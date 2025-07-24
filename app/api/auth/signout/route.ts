import { NextRequest, NextResponse } from "next/server";
import { signOut } from "@/lib/actions/auth.action";

export async function POST(request: NextRequest) {
  try {
    // Check if Firebase is properly configured
    if (!process.env.FIREBASE_PROJECT_ID) {
      console.warn("Firebase not configured, skipping signout");
      return NextResponse.json({ success: true, message: "Firebase not configured" });
    }

    await signOut();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error signing out:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
} 