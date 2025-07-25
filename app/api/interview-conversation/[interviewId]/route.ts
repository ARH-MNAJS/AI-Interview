import { NextRequest } from "next/server";
import { db } from "@/firebase/admin";
import { logger } from "@/lib/services/logger";

export async function GET(
  request: NextRequest, 
  { params }: { params: Promise<{ interviewId: string }> }
) {
  try {
    const { interviewId } = await params;
    
    logger.info("API Interview Conversation", "Fetching conversation", { interviewId });

    // Try to fetch conversation data from Firestore
    // This is a placeholder - you'll need to implement the actual storage mechanism
    // For now, we'll return mock data since conversation storage isn't implemented yet
    
    const mockConversation = [
      { 
        role: "assistant", 
        content: "Hello! Welcome to your interview. Let's start with a quick introduction - can you tell me about yourself?", 
        timestamp: new Date().toISOString()
      },
      { 
        role: "user", 
        content: "Hi, I'm excited to be here. I have experience in software development and I'm passionate about creating great user experiences.", 
        timestamp: new Date(Date.now() + 30000).toISOString()
      },
      { 
        role: "assistant", 
        content: "That's great to hear! Can you tell me about a challenging project you've worked on recently?", 
        timestamp: new Date(Date.now() + 60000).toISOString()
      },
      { 
        role: "user", 
        content: "Recently, I worked on a complex web application that required real-time data synchronization across multiple clients. I used WebSockets and implemented a state management solution to handle concurrent updates.", 
        timestamp: new Date(Date.now() + 120000).toISOString()
      },
    ];

    logger.info("API Interview Conversation", "Conversation fetched successfully", { 
      interviewId, 
      messageCount: mockConversation.length 
    });

    return Response.json({ 
      success: true, 
      conversation: mockConversation 
    }, { status: 200 });

  } catch (error) {
    logger.error("API Interview Conversation", "Error fetching conversation", error);
    return Response.json(
      { success: false, error: "Failed to fetch conversation" }, 
      { status: 500 }
    );
  }
} 