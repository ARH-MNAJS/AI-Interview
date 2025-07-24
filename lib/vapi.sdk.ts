// Replaced VAPI with open-source solution
import { conversationHandler } from './services/conversation_handler';

// VAPI-compatible interface for seamless migration
export const vapi = conversationHandler;
