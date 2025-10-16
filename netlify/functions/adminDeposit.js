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
    // 1. HTTP Method Check
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        // Data is passed in the request body for HTTP functions
        const data = JSON.parse(event.body);
        const { userId, amount, adminUid } = data; // adminUid must be passed from the front-end

        // 2. Admin Authorization Check (using the UID passed from the client)
        if (!adminUid) {
            return { statusCode: 401, body: JSON.stringify({ error: 'unauthenticated', message: 'Admin UID is missing.' }) };
        }
        const adminDoc = await db.collection("users").doc(adminUid).get();
        if (!adminDoc.exists || adminDoc.data().isAdmin !== true) {
            return { statusCode: 403, body: JSON.stringify({ error: 'permission-denied', message: 'Only administrators can perform this action.' }) };
        }

        // 3. Input Validation
        if (!userId || typeof amount !== 'number' || amount <= 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'invalid-argument', message: 'Invalid user ID or deposit amount.' }) };
        }

        const userRef = db.collection("users").doc(userId);
        const txRef = db.collection("deposits").doc();

        // 4. Atomic Transaction
        await db.runTransaction(async (t) => {
            const uDoc = await t.get(userRef);
            if (!uDoc.exists) throw new Error("User not found.");

            const currentBalance = Number(uDoc.data().accountBalance || 0);
            const newBalance = currentBalance + amount;
            const email = uDoc.data().email || 'N/A';

            t.update(userRef, { accountBalance: newBalance });

            t.set(txRef, {
                userId,
                email: email,
                amount,
                type: "admin_deposit",
                processedBy: adminUid,
                processedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            db.collection("notifications").add({
                userId,
                type: "deposit_credit",
                message: `$${amount.toFixed(2)} has been credited to your account balance by Account Manager.`,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ status: 'success', message: `Deposit of $${amount.toFixed(2)} to ${userId} successful.` })
        };
    } catch (error) {
        console.error("Deposit Transaction Failed:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'internal', message: error.message || 'Deposit failed due to a database error.' })
        };
    }
};