"use server";

import { db } from "@/firebase/admin";
import { feedbackSchema } from "@/constants";
import { ollamaLLMAdapter } from "@/lib/services/ollama_llm_adapter";
import { logger } from "@/lib/services/logger";

export async function createFeedback(params: CreateFeedbackParams) {
  const { interviewId, userId, transcript, feedbackId } = params;

  try {
    const formattedTranscript = transcript
      .map(
        (sentence: { role: string; content: string }) =>
          `- ${sentence.role}: ${sentence.content}\n`
      )
      .join("");

    logger.info('CreateFeedback', 'Starting feedback generation', {
      interviewId,
      userId,
      transcriptLength: formattedTranscript.length,
    });

    const feedbackPrompt = `You are an AI interviewer analyzing a mock interview. Your task is to evaluate the candidate based on structured categories. Be thorough and detailed in your analysis. Don't be lenient with the candidate. If there are mistakes or areas for improvement, point them out.

Transcript:
${formattedTranscript}

Please analyze this interview and provide feedback in the following JSON format. IMPORTANT: Use only simple text in comments without special characters, quotes, or line breaks:

{
  "totalScore": <number 0-100>,
  "categoryScores": [
    {
      "name": "Communication Skills",
      "score": <number 0-100>,
      "comment": "detailed comment about clarity and articulation"
    },
    {
      "name": "Technical Knowledge", 
      "score": <number 0-100>,
      "comment": "detailed comment about understanding of key concepts"
    },
    {
      "name": "Problem Solving",
      "score": <number 0-100>, 
      "comment": "detailed comment about ability to analyze problems and propose solutions"
    },
    {
      "name": "Cultural Fit",
      "score": <number 0-100>,
      "comment": "detailed comment about alignment with company values and job role"
    },
    {
      "name": "Confidence and Clarity",
      "score": <number 0-100>,
      "comment": "detailed comment about confidence in responses and engagement"
    }
  ],
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "areasForImprovement": ["area 1", "area 2", "area 3"],
  "finalAssessment": "overall assessment paragraph"
}

CRITICAL: Return only valid JSON with no markdown code blocks, no additional text, and no special characters in strings. Avoid apostrophes, quotes within strings, and newlines.`;

    const response = await ollamaLLMAdapter.generateResponse([
      {
        role: 'user',
        content: feedbackPrompt,
      },
    ]);

    logger.debug('CreateFeedback', 'Raw LLM response', { response });

    // Parse the JSON response (strip markdown code blocks if present)
    let cleanResponse = response.trim();
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    // Additional cleaning to handle problematic characters in JSON strings
    // First, remove control characters that break JSON parsing
    cleanResponse = cleanResponse
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
      .replace(/\r\n/g, ' ') // Replace Windows line endings
      .replace(/\n/g, ' ') // Replace newlines with spaces
      .replace(/\r/g, ' ') // Replace carriage returns with spaces
      .replace(/\t/g, ' ') // Replace tabs with spaces
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .trim();

    let object;
    try {
      object = JSON.parse(cleanResponse);
    } catch (parseError) {
      logger.error('CreateFeedback', 'Failed to parse JSON response', { 
        error: parseError,
        originalResponse: response.slice(0, 500),
        cleanedResponse: cleanResponse.slice(0, 500)
      });
      
      // Try a more aggressive cleaning approach
      try {
        // Extract JSON manually using regex
        const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          let extractedJson = jsonMatch[0];
          // Clean up the extracted JSON more aggressively
          extractedJson = extractedJson
            .replace(/\\n/g, ' ')
            .replace(/\\r/g, '')
            .replace(/\\t/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          object = JSON.parse(extractedJson);
          logger.info('CreateFeedback', 'Successfully parsed JSON after aggressive cleaning');
        } else {
          throw new Error('No JSON object found in response');
        }
      } catch (secondParseError) {
        logger.error('CreateFeedback', 'Second parsing attempt failed', { 
          error: secondParseError,
          response: response.slice(0, 1000)
        });
        
        // Fallback: create a basic feedback structure
        object = {
          totalScore: 75,
          categoryScores: [
            { name: "Communication Skills", score: 75, comment: "Analysis pending - JSON parse error" },
            { name: "Technical Knowledge", score: 75, comment: "Analysis pending - JSON parse error" },
            { name: "Problem Solving", score: 75, comment: "Analysis pending - JSON parse error" },
            { name: "Cultural Fit", score: 75, comment: "Analysis pending - JSON parse error" },
            { name: "Confidence and Clarity", score: 75, comment: "Analysis pending - JSON parse error" },
          ],
          strengths: ["Interview completed successfully"],
          areasForImprovement: ["Feedback generation needs improvement"],
          finalAssessment: "Feedback generation encountered technical issues. Please review transcript manually.",
        };
      }
    }

    const feedback = {
      interviewId: interviewId,
      userId: userId,
      totalScore: object.totalScore,
      categoryScores: object.categoryScores,
      strengths: object.strengths,
      areasForImprovement: object.areasForImprovement,
      finalAssessment: object.finalAssessment,
      createdAt: new Date().toISOString(),
    };

    let feedbackRef;

    if (feedbackId) {
      feedbackRef = db.collection("feedback").doc(feedbackId);
    } else {
      feedbackRef = db.collection("feedback").doc();
    }

    await feedbackRef.set(feedback);

    return { success: true, feedbackId: feedbackRef.id };
  } catch (error) {
    console.error("Error saving feedback:", error);
    return { success: false };
  }
}

export async function getInterviewById(id: string): Promise<Interview | null> {
  const interview = await db.collection("interviews").doc(id).get();

  return interview.data() as Interview | null;
}

export async function getFeedbackByInterviewId(
  params: GetFeedbackByInterviewIdParams
): Promise<Feedback | null> {
  const { interviewId, userId } = params;

  const querySnapshot = await db
    .collection("feedback")
    .where("interviewId", "==", interviewId)
    .where("userId", "==", userId)
    .limit(1)
    .get();

  if (querySnapshot.empty) return null;

  const feedbackDoc = querySnapshot.docs[0];
  return { id: feedbackDoc.id, ...feedbackDoc.data() } as Feedback;
}

// Function to get feedback by its ID (for TPO viewing specific student feedback)
export async function getFeedbackById(feedbackId: string): Promise<Feedback | null> {
  try {
    const feedbackDoc = await db.collection("feedback").doc(feedbackId).get();
    
    if (!feedbackDoc.exists) return null;
    
    return { id: feedbackDoc.id, ...feedbackDoc.data() } as Feedback;
  } catch (error) {
    console.error("Error fetching feedback by ID:", error);
    return null;
  }
}

// Enhanced function to get interviews for students based on their college/branch/year
export async function getInterviewsForStudent(userId: string): Promise<Interview[] | null> {
  try {
    // First get user details to check their college/branch/year
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) return [];
    
    const userData = userDoc.data() as User;
    
    // If user doesn't have college info, show all interviews (backward compatibility)
    if (!userData.college || !userData.branch || !userData.year) {
      return getLatestInterviews({ userId });
    }

    // Get interviews targeted to user's college/branch/year
    const interviews = await db
      .collection("interviews")
      .where("finalized", "==", true)
      .where("userId", "!=", userId)
      .orderBy("createdAt", "desc")
      .get();

    // Filter interviews that match user's college/branch/year
    const filteredInterviews = interviews.docs.filter(doc => {
      const interview = doc.data() as Interview;
      
      // If interview has no targeting, show to everyone (backward compatibility)
      if (!interview.targetColleges || !interview.targetBranches || !interview.targetYears) {
        return true;
      }
      
      // Check if user's details match interview targeting
      const matchesCollege = interview.targetColleges.includes(userData.college!);
      const matchesBranch = interview.targetBranches.includes(userData.branch!);
      const matchesYear = interview.targetYears.includes(parseInt(userData.year!));
      
      return matchesCollege && matchesBranch && matchesYear;
    });

    return filteredInterviews.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Interview[];

  } catch (error) {
    console.error("Error fetching interviews for student:", error);
    return [];
  }
}

// Function to get interviews with filters for admin/TPO
export async function getInterviewsWithFilters(
  filters: CollegeFilters,
  userId?: string
): Promise<Interview[] | null> {
  try {
    console.log("🔍 getInterviewsWithFilters called with:", {
      filters,
      userId
    });
    
    // Also log to console.error to make it more visible
    console.error("DEBUG: getInterviewsWithFilters called with filters:", JSON.stringify(filters));

    let query = db.collection("interviews").where("finalized", "==", true);
    
    // Exclude user's own interviews if userId provided
    if (userId) {
      query = query.where("userId", "!=", userId);
      console.log("👤 Excluding interviews from user:", userId);
    }

    console.log("📡 Executing database query...");
    const interviews = await query.orderBy("createdAt", "desc").get();
    console.log("📊 Total interviews from DB:", interviews.docs.length);
    console.error("DEBUG: Total interviews from DB:", interviews.docs.length);

    // Log sample interview data to understand structure
    if (interviews.docs.length > 0) {
      const sampleInterview = interviews.docs[0].data() as Interview;
      console.log("📝 Sample interview structure:", {
        id: interviews.docs[0].id,
        targetColleges: sampleInterview.targetColleges,
        targetBranches: sampleInterview.targetBranches,
        targetYears: sampleInterview.targetYears,
        role: sampleInterview.role,
        type: sampleInterview.type
      });
    }

    // Filter based on college/branch/year
    const filteredInterviews = interviews.docs.filter(doc => {
      const interview = doc.data() as Interview;
      
      console.log(`🔍 Checking interview ${doc.id}:`, {
        targetColleges: interview.targetColleges,
        targetBranches: interview.targetBranches,
        targetYears: interview.targetYears
      });
      
      if (filters.college && interview.targetColleges) {
        const collegeMatch = interview.targetColleges.includes(filters.college);
        console.log(`  College filter (${filters.college}):`, collegeMatch);
        if (!collegeMatch) return false;
      }
      
      if (filters.branch && interview.targetBranches) {
        const branchMatch = interview.targetBranches.includes(filters.branch);
        console.log(`  Branch filter (${filters.branch}):`, branchMatch);
        if (!branchMatch) return false;
      }
      
      if (filters.year && interview.targetYears) {
        const yearNum = parseInt(filters.year);
        const yearMatch = interview.targetYears.includes(yearNum);
        console.log(`  Year filter (${filters.year} -> ${yearNum}):`, yearMatch, "in", interview.targetYears);
        if (!yearMatch) return false;
      }
      
      console.log(`  ✅ Interview ${doc.id} matches all filters`);
      return true;
    });

    console.log("🎯 Filtered interviews count:", filteredInterviews.length);
    console.error("DEBUG: Final filtered count:", filteredInterviews.length);

    return filteredInterviews.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Interview[];

  } catch (error) {
    console.error("💥 Error fetching interviews with filters:", error);
    return [];
  }
}

// Function to get all attempts for a specific interview (for reports)
export async function getInterviewAttempts(interviewId: string): Promise<StudentFeedbackData[]> {
  try {
    console.log("🔍 [getInterviewAttempts] Starting with interviewId:", interviewId);
    
    const feedbackSnapshot = await db
      .collection("feedback")
      .where("interviewId", "==", interviewId)
      .orderBy("createdAt", "desc")
      .get();

    console.log("📊 [getInterviewAttempts] Raw feedback from DB:", {
      interviewId,
      feedbackCount: feedbackSnapshot.docs.length,
      feedbacks: feedbackSnapshot.docs.map(doc => ({
        id: doc.id,
        userId: doc.data().userId,
        totalScore: doc.data().totalScore,
        createdAt: doc.data().createdAt
      }))
    });

    const attempts: StudentFeedbackData[] = [];

    for (const feedbackDoc of feedbackSnapshot.docs) {
      const feedback = feedbackDoc.data();
      
      console.log(`🔍 [getInterviewAttempts] Processing feedback ${feedbackDoc.id} for user:`, feedback.userId);
      
      // Get student details
      const userDoc = await db.collection("users").doc(feedback.userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data() as User;
        
        console.log(`✅ [getInterviewAttempts] Found user data for ${feedback.userId}:`, {
          name: userData.name,
          email: userData.email,
          college: userData.college,
          branch: userData.branch,
          year: userData.year
        });
        
        attempts.push({
          feedbackId: feedbackDoc.id,
          studentName: userData.name,
          studentEmail: userData.email,
          totalScore: feedback.totalScore,
          attemptDate: feedback.createdAt,
          college: userData.college || "N/A",
          branch: userData.branch || "N/A",
          year: userData.year || "N/A",
        });
      } else {
        console.warn(`❌ [getInterviewAttempts] User document not found for userId:`, feedback.userId);
      }
    }

    console.log("🎯 [getInterviewAttempts] Final attempts result:", {
      interviewId,
      attemptCount: attempts.length,
      attempts: attempts.map(a => ({
        feedbackId: a.feedbackId,
        studentName: a.studentName,
        college: a.college,
        totalScore: a.totalScore
      }))
    });

    return attempts;
  } catch (error) {
    console.error("❌ [getInterviewAttempts] Error fetching interview attempts:", error);
    return [];
  }
}

// Function to get interviews for TPO reports
export async function getInterviewsForTPO(params: TPOReportParams): Promise<Interview[] | null> {
  try {
    const { collegeId, branch, year } = params;
    
    console.log("🔍 [getInterviewsForTPO] Starting with params:", { collegeId, branch, year });
    
    let query = db
      .collection("interviews")
      .where("finalized", "==", true)
      .where("targetColleges", "array-contains", collegeId);

    console.log("📡 [getInterviewsForTPO] Executing Firestore query with targetColleges array-contains:", collegeId);

    const interviews = await query.orderBy("createdAt", "desc").get();

    console.log("📊 [getInterviewsForTPO] Raw interviews from DB:", {
      count: interviews.docs.length,
      collegeId,
      interviews: interviews.docs.map(doc => {
        const data = doc.data() as Interview;
        return {
          id: doc.id,
          role: data.role,
          targetColleges: data.targetColleges,
          targetBranches: data.targetBranches,
          targetYears: data.targetYears,
          createdAt: data.createdAt
        };
      })
    });

    // Filter by branch and year if specified
    const filteredInterviews = interviews.docs.filter(doc => {
      const interview = doc.data() as Interview;
      
      console.log(`🔍 [getInterviewsForTPO] Filtering interview ${doc.id}:`, {
        targetBranches: interview.targetBranches,
        targetYears: interview.targetYears,
        filterBranch: branch,
        filterYear: year
      });
      
      if (branch && interview.targetBranches && !interview.targetBranches.includes(branch)) {
        console.log(`❌ [getInterviewsForTPO] Interview ${doc.id} excluded by branch filter`);
        return false;
      }
      
      if (year && interview.targetYears && !interview.targetYears.includes(parseInt(year))) {
        console.log(`❌ [getInterviewsForTPO] Interview ${doc.id} excluded by year filter`);
        return false;
      }
      
      console.log(`✅ [getInterviewsForTPO] Interview ${doc.id} passed all filters`);
      return true;
    });

    console.log("🎯 [getInterviewsForTPO] Final filtered result:", {
      originalCount: interviews.docs.length,
      filteredCount: filteredInterviews.length,
      collegeId,
      branch,
      year
    });

    const result = filteredInterviews.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Interview[];

    console.log("📤 [getInterviewsForTPO] Returning interviews:", result.length);
    return result;

  } catch (error) {
    console.error("❌ [getInterviewsForTPO] Error fetching interviews for TPO:", error);
    
    // Check if it's a composite index error
    if (error && typeof error === 'object' && 'code' in error) {
      const firebaseError = error as any;
      if (firebaseError.code === 9 || firebaseError.message?.includes('index')) {
        console.error("🚨 [getInterviewsForTPO] COMPOSITE INDEX ERROR - You need to create a Firestore composite index!");
        console.error("🔗 Index needed for: finalized (==) + targetColleges (array-contains) + createdAt (desc)");
        console.error("📝 Go to Firebase Console > Firestore > Indexes to create it");
      }
    }
    
    return [];
  }
}

// Original functions (keeping for backward compatibility)
export async function getLatestInterviews(
  params: GetLatestInterviewsParams
): Promise<Interview[] | null> {
  const { userId, limit = 20 } = params;

  const interviews = await db
    .collection("interviews")
    .orderBy("createdAt", "desc")
    .where("finalized", "==", true)
    .where("userId", "!=", userId)
    .limit(limit)
    .get();

  return interviews.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Interview[];
}

export async function getInterviewsByUserId(
  userId: string
): Promise<Interview[] | null> {
  const interviews = await db
    .collection("interviews")
    .where("userId", "==", userId)
    .orderBy("createdAt", "desc")
    .get();

  return interviews.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Interview[];
}
