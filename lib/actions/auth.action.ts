"use server";

import { auth, db } from "@/firebase/admin";
import { cookies } from "next/headers";

// Session duration (1 week)
const SESSION_DURATION = 60 * 60 * 24 * 7;

// Set session cookie
export async function setSessionCookie(idToken: string) {
  const cookieStore = await cookies();

  // Create session cookie
  const sessionCookie = await auth.createSessionCookie(idToken, {
    expiresIn: SESSION_DURATION * 1000, // milliseconds
  });

  // Set cookie in the browser
  cookieStore.set("session", sessionCookie, {
    maxAge: SESSION_DURATION,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    sameSite: "lax",
  });
}

// Get all colleges for dropdown
export async function getColleges(): Promise<College[]> {
  try {
    const collegesSnapshot = await db.collection("colleges").get();
    return collegesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as College[];
  } catch (error) {
    console.error("Error fetching colleges:", error);
    return [];
  }
}

// Get branches for a specific college
export async function getCollegeBranches(collegeId: string): Promise<string[]> {
  try {
    const collegeDoc = await db.collection("colleges").doc(collegeId).get();
    if (!collegeDoc.exists) return [];
    const collegeData = collegeDoc.data() as College;
    return collegeData.branches || [];
  } catch (error) {
    console.error("Error fetching college branches:", error);
    return [];
  }
}

// Get years for a specific college
export async function getCollegeYears(collegeId: string): Promise<number[]> {
  try {
    const collegeDoc = await db.collection("colleges").doc(collegeId).get();
    if (!collegeDoc.exists) return [];
    const collegeData = collegeDoc.data() as College;
    return collegeData.years || [];
  } catch (error) {
    console.error("Error fetching college years:", error);
    return [];
  }
}

// Check if user is TPO for a college
export async function checkTPOAccess(userId: string): Promise<string | null> {
  try {
    const collegesSnapshot = await db
      .collection("colleges")
      .where("tpoUserId", "==", userId)
      .limit(1)
      .get();
    
    if (collegesSnapshot.empty) return null;
    return collegesSnapshot.docs[0].id;
  } catch (error) {
    console.error("Error checking TPO access:", error);
    return null;
  }
}

export async function signUp(params: SignUpParams) {
  const { uid, name, email, college, branch, year } = params;

  try {
    // check if user exists in db
    const userRecord = await db.collection("users").doc(uid).get();
    if (userRecord.exists)
      return {
        success: false,
        message: "User already exists. Please sign in.",
      };

    // save user to db with college information
    const userData: any = {
      name,
      email,
      // profileURL,
      // resumeURL,
    };

    // Add college information if provided
    if (college) userData.college = college;
    if (branch) userData.branch = branch;
    if (year) userData.year = year;

    await db.collection("users").doc(uid).set(userData);

    return {
      success: true,
      message: "Account created successfully. Please sign in.",
    };
  } catch (error: any) {
    console.error("Error creating user:", error);

    // Handle Firebase specific errors
    if (error.code === "auth/email-already-exists") {
      return {
        success: false,
        message: "This email is already in use",
      };
    }

    return {
      success: false,
      message: "Failed to create account. Please try again.",
    };
  }
}

export async function signIn(params: SignInParams) {
  const { email, idToken } = params;

  try {
    const userRecord = await auth.getUserByEmail(email);
    if (!userRecord)
      return {
        success: false,
        message: "User does not exist. Create an account.",
      };

    await setSessionCookie(idToken);
  } catch (error: any) {
    console.log("");

    return {
      success: false,
      message: "Failed to log into account. Please try again.",
    };
  }
}

// Sign out user by clearing the session cookie
export async function signOut() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete("session");
  } catch (error) {
    console.error("Error during signout:", error);
    // Don't throw error, just log it
  }
}

// Get current user from session cookie
export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();

  const sessionCookie = cookieStore.get("session")?.value;
  if (!sessionCookie) return null;

  try {
    const decodedClaims = await auth.verifySessionCookie(sessionCookie, true);

    // get user info from db
    const userRecord = await db
      .collection("users")
      .doc(decodedClaims.uid)
      .get();
    if (!userRecord.exists) return null;

    return {
      ...userRecord.data(),
      id: userRecord.id,
    } as User;
  } catch (error) {
    console.log(error);

    // Invalid or expired session
    return null;
  }
}

// Check if user is authenticated
export async function isAuthenticated() {
  const user = await getCurrentUser();
  return !!user;
}
