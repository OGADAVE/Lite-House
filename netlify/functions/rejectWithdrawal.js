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
        const { withdrawalId, adminUid } = data; // adminUid must be passed

        // 1. Admin Authorization Check
        if (!adminUid) {
            return { statusCode: 401, body: JSON.stringify({ error: 'unauthenticated', message: 'Admin UID is missing.' }) };
        }
        const adminDoc = await db.collection("users").doc(adminUid).get();
        if (!adminDoc.exists || adminDoc.data().isAdmin !== true) {
            return { statusCode: 403, body: JSON.stringify({ error: 'permission-denied', message: 'Only administrators can reject withdrawals.' }) };
        }

        // 2. Input Validation
        if (!withdrawalId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'invalid-argument', message: 'Invalid withdrawal ID.' }) };
        }

        const withdrawalRef = db.collection("withdrawals").doc(withdrawalId);
        
        const wDoc = await withdrawalRef.get();
        if (!wDoc.exists || wDoc.data().status !== 'pending') {
            return { statusCode: 412, body: JSON.stringify({ error: 'failed-precondition', message: "Withdrawal not found or already processed." }) };
        }

        await withdrawalRef.update({
            status: "rejected",
            processedBy: adminUid,
            processedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        db.collection("notifications").add({
            userId: wDoc.data().userId,
            type: "withdrawal_rejected",
            message: `Your withdrawal request was rejected. Please contact support.`,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ status: 'success', message: `Withdrawal ${withdrawalId} rejected.` })
        };
    } catch (error) {
        console.error("Reject Withdrawal Failed:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'internal', message: error.message || 'Withdrawal rejection failed.' })
        };
    }
};