import admin from './node_modules/firebase-admin/lib/index.js';
import fs from 'fs';

const serviceAccount = JSON.parse(fs.readFileSync('./animoro-b9268-firebase-adminsdk-fbsvc-cee79b10ac.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function serviceAccountAuthToken() {
  const { GoogleAuth } = await import('./node_modules/google-auth-library/build/src/index.js');
  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase']
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token;
}

async function run() {
  const token = await serviceAccountAuthToken();
  console.log("Token obtained successfully.");

  // Test testRuleset API (dry run validation)
  const rulesContent = fs.readFileSync('./firestore.rules', 'utf8');
  console.log("Testing validation of local firestore.rules...");
  const testRes = await fetch(`https://firebaserules.googleapis.com/v1/projects/animoro-b9268:test`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      source: {
        files: [{
          name: 'firestore.rules',
          content: rulesContent
        }]
      }
    })
  });
  const testData = await testRes.json();
  console.log("Test result:", JSON.stringify(testData, null, 2));
}

run().catch(console.error);
