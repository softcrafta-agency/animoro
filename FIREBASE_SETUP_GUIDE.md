# Animoro — Complete Firebase Setup Guide

Welcome to **Animoro**, your real production-ready anime editorial blog platform.

Animoro is built on **HTML5, CSS3, Vanilla JavaScript, Firebase Authentication, Cloud Firestore, and Cloud Storage for Firebase**.

---

## 1. Create a Firebase Project

1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** (or **Create a project**).
3. Name your project (e.g., `animoro-blog`).
4. (Optional) Disable Google Analytics if not needed, then click **Create project**.

---

## 2. Register Your Web App & Get Credentials

1. On the Project Overview page, click the **Web icon (`</>`)** to add an app.
2. Enter an app nickname (e.g., `Animoro Web`).
3. Click **Register app**.
4. Copy the `firebaseConfig` object shown on the screen:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project",
   storageBucket: "your-project.firebasestorage.app",
     messagingSenderId: "1234567890",
     appId: "1:123456789:web:abcdef"
   };
   ```
5. Open `/js/firebase-config.js` in this project and replace the placeholder values with your copied configuration.
   *(Tip: You can also enter them directly in the **Admin Portal &rarr; Firebase Settings** tab!)*

   For Vite deployments, set `VITE_FIREBASE_STORAGE_BUCKET` to the exact `storageBucket` value from your Firebase web configuration.

---

## 3. Enable Firebase Authentication (Email/Password)

1. In the Firebase Console left menu, navigate to **Build &rarr; Authentication**.
2. Click **Get started**.
3. In the **Sign-in method** tab, select **Email/Password**.
4. Enable the first toggle (**Email/Password**), then click **Save**.
5. Switch to the **Users** tab and click **Add user**:
   - Enter your admin email (e.g., `softcrafta@gmail.com`).
   - Enter a strong password.
   - Click **Add user**.

---

## 4. Enable Cloud Firestore Database

1. In the left menu, navigate to **Build &rarr; Firestore Database**.
2. Click **Create database**.
3. Choose a Firestore location closest to your users.
4. Select **Start in production mode**, then click **Create**.
5. Go to the **Rules** tab in Firestore and paste the contents of `firestore.rules` from this repository, then click **Publish**.

### Admin Access Authorization:
Animoro enforces strict role-based Firestore security rules:
- Any user signing in with `softcrafta@gmail.com` is automatically recognized by the security rules and automatically bootstraps their admin document in the `admins` collection upon sign-in.
- For any other administrator email:
  1. In the **Authentication &rarr; Users** tab, copy the user's **User UID**.
  2. In the **Firestore Database &rarr; Data** tab, click **Start collection** (or add to existing `admins` collection).
  3. Set Collection ID to `admins`.
  4. Set Document ID to the user's **User UID**.
  5. Add a field: Field `role` &rarr; Type `string` &rarr; Value `admin`.
  6. Click **Save**.

### Security Rules Highlights:
- **Public access:** Anyone can read published articles, view categories, and submit contact inquiries.
- **Private Drafts:** Draft articles are never visible to the public — only authenticated admins can see or edit them.
- **Admin protection:** Only authenticated administrators can create, edit, publish, or delete posts.
- **View counter:** Public visitors can atomically increment `views` on published articles (+1).
- **Article image uploads:** Uploaded article images are stored in Cloud Storage; Firestore stores only their download URLs. Direct URL images remain external URLs.

## 5. Enable Cloud Storage for Firebase

1. In the same Firebase project, open **Build &rarr; Storage** and create/enable the Storage bucket.
2. Set `VITE_FIREBASE_STORAGE_BUCKET` to the exact bucket value shown in the web app configuration.
3. Deploy the repository's `storage.rules`. They allow public reads for article images and restrict uploads/deletes to users with `role: admin` in `admins/{uid}`.
4. From the project directory, deploy both rule sets with `firebase deploy --only firestore:rules,storage`.
   The first Storage Rules deployment may ask to enable permission for Storage Rules to read the Firestore `admins` collection; approve it for role-based admin checks.

---

## 6. Publish Your First Anime Story

1. Open your Animoro site and click **Admin** in the navigation header (or go to `admin-login.html`).
2. Sign in with your admin email and password.
3. Click **+ New Article** or **Add New Article**:
   - Enter an engaging title (e.g., *"Attack on Titan: The Narrative Anatomy of Freedom"*).
   - The URL slug will generate automatically.
   - Write or format your article content using the Rich Text toolbar.
   - Drop or select up to three images for cover, middle, and ending positions, or use **Direct URL** for an external cover image. Selected files upload to Storage when the article is saved.
   - Select a Category (*Anime News, Reviews, Rankings, Guides, Recommendations, Manga, Seasonal Anime*).
   - Add tags (e.g., `#shonen`, `#mappa`, `#analysis`).
   - Choose Status: **Published** to publish immediately or **Draft** to save privately.
   - Click **Publish Article**.

Your article is now live on the homepage, under its category archive, searchable in real-time, and equipped with an atomic view counter!
