import { clientOllamaAdapter } from './client_ollama_adapter';

interface CategoryScore {
  name: string;
  score: number;
  comment: string;
}

interface FeedbackData {
  totalScore: number;
  categoryScores: CategoryScore[];
  strengths: string[];
  areasForImprovement: string[];
  finalAssessment: string;
}

export class ClientFeedbackGenerator {
  async generateFeedback(transcript: { role: string; content: string }[]): Promise<FeedbackData> {
    const formattedTranscript = transcript
      .map(
        (sentence: { role: string; content: string }) =>
          `- ${sentence.role}: ${sentence.content}\n`
      )
      .join("");

    console.log('Starting client-side feedback generation', {
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

      let feedbackData: FeedbackData;
      try {
        feedbackData = JSON.parse(cleanResponse);
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
            
            feedbackData = JSON.parse(extractedJson);
            console.log('Successfully parsed JSON after aggressive cleaning');
          } else {
            throw new Error('No JSON object found in response');
          }
        } catch (secondParseError) {
          console.error('Second parsing attempt failed', { 
            error: secondParseError,
            response: response.slice(0, 1000)
          });
          
          // Fallback: create a basic feedback structure
          feedbackData = {
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

      console.log('Client-side feedback generation completed', {
        totalScore: feedbackData.totalScore,
        categoriesCount: feedbackData.categoryScores.length,
      });

      return feedbackData;

    } catch (error) {
      console.error('Client-side feedback generation failed:', error);
      throw error;
    }
  }
}

export const clientFeedbackGenerator = new ClientFeedbackGenerator();