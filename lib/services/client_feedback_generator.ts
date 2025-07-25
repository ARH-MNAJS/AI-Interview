import { clientOllamaAdapter } from './client_ollama_adapter';

interface CategoryScore {
  name: string;
  score: number | string; // Allow "Cannot be determined"
  comment: string;
}

interface FeedbackData {
  totalScore: number | string; // Allow "Cannot be determined"
  categoryScores: CategoryScore[];
  strengths: string[];
  areasForImprovement: string[];
  finalAssessment: string;
}

interface ConversationValidation {
  isValid: boolean;
  reason?: string;
  userMessages: number;
  assistantMessages: number;
  totalLength: number;
  meaningfulExchanges: number;
}

export class ClientFeedbackGenerator {
  
  /**
   * Validates if the conversation is substantial enough for meaningful feedback
   */
  private validateConversation(transcript: { role: string; content: string }[]): ConversationValidation {
    const userMessages = transcript.filter(msg => msg.role === "user");
    const assistantMessages = transcript.filter(msg => msg.role === "assistant");
    
    // Calculate meaningful content (non-empty, non-trivial responses)
    const meaningfulUserMessages = userMessages.filter(msg => 
      msg.content.trim().length > 10 && // More than just "hello" or "yes"
      msg.content.trim().split(' ').length > 2 // More than 2 words
    );
    
    const totalLength = transcript.reduce((sum, msg) => sum + msg.content.length, 0);
    const meaningfulExchanges = Math.min(meaningfulUserMessages.length, assistantMessages.length);
    
    // Validation criteria
    const minUserMessages = 3; // At least 3 user responses
    const minMeaningfulExchanges = 2; // At least 2 meaningful back-and-forth exchanges
    const minTotalLength = 200; // At least 200 characters total
    const minMeaningfulUserMessages = 2; // At least 2 substantial user responses
    
    let isValid = true;
    let reason = "";
    
    if (userMessages.length < minUserMessages) {
      isValid = false;
      reason = `Insufficient user responses (${userMessages.length}/${minUserMessages} required)`;
    } else if (meaningfulUserMessages.length < minMeaningfulUserMessages) {
      isValid = false;
      reason = `Insufficient meaningful responses from candidate (${meaningfulUserMessages.length}/${minMeaningfulUserMessages} required)`;
    } else if (meaningfulExchanges < minMeaningfulExchanges) {
      isValid = false;
      reason = `Insufficient conversation exchanges (${meaningfulExchanges}/${minMeaningfulExchanges} required)`;
    } else if (totalLength < minTotalLength) {
      isValid = false;
      reason = `Interview too brief (${totalLength}/${minTotalLength} characters required)`;
    }
    
    return {
      isValid,
      reason,
      userMessages: userMessages.length,
      assistantMessages: assistantMessages.length,
      totalLength,
      meaningfulExchanges
    };
  }

  /**
   * Calculates total score from category averages
   */
  private calculateTotalScore(categoryScores: CategoryScore[]): number | string {
    const numericScores = categoryScores
      .map(cat => cat.score)
      .filter((score): score is number => typeof score === 'number');
    
    if (numericScores.length === 0) {
      return "Cannot be determined";
    }
    
    if (numericScores.length !== categoryScores.length) {
      // Some categories couldn't be determined
      return "Cannot be determined";
    }
    
    // Calculate weighted average (you can adjust weights if needed)
    const average = numericScores.reduce((sum, score) => sum + score, 0) / numericScores.length;
    return Math.round(average);
  }

  async generateFeedback(transcript: { role: string; content: string }[]): Promise<FeedbackData> {
    const formattedTranscript = transcript
      .map(
        (sentence: { role: string; content: string }) =>
          `- ${sentence.role}: ${sentence.content}\n`
      )
      .join("");

    console.log('Starting client-side feedback generation', {
      transcriptLength: formattedTranscript.length,
      messageCount: transcript.length
    });

    // First, validate the conversation
    const validation = this.validateConversation(transcript);
    
    console.log('Conversation validation result:', validation);

    if (!validation.isValid) {
      console.log('Conversation insufficient for feedback:', validation.reason);
      
      return {
        totalScore: "Cannot be determined",
        categoryScores: [
          { name: "Communication Skills", score: "Cannot be determined", comment: "Insufficient conversation data for assessment" },
          { name: "Technical Knowledge", score: "Cannot be determined", comment: "Insufficient conversation data for assessment" },
          { name: "Problem Solving", score: "Cannot be determined", comment: "Insufficient conversation data for assessment" },
          { name: "Cultural Fit", score: "Cannot be determined", comment: "Insufficient conversation data for assessment" },
          { name: "Confidence and Clarity", score: "Cannot be determined", comment: "Insufficient conversation data for assessment" },
        ],
        strengths: [],
        areasForImprovement: [],
        finalAssessment: `This interview was too brief or lacked sufficient meaningful interaction for a comprehensive evaluation. ${validation.reason}. To receive proper feedback, please engage more actively with the interviewer and provide detailed responses to questions.`
      };
    }

    // Improved LLM prompt - more polite but honest
    const feedbackPrompt = `You are a professional interview assessor providing constructive feedback on a mock interview. Your evaluation should be honest, detailed, and helpful for the candidate's growth while maintaining a respectful and encouraging tone.

Transcript:
${formattedTranscript}

Evaluation Guidelines:
- Be thorough and specific in your analysis
- Provide honest assessment but avoid harsh or dismissive language
- Focus on actionable feedback that helps the candidate improve
- Give credit where deserved - if responses are excellent, score them highly
- Don't hesitate to give high scores (80-100) when truly earned
- Be constructive in criticism - explain what could be improved and how

Please analyze this interview and provide feedback in the following JSON format. IMPORTANT: Use only simple text in comments without special characters, quotes, or line breaks:

{
  "categoryScores": [
    {
      "name": "Communication Skills",
      "score": <number 0-100>,
      "comment": "detailed comment about clarity, articulation, and communication effectiveness"
    },
    {
      "name": "Technical Knowledge", 
      "score": <number 0-100>,
      "comment": "detailed comment about understanding of key concepts and technical competency"
    },
    {
      "name": "Problem Solving",
      "score": <number 0-100>, 
      "comment": "detailed comment about analytical thinking and problem-solving approach"
    },
    {
      "name": "Cultural Fit",
      "score": <number 0-100>,
      "comment": "detailed comment about alignment with professional values and team collaboration"
    },
    {
      "name": "Confidence and Clarity",
      "score": <number 0-100>,
      "comment": "detailed comment about confidence level, clarity of thought, and presentation"
    }
  ],
  "strengths": ["specific strength 1", "specific strength 2", "specific strength 3"],
  "areasForImprovement": ["specific improvement area 1", "specific improvement area 2", "specific improvement area 3"],
  "finalAssessment": "A balanced, constructive overall assessment that acknowledges both strengths and areas for growth, written in an encouraging but honest tone"
}

CRITICAL: 
- Return only valid JSON with no markdown code blocks or additional text
- Do NOT include totalScore in the JSON - it will be calculated separately
- Avoid apostrophes, quotes within strings, and newlines in the JSON
- Be encouraging yet honest - avoid phrases like 'completely useless' or 'not made for this job'
- Instead use constructive language like 'has potential but needs development in...' or 'shows promise with room for improvement in...'`;

    try {
      const response = await clientOllamaAdapter.generateResponse([
        {
          role: 'user',
          content: feedbackPrompt,
        },
      ]);

      console.log('Raw feedback response from Ollama:', response);

      // Parse the JSON response (strip markdown code blocks if present)
      let cleanResponse = response.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      // Additional cleaning to handle problematic characters in JSON strings
      cleanResponse = cleanResponse
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
        .replace(/\r\n/g, ' ') // Replace Windows line endings
        .replace(/\n/g, ' ') // Replace newlines with spaces
        .replace(/\r/g, ' ') // Replace carriage returns with spaces
        .replace(/\t/g, ' ') // Replace tabs with spaces
        .replace(/\s+/g, ' ') // Collapse multiple spaces
        .trim();

      let parsedData: any;
      try {
        parsedData = JSON.parse(cleanResponse);
      } catch (parseError) {
        console.error('Failed to parse JSON response', { 
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
            
            parsedData = JSON.parse(extractedJson);
            console.log('Successfully parsed JSON after aggressive cleaning');
          } else {
            throw new Error('No JSON object found in response');
          }
        } catch (secondParseError) {
          console.error('Critical: Unable to parse LLM response after multiple attempts', { 
            error: secondParseError,
            response: response.slice(0, 1000)
          });
          
          // NO FALLBACK SCORES - return "Cannot be determined"
          return {
            totalScore: "Cannot be determined",
            categoryScores: [
              { name: "Communication Skills", score: "Cannot be determined", comment: "Technical error occurred during assessment" },
              { name: "Technical Knowledge", score: "Cannot be determined", comment: "Technical error occurred during assessment" },
              { name: "Problem Solving", score: "Cannot be determined", comment: "Technical error occurred during assessment" },
              { name: "Cultural Fit", score: "Cannot be determined", comment: "Technical error occurred during assessment" },
              { name: "Confidence and Clarity", score: "Cannot be determined", comment: "Technical error occurred during assessment" },
            ],
            strengths: [],
            areasForImprovement: [],
            finalAssessment: "A technical error occurred during the feedback generation process. Please try the interview again or contact support for assistance.",
          };
        }
      }

      // Validate the parsed data structure
      if (!parsedData.categoryScores || !Array.isArray(parsedData.categoryScores)) {
        throw new Error('Invalid response structure from LLM');
      }

      // Calculate total score from category averages
      const totalScore = this.calculateTotalScore(parsedData.categoryScores);

      const feedbackData: FeedbackData = {
        totalScore,
        categoryScores: parsedData.categoryScores,
        strengths: parsedData.strengths || ["Interview participation"],
        areasForImprovement: parsedData.areasForImprovement || ["Continue developing interview skills"],
        finalAssessment: parsedData.finalAssessment || "Feedback assessment completed.",
      };

      console.log('Client-side feedback generation completed', {
        totalScore: feedbackData.totalScore,
        categoriesCount: feedbackData.categoryScores.length,
        validationPassed: validation.isValid
      });

      return feedbackData;

    } catch (error) {
      console.error('Client-side feedback generation failed:', error);
      
      // NO FALLBACK - return "Cannot be determined"
      return {
        totalScore: "Cannot be determined",
        categoryScores: [
          { name: "Communication Skills", score: "Cannot be determined", comment: "System error prevented assessment" },
          { name: "Technical Knowledge", score: "Cannot be determined", comment: "System error prevented assessment" },
          { name: "Problem Solving", score: "Cannot be determined", comment: "System error prevented assessment" },
          { name: "Cultural Fit", score: "Cannot be determined", comment: "System error prevented assessment" },
          { name: "Confidence and Clarity", score: "Cannot be determined", comment: "System error prevented assessment" },
        ],
        strengths: [],
        areasForImprovement: [],
        finalAssessment: "A system error occurred during feedback generation. Please try again or contact support if the issue persists.",
      };
    }
  }
}

export const clientFeedbackGenerator = new ClientFeedbackGenerator();