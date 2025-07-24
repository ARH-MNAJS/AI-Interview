import { NextResponse } from "next/server";

export async function GET() {
  // Return only the client-side Firebase configuration
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID,
  };

  // Check if config is complete
  const hasValidConfig = firebaseConfig.apiKey && firebaseConfig.projectId;

  return NextResponse.json({
    config: hasValidConfig ? firebaseConfig : null,
    hasValidConfig,
  });
} 