import admin from './node_modules/firebase-admin/lib/index.js';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./animoro-b9268-firebase-adminsdk-fbsvc-cee79b10ac.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function run() {
  const token = await serviceAccountAuthToken();
  const releasesRes = await fetch(`https://firebaserules.googleapis.com/v1/projects/animoro-b9268/releases`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const releasesData = await releasesRes.json();
  console.log("Releases:", JSON.stringify(releasesData, null, 2));

  // Find the release for firestore
  const firestoreRelease = releasesData.releases?.find(r => r.name.includes('cloud.firestore'));
  if (firestoreRelease) {
    console.log("Active release:", firestoreRelease);
    const rulesetRes = await fetch(`https://firebaserules.googleapis.com/v1/${firestoreRelease.rulesetName}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const rulesetData = await rulesetRes.json();
    console.log("=== DEPLOYED FIRESTORE RULES ===");
    for (const file of rulesetData.source?.files || []) {
      console.log(`File: ${file.name}`);
      console.log(file.content);
    }
  }
}

async function serviceAccountAuthToken() {
  // Use google-auth-library or JWT
  const { GoogleAuth } = await import('./node_modules/google-auth-library/build/src/index.js');
  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase']
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token;
}

run().catch(console.error);
