// netlify/functions/rejectWithdrawal.js

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