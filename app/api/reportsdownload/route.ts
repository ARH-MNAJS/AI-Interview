import { NextRequest } from "next/server";
import { db, auth } from "@/firebase/admin";
import { checkTPOAccess } from "@/lib/actions/auth.action";

interface FeedbackDownloadData {
  feedbackId: string;
  interviewId: string;
  studentName: string;
  studentEmail: string;
  college: string;
  branch: string;
  year: string;
  interviewRole: string;
  interviewLevel: string;
  interviewType: string;
  techStack: string;
  totalScore: number | string;
  communicationScore: number | string;
  communicationComment: string;
  technicalScore: number | string;
  technicalComment: string;
  problemSolvingScore: number | string;
  problemSolvingComment: string;
  culturalFitScore: number | string;
  culturalFitComment: string;
  confidenceScore: number | string;
  confidenceComment: string;
  strengths: string;
  areasForImprovement: string;
  finalAssessment: string;
  attemptDate: string;
  interviewCreatedAt: string;
}

export async function GET(request: NextRequest) {
  try {
    console.log("🔍 [API Download Reports] Starting request");
    
    // Verify authentication
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("❌ [API Download Reports] No auth header");
      return Response.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const idToken = authHeader.substring(7);
    const decodedClaims = await auth.verifyIdToken(idToken);
    const userId = decodedClaims.uid;
    console.log("✅ [API Download Reports] User authenticated", { userId });

    // Check if user is TPO
    const collegeId = await checkTPOAccess(userId);
    if (!collegeId) {
      console.error("❌ [API Download Reports] User is not TPO", { userId });
      return Response.json(
        { success: false, error: "TPO access required" },
        { status: 403 }
      );
    }
    console.log("✅ [API Download Reports] TPO access verified", { userId, collegeId });

    // Get query parameters for optional filtering
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "csv";
    const branch = searchParams.get("branch");
    const year = searchParams.get("year");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    console.log("🔍 [API Download Reports] Parameters", { 
      format, branch, year, startDate, endDate, collegeId 
    });

    // Fetch all feedback documents
    console.log("📡 [API Download Reports] Fetching all feedback documents");
    const feedbackSnapshot = await db
      .collection("feedback")
      .orderBy("createdAt", "desc")
      .get();

    console.log("📊 [API Download Reports] Raw feedback count:", feedbackSnapshot.docs.length);

    const downloadData: FeedbackDownloadData[] = [];

    for (const feedbackDoc of feedbackSnapshot.docs) {
      const feedback = feedbackDoc.data();
      
      try {
        // Get student details
        const userDoc = await db.collection("users").doc(feedback.userId).get();
        if (!userDoc.exists) {
          console.warn(`⚠️ [API Download Reports] User not found: ${feedback.userId}`);
          continue;
        }
        
        const userData = userDoc.data();
        
        // Filter by college if user is from different college
        if (userData?.college !== collegeId) {
          continue;
        }
        
        // Apply branch filter if specified
        if (branch && userData?.branch !== branch) {
          continue;
        }
        
        // Apply year filter if specified
        if (year && userData?.year !== year) {
          continue;
        }
        
        // Apply date filters if specified
        if (startDate && feedback.createdAt < startDate) {
          continue;
        }
        
        if (endDate && feedback.createdAt > endDate) {
          continue;
        }

        // Get interview details
        const interviewDoc = await db.collection("interviews").doc(feedback.interviewId).get();
        if (!interviewDoc.exists) {
          console.warn(`⚠️ [API Download Reports] Interview not found: ${feedback.interviewId}`);
          continue;
        }
        
        const interviewData = interviewDoc.data();

        // Parse category scores
        const categoryScores = feedback.categoryScores || [];
        const getScoreAndComment = (categoryName: string) => {
          const category = categoryScores.find((cat: any) => cat.name === categoryName);
          return {
            score: category?.score || "N/A",
            comment: category?.comment || "N/A"
          };
        };

        const comm = getScoreAndComment("Communication Skills");
        const tech = getScoreAndComment("Technical Knowledge");
        const problem = getScoreAndComment("Problem Solving");
        const cultural = getScoreAndComment("Cultural Fit");
        const confidence = getScoreAndComment("Confidence and Clarity");

        downloadData.push({
          feedbackId: feedbackDoc.id,
          interviewId: feedback.interviewId,
          studentName: userData?.name || "N/A",
          studentEmail: userData?.email || "N/A",
          college: userData?.college || "N/A",
          branch: userData?.branch || "N/A",
          year: userData?.year || "N/A",
          interviewRole: interviewData?.role || "N/A",
          interviewLevel: interviewData?.level || "N/A",
          interviewType: interviewData?.type || "N/A",
          techStack: Array.isArray(interviewData?.techstack) ? interviewData.techstack.join(", ") : (interviewData?.techstack || "N/A"),
          totalScore: feedback.totalScore || "N/A",
          communicationScore: comm.score,
          communicationComment: comm.comment,
          technicalScore: tech.score,
          technicalComment: tech.comment,
          problemSolvingScore: problem.score,
          problemSolvingComment: problem.comment,
          culturalFitScore: cultural.score,
          culturalFitComment: cultural.comment,
          confidenceScore: confidence.score,
          confidenceComment: confidence.comment,
          strengths: Array.isArray(feedback.strengths) ? feedback.strengths.join("; ") : (feedback.strengths || "N/A"),
          areasForImprovement: Array.isArray(feedback.areasForImprovement) ? feedback.areasForImprovement.join("; ") : (feedback.areasForImprovement || "N/A"),
          finalAssessment: feedback.finalAssessment || "N/A",
          attemptDate: feedback.createdAt || "N/A",
          interviewCreatedAt: interviewData?.createdAt || "N/A"
        });

      } catch (error) {
        console.error(`❌ [API Download Reports] Error processing feedback ${feedbackDoc.id}:`, error);
        continue;
      }
    }

    console.log("🎯 [API Download Reports] Final filtered data count:", downloadData.length);

    if (format === "csv") {
      // Convert to CSV
      const headers = [
        "Feedback ID",
        "Interview ID", 
        "Student Name",
        "Student Email",
        "College",
        "Branch",
        "Year",
        "Interview Role",
        "Interview Level",
        "Interview Type",
        "Tech Stack",
        "Total Score",
        "Communication Score",
        "Communication Comment",
        "Technical Score", 
        "Technical Comment",
        "Problem Solving Score",
        "Problem Solving Comment",
        "Cultural Fit Score",
        "Cultural Fit Comment",
        "Confidence Score",
        "Confidence Comment",
        "Strengths",
        "Areas for Improvement",
        "Final Assessment",
        "Attempt Date",
        "Interview Created Date"
      ];

      const csvContent = [
        headers.join(","),
        ...downloadData.map(row => [
          `"${row.feedbackId}"`,
          `"${row.interviewId}"`,
          `"${row.studentName}"`,
          `"${row.studentEmail}"`,
          `"${row.college}"`,
          `"${row.branch}"`,
          `"${row.year}"`,
          `"${row.interviewRole}"`,
          `"${row.interviewLevel}"`,
          `"${row.interviewType}"`,
          `"${row.techStack}"`,
          `"${row.totalScore}"`,
          `"${row.communicationScore}"`,
          `"${row.communicationComment.replace(/"/g, '""')}"`,
          `"${row.technicalScore}"`,
          `"${row.technicalComment.replace(/"/g, '""')}"`,
          `"${row.problemSolvingScore}"`,
          `"${row.problemSolvingComment.replace(/"/g, '""')}"`,
          `"${row.culturalFitScore}"`,
          `"${row.culturalFitComment.replace(/"/g, '""')}"`,
          `"${row.confidenceScore}"`,
          `"${row.confidenceComment.replace(/"/g, '""')}"`,
          `"${row.strengths.replace(/"/g, '""')}"`,
          `"${row.areasForImprovement.replace(/"/g, '""')}"`,
          `"${row.finalAssessment.replace(/"/g, '""')}"`,
          `"${row.attemptDate}"`,
          `"${row.interviewCreatedAt}"`
        ].join(","))
      ].join("\n");

      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `interview_reports_${collegeId}_${timestamp}.csv`;

      return new Response(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    } else {
      // Return JSON format
      return Response.json({
        success: true,
        data: downloadData,
        total: downloadData.length,
        collegeId,
        filters: { branch, year, startDate, endDate }
      });
    }

  } catch (error) {
    console.error("❌ [API Download Reports] Error:", error);
    return Response.json(
      { success: false, error: "Failed to generate download" },
      { status: 500 }
    );
  }
} 