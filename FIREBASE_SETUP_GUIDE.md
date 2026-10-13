# Animoro — Complete Firebase Setup Guide

Welcome to **Animoro**, your real production-ready anime editorial blog platform.

Animoro is built on **HTML5, CSS3, Vanilla JavaScript, Firebase Authentication, and Cloud Firestore**.

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
     messagingSenderId: "1234567890",
     appId: "1:123456789:web:abcdef"
   };
   ```
5. Set the `VITE_FIREBASE_*` values in your frontend environment and rebuild the site.

---

## 3. Enable Firebase Authentication

1. In the Firebase Console left menu, navigate to **Build &rarr; Authentication**.
2. Click **Get started**.
3. In the **Sign-in method** tab, enable **Email/Password** and **Google**, then click **Save**.
4. In **Authentication &rarr; Settings &rarr; Authorized domains**, add `animoro.in` and `www.animoro.in`.
5. Keep `VITE_FIREBASE_AUTH_DOMAIN` set to the Firebase project's configured auth domain (for project `animoro-b9268`, normally `animoro-b9268.firebaseapp.com`). Do not replace it with `animoro.in` unless a Firebase custom auth domain has been explicitly configured and its DNS setup is complete.
6. Switch to the **Users** tab and click **Add user**:
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
Animoro verifies administrators using an `admins/{uid}` Firestore document whose `role` is `admin`.
- Create the authorized administrator's document before first login:
  1. In the **Authentication &rarr; Users** tab, copy the user's **User UID**.
  2. In the **Firestore Database &rarr; Data** tab, click **Start collection** (or add to existing `admins` collection).
  3. Set Collection ID to `admins`.
  4. Set Document ID to the user's **User UID**.
  5. Add a field: Field `role` &rarr; Type `string` &rarr; Value `admin`.
  6. Click **Save**.
- The existing super-admin UID/email is additionally recognized by Firestore rules. Normal users cannot create their own admin documents.

Deploy rules explicitly after editing them:

```sh
npx firebase-tools deploy --only firestore:rules --project YOUR_FIREBASE_PROJECT_ID
```

### Security Rules Highlights:
- **Public access:** Anyone can read published articles, view categories, and submit contact inquiries.
- **Private Drafts:** Draft articles are never visible to the public — only authenticated admins can see or edit them.
- **Admin protection:** Only authenticated administrators can create, edit, publish, or delete posts.
- **Upcoming anime:** Published entries in the existing `upcomingAnime` collection are readable only by signed-in users; writes and unpublished-entry access require administrator authorization.
- **View counter:** Public visitors can atomically increment `views` on published articles (+1).
- **Image uploads:** Anime covers and banners, upcoming anime posters, article covers, and article body images can be selected by drag-and-drop or file picker, with manual URL entry retained as a fallback. New image files are uploaded to the configured Firebase Storage bucket by the authenticated Firebase client and Firestore stores download URLs and lightweight metadata only. Storage writes are limited to admins by `storage.rules`; the protected `/api/delete-image` endpoint checks Firestore references before deleting either Firebase Storage or legacy R2 objects. Existing R2 URLs remain readable.
- **My List:** Each signed-in user's normal/upcoming anime entries are stored under `users/{uid}/myList`; Firestore rules permit access only when the authenticated UID matches `{uid}`.

### Firebase Storage setup

The existing project configuration uses `VITE_FIREBASE_STORAGE_BUCKET`. For `animoro-b9268`, verify that its value matches the bucket shown under Firebase Console → **animoro-b9268** → **Build** → **Storage**. The repository currently targets `animoro-b9268.firebasestorage.app`, but a project setting alone does not prove that the remote bucket exists.

If Storage has not been initialized, open **Build → Storage → Get started**, create the default bucket only if the Console reports that no bucket exists, choose the required data location, and start in production mode. Then publish this repository's rules with `firebase deploy --only storage` from a Firebase CLI authenticated to `animoro-b9268`, or paste `storage.rules` into the Storage **Rules** tab and click **Publish**. The rules allow public reads for image objects, restrict writes to existing Animoro super-admins or `admins/{uid}` records with `role: "admin"`, limit uploads to 3 MB PNG/JPEG/WebP files, and disallow client-side deletes. If the Console asks to enable Storage-to-Firestore rule lookups, approve that so the admin-document check can run.

Set `VITE_FIREBASE_STORAGE_BUCKET` to the verified bucket name in every frontend build environment and redeploy. The existing API image deletion route also uses the existing `FIREBASE_SERVICE_ACCOUNT_JSON` and accepts `FIREBASE_STORAGE_BUCKET` (or the same `VITE_FIREBASE_STORAGE_BUCKET`) server-side; no R2 credentials are used for new uploads.

### Legacy Cloudflare R2 images

Keep these server-side Vercel variables only while legacy R2 objects are still referenced or need deletion. Never expose the secret key in browser code:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_BASE_URL` (preferred; the existing `R2_PUBLIC_URL` name remains supported)
- `FIREBASE_SERVICE_ACCOUNT_JSON` (used by the API to verify Firebase ID tokens and administrator roles)

Existing R2 download URLs in Firestore and published article HTML continue to work. New uploads use Firebase Storage. Keep the legacy R2 API/configuration until its objects have been migrated and verified; do not delete R2 objects just because a new Firebase URL was saved.

---

## 5. Publish Your First Anime Story

1. Open your Animoro site and click **Admin** in the navigation header (or go to `admin-login.html`).
2. Sign in with your admin email and password.
3. Click **+ New Article** or **Add New Article**:
   - Enter an engaging title (e.g., *"Attack on Titan: The Narrative Anatomy of Freedom"*).
   - The URL slug will generate automatically.
   - Write or format your article content using the Rich Text toolbar.
   - Enter an image URL in the **Cover Image URL** field (optional; articles can also be published without an image). A live preview will show immediately.
   - Select a Category (*Anime News, Reviews, Rankings, Guides, Recommendations, Manga, Seasonal Anime*).
   - Add tags (e.g., `#shonen`, `#mappa`, `#analysis`).
   - Choose Status: **Published** to publish immediately or **Draft** to save privately.
   - Click **Publish Article**.

Your article is now live on the homepage, under its category archive, searchable in real-time, and equipped with an atomic view counter!

## 6. Dynamic XML Sitemap

The public sitemap is served at `https://www.animoro.in/sitemap.xml` through the existing Vercel API setup. It includes public pages, categories represented by published posts, and posts whose `status` is `published`. The endpoint fetches current records for each request and sends the response with `no-store` caching.

The sitemap reuses the existing `FIREBASE_SERVICE_ACCOUNT_JSON` Vercel environment variable used by the image API. Do not expose this value in client-side code. Test the XML generator with `node --test api/_lib/sitemap.test.js`. For an end-to-end local test, run `vercel dev` with the existing server-side Firebase environment variable configured, then request `http://localhost:3000/sitemap.xml`.

## 7. Server-rendered public article pages

Public article URLs keep the existing `/blog.html/{slug}` format. On Vercel, those paths are rewritten to the server-side `api/article.js` handler, which reads only documents in `posts` with `status: "published"` using Firebase Admin. The handler uses the existing `FIREBASE_SERVICE_ACCOUNT_JSON` server-only environment variable; it must not be configured with a `VITE_` prefix. Article HTML is sanitized before delivery. Missing, malformed, draft, and deleted article slugs return HTTP 404.

The article page returns its title, summary, body, author, dates, image, canonical URL, Open Graph/Twitter metadata, and Article/Breadcrumb JSON-LD in the initial HTML response. Browser JavaScript adds the existing sharing and view-count behavior without issuing a second request for the main article. Public article responses use a 60-second shared cache; a publish, edit, or delete can therefore take up to 60 seconds to be reflected by Vercel's shared cache. Deploy the Vercel project with its existing Vite build and output configuration. No Firebase Rules, database, R2, or publishing-endpoint changes are required.
