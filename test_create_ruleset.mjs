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
  const rulesContent = fs.readFileSync('./firestore.rules', 'utf8');

  console.log("Attempting to create ruleset...");
  const createRes = await fetch(`https://firebaserules.googleapis.com/v1/projects/animoro-b9268/rulesets`, {
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

  const createData = await createRes.json();
  console.log("Create ruleset response:", JSON.stringify(createData, null, 2));

  if (createRes.ok && createData.name) {
    console.log("Ruleset created! Name:", createData.name);
    console.log("Attempting to release ruleset...");
    const releaseRes = await fetch(`https://firebaserules.googleapis.com/v1/projects/animoro-b9268/releases/cloud.firestore`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        release: {
          name: 'projects/animoro-b9268/releases/cloud.firestore',
          rulesetName: createData.name
        }
      })
    });
    const releaseData = await releaseRes.json();
    console.log("Release response:", JSON.stringify(releaseData, null, 2));
  }
}

run().catch(console.error);
