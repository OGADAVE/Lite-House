// script/admin.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
// We still need getFirestore, collection, doc, getDoc for the admin check
import { getFirestore, collection, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"; 

const firebaseConfig = {
    // Your actual configuration details
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
const db = getFirestore(app); // Used only for admin check

// ----------------------------------------------------
// 🛑 NETLIFY FUNCTION ENDPOINTS & UTILITY
// ----------------------------------------------------
const netlifyFunctionUrl = (name) => `/.netlify/functions/${name}`;

// Admin Actions (POST requests with payload)
const runManualROI_URL = netlifyFunctionUrl('dailyRoi'); 
const adminDeposit_URL = netlifyFunctionUrl('adminDeposit');
const approveWithdrawal_URL = netlifyFunctionUrl('approveWithdrawal');
const rejectWithdrawal_URL = netlifyFunctionUrl('rejectWithdrawal');
const adminSendMessage_URL = netlifyFunctionUrl('adminSendMessage');

// Data Fetching (GET or POST request to retrieve dashboard data)
const fetchAdminData_URL = netlifyFunctionUrl('fetchAdminData');

/**
 * Utility function to handle POST requests to Netlify Functions.
 */
async function callNetlifyFunction(url, payload = {}) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const result = await response.json();
    
    if (!response.ok || result.error) {
        throw new Error(result.message || result.error || "Netlify Function Error");
    }
    return result;
}

// ----------------------------------------------------
// ROI BUTTON HANDLER (Uses callNetlifyFunction)
// ----------------------------------------------------
document.getElementById("runRoiBtn").addEventListener("click", async () => {
    if (!confirm("Run daily ROI update for all users?")) return;

    const btn = document.getElementById("runRoiBtn");
    btn.disabled = true;
    btn.textContent = "Processing...";

    try {
        const result = await callNetlifyFunction(runManualROI_URL);
        alert(result.message);
    } catch (error) {
        console.error("ROI Update failed:", error);
        alert("Error: " + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = "Run Daily ROI Update";
    }
});


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
const notifBadge = document.getElementById("notifBadge"); // Assume you have a badge element

const loadingOverlay = document.getElementById("loading-overlay");
const loadingText = document.getElementById("loading-text");
const successMsg = document.getElementById("success-msg");

const confirmModal = document.getElementById("confirm-modal");
const confirmMsg = document.getElementById("confirm-msg");
const confirmYes = document.getElementById("confirm-yes");
const confirmNo = document.getElementById("confirm-no");

const depositModal = document.getElementById("deposit-modal");
const depositMsg = document.getElementById("deposit-msg");
const depositAmountInput = document.getElementById("deposit-amount-input");
const depositYes = document.getElementById("deposit-yes");
const depositNo = document.getElementById("deposit-no");

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
// RENDERING FUNCTIONS (To display data fetched from backend)
// ----------------------------------------------------

function renderUsers(users) {
    usersTableBody.innerHTML = "";
    let totalUsers = 0, totalBalance = 0;
    
    users.forEach(u => {
        totalUsers++;
        totalBalance += u.accountBalance || 0;
        
        const joinedDate = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "-";

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${u.email}</td>
            <td>$${(u.accountBalance||0).toFixed(2)}</td>
            <td>$${(u.tradingBalance||0).toFixed(2)}</td>
            <td>$${(u.dailyRoiBalance||0).toFixed(2)}</td>
            <td>${u.referralCode || "-"}</td>
            <td>${joinedDate}</td>
            <td>
                <button class="deposit-btn">Deposit</button>
                <button class="msg-btn">Message</button>
            </td>`;
        usersTableBody.appendChild(tr);

        tr.querySelector(".deposit-btn").addEventListener("click", ()=>{
            depositUserId = u.id; 
            depositUserEmail = u.email;
            depositMsg.textContent=`Deposit amount to ${depositUserEmail}?`;
            depositAmountInput.value="";
            depositModal.style.display="flex";
        });

        tr.querySelector(".msg-btn").addEventListener("click", ()=>{
            messageUserId = u.id; 
            messageTo.textContent = `To: ${u.email}`;
            msgSubject.value = "";
            msgBody.value = "";
            messageModal.style.display = "flex";
        });
    });
    totalUsersEl.textContent = totalUsers;
    totalBalanceEl.textContent = "$" + totalBalance.toFixed(2);
}

function renderWithdrawals(withdrawals) {
    withdrawalsTableBody.innerHTML = "";
    let pendingCount = 0;
    
    withdrawals.forEach(w => {
        if(w.status==="pending") pendingCount++;
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${w.email}</td>
            <td>${w.coin}</td>
            <td>$${w.amount}</td>
            <td>${w.status}</td>
            <td>
                ${w.status==="pending"?`
                    <button class="action-btn approve" data-id="${w.id}" data-user="${w.userId}" data-amount="${w.amount}">Approve</button>
                    <button class="action-btn reject" data-id="${w.id}">Reject</button>
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
}

function renderDeposits(deposits) {
    depositTableBody.innerHTML = "";
    let totalDeposits = 0;
    
    deposits.forEach(d => {
        totalDeposits += d.amount || 0;
        
        const processedDate = d.processedAt ? new Date(d.processedAt).toLocaleString() : "-";

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${d.email}</td>
            <td>$${(d.amount||0).toFixed(2)}</td>  
            <td>${processedDate}</td>
        `;
        depositTableBody.appendChild(tr);
    });
    totalDepositsEl.textContent = "$" + totalDeposits.toFixed(2);
}

function renderNotifications(notifications) {
    const notifDropdown = document.getElementById("notifDropdown");
    notifDropdown.innerHTML = "";
    notifBadge.textContent = notifications.length; 
    
    notifications.forEach(n => {
        const div = document.createElement("div");
        div.className = "notif-item";
        div.textContent = `${n.message||"New event"} (${n.type})`;
        notifDropdown.appendChild(div);
    });
}

// ----------------------------------------------------
// DATA LOADER
// ----------------------------------------------------

async function loadAdminData() {
    showLoading("Loading admin data securely...");
    try {
        // 🛑 FIX: Call Netlify Function to get all secure data
        const data = await callNetlifyFunction(fetchAdminData_URL);

        // Render all data from the secure backend response
        renderUsers(data.users || []);
        renderWithdrawals(data.withdrawals || []);
        renderDeposits(data.deposits || []);
        renderNotifications(data.notifications || []); 

    } catch (err) {
        showError("Failed to load dashboard data securely. Check Netlify function logs. Error: " + err.message);
    } finally {
        hideLoading();
    }
}


// ----------------------------------------------------
// AUTH AND INITIAL LOAD
// ----------------------------------------------------
onAuthStateChanged(auth, async user=>{
    if(!user){ window.location.href="login.html"; return; }
    
    // Perform the initial Admin check using the client-side SDK (secure enough for a redirect check)
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
    loadAdminData(); // <-- NEW CALL that fetches data via the secure Netlify Function
});

document.getElementById("logoutBtn").addEventListener("click", async ()=>{ await signOut(auth); window.location.href="login.html"; });

const notifBell = document.getElementById("notifBell");
const notifDropdown = document.getElementById("notifDropdown");
notifBell.addEventListener("click",()=>notifDropdown.classList.toggle("active"));


// ----------------------------------------------------
// MODAL & ACTION HANDLERS (Unchanged, use callNetlifyFunction)
// ----------------------------------------------------

function confirmAction(action, id, amount = 0, userId = null){
    selectedWithdrawal = { action, id, amount: parseFloat(amount), userId };
    confirmMsg.textContent=`Are you sure you want to ${action} this withdrawal of $${amount}?`;
    confirmModal.style.display="flex";
}

confirmYes.addEventListener("click", async ()=>{
    confirmModal.style.display="none";
    if(!selectedWithdrawal) return;

    showLoading(`${selectedWithdrawal.action}ing withdrawal...`);
    try{
        let url, payload;
        
        if(selectedWithdrawal.action === "approve"){
            url = approveWithdrawal_URL;
            payload = { 
                withdrawalId: selectedWithdrawal.id,
                userId: selectedWithdrawal.userId,
                amount: selectedWithdrawal.amount
            };
        } else if(selectedWithdrawal.action === "reject"){
            url = rejectWithdrawal_URL;
            payload = { withdrawalId: selectedWithdrawal.id };
        }
        
        const res = await callNetlifyFunction(url, payload);
        showSuccess(res.message || `Withdrawal ${selectedWithdrawal.action}ed successfully!`);
        // 🛑 IMPORTANT: Reload data after action is complete
        await loadAdminData();

    }catch(err){ 
        console.error("Function Error:", err); 
        showError(err.message || "Something went wrong during the action."); 
    }
    finally{ selectedWithdrawal=null; hideLoading(); }
});

confirmNo.addEventListener("click", ()=>{ selectedWithdrawal=null; confirmModal.style.display="none"; });

depositYes.addEventListener("click", async ()=>{
    const amt=parseFloat(depositAmountInput.value);
    if(isNaN(amt)||amt<=0){ showError("Enter a valid positive amount."); return; }
    
    depositModal.style.display="none";
    showLoading(`Depositing $${amt} to ${depositUserEmail}...`);

    try{
        const payload = {
            userId: depositUserId,
            amount: amt,
            email: depositUserEmail
        };

        const res = await callNetlifyFunction(adminDeposit_URL, payload);
        showSuccess(res.message || `Deposited $${amt} successfully!`);
        // 🛑 IMPORTANT: Reload data after action is complete
        await loadAdminData();
        
    }catch(err){ 
        console.error("Function Error:", err); 
        showError(err.message || "Failed to process deposit."); 
    }
    finally{ depositUserId=null; depositUserEmail=null; hideLoading(); }
});

depositNo.addEventListener("click",()=>{ depositUserId=null; depositUserEmail=null; depositModal.style.display="none"; });

sendMsgBtn.addEventListener("click",async()=>{
    if(!messageUserId) return;
    const subject=msgSubject.value.trim();
    const body=msgBody.value.trim();
    if(!subject||!body){ showError("Please fill all fields."); return; }
    
    showLoading("Sending message...");
    try{
        const payload = {
            to: messageUserId,
            subject,
            message: body
        };

        const res = await callNetlifyFunction(adminSendMessage_URL, payload);
        showSuccess(res.message || "Message sent successfully!");
    }catch(err){ 
        console.error("Function Error:", err); 
        showError(err.message || "Failed to send message."); 
    }
    finally{ messageModal.style.display="none"; hideLoading(); }
});

cancelMsgBtn.addEventListener("click",()=>{ messageUserId=null; messageModal.style.display="none"; });