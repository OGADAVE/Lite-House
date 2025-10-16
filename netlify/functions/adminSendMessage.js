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