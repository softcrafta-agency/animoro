# Animoro — Complete Firebase Setup Guide

Welcome to **Animoro**, your real production-ready anime editorial blog platform.

Animoro is built on **HTML5, CSS3, Vanilla JavaScript, Firebase Authentication, Cloud Firestore, and Firebase Storage**.

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
3. (Optional) Check "Also set up Firebase Hosting".
4. Click **Register app**.
5. Copy the `firebaseConfig` object shown on the screen:
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
6. Open `/js/firebase-config.js` in this project and replace the placeholder values with your copied configuration.
   *(Tip: You can also enter them directly in the **Admin Portal &rarr; Firebase Settings** tab!)*

---

## 3. Enable Firebase Authentication

1. In the Firebase Console left menu, navigate to **Build &rarr; Authentication**.
2. Click **Get started**.
3. In the **Sign-in method** tab, select **Email/Password**.
4. Enable the first toggle (**Email/Password**), then click **Save**.
5. Switch to the **Users** tab and click **Add user**:
   - Enter your email (e.g., `softcrafta@gmail.com` or your personal admin email).
   - Enter a strong password.
   - Click **Add user**.

---

## 4. Enable Cloud Firestore Database

1. In the left menu, navigate to **Build &rarr; Firestore Database**.
2. Click **Create database**.
3. Choose a Firestore location closest to your users.
4. Select **Start in production mode**, then click **Create**.
5. Go to the **Rules** tab in Firestore and paste the contents of `firestore.rules` from this repository, then click **Publish**.

### Security Rules Highlights:
- **Public access:** Anyone can read published articles and submit contact inquiries.
- **Admin protection:** Only authenticated administrators can create, edit, or delete posts.
- **View counter:** Public visitors can atomically increment `views` on published articles.

---

## 5. Enable Firebase Storage (For Cover Images)

1. In the left menu, navigate to **Build &rarr; Storage**.
2. Click **Get started**.
3. Accept default cloud storage location and select **Start in production mode**.
4. Go to the **Rules** tab in Storage and paste the contents of `storage.rules` from this repository, then click **Publish**.

---

## 6. Publish Your First Anime Story

1. Open your Animoro site and click **Admin** in the navigation header (or go to `admin-login.html`).
2. Sign in with the email and password you created in Step 3.
3. Click **+ New Article** or **Add New Article**:
   - Enter an engaging title (e.g., *"Attack on Titan: The Narrative Anatomy of Freedom"*).
   - The URL slug will generate automatically.
   - Write or paste your article content using the Rich Text toolbar.
   - Upload a cover image (or drag and drop an image file). The file is uploaded directly to Firebase Storage with a real-time progress bar.
   - Select a Category (*Anime News, Reviews, Rankings, Guides, Recommendations, Manga, Seasonal Anime*).
   - Add tags (e.g., `#shonen`, `#mappa`, `#analysis`).
   - Check **Featured in Hero Slider** if you want it on the homepage carousel.
   - Click **Publish Article**.

Your article is now live on the homepage, under its category archive, searchable in real-time, and equipped with a live reader view counter!
