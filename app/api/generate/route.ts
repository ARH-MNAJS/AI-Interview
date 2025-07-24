import { NextRequest } from "next/server";
import { db, auth } from "@/firebase/admin";
import { getRandomInterviewCover } from "@/lib/utils";
import { ollamaLLMAdapter } from "@/lib/services/ollama_llm_adapter";
import { logger } from "@/lib/services/logger";

const AUTHORIZED_USER_ID = "i0bZW01fAeMaiqm2WSOKxFxwTAx2";

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get("authorization");
    let userId: string | null = null;

    if (authHeader?.startsWith("Bearer ")) {
      const idToken = authHeader.substring(7);
      try {
        const decodedClaims = await auth.verifyIdToken(idToken);
        userId = decodedClaims.uid;
      } catch (error) {
        logger.error("API Generate", "ID token verification failed", error);
      }
    }

    // Get request body
    const { type, role, level, techstack, amount, userid, targetColleges, targetBranches, targetYears } = await request.json();

    // Use userid from request body if no auth header
    const finalUserId = userId || userid;

    // Verify authorization
    if (finalUserId !== AUTHORIZED_USER_ID) {
      logger.warn("API Generate", "Unauthorized access attempt", { userId: finalUserId });
      return Response.json(
        { success: false, error: "Unauthorized access" }, 
        { status: 403 }
      );
    }

    // Validate input
    if (!type || !role || !level || !techstack || !amount) {
      return Response.json(
        { success: false, error: "Missing required fields" }, 
        { status: 400 }
      );
    }

    // Validate targeting fields
    if (!targetColleges || !targetBranches || !targetYears) {
      return Response.json(
        { success: false, error: "Missing targeting fields (colleges, branches, years)" }, 
        { status: 400 }
      );
    }

    logger.info("API Generate", "Starting interview generation", {
      role,
      level,
      type,
      techstack,
      amount,
      targetColleges: targetColleges.length,
      targetBranches: targetBranches.length,
      targetYears: targetYears.length,
      userId: finalUserId,
    });

    // Create the prompt for Ollama
    const prompt = `Prepare questions for a job interview.
        The job role is ${role}.
        The job experience level is ${level}.
        The tech stack used in the job is: ${techstack}.
        The focus between behavioural and technical questions should lean towards: ${type}.
        The amount of questions required is: ${amount}.
        Please return only the questions, without any additional text.
        The questions are going to be read by a voice assistant so do not use "/" or "*" or any other special characters which might break the voice assistant.
        Return the questions formatted like this:
        ["Question 1", "Question 2", "Question 3"]
        
        Thank you!`;

    // Generate questions using Ollama
    const questions = await ollamaLLMAdapter.generateResponse([
      {
        role: "user",
        content: prompt,
      },
    ]);

    logger.debug("API Generate", "Raw LLM response", { response: questions });

    // Parse the questions array
    let parsedQuestions: string[];
    try {
      // Try to parse JSON directly
      parsedQuestions = JSON.parse(questions);
      
      // Validate it's an array
      if (!Array.isArray(parsedQuestions)) {
        throw new Error("Response is not an array");
      }
    } catch (parseError) {
      logger.warn("API Generate", "Failed to parse JSON, attempting text extraction", {
        error: parseError,
        rawResponse: questions,
      });

      // Fallback: extract questions from text
      const lines = questions.split('\n').filter(line => line.trim());
      parsedQuestions = lines
        .filter(line => 
          line.includes('?') && 
          !line.toLowerCase().includes('thank you') &&
          line.length > 10
        )
        .map(line => line.replace(/^\d+\.?\s*/, '').replace(/^["\[\]]/g, '').replace(/["\[\]],?$/g, '').trim())
        .slice(0, amount);

      if (parsedQuestions.length === 0) {
        logger.error("API Generate", "No valid questions extracted", { rawResponse: questions });
        return Response.json(
          { success: false, error: "Failed to generate valid questions" }, 
          { status: 500 }
        );
      }
    }

    // Ensure we have the right number of questions
    if (parsedQuestions.length < amount) {
      logger.warn("API Generate", "Generated fewer questions than requested", {
        requested: amount,
        generated: parsedQuestions.length,
      });
    }

    // Create interview object with targeting
    const interview = {
      role: role,
      type: type,
      level: level,
      techstack: typeof techstack === 'string' 
        ? techstack.split(",").map((tech: string) => tech.trim())
        : Array.isArray(techstack) 
        ? techstack 
        : [],
      questions: parsedQuestions,
      userId: finalUserId,
      finalized: true,
      coverImage: getRandomInterviewCover(),
      createdAt: new Date().toISOString(),
      // Add targeting fields
      targetColleges: targetColleges,
      targetBranches: targetBranches,
      targetYears: targetYears,
    };

    // Save to database
    const docRef = await db.collection("interviews").add(interview);

    logger.info("API Generate", "Interview generated successfully", {
      interviewId: docRef.id,
      questionsGenerated: parsedQuestions.length,
      targetColleges: targetColleges.length,
      targetBranches: targetBranches.length,
      targetYears: targetYears.length,
      userId: finalUserId,
    });

    return Response.json({ 
      success: true, 
      interviewId: docRef.id,
      questionsGenerated: parsedQuestions.length 
    }, { status: 200 });

  } catch (error) {
    logger.error("API Generate", "Interview generation failed", error);
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
    message: "Interview Generation API",
    status: "active" 
  }, { status: 200 });
} 