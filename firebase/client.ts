// Import the functions you need from the SDKs you need
import { getApp, getApps, initializeApp } from "firebase/app";
// import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

let app: any = null;
let auth: any = null;
let db: any = null;

// Initialize Firebase with config from API
const initializeFirebaseClient = async () => {
  if (typeof window === 'undefined') {
    // Server-side: return null objects
    return { auth: null, db: null };
  }

  try {
    // Get Firebase config from API endpoint
    const response = await fetch('/api/firebase-config');
    const { config, hasValidConfig } = await response.json();

    if (!hasValidConfig || !config) {
      console.warn('Firebase client: No valid configuration available');
      return { auth: null, db: null };
    }

    // Initialize Firebase if not already initialized
    if (!getApps().length) {
      app = initializeApp(config);
    } else {
      app = getApp();
    }

    auth = getAuth(app);
    db = getFirestore(app);

    console.log('Firebase client initialized successfully');
    return { auth, db };
  } catch (error) {
    console.error('Firebase client initialization error:', error);
    return { auth: null, db: null };
  }
};

// Initialize immediately if in browser
if (typeof window !== 'undefined') {
  initializeFirebaseClient();
}

export { auth, db, initializeFirebaseClient };
