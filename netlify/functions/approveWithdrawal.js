// --- Netlify Setup: Initialize Admin SDK from Environment Variable ---

// 1. Get the JSON string from the Netlify environment variable
const configString = process.env.FIREBASE_ADMIN_CONFIG;

// 2. PARSE the JSON string into an object (This is the standard, simple way)
// We wrap it in a try/catch to handle potential failures gracefully.
try {
    const serviceAccount = JSON.parse(configString);
    
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }

} catch (error) {
    // Log the error to Netlify's console if initialization fails
    console.error("Firebase Admin Initialization Error:", error);
    // Returning here will prevent the function from running and hitting a 500 error
}

const db = admin.firestore();
// --------------------------------------------------------------------

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const data = JSON.parse(event.body);
        const { withdrawalId, userId, amount, adminUid } = data; // adminUid must be passed

        // 1. Admin Authorization Check
        if (!adminUid) {
            return { statusCode: 401, body: JSON.stringify({ error: 'unauthenticated', message: 'Admin UID is missing.' }) };
        }
        const adminDoc = await db.collection("users").doc(adminUid).get();
        if (!adminDoc.exists || adminDoc.data().isAdmin !== true) {
            return { statusCode: 403, body: JSON.stringify({ error: 'permission-denied', message: 'Only administrators can approve withdrawals.' }) };
        }

        // 2. Input Validation
        if (!withdrawalId || !userId || typeof amount !== 'number' || amount <= 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'invalid-argument', message: 'Invalid request data.' }) };
        }

        const userRef = db.collection("users").doc(userId);
        const withdrawalRef = db.collection("withdrawals").doc(withdrawalId);

        // 3. Atomic Transaction
        await db.runTransaction(async (t) => {
            const wDoc = await t.get(withdrawalRef);
            const uDoc = await t.get(userRef);

            if (!wDoc.exists || wDoc.data().status !== 'pending') {
                throw new Error("Withdrawal not found or already processed.");
            }
            if (!uDoc.exists) {
                throw new Error("User associated with withdrawal not found.");
            }

            const currentBalance = Number(uDoc.data().accountBalance || 0);
            
            if (currentBalance < amount) {
                throw new Error("Insufficient funds. User's balance has changed.");
            }

            const newBalance = currentBalance - amount;

            t.update(userRef, { accountBalance: newBalance });

            t.update(withdrawalRef, {
                status: "approved",
                processedBy: adminUid,
                processedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            db.collection("notifications").add({
                userId,
                type: "withdrawal_approved",
                message: `Your withdrawal of $${amount.toFixed(2)} has been approved.`,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ status: 'success', message: `Withdrawal ${withdrawalId} approved.` })
        };
    } catch (error) {
        console.error("Approve Withdrawal Transaction Failed:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'internal', message: error.message || 'Withdrawal approval failed.' })
        };
    }
};