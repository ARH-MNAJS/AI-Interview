// Conversation-related types to avoid circular imports

// Conversation status enum
export enum CallStatus {
  INACTIVE = "INACTIVE",
  CONNECTING = "CONNECTING",
  ACTIVE = "ACTIVE",
  FINISHED = "FINISHED",
}

export interface ConversationConfig {
  systemPrompt: string;
  variables?: Record<string, string>;
  useStreaming?: boolean;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface ConversationEventCallbacks {
  onCallStart?: () => void;
  onCallEnd?: () => void;
  onMessage?: (message: ConversationMessage) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: CallStatus) => void;
}

// VAPI compatibility types (for backwards compatibility during migration)
export interface Message {
  type: string;
  role: 'user' | 'assistant' | 'system';
  transcriptType?: string;
  transcript: string;
} 