# ⚡ Edge-Drop: Bring Your Own Firebase Setup Guide

> **Zero-Knowledge, Local-First, Zero Data Lock-In.**  
> Edge-Drop stores all your clipboard history, images, and stacks securely on your local SSD first. When you connect **Bring Your Own Firebase**, you get 100% control over your cloud sync, encryption keys, and security rules on your own personal Google Cloud account.
>
> 🔒 **Rollback Guarantee:** You can switch back to Edge-Drop's default cloud backend at any time with a single click. Your local items will never be deleted.

---

## 📋 Prerequisites
- A Google account (free forever on the Firebase Spark plan — 15 GB storage, 50,000 document reads/day, 20,000 writes/day, zero credit card required).
- Web browser open to the [Firebase Console](https://console.firebase.google.com/).

---

## 🚀 Step 1: Create a Free Firebase Project (30 seconds)

1. Open [console.firebase.google.com](https://console.firebase.google.com/).
2. Click **Add project** (or **Create a project**).
3. Enter a project name, for example: `edge-drop-vault` (or your preferred name).
4. Click **Continue**.
5. Disable Google Analytics (optional, keeps setup minimal).
6. Click **Create project** and wait a few seconds for provisioning to finish.
7. Click **Continue** to open your project dashboard.

---

## 🔑 Step 2: Enable Authentication (1 minute)

Edge-Drop uses Firebase Authentication to isolate each user's vault to their private user ID.

1. In the left navigation menu, navigate to **Build** → **Authentication**.
2. Click **Get started**.
3. Under the **Sign-in method** tab, click **Email/Password**:
   - Toggle **Enable** to ON.
   - (Optional) You can leave *Email link (passwordless)* disabled.
   - Click **Save**.
4. Click **Add new provider** and select **Anonymous**:
   - Toggle **Enable** to ON.
   - Click **Save**. *(This allows Instant Guest Vault sync without entering an email).*

---

## 🗄️ Step 3: Create Cloud Firestore Database & Paste Rules (1 minute)

Edge-Drop synchronizes text clips, URLs, tags, and item metadata using Cloud Firestore.

1. In the left navigation menu, navigate to **Build** → **Firestore Database**.
2. Click **Create database**.
3. **Database location:** Select the region closest to you (e.g. `nam5 (us-central)` or `eur3 (europe-west)`). Click **Next**.
4. **Secure rules:** Choose **Start in production mode**. Click **Create**.
5. Once created, click on the **Rules** tab at the top.
6. Replace all existing text in the editor with the exact security rules below:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

7. Click **Publish**.

> 💡 **Why this rule?** It ensures strict tenant isolation: only the authenticated user matching `request.auth.uid` can read or write their own clipboard items. No one else, not even other authenticated users, can access your documents.

---

## 📦 Step 4: Enable Storage for Images (Optional, 1 minute)

If you copy images or file thumbnails, Edge-Drop can sync them securely to your private Firebase Storage bucket.

1. In the left navigation menu, navigate to **Build** → **Storage**.
2. Click **Get started**.
3. Choose **Start in production mode** and click **Next**.
4. Confirm your Cloud Storage location and click **Done**.
5. Once provisioned, click on the **Rules** tab at the top.
6. Replace all existing text with the exact storage rules below:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

7. Click **Publish**.

---

## ⚙️ Step 5: Register Web App & Copy Configuration (30 seconds)

1. Click the **Project settings** (⚙️ gear icon) next to *Project Overview* in the top left sidebar.
2. In the **General** tab, scroll down to the **Your apps** section.
3. Click the **Web** icon (`</>`).
4. Enter an App nickname: `Edge-Drop`.
5. You do **not** need to check *Firebase Hosting*.
6. Click **Register app**.
7. Firebase will display a code snippet. Copy either:
   - The entire `const firebaseConfig = { ... };` object.
   - OR just the JSON within the curly brackets `{ ... }`.
   - OR the entire `<script>` block.

### Example of what your config looks like:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyD-1234567890abcdefghijklmnopqrst",
  authDomain: "edge-drop-vault.firebaseapp.com",
  projectId: "edge-drop-vault",
  storageBucket: "edge-drop-vault.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};
```

---

## 📥 Step 6: Connect Inside Edge-Drop (10 seconds)

1. Open Edge-Drop and click the **Settings** (⚙️ gear icon).
2. Scroll to the **Bring Your Own Firebase** card under *Vault & Sync*.
3. Click **Configure Custom Database**.
4. Paste your copied configuration into the text box. Edge-Drop automatically accepts:
   - Direct JSON
   - JavaScript code snippet (`const firebaseConfig = { ... }`)
   - `<script>` tag blocks
   - `.env` key-value pairs
5. Click **Connect & Encrypt**.
   - Edge-Drop validates connectivity against Google APIs.
   - Your configuration is encrypted at rest using OS hardware DPAPI.

---

## 🩺 Step 7: Test Connection & Sign In

1. Click **Test Connection**.
   - Edge-Drop performs a live latency ping and verifies that both **Auth** and **Firestore** are healthy (`✓ Connection successful • Auth: OK • Firestore: OK`).
2. Under **Account & Verification**:
   - Click **Instant Guest Vault** to start syncing immediately as an anonymous user.
   - OR enter your email and password, then click **Register** or **Sign In** to create a named account.
3. Your items are now backed up to your personal Google Cloud Firestore database in real time!

---

## 🔄 Step 8: How to Roll Back to Default Backend Anytime

If you ever want to disconnect your personal Firebase database and switch back to the original default Edge-Drop backend:

1. Open **Settings** → **Bring Your Own Firebase**.
2. Click the red **Reset** button.
3. Edge-Drop immediately:
   - Removes custom credentials from encrypted storage.
   - Disconnects from your custom database.
   - Restores the original default backend.
   - Preserves all your local clipboard items with zero data loss.

---

## 🛠️ Common Troubleshooting

| Error Message in Edge-Drop | Root Cause | Solution |
| :--- | :--- | :--- |
| `Firebase API key is invalid` | Typo in `apiKey` or characters missing. | Re-copy the snippet from Project Settings in Firebase Console. |
| `Firebase Authentication is not enabled yet` | Step 2 was skipped; Auth is not turned on. | In Firebase Console, go to **Build** → **Authentication**, click **Get started**, and enable **Email/Password** or **Anonymous**. |
| `Cloud Firestore database is not created yet` | Step 3 was skipped; Firestore database does not exist. | In Firebase Console, go to **Build** → **Firestore Database**, click **Create database**, and choose production mode. |
| `Permission denied on Firestore or Storage` | Security rules were not published. | Go to the **Rules** tab in Firestore or Storage, paste the rules from Step 3 & 4, and click **Publish**. |
| `API key has HTTP referer restrictions` | API key restrictions in Google Cloud Console block requests. | In Google Cloud Console, under Credentials, set Application restrictions to *None* for this key. |
