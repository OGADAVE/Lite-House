// netlify/functions/dailyRoi.js
// This script is configured to run automatically on a set schedule.

const admin = require('firebase-admin');

// --- Netlify Setup: Initialize Admin SDK from Environment Variable ---
const serviceAccountString = process.env.FIREBASE_ADMIN_CONFIG;
const serviceAccount = JSON.parse(serviceAccountString.replace(/\\\\n/g, '\\n')); 

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

// --------------------------------------------------------------------

// Define the ROI rate (e.g., 1.5% daily)
const DAILY_ROI_RATE = 0.015; // 1.5%

// Netlify's handler for scheduled functions
exports.handler = async (event, context) => {
    console.log("Starting Daily ROI Calculation...");
    
    // In a scheduled function, no request body exists. 
    // We execute the main logic immediately.
    
    try {
        const usersRef = db.collection("users");
        
        // 1. Get all active users with a balance > 0
        const snapshot = await usersRef
            .where('accountBalance', '>', 0)
            .get();

        if (snapshot.empty) {
            console.log("No active users found. ROI calculation skipped.");
            return {
                statusCode: 200,
                body: JSON.stringify({ message: "ROI complete, no users processed." })
            };
        }

        const batch = db.batch();
        let totalUsersProcessed = 0;

        // 2. Iterate through users and update balance atomically (within the batch)
        snapshot.forEach(doc => {
            const userId = doc.id;
            const userData = doc.data();
            const currentBalance = Number(userData.accountBalance || 0);

            if (currentBalance > 0) {
                const roiAmount = currentBalance * DAILY_ROI_RATE;
                const newBalance = currentBalance + roiAmount;
                
                // Update user's account balance
                const userRef = usersRef.doc(userId);
                batch.update(userRef, {
                    accountBalance: newBalance,
                    totalRoiEarned: admin.firestore.FieldValue.increment(roiAmount)
                });
                
                // Log the ROI transaction for auditing
                const txRef = db.collection("roiTransactions").doc();
                batch.set(txRef, {
                    userId,
                    amount: roiAmount,
                    balanceBefore: currentBalance,
                    balanceAfter: newBalance,
                    rate: DAILY_ROI_RATE,
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                });

                totalUsersProcessed++;
            }
        });

        // 3. Commit the batch transaction
        await batch.commit();

        console.log(`✅ Daily ROI SUCCEEDED. Processed ${totalUsersProcessed} users.`);
        
        return {
            statusCode: 200,
            body: JSON.stringify({ message: `ROI successfully processed for ${totalUsersProcessed} users.` })
        };
        
    } catch (error) {
        console.error("❌ Daily ROI FAILED:", error);
        
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message || 'ROI processing failed.' })
        };
    }
};