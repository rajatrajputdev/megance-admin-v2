
# Firebase and Supabase Setup Instructions

## Firebase Setup

1.  **Create a Firebase Project:**
    *   Go to the [Firebase Console](https://console.firebase.google.com/).
    *   Click on "Add project" and follow the on-screen instructions to create a new project.

2.  **Get Firebase Configuration:**
    *   In your Firebase project, click on the "Project Overview" settings icon and select "Project settings".
    *   Under the "General" tab, scroll down to the "Your apps" section.
    *   Click on the web icon (`</>`) to create a new web app.
    *   Register your app and you will be provided with a `firebaseConfig` object.

3.  **Update Firebase Configuration File:**
    *   Open the `src/firebase/config.js` file in your project.
    *   Replace the placeholder values in the `firebaseConfig` object with the values from your Firebase project.

4.  **Set up Firestore:**
    *   In the Firebase Console, go to the "Firestore Database" section.
    *   Click on "Create database" and choose to start in "test mode" for now. You can change the security rules later.
    *   Create a new collection named `products`.

## Supabase Setup

1.  **Create a Supabase Project:**
    *   Go to the [Supabase Dashboard](https://app.supabase.io/).
    *   Click on "New project" and follow the on-screen instructions to create a new project.

2.  **Get Supabase Configuration:**
    *   In your Supabase project, go to the "Settings" page.
    *   Click on the "API" tab.
    *   You will find your Supabase URL and your `anon` key (which is the `supabaseKey`).

3.  **Update Supabase Configuration File:**
    *   Open the `src/supabase/config.js` file in your project.
    *   Replace the placeholder values for `supabaseUrl` and `supabaseKey` with the values from your Supabase project.

4.  **Set up Supabase Storage:**
    *   In the Supabase Dashboard, go to the "Storage" section.
    *   Create a new bucket named `product-images`.
    *   Make sure to set the bucket to be `public` so that the images can be accessed via a URL.

## Running the Application

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Start the Development Server:**
    ```bash
    npm run dev
    ```

3.  Open your browser and navigate to `http://localhost:5173` (or the port shown in your terminal).

---

## CLI-based Cloud Setup (Recommended)

Below are exact CLI commands to set up Supabase Storage for images and Firebase Firestore for product details. Run these on your machine; interactive logins will open your browser.

### Supabase (images)

1. Install CLI
   - macOS: `brew install supabase/tap/supabase`
   - Linux: `curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz | tar -xz && sudo mv supabase /usr/local/bin`
2. Login: `supabase login`
3. Create a project (or use existing):
   - `supabase projects create my-ecom --org-id <your_org_id> --region us-east-1`
4. Get project ref: `supabase projects list`
5. Create public bucket for images:
   - `supabase storage create-bucket product-images --public --project-ref <your_project_ref>`
6. Get `SUPABASE_URL` and `SUPABASE_ANON_KEY` from Dashboard → Project Settings → API

### Firebase (product details)

1. Install CLI: `npm i -g firebase-tools`
2. Login: `firebase login`
3. Create project: `firebase projects:create my-ecom --display-name "My Ecom"`
4. Select project: `firebase use my-ecom`
5. Initialize Firestore locally: `firebase init firestore`
6. Create a Web App: `firebase apps:create web "Ecom Web"`
7. Show SDK config to copy env values: `firebase apps:sdkconfig web`
8. Optional: Deploy Firestore rules later: `firebase deploy --only firestore:rules`

### Environment Variables

1. Copy `.env.example` to `.env.local` and fill in values:
   - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
   - `VITE_FIREBASE_*` (from Firebase SDK config)
2. Restart dev server if running.

### Verify

- Supabase buckets: `supabase storage list-buckets --project-ref <ref>`
- Firebase apps: `firebase apps:list`
- Firestore access: `firebase firestore:databases:list`
