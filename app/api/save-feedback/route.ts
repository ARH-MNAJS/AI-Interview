import { NextRequest } from "next/server";
import { db, auth } from "@/firebase/admin";
import { logger } from "@/lib/services/logger";

export async function POST(request: NextRequest) {
  try {
    // Verify authentication if needed (optional for this endpoint)
    const authHeader = request.headers.get("authorization");
    let userId: string | null = null;

    if (authHeader?.startsWith("Bearer ")) {
      const idToken = authHeader.substring(7);
      try {
        const decodedClaims = await auth.verifyIdToken(idToken);
        userId = decodedClaims.uid;
      } catch (error) {
        logger.error("API Save Feedback", "ID token verification failed", error);
      }
    }

    // Get request body
    const { 
      interviewId,
      userId: requestUserId,
      feedbackId,
      totalScore,
      categoryScores,
      strengths,
      areasForImprovement,
      finalAssessment
    } = await request.json();

    // Use userId from token or request body
    const finalUserId = userId || requestUserId;

    // Validate input
    if (!interviewId || !finalUserId || !totalScore || !categoryScores) {
      return Response.json(
        { success: false, error: "Missing required fields" }, 
        { status: 400 }
      );
    }

    logger.info("API Save Feedback", "Saving feedback to database", {
      interviewId,
      userId: finalUserId,
      totalScore,
      categoriesCount: categoryScores.length,
    });

    const feedback = {
      interviewId: interviewId,
      userId: finalUserId,
      totalScore: totalScore,
      categoryScores: categoryScores,
      strengths: strengths || [],
      areasForImprovement: areasForImprovement || [],
      finalAssessment: finalAssessment || "",
      createdAt: new Date().toISOString(),
    };

    let feedbackRef;

    if (feedbackId) {
      feedbackRef = db.collection("feedback").doc(feedbackId);
    } else {
      feedbackRef = db.collection("feedback").doc();
    }

    await feedbackRef.set(feedback);

    logger.info("API Save Feedback", "Feedback saved successfully", {
      feedbackId: feedbackRef.id,
      interviewId,
      userId: finalUserId,
      totalScore,
    });

    return Response.json({ 
      success: true, 
      feedbackId: feedbackRef.id
    }, { status: 200 });

  } catch (error) {
    logger.error("API Save Feedback", "Feedback save failed", error);
    console.error("Error:", error);
    return Response.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error occurred" 
      }, 
      { status: 500 }
    );
  }
}

export async function GET() {
  return Response.json({ 
    success: true, 
    message: "Save Feedback API",
    status: "active" 
  }, { status: 200 });
}