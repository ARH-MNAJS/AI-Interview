"use client";

import Image from "next/image";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { conversationHandler } from "@/lib/services/conversation_handler";
import { interviewer } from "@/constants";
import { clientFeedbackGenerator } from "@/lib/services/client_feedback_generator";
import { CallStatus, ConversationMessage, Message } from "../types/conversation";

interface SavedMessage {
  role: "user" | "system" | "assistant";
  content: string;
}

// Warning levels for inappropriate behavior
enum WarningLevel {
  NONE = 0,
  FIRST = 1,
  SECOND = 2,
  TERMINATED = 3
}

const Agent = ({
  userName,
  userId,
  interviewId,
  feedbackId,
  type,
  questions,
}: AgentProps) => {
  const router = useRouter();
  const [callStatus, setCallStatus] = useState<CallStatus>(CallStatus.INACTIVE);
  const [messages, setMessages] = useState<SavedMessage[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastMessage, setLastMessage] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [warningLevel, setWarningLevel] = useState<WarningLevel>(WarningLevel.NONE);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const keydownRef = useRef<boolean>(false);

  // Function to detect inappropriate content
  const detectAIWarningResponse = (text: string): boolean => {
    // Detect when AI interviewer is giving warnings based on response content
    const warningIndicators = [
      /that language is.*unacceptable/i,
      /inappropriate.*behavior/i,
      /this is your.*warning/i,
      /unprofessional.*conduct/i,
      /interview.*terminated/i,
      /further inappropriate/i,
      /completely unacceptable/i,
      /professional.*setting/i,
      /warning.*termination/i,
      /inappropriate.*comments/i
    ];

    return warningIndicators.some(pattern => pattern.test(text));
  };

  // Handle warning system
  const handleInappropriateBehavior = useCallback(() => {
    const newWarningLevel = warningLevel + 1;
    setWarningLevel(newWarningLevel);

    if (newWarningLevel >= WarningLevel.TERMINATED) {
      // Automatically terminate interview
      setTimeout(() => {
        handleDisconnect();
      }, 3000); // Give 3 seconds for the termination message to be heard
    }
  }, [warningLevel]);

  // Get warning indicator color and text
  const getWarningIndicator = () => {
    switch (warningLevel) {
      case WarningLevel.FIRST:
        return { color: "bg-yellow-500", text: "Warning 1/2", pulse: "animate-pulse" };
      case WarningLevel.SECOND:
        return { color: "bg-orange-500", text: "Final Warning", pulse: "animate-pulse" };
      case WarningLevel.TERMINATED:
        return { color: "bg-red-500", text: "Interview Terminated", pulse: "animate-pulse" };
      default:
        return null;
    }
  };

  // Debug method to reset states if stuck
  const debugResetStates = useCallback(() => {
    console.log("🔧 DEBUG: Force resetting all states");
    setIsRecording(false);
    setIsTranscribing(false);
    setIsGenerating(false);
    setIsSpeaking(false);
    keydownRef.current = false;
    conversationHandler.resetStates();
  }, []);

  // Expose debug function globally for console access
  useEffect(() => {
    (window as any).debugResetInterviewStates = debugResetStates;
    return () => {
      delete (window as any).debugResetInterviewStates;
    };
  }, [debugResetStates]);

  // Hold-to-speak functionality
  const startRecording = useCallback(() => {
    console.log("Starting recording attempt...", {
      callStatus,
      isTranscribing,
      isGenerating,
      isRecording,
      keydownRef: keydownRef.current
    });
    
    if (callStatus === CallStatus.ACTIVE && !isTranscribing && !isGenerating && !isRecording && warningLevel < WarningLevel.TERMINATED) {
      console.log("✅ Starting recording");
      setIsRecording(true);
      conversationHandler.startManualRecording();
    } else {
      console.log("❌ Recording blocked:", {
        callStatus,
        isTranscribing,
        isGenerating,
        isRecording,
        warningLevel
      });
    }
  }, [callStatus, isTranscribing, isGenerating, isRecording, warningLevel]);

  const stopRecording = useCallback(() => {
    console.log("Stopping recording attempt...", { isRecording });
    if (isRecording) {
      console.log("✅ Stopping recording");
      setIsRecording(false);
      conversationHandler.stopManualRecording();
    }
  }, [isRecording]);

  // Keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !keydownRef.current) {
        console.log("Spacebar down - starting recording");
        keydownRef.current = true;
        startRecording();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space" && keydownRef.current) {
        console.log("Spacebar up - stopping recording");
        keydownRef.current = false;
        stopRecording();
      }
    };

    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    document.addEventListener("keypress", handleKeyPress);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("keypress", handleKeyPress);
    };
  }, [startRecording, stopRecording]);

  // Event handlers for conversation
  useEffect(() => {
    const onCallStart = () => {
      console.log("Conversation started");
      setCallStatus(CallStatus.ACTIVE);
    };

    const onCallEnd = () => {
      console.log("Conversation ended");
      setCallStatus(CallStatus.FINISHED);
    };

    const onMessage = (message: Message) => {
      console.log("Message received:", message);

      if (message.type === "transcript" && message.transcriptType === "final") {
        const newMessage: SavedMessage = {
          role: message.role,
          content: message.transcript,
        };

        // Check for AI warning responses instead of user content
        if (message.role === "assistant" && detectAIWarningResponse(message.transcript)) {
          console.log("🚨 AI issued warning response:", message.transcript);
          handleInappropriateBehavior();
        }

        setMessages((prev) => [...prev, newMessage]);

        if (message.role === "user") {
          console.log("User message received - starting AI generation");
          setIsGenerating(true);
          setIsTranscribing(false);
        } else if (message.role === "assistant") {
          console.log("Assistant response received - resetting all states");
          setIsGenerating(false);
          setIsTranscribing(false);
          setIsRecording(false);
        }
      }
    };

    const onSpeechStart = () => {
      console.log("Speech started (TTS playing)");
      setIsSpeaking(true);
    };

    const onSpeechEnd = () => {
      console.log("Speech ended (TTS finished)");
      setIsSpeaking(false);
    };

    const onError = (error: Error) => {
      console.error("Conversation error:", error);
      setCallStatus(CallStatus.FINISHED);
    };

    conversationHandler.on("call-start", onCallStart);
    conversationHandler.on("call-end", onCallEnd);
    conversationHandler.on("message", onMessage);
    conversationHandler.on("speech-start", onSpeechStart);
    conversationHandler.on("speech-end", onSpeechEnd);
    conversationHandler.on("error", onError);

    return () => {
      // Clean up event listeners
      conversationHandler.off("call-start", onCallStart);
      conversationHandler.off("call-end", onCallEnd);
      conversationHandler.off("message", onMessage);
      conversationHandler.off("speech-start", onSpeechStart);
      conversationHandler.off("speech-end", onSpeechEnd);
      conversationHandler.off("error", onError);
    };
  }, [handleInappropriateBehavior]);

  useEffect(() => {
    if (messages.length > 0) {
      setLastMessage(messages[messages.length - 1].content);
    }

    const handleGenerateFeedback = async (messages: SavedMessage[]) => {
      console.log("handleGenerateFeedback - client-side");

      try {
        // Step 1: Generate feedback using client-side Ollama
        console.log("Generating feedback with client-side Ollama...");
        const feedbackData = await clientFeedbackGenerator.generateFeedback(messages);
        
        console.log("Feedback generated:", feedbackData);

        // Step 2: Save feedback to database via API
        console.log("Saving feedback to database...");
        const response = await fetch("/api/save-feedback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            interviewId: interviewId!,
            userId: userId!,
            feedbackId,
            totalScore: feedbackData.totalScore,
            categoryScores: feedbackData.categoryScores,
            strengths: feedbackData.strengths,
            areasForImprovement: feedbackData.areasForImprovement,
            finalAssessment: feedbackData.finalAssessment,
          }),
        });

        const result = await response.json();
        console.log("Save feedback response:", result);

        if (result.success && result.feedbackId) {
          router.push(`/interview/${interviewId}/feedback`);
        } else {
          console.log("Error saving feedback:", result.error);
          router.push("/");
        }
      } catch (error) {
        console.error("Error generating feedback:", error);
        
        // Provide more specific error messages
        if (error instanceof Error) {
          if (error.message.includes("fetch failed") || error.message.includes("NetworkError")) {
            console.error("Cannot connect to Ollama service for feedback generation");
          }
        }
        
        router.push("/");
      } finally {
        setIsGeneratingFeedback(false);
      }
    };

    if (callStatus === CallStatus.FINISHED) {
      if (type === "generate") {
        router.push("/");
      } else {
        // Only generate feedback if there was actual meaningful conversation
        // Check if there are user messages (indicating actual interview interaction)
        const userMessages = messages.filter(msg => msg.role === "user");
        const assistantMessages = messages.filter(msg => msg.role === "assistant");
        
        if (userMessages.length > 0 && assistantMessages.length > 1) {
          // There was actual conversation, immediately start generating feedback
          // This prevents the glitch where interview screen shows briefly
          setIsGeneratingFeedback(true);
          handleGenerateFeedback(messages);
        } else {
          // No meaningful conversation happened, just go back to home or allow retry
          console.log("No meaningful conversation detected, not generating feedback");
          // Reset call status to allow retry
          setCallStatus(CallStatus.INACTIVE);
        }
      }
    }
  }, [messages, callStatus, feedbackId, interviewId, router, type, userId]);

  const handleCall = async () => {
    try {
      console.log("Starting conversation...");
      setCallStatus(CallStatus.CONNECTING);
      setWarningLevel(WarningLevel.NONE); // Reset warning level

      if (type === "generate") {
        // For generate type, use a default workflow with conversation handler
        console.log("Starting general conversation mode");
        await conversationHandler.start("default", {
          variableValues: {
            username: userName || "User",
            userid: userId || "unknown",
          },
        });
      } else {
        let formattedQuestions = "";
        if (questions) {
          formattedQuestions = questions
            .map((question) => `- ${question}`)
            .join("\n");
        }

        console.log("Interviewer config:", interviewer);
        console.log("Formatted questions:", formattedQuestions);

        // Fallback configuration if interviewer is undefined
        const interviewConfig = interviewer || {
          systemPrompt: `You are a professional job interviewer conducting a real-time voice interview with a candidate. Your goal is to assess their qualifications, motivation, and fit for the role.

Interview Guidelines:
Follow the structured question flow:
{{questions}}

Engage naturally & react appropriately:
Listen actively to responses and acknowledge them before moving forward.
Ask brief follow-up questions if a response is vague or requires more detail.
Keep the conversation flowing smoothly while maintaining control.
Be professional, yet warm and welcoming:

Use official yet friendly language.
Keep responses concise and to the point (like in a real voice interview).
Avoid robotic phrasing—sound natural and conversational.

Handle unprofessional behavior with ZERO TOLERANCE:
If a candidate uses profanity, sexual language, inappropriate comments, or behaves unprofessionally:
- Issue an IMMEDIATE, FIRM warning without any politeness or apologies
- Be direct, authoritative, and assertive - you are in complete control
- NEVER say "I apologize" or "I understand you're frustrated" - DO NOT make excuses for their behavior
- Make it clear this behavior is completely unacceptable and will result in interview termination
- Examples of firm responses:
  * "That language is completely unacceptable in a professional interview. This is your first warning. Any further inappropriate behavior will result in immediate termination of this interview."
  * "Your behavior is unprofessional and inappropriate. This is your second warning. One more incident and this interview will be terminated immediately."
  * "This interview is being terminated due to your continued inappropriate behavior. This is unacceptable in any professional setting."
- Track warnings internally and terminate after the third offense
- Do NOT continue with interview questions after giving a warning - wait for their response first

Handle company-specific questions with strict boundaries:
- For salary, compensation, benefits: "I cannot provide specific compensation information. HR will discuss all compensation details during the next phase if you advance."
- For company policies, specific benefits, work environment: "I'm not authorized to discuss those specifics. HR will provide comprehensive information about company policies and culture."
- For role responsibilities: You can discuss general job duties and what the role typically involves
- CRITICAL: NEVER make up or invent specific salary figures, benefit amounts, company policies, or organizational details
- If you don't know something specific about the company, always redirect to HR or state you cannot provide that information
- NEVER hallucinate or create fictional company information

IMPORTANT RESPONSE RULES:
- Be firm and authoritative when dealing with misconduct - you control this interview
- Keep all your responses short and simple. Use official language, but be kind and welcoming.
- This is a voice conversation, so keep your responses short, like in a real conversation. Don't ramble for too long.
- NEVER include stage directions, parenthetical notes, or bracketed text in your responses.
- Speak only what should be heard by the candidate - no internal thoughts or directions.
- Do not use phrases like "(pause)", "(maintaining calm tone)", "[smiling]", etc.
- Your responses should be direct speech only.
- Do not apologize for candidate misconduct - be firm and professional instead.`,
          useStreaming: false,
        };

        console.log("Starting interview with config:", interviewConfig);
        await conversationHandler.start(interviewConfig, {
          variableValues: {
            questions: formattedQuestions,
          },
        });
      }
    } catch (error) {
      console.error("Failed to start conversation:", error);
      setCallStatus(CallStatus.FINISHED);
    }
  };

  const handleDisconnect = async () => {
    try {
      console.log("Stopping conversation...");
      await conversationHandler.stop();
      setCallStatus(CallStatus.FINISHED);
    } catch (error) {
      console.error("Error stopping conversation:", error);
      setCallStatus(CallStatus.FINISHED);
    }
  };

  // Get current processing state for UI
  const getProcessingState = () => {
    if (isTranscribing) return "Transcribing...";
    if (isGenerating) return "Generating response...";
    return "Hold to Speak";
  };

  const isAnyProcessing = isTranscribing || isGenerating;
  const warningIndicator = getWarningIndicator();

  // Debug logging
  console.log("Agent render state:", {
    callStatus,
    isRecording,
    isTranscribing,
    isGenerating,
    isSpeaking,
    warningLevel,
    messagesCount: messages.length,
    lastMessage: lastMessage ? lastMessage.slice(0, 50) + "..." : "No message"
  });

  // Show feedback generation loader
  if (isGeneratingFeedback) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-900 z-50">
        <div className="flex flex-col items-center justify-center space-y-8 p-8">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin"></div>
            <div className="absolute inset-0 w-20 h-20 border-4 border-transparent border-r-blue-300 rounded-full animate-ping"></div>
          </div>
          <div className="text-center max-w-md">
            <h3 className="text-2xl font-bold text-white mb-3">Generating Your Feedback</h3>
            <p className="text-gray-300 mb-6 text-lg">Our AI is analyzing your interview performance and preparing detailed insights...</p>
            <div className="flex items-center justify-center space-x-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="call-view">
        {/* Warning Indicator */}
        {warningIndicator && (
          <div className={cn(
            "fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-white font-semibold shadow-lg",
            warningIndicator.color,
            warningIndicator.pulse
          )}>
            {warningIndicator.text}
          </div>
        )}

        {/* AI Interviewer Card */}
        <div className="card-interviewer">
          <div className="avatar">
            <Image
              src="/ai-avatar.png"
              alt="profile-image"
              width={65}
              height={54}
              className="object-cover"
            />
            {isSpeaking && <span className="animate-speak" />}
          </div>
          <h3>AI Interviewer</h3>
        </div>

        {/* User Profile Card */}
        <div className="card-border">
          <div className="card-content">
            <Image
              src="/user-avatar.png"
              alt="profile-image"
              width={539}
              height={539}
              className="rounded-full object-cover size-[120px]"
            />
            <h3>{userName}</h3>
            {/* Recording indicator */}
            {isRecording && (
              <div className="flex items-center gap-2 mt-2">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-red-500 font-medium">Recording...</span>
              </div>
            )}
            {isTranscribing && (
              <div className="flex items-center gap-2 mt-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-blue-500 font-medium">Transcribing...</span>
              </div>
            )}
            {isGenerating && (
              <div className="flex items-center gap-2 mt-2">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-green-500 font-medium">Generating...</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transcript Section - Always show when there are messages */}
      {messages.length > 0 && lastMessage && (
        <div className="transcript-border">
          <div className="transcript">
            <p
              key={lastMessage}
              className={cn(
                "transition-opacity duration-500 opacity-0",
                "animate-fadeIn opacity-100"
              )}
            >
              {lastMessage}
            </p>
          </div>
        </div>
      )}

      {/* Control Buttons */}
      <div className="w-full flex flex-col items-center gap-4">
        {/* Call Status Debug */}
        <div className="text-xs text-gray-400 mb-2">
          Status: {callStatus} | Recording: {isRecording ? 'Yes' : 'No'} | Transcribing: {isTranscribing ? 'Yes' : 'No'} | Generating: {isGenerating ? 'Yes' : 'No'} | Warnings: {warningLevel}/2
        </div>
        
        {callStatus !== CallStatus.ACTIVE ? (
          <button className="relative btn-call" onClick={() => handleCall()}>
            <span
              className={cn(
                "absolute animate-ping rounded-full opacity-75",
                callStatus !== CallStatus.CONNECTING && "hidden"
              )}
            />

            <span className="relative text-black">
              {callStatus === CallStatus.INACTIVE || callStatus === CallStatus.FINISHED
                ? "Start Interview"
                : "Connecting..."}
            </span>
          </button>
        ) : (
          <div className="flex flex-col items-center gap-2">
            {/* Buttons Row */}
            <div className="flex items-center gap-6">
              {/* Hold to Speak Button */}
              <button
                className={cn(
                  "relative transition-all duration-200 flex items-center justify-center rounded-full w-36 h-12 border-0",
                  isRecording 
                    ? "bg-red-500 hover:bg-red-600 scale-110 shadow-lg" 
                    : isTranscribing 
                      ? "bg-blue-500 hover:bg-blue-600"
                      : isGenerating
                        ? "bg-green-500 hover:bg-green-600"
                        : "bg-blue-500 hover:bg-blue-600",
                  (isAnyProcessing || warningLevel >= WarningLevel.TERMINATED) && "opacity-50 cursor-not-allowed"
                )}
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onMouseLeave={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                disabled={isAnyProcessing || warningLevel >= WarningLevel.TERMINATED}
              >
                {warningLevel >= WarningLevel.TERMINATED ? (
                  <span className="relative z-10 font-medium text-xs px-2 text-center">
                    Terminated
                  </span>
                ) : (
                  <svg 
                    className="w-6 h-6 text-white" 
                    fill="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                  </svg>
                )}
              </button>

              {/* End Interview Button */}
              <button
                className="btn-disconnect"
                onClick={handleDisconnect}
              >
                End Interview
              </button>
            </div>

            {/* Instructions */}
            <p className="text-xs text-gray-500 text-center max-w-md">
              {warningLevel >= WarningLevel.TERMINATED 
                ? "This interview has been terminated due to inappropriate behavior."
                : "Hold the button above or press and hold SPACEBAR to speak"
              }
            </p>
          </div>
        )}
      </div>
    </>
  );
};

export default Agent;
