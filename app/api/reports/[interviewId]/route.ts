import { NextRequest } from "next/server";
import { getInterviewAttempts } from "@/lib/actions/general.action";
import { checkTPOAccess } from "@/lib/actions/auth.action";
import { auth } from "@/firebase/admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ interviewId: string }> }
) {
  try {
    const { interviewId } = await params;
    console.log("🔍 [API IndividualReport] Starting request for interview:", interviewId);

    // Verify authentication
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("❌ [API IndividualReport] No auth header");
      return Response.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const idToken = authHeader.substring(7);
    const decodedClaims = await auth.verifyIdToken(idToken);
    const userId = decodedClaims.uid;
    console.log("✅ [API IndividualReport] User authenticated:", userId);

    // Check if user is TPO
    const collegeId = await checkTPOAccess(userId);
    if (!collegeId) {
      console.error("❌ [API IndividualReport] User is not TPO:", userId);
      return Response.json(
        { success: false, error: "TPO access required" },
        { status: 403 }
      );
    }
    console.log("✅ [API IndividualReport] TPO access verified:", { userId, collegeId });

    console.log("📡 [API IndividualReport] Fetching attempts for interview:", interviewId);
    const attempts = await getInterviewAttempts(interviewId);
    console.log("📊 [API IndividualReport] Raw attempts from DB:", {
      count: attempts.length,
      attempts: attempts.map(a => ({
        feedbackId: a.feedbackId,
        studentName: a.studentName,
        college: a.college,
        branch: a.branch,
        year: a.year,
        totalScore: a.totalScore
      }))
    });

    // Filter attempts to only show students from TPO's college
    const filteredAttempts = attempts.filter(attempt => {
      const isMatch = attempt.college === collegeId || attempt.college === "N/A";
      console.log(`🔍 [API IndividualReport] Filtering attempt ${attempt.feedbackId}:`, {
        studentCollege: attempt.college,
        tpoCollege: collegeId,
        isMatch
      });
      return isMatch;
    });

    console.log("🎯 [API IndividualReport] Final filtered attempts:", {
      originalCount: attempts.length,
      filteredCount: filteredAttempts.length,
      collegeId,
      interviewId
    });

    return Response.json({ 
      success: true, 
      attempts: filteredAttempts,
      interviewId,
      collegeId
    }, { status: 200 });

  } catch (error) {
    console.error("❌ [API IndividualReport] Error fetching interview attempts:", error);
    return Response.json(
      { success: false, error: "Failed to fetch interview attempts" },
      { status: 500 }
    );
  }
} 