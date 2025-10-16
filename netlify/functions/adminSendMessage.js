// netlify/functions/adminSendMessage.js

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
        const { to, subject, message, adminUid } = data; // adminUid must be passed

        // 1. Admin Authorization Check
        if (!adminUid) {
            return { statusCode: 401, body: JSON.stringify({ error: 'unauthenticated', message: 'Admin UID is missing.' }) };
        }
        const adminDoc = await db.collection("users").doc(adminUid).get();
        if (!adminDoc.exists || adminDoc.data().isAdmin !== true) {
            return { statusCode: 403, body: JSON.stringify({ error: 'permission-denied', message: 'Only administrators can send messages.' }) };
        }

        // 2. Input Validation
        if (!to || !subject || !message) {
            return { statusCode: 400, body: JSON.stringify({ error: 'invalid-argument', message: 'Missing recipient, subject, or message body.' }) };
        }

        // Log the message
        await db.collection("messages").add({
            from: adminUid, // Admin ID
            to: to, // Recipient User ID
            subject,
            message,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            status: "unread"
        });

        // Add an admin log/notification
        db.collection("notifications").add({
            type: "admin_message_sent",
            message: `Message sent to user ${to}`,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ status: 'success', message: 'Message sent securely.' })
        };
    } catch (error) {
        console.error("Send Message Failed:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'internal', message: error.message || 'Failed to send message.' })
        };
    }
};