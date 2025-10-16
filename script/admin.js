// script/admin.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const firebaseConfig = {
    apiKey: "AIzaSyAYpJh4hLwrXsFpKnnXi1e6wVstgitv5L0",
    authDomain: "lite-house-b2139.firebaseapp.com",
    projectId: "lite-house-b2139",
    storageBucket: "lite-house-b2139.appspot.com",
    messagingSenderId: "563490813811",
    appId: "1:563490813811:web:1d3d83fb43db7be178f706",
    measurementId: "G-5JF6YSRC9F"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

// Reference the secure server function by name
const runManualROI = httpsCallable(functions, 'runManualROI'); 

document.getElementById("runRoiBtn").addEventListener("click", async () => {
    if (!confirm("Run daily ROI update for all users?")) return;

    // Show loading state
    const btn = document.getElementById("runRoiBtn");
    btn.disabled = true;
    btn.textContent = "Processing...";

    try {
        // Call the secure Cloud Function
        const result = await runManualROI();
        alert(result.data.message);
    } catch (error) {
        console.error("ROI Update failed:", error);
        // HttpsError allows checking for 'permission-denied' from Step 1
        alert("Error: " + error.message);
    } finally {
        // Reset button state
        btn.disabled = false;
        btn.textContent = "Run Daily ROI Update";
    }
});

// ----------------------------------------------------
// 🛑 SECURE CLOUD FUNCTION CALLS
// ----------------------------------------------------
const adminDeposit = httpsCallable(functions, 'adminDeposit');
const approveWithdrawal = httpsCallable(functions, 'approveWithdrawal');
const rejectWithdrawal = httpsCallable(functions, 'rejectWithdrawal');
const adminSendMessage = httpsCallable(functions, 'adminSendMessage');

// ----------------------------------------------------
// DOM ELEMENTS & State
// ----------------------------------------------------
const usersTableBody = document.querySelector("#usersTable tbody");
const withdrawalsTableBody = document.querySelector("#withdrawalsTable tbody");
const depositTableBody = document.querySelector("#depositTable tbody");

const totalUsersEl = document.getElementById("totalUsers");
const totalDepositsEl = document.getElementById("totalDeposits");
const totalBalanceEl = document.getElementById("totalBalance");
const pendingWithdrawalsEl = document.getElementById("pendingWithdrawals");

const loadingOverlay = document.getElementById("loading-overlay");
const loadingText = document.getElementById("loading-text");
const successMsg = document.getElementById("success-msg");

// Confirm Modal (for Withdrawal actions)
const confirmModal = document.getElementById("confirm-modal");
const confirmMsg = document.getElementById("confirm-msg");
const confirmYes = document.getElementById("confirm-yes");
const confirmNo = document.getElementById("confirm-no");

// Deposit Modal (NEW)
const depositModal = document.getElementById("deposit-modal");
const depositMsg = document.getElementById("deposit-msg");
const depositAmountInput = document.getElementById("deposit-amount-input");
const depositYes = document.getElementById("deposit-yes");
const depositNo = document.getElementById("deposit-no");

// Message Modal
const messageModal = document.getElementById("message-modal");
const messageTo = document.getElementById("message-to");
const msgSubject = document.getElementById("msg-subject");
const msgBody = document.getElementById("msg-body");
const sendMsgBtn = document.getElementById("send-msg");
const cancelMsgBtn = document.getElementById("cancel-msg");

let selectedWithdrawal = null;
let depositUserId = null;
let messageUserId = null;
let depositUserEmail = null; 

// ----------------------------------------------------
// UTILITIES
// ----------------------------------------------------
function showLoading(msg="Loading..."){ loadingText.textContent=msg; loadingOverlay.style.display="flex"; }
function hideLoading(){ loadingOverlay.style.display="none"; }
function showSuccess(msg){ successMsg.textContent=msg; successMsg.style.display="block"; setTimeout(()=>{ successMsg.style.display="none"; },3000); }
function showError(msg){ alert(`Error: ${msg}`); }

// ----------------------------------------------------
// AUTH AND INITIAL LOAD
// ----------------------------------------------------
onAuthStateChanged(auth, async user=>{
    if(!user){ window.location.href="login.html"; return; }
    const uRef = doc(db,"users",user.uid);
    const uSnap = await getDoc(uRef);
    
    // 🛑 CRITICAL SECURITY CHECK
    if(!uSnap.exists() || uSnap.data().isAdmin !== true){ 
        alert("Access denied. Admins only."); 
        await signOut(auth); 
        window.location.href="login.html"; 
        return; 
    }
    
    // Load data after successful admin check
    loadUsers();
    loadWithdrawals();
    loadDeposits();
    loadNotifications(); 
});

document.getElementById("logoutBtn").addEventListener("click", async ()=>{ await signOut(auth); window.location.href="login.html"; });

const notifBell = document.getElementById("notifBell");
const notifDropdown = document.getElementById("notifDropdown");
notifBell.addEventListener("click",()=>notifDropdown.classList.toggle("active"));

// ----------------------------------------------------
// REAL-TIME DATA LOADERS
// ----------------------------------------------------

function loadUsers(){
    showLoading("Loading users...");
    onSnapshot(collection(db,"users"), snapshot=>{
        usersTableBody.innerHTML="";
        let totalUsers = 0, totalBalance = 0;
        snapshot.forEach(docSnap=>{
            const u = docSnap.data();
            totalUsers++;
            // Note: Total balance sums the accountBalance field (safer assumption)
            totalBalance += u.accountBalance || 0; 
            
            const tr = document.createElement("tr");
            tr.innerHTML=`
                <td>${u.email}</td>
                <td>$${(u.accountBalance||0).toFixed(2)}</td>
                <td>$${(u.tradingBalance||0).toFixed(2)}</td>
                <td>$${(u.dailyRoiBalance||0).toFixed(2)}</td>
                <td>${u.referralCode || "-"}</td>
                <td>${u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString() : "-"}</td>
                <td>
                    <button class="deposit-btn">Deposit</button>
                    <button class="msg-btn">Message</button>
                </td>`;
            usersTableBody.appendChild(tr);

            // Deposit button listener (opens NEW modal)
            tr.querySelector(".deposit-btn").addEventListener("click", ()=>{
                depositUserId = docSnap.id;
                depositUserEmail = u.email;
                depositMsg.textContent=`Deposit amount to ${depositUserEmail}?`;
                depositAmountInput.value="";
                depositModal.style.display="flex";
            });

            // Message button listener
            tr.querySelector(".msg-btn").addEventListener("click", ()=>{
                messageUserId = docSnap.id;
                messageTo.textContent = `To: ${u.email}`;
                msgSubject.value = "";
                msgBody.value = "";
                messageModal.style.display = "flex";
            });
        });
        totalUsersEl.textContent = totalUsers;
        totalBalanceEl.textContent = "$" + totalBalance.toFixed(2);
        hideLoading();
    });
}

function loadWithdrawals(){
    onSnapshot(collection(db,"withdrawals"), snapshot=>{
        withdrawalsTableBody.innerHTML="";
        let pendingCount = 0;
        snapshot.forEach(docSnap=>{
            const w=docSnap.data();
            if(w.status==="pending") pendingCount++;
            const tr=document.createElement("tr");
            tr.innerHTML=`
                <td>${w.email}</td>
                <td>${w.coin}</td>
                <td>$${w.amount}</td>
                <td>${w.status}</td>
                <td>
                    ${w.status==="pending"?`
                        <button class="action-btn approve" data-id="${docSnap.id}" data-user="${w.userId}" data-amount="${w.amount}">Approve</button>
                        <button class="action-btn reject" data-id="${docSnap.id}">Reject</button>
                    `:"-"}
                </td>
            `;
            withdrawalsTableBody.appendChild(tr);
            
            if(w.status==="pending"){
                tr.querySelector(".approve").addEventListener("click", (e)=>{
                    const { id, user, amount } = e.target.dataset;
                    confirmAction("approve", id, amount, user);
                });
                tr.querySelector(".reject").addEventListener("click", (e)=>{
                    const { id } = e.target.dataset;
                    confirmAction("reject", id);
                });
            }
        });
        pendingWithdrawalsEl.textContent = pendingCount;
    });
}

function loadDeposits(){
    // Note: Since this is an admin view, it tracks "total deposits" processed by the admin/system
    onSnapshot(collection(db,"deposits"), snapshot=>{
        depositTableBody.innerHTML="";
        let totalDeposits = 0;
        snapshot.forEach(docSnap=>{
            const d = docSnap.data();
            totalDeposits += d.amount || 0;
            const tr=document.createElement("tr");
            tr.innerHTML = `
                <td>${d.email}</td>
                <td>$${(d.amount||0).toFixed(2)}</td>  
                <td>${d.processedAt?.toDate ? d.processedAt.toDate().toLocaleString() : "-"}</td>
            `;
            depositTableBody.appendChild(tr);
        });
        totalDepositsEl.textContent = "$" + totalDeposits.toFixed(2);
    });
}

function loadNotifications(){
    // Simplified: Show all notifications for now
    onSnapshot(collection(db,"notifications"),snapshot=>{
        notifDropdown.innerHTML="";
        // Only count unread notifications if you track read status
        notifBadge.textContent=snapshot.size; 
        snapshot.forEach(docSnap=>{
            const n=docSnap.data();
            const div=document.createElement("div");
            div.className="notif-item";
            div.textContent=`${n.message||"New event"} (${n.type})`;
            notifDropdown.appendChild(div);
        });
    });
}

// ----------------------------------------------------
// MODAL & ACTION HANDLERS
// ----------------------------------------------------

// 1. Withdrawal Confirmation Handler
function confirmAction(action, id, amount = 0, userId = null){
    selectedWithdrawal = { action, id, amount: parseFloat(amount), userId };
    confirmMsg.textContent=`Are you sure you want to ${action} this withdrawal of $${amount}?`;
    confirmModal.style.display="flex";
}

// 2. Withdrawal Action Submission (calls secure Cloud Function)
confirmYes.addEventListener("click", async ()=>{
    confirmModal.style.display="none";
    if(!selectedWithdrawal) return;

    showLoading(`${selectedWithdrawal.action}ing withdrawal...`);
    try{
        if(selectedWithdrawal.action === "approve"){
            const res = await approveWithdrawal({
                withdrawalId: selectedWithdrawal.id,
                userId: selectedWithdrawal.userId,
                amount: selectedWithdrawal.amount
            });
            showSuccess(res.data.message || `Withdrawal approved successfully!`);
        } else if(selectedWithdrawal.action === "reject"){
            const res = await rejectWithdrawal({
                withdrawalId: selectedWithdrawal.id
            });
            showSuccess(res.data.message || `Withdrawal rejected successfully!`);
        }
    }catch(err){ 
        console.error("Function Error:", err); 
        showError(err.message || "Something went wrong during the action."); 
    }
    finally{ selectedWithdrawal=null; hideLoading(); }
});

confirmNo.addEventListener("click", ()=>{ selectedWithdrawal=null; confirmModal.style.display="none"; });

// 3. Deposit Action Submission (calls secure Cloud Function)
depositYes.addEventListener("click", async ()=>{
    const amt=parseFloat(depositAmountInput.value);
    if(isNaN(amt)||amt<=0){ showError("Enter a valid positive amount."); return; }
    
    depositModal.style.display="none";
    showLoading(`Depositing $${amt} to ${depositUserEmail}...`);

    try{
        const res = await adminDeposit({
            userId: depositUserId,
            amount: amt,
            email: depositUserEmail // Pass email for logging/notification on backend
        });
        showSuccess(res.data.message || `Deposited $${amt} successfully!`);
    }catch(err){ 
        console.error("Function Error:", err); 
        showError(err.message || "Failed to process deposit."); 
    }
    finally{ depositUserId=null; depositUserEmail=null; hideLoading(); }
});

depositNo.addEventListener("click",()=>{ depositUserId=null; depositUserEmail=null; depositModal.style.display="none"; });

// 4. Send Message Handler (calls secure Cloud Function)
sendMsgBtn.addEventListener("click",async()=>{
    if(!messageUserId) return;
    const subject=msgSubject.value.trim();
    const body=msgBody.value.trim();
    if(!subject||!body){ showError("Please fill all fields."); return; }
    
    showLoading("Sending message...");
    try{
        const res = await adminSendMessage({
            to: messageUserId,
            subject,
            message: body
        });
        showSuccess(res.data.message || "Message sent successfully!");
    }catch(err){ 
        console.error("Function Error:", err); 
        showError(err.message || "Failed to send message."); 
    }
    finally{ messageModal.style.display="none"; hideLoading(); }
});

cancelMsgBtn.addEventListener("click",()=>{ messageUserId=null; messageModal.style.display="none"; });

