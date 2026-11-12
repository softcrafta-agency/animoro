import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  initializeApp,
  deleteApp,
} from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  connectAuthEmulator,
  deleteUser,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  ARTICLE_KEYWORD_GROUPS,
  buildArticleKeywordGroupsPayload,
  normalizeKeywordGroupValues,
} from '../js/article-keyword-groups.js';

const PROJECT_ID = 'demo-animoro-keyword-test';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;

function assertEmulatorHost(host, service, expectedPort) {
  assert.ok(host, `${service} emulator host must be provided by firebase emulators:exec`);
  assert.match(host, new RegExp(`^(127\\.0\\.0\\.1|localhost):${expectedPort}$`),
    `${service} must connect to localhost:${expectedPort}, received ${host}`);
}

assert.equal(process.env.GCLOUD_PROJECT, PROJECT_ID,
  'Refusing to run unless Firebase CLI selected the non-production demo project.');
assertEmulatorHost(FIRESTORE_HOST, 'Firestore', 8080);
assertEmulatorHost(AUTH_HOST, 'Authentication', 9099);

const firebaseConfig = {
  apiKey: 'emulator-only-api-key',
  authDomain: 'localhost',
  projectId: PROJECT_ID,
};
const primaryApp = initializeApp(firebaseConfig, `keyword-test-${randomUUID()}`);
const primaryAuth = getAuth(primaryApp);
connectAuthEmulator(primaryAuth, `http://${AUTH_HOST}`, { disableWarnings: true });
const primaryDb = getFirestore(primaryApp);
connectFirestoreEmulator(primaryDb, ...FIRESTORE_HOST.split(':').map((part, index) =>
  index === 1 ? Number(part) : part
));

const documentIds = [
  `keyword-emulator-draft-${randomUUID()}`,
  `keyword-emulator-published-${randomUUID()}`,
  `keyword-emulator-legacy-${randomUUID()}`,
];
const createdDocumentIds = [];
let secondApp;
let secondAuth;
let anonymousApp;
let signedInUser;

function assertKeywordGroups(article, expectedValues) {
  assert.deepEqual(normalizeKeywordGroupValues(article), expectedValues);
}

function createArticleBase(id, status, authorId) {
  return {
    title: `Emulator keyword test ${status}`,
    slug: id,
    excerpt: 'Temporary emulator-only integration article.',
    content: '<p>Temporary test content for Firestore lifecycle verification.</p>',
    category: 'Emulator Test',
    categories: ['Emulator Test'],
    seoTitle: 'Temporary emulator test article',
    seoDescription: 'Temporary emulator test description.',
    authorName: 'Emulator Test User',
    authorId,
    authorEmail: 'keyword-test@example.invalid',
    status,
    featured: false,
    tags: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    publishedAt: status === 'published' ? serverTimestamp() : null,
  };
}

async function run() {
  try {
    const password = `test-${randomUUID()}-Pass1!`;
    const userCredential = await createUserWithEmailAndPassword(
      primaryAuth,
      `keyword-test-${randomUUID()}@example.invalid`,
      password
    );
    signedInUser = userCredential.user;
    const authorId = signedInUser.uid;

    const initialGroups = {
      additionalSeoKeywords: ['anime story analysis'],
      storyCharacterKeywords: ['Akira character arc'],
      longTailKeywords: ['how the story develops'],
      questionBasedKeywords: ['Who is Akira?'],
    };
    const draftId = documentIds[0];
    const draftRef = doc(primaryDb, 'posts', draftId);
    const createPayload = {
      ...createArticleBase(draftId, 'draft', authorId),
      ...buildArticleKeywordGroupsPayload(initialGroups, {}, [], true),
    };
    await setDoc(draftRef, createPayload);
    createdDocumentIds.push(draftId);

    const firstRead = await getDocFromServer(draftRef);
    assert.ok(firstRead.exists());
    assertKeywordGroups(firstRead.data(), initialGroups);
    assert.equal(firstRead.data().status, 'draft');
    assert.equal(firstRead.data().title, createPayload.title);
    assert.equal(firstRead.data().content, createPayload.content);
    console.log('PASS create and read back a draft with all four keyword groups');

    const refreshApp = initializeApp(firebaseConfig, `keyword-refresh-${randomUUID()}`);
    secondApp = refreshApp;
    secondAuth = getAuth(refreshApp);
    connectAuthEmulator(secondAuth, `http://${AUTH_HOST}`, { disableWarnings: true });
    await signInWithEmailAndPassword(
      secondAuth,
      signedInUser.email,
      password
    );

    const refreshDb = getFirestore(refreshApp);
    connectFirestoreEmulator(refreshDb, ...FIRESTORE_HOST.split(':').map((part, index) =>
      index === 1 ? Number(part) : part
    ));
    const refreshedDraft = await getDocFromServer(doc(refreshDb, 'posts', draftId));
    assertKeywordGroups(refreshedDraft.data(), initialGroups);
    console.log('PASS refresh and reload persisted keyword groups from a fresh client');

    let updatedGroups = initialGroups;
    let updatedDraft = refreshedDraft;
    for (const { key } of ARTICLE_KEYWORD_GROUPS) {
      updatedGroups = {
        ...updatedGroups,
        [key]: [`${key} revised phrase`],
      };
      await updateDoc(draftRef, buildArticleKeywordGroupsPayload(
        updatedGroups,
        updatedDraft.data(),
        [key],
        false
      ));
      updatedDraft = await getDocFromServer(draftRef);
      assertKeywordGroups(updatedDraft.data(), updatedGroups);
    }
    assert.equal(updatedDraft.data().title, createPayload.title);
    assert.equal(updatedDraft.data().seoDescription, createPayload.seoDescription);
    assert.equal(updatedDraft.data().content, createPayload.content);
    console.log('PASS update each keyword group independently without losing other groups or article fields');

    const clearedGroups = {
      ...updatedGroups,
      additionalSeoKeywords: [],
    };
    await updateDoc(draftRef, buildArticleKeywordGroupsPayload(
      clearedGroups,
      updatedDraft.data(),
      ['additionalSeoKeywords'],
      false
    ));
    const clearedDraft = await getDocFromServer(draftRef);
    assertKeywordGroups(clearedDraft.data(), clearedGroups);
    console.log('PASS intentionally clear a keyword group while preserving other groups');

    const legacyId = documentIds[2];
    const legacyRef = doc(primaryDb, 'posts', legacyId);
    const legacyArticle = createArticleBase(legacyId, 'draft', authorId);
    delete legacyArticle.createdAt;
    delete legacyArticle.updatedAt;
    delete legacyArticle.publishedAt;
    legacyArticle.title = 'Legacy article without keyword groups';
    legacyArticle.content = '<p>Legacy article content is retained.</p>';
    await setDoc(legacyRef, legacyArticle);
    createdDocumentIds.push(legacyId);
    const legacyRead = await getDocFromServer(legacyRef);
    const legacyKeywordPayload = buildArticleKeywordGroupsPayload(
      {},
      legacyRead.data(),
      [],
      false
    );
    assert.deepEqual(legacyKeywordPayload, {});
    await updateDoc(legacyRef, {
      seoDescription: 'Updated legacy description.',
      ...legacyKeywordPayload,
    });
    const updatedLegacy = (await getDocFromServer(legacyRef)).data();
    assert.equal(updatedLegacy.content, legacyArticle.content);
    assert.equal(updatedLegacy.title, legacyArticle.title);
    assert.equal(updatedLegacy.seoDescription, 'Updated legacy description.');
    for (const { key } of ARTICLE_KEYWORD_GROUPS) {
      assert.equal(Object.hasOwn(updatedLegacy, key), false, `${key} should remain absent`);
    }
    console.log('PASS edit a legacy article without adding empty keyword fields or losing content');

    const publishedId = documentIds[1];
    const publishedRef = doc(primaryDb, 'posts', publishedId);
    const publishedGroups = {
      additionalSeoKeywords: ['published additional phrase'],
      storyCharacterKeywords: ['published character'],
      longTailKeywords: ['published long-tail phrase'],
      questionBasedKeywords: ['What happens in this article?'],
    };
    await setDoc(publishedRef, {
      ...createArticleBase(publishedId, 'published', authorId),
      ...buildArticleKeywordGroupsPayload(publishedGroups, {}, [], true),
    });
    createdDocumentIds.push(publishedId);
    const published = await getDocFromServer(publishedRef);
    assert.equal(published.data().status, 'published');
    assertKeywordGroups(published.data(), publishedGroups);
    assert.equal(published.data().publishedAt.toDate instanceof Function, true);

    anonymousApp = initializeApp(firebaseConfig, `keyword-anonymous-${randomUUID()}`);
    const anonymousDb = getFirestore(anonymousApp);
    connectFirestoreEmulator(anonymousDb, ...FIRESTORE_HOST.split(':').map((part, index) =>
      index === 1 ? Number(part) : part
    ));
    await assert.rejects(getDocFromServer(doc(anonymousDb, 'posts', draftId)));
    const publicPublished = await getDocFromServer(doc(anonymousDb, 'posts', publishedId));
    assert.ok(publicPublished.exists());
    assertKeywordGroups(publicPublished.data(), publishedGroups);
    console.log('PASS published article visibility and draft access rules remain intact');
  } finally {
    if (signedInUser && primaryAuth.currentUser) {
      for (const id of createdDocumentIds) {
        await deleteDoc(doc(primaryDb, 'posts', id)).catch(error => {
          if (error?.code !== 'not-found') throw error;
        });
      }
      createdDocumentIds.length = 0;
      await deleteUser(primaryAuth.currentUser).catch(error => {
        if (error?.code !== 'auth/user-not-found') throw error;
      });
      console.log('PASS remove all temporary article records and Auth user');
    }
    if (secondAuth?.currentUser) await signOut(secondAuth);
    if (anonymousApp) await deleteApp(anonymousApp);
    if (secondApp) await deleteApp(secondApp);
    await deleteApp(primaryApp);
  }
}

run().catch(error => {
  console.error('Firebase Emulator keyword integration test failed:', error);
  process.exitCode = 1;
});
