import admin from './node_modules/firebase-admin/lib/index.js';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./animoro-b9268-firebase-adminsdk-fbsvc-cee79b10ac.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function run() {
  const adminDoc = await db.collection('admins').doc('w7vXxGuN5JNwkOvEcFEOGnfqUl42').get();
  console.log("Admin doc data:", adminDoc.data());

  const usersResult = await admin.auth().listUsers(10);
  console.log("Auth users count:", usersResult.users.length);
  for (const u of usersResult.users) {
    console.log(`User: uid=${u.uid}, email=${u.email}, displayName=${u.displayName}, providerData=${JSON.stringify(u.providerData.map(p => p.providerId))}`);
  }
}

run().catch(console.error);
