import admin from './node_modules/firebase-admin/lib/index.js';
import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, getDocs, collection, deleteDoc, query, where, limit } from 'firebase/firestore';

const serviceAccount = JSON.parse(fs.readFileSync('./animoro-b9268-firebase-adminsdk-fbsvc-cee79b10ac.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const clientApp = initializeApp({
  apiKey: "AIzaSyDMnIk-rwx0qHk0ZIMzaGg37NRZaW7Nj3o",
  authDomain: "animoro-b9268.firebaseapp.com",
  projectId: "animoro-b9268",
  storageBucket: "animoro-b9268.firebasestorage.app",
  messagingSenderId: "1033726749150",
  appId: "1:1033726749150:web:8c4a99292ed9d728b4554f"
});

const clientAuth = getAuth(clientApp);
const clientDb = getFirestore(clientApp);

const user1Uid = "hmVC3r1RkuYKWWHdpoy6Y66wWbE3"; // sayedshoaib3869224@gmail.com
const user2Uid = "Ud39ohsDlUN9VdMKiYKFus0xeCj1"; // vishalahir1900@gmail.com

async function test() {
  console.log("=== STEP 1: Test unauthenticated public read of upcomingAnime ===");
  try {
    const pubSnap = await getDocs(query(collection(clientDb, 'upcomingAnime'), where('status', '==', 'published'), limit(3)));
    console.log("PASS: Unauthenticated read of published upcomingAnime succeeded. Docs returned:", pubSnap.size);
  } catch (err) {
    console.error("FAIL: Unauthenticated read of upcomingAnime failed:", err.code, err.message);
  }

  console.log("\n=== STEP 2: Test unauthenticated read of myList (should fail) ===");
  try {
    await getDocs(collection(clientDb, 'users', user1Uid, 'myList'));
    console.error("FAIL: Unauthenticated read of myList succeeded but should have failed!");
  } catch (err) {
    console.log("PASS: Unauthenticated read of myList was denied as expected:", err.code);
  }

  console.log("\n=== STEP 3: Sign in as User 1 ===");
  const customToken1 = await admin.auth().createCustomToken(user1Uid);
  await signInWithCustomToken(clientAuth, customToken1);
  console.log("Signed in as User 1:", clientAuth.currentUser.uid);

  console.log("\n=== STEP 4: User 1 writes to their own myList ===");
  const testDocId = "upcoming:test-anime-slug";
  const testPayload = {
    animeId: "test-anime-slug",
    kind: "upcoming",
    title: "Test Anime Title",
    slug: "test-anime-slug",
    status: "plan_to_watch",
    addedAt: new Date()
  };
  try {
    await setDoc(doc(clientDb, 'users', user1Uid, 'myList', testDocId), testPayload);
    console.log("PASS: User 1 wrote to their own myList successfully.");
  } catch (err) {
    console.error("FAIL: User 1 could not write to their own myList:", err.code, err.message);
  }

  console.log("\n=== STEP 5: User 1 reads their own myList ===");
  try {
    const readSnap = await getDocs(collection(clientDb, 'users', user1Uid, 'myList'));
    console.log("PASS: User 1 read their own myList. Doc count:", readSnap.size);
    readSnap.forEach(d => console.log("  Item:", d.id, d.data().title));
  } catch (err) {
    console.error("FAIL: User 1 could not read their own myList:", err.code, err.message);
  }

  console.log("\n=== STEP 6: User 1 attempts to read User 2's myList (should fail) ===");
  try {
    await getDocs(collection(clientDb, 'users', user2Uid, 'myList'));
    console.error("FAIL: User 1 was able to read User 2's myList!");
  } catch (err) {
    console.log("PASS: User 1 was denied reading User 2's myList as expected:", err.code);
  }

  console.log("\n=== STEP 7: User 1 attempts to write to User 2's myList (should fail) ===");
  try {
    await setDoc(doc(clientDb, 'users', user2Uid, 'myList', testDocId), testPayload);
    console.error("FAIL: User 1 was able to write to User 2's myList!");
  } catch (err) {
    console.log("PASS: User 1 was denied writing to User 2's myList as expected:", err.code);
  }

  console.log("\n=== STEP 8: User 1 removes item from myList ===");
  try {
    await deleteDoc(doc(clientDb, 'users', user1Uid, 'myList', testDocId));
    console.log("PASS: User 1 deleted item from their own myList.");
  } catch (err) {
    console.error("FAIL: User 1 could not delete item:", err.code, err.message);
  }

  console.log("\n=== STEP 9: User 1 reads empty myList ===");
  try {
    const emptySnap = await getDocs(collection(clientDb, 'users', user1Uid, 'myList'));
    console.log("PASS: User 1 read empty myList. Doc count:", emptySnap.size);
  } catch (err) {
    console.error("FAIL: User 1 could not read empty myList:", err.code, err.message);
  }

  console.log("\n=== STEP 10: Sign in as User 2 and verify isolation ===");
  await signOut(clientAuth);
  const customToken2 = await admin.auth().createCustomToken(user2Uid);
  await signInWithCustomToken(clientAuth, customToken2);
  console.log("Signed in as User 2:", clientAuth.currentUser.uid);

  try {
    await setDoc(doc(clientDb, 'users', user2Uid, 'myList', "anime:user2-item"), {
      animeId: "user2-item",
      kind: "anime",
      title: "User 2 Anime",
      slug: "user2-item"
    });
    console.log("PASS: User 2 wrote to their myList.");

    const u2Snap = await getDocs(collection(clientDb, 'users', user2Uid, 'myList'));
    console.log("PASS: User 2 read their myList. Count:", u2Snap.size);

    // Clean up
    await deleteDoc(doc(clientDb, 'users', user2Uid, 'myList', "anime:user2-item"));
    console.log("PASS: User 2 cleaned up their test item.");
  } catch (err) {
    console.error("FAIL: User 2 test failed:", err.code, err.message);
  }

  await signOut(clientAuth);
  console.log("\nAll tests completed!");
}

test().catch(console.error);
