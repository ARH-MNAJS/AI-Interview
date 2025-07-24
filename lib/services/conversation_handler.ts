import { edgeTTSClient } from './tts_client';
import { whisperSTTClient } from './stt_client';
import { clientOllamaAdapter, type ChatMessage } from './client_ollama_adapter';
import { logger } from './logger';
import { AUDIO_CONFIG } from '../config/services';
import { 
  CallStatus, 
  ConversationConfig, 
  ConversationMessage, 
  ConversationEventCallbacks 
} from '../../types/conversation';

// Re-export types for convenience
export type { CallStatus, ConversationConfig, ConversationMessage, ConversationEventCallbacks };

export class ConversationHandler {
  private status: CallStatus = CallStatus.INACTIVE;
  private callbacks: ConversationEventCallbacks = {};
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private conversationHistory: ConversationMessage[] = [];
  private stream: MediaStream | null = null;
  private config: ConversationConfig | null = null;
  private speechStartTimer: NodeJS.Timeout | null = null;
  private keyboardCleanup: (() => void) | null = null;
  private isManualRecording = false;
  private audioChunks: Blob[] = [];
  private hasStarted = false; // Track if conversation has started to avoid repeating greeting
  private isGeneratingResponse = false; // Track AI response generation
  private stateTimeoutId: NodeJS.Timeout | null = null; // Timeout to prevent stuck states

  constructor() {
    logger.info('ConversationHandler', 'Initialized conversation handler');
  }

  // Manual recording methods for hold-to-speak functionality
  startManualRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'inactive' && !this.isGeneratingResponse) {
      this.isManualRecording = true;
      this.audioChunks = [];
      this.callbacks.onSpeechStart?.();
      this.mediaRecorder.start();
      logger.info('ConversationHandler', 'Manual recording started (hold-to-speak)');
    } else {
      logger.warn('ConversationHandler', 'Cannot start manual recording', {
        mediaRecorderState: this.mediaRecorder?.state,
        isGeneratingResponse: this.isGeneratingResponse,
        isManualRecording: this.isManualRecording
      });
    }
  }

  stopManualRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording' && this.isManualRecording) {
      this.isManualRecording = false;
      this.mediaRecorder.stop();
      logger.info('ConversationHandler', 'Manual recording stopped (hold-to-speak)');
    } else {
      logger.warn('ConversationHandler', 'Cannot stop manual recording', {
        mediaRecorderState: this.mediaRecorder?.state,
        isManualRecording: this.isManualRecording
      });
      
      // Force reset manual recording state if we get into an inconsistent state
      if (this.isManualRecording && this.mediaRecorder?.state !== 'recording') {
        logger.info('ConversationHandler', 'Force resetting manual recording state');
        this.isManualRecording = false;
        this.callbacks.onSpeechEnd?.();
      }
    }
  }

  // Event subscription methods (mimicking VAPI pattern)
  on(event: string, callback: Function) {
    switch (event) {
      case 'call-start':
        this.callbacks.onCallStart = callback as () => void;
        break;
      case 'call-end':
        this.callbacks.onCallEnd = callback as () => void;
        break;
      case 'message':
        this.callbacks.onMessage = callback as (message: ConversationMessage) => void;
        break;
      case 'speech-start':
        this.callbacks.onSpeechStart = callback as () => void;
        break;
      case 'speech-end':
        this.callbacks.onSpeechEnd = callback as () => void;
        break;
      case 'error':
        this.callbacks.onError = callback as (error: Error) => void;
        break;
    }
    logger.debug('ConversationHandler', `Registered event listener: ${event}`);
  }

  off(event: string, callback?: Function) {
    switch (event) {
      case 'call-start':
        this.callbacks.onCallStart = undefined;
        break;
      case 'call-end':
        this.callbacks.onCallEnd = undefined;
        break;
      case 'message':
        this.callbacks.onMessage = undefined;
        break;
      case 'speech-start':
        this.callbacks.onSpeechStart = undefined;
        break;
      case 'speech-end':
        this.callbacks.onSpeechEnd = undefined;
        break;
      case 'error':
        this.callbacks.onError = undefined;
        break;
    }
    logger.debug('ConversationHandler', `Removed event listener: ${event}`);
  }

  private setStatus(newStatus: CallStatus) {
    this.status = newStatus;
    this.callbacks.onStatusChange?.(newStatus);
    logger.info('ConversationHandler', `Status changed to: ${newStatus}`);
  }

  private emitMessage(message: ConversationMessage) {
    // Add to conversation history
    this.conversationHistory.push({
      ...message,
      timestamp: new Date().toISOString(),
    });

    // Create VAPI-compatible message format
    const vapiMessage = {
      type: "transcript",
      role: message.role,
      transcriptType: "final",
      transcript: message.content,
    };

    this.callbacks.onMessage?.(vapiMessage as any);
    logger.debug('ConversationHandler', 'Emitted message', { role: message.role, length: message.content.length });
  }

  async start(configOrWorkflowId: ConversationConfig | string, options?: { variableValues?: Record<string, string> }) {
    try {
      this.setStatus(CallStatus.CONNECTING);
      logger.info('ConversationHandler', 'Starting conversation');

      // Reset state
      this.hasStarted = false;
      this.isGeneratingResponse = false;
      this.conversationHistory = [];

             // Handle configuration
       if (typeof configOrWorkflowId === 'string') {
         // Legacy VAPI workflow support - use default interviewer config
         this.config = {
           systemPrompt: this.buildSystemPrompt(options?.variableValues || {}),
           variables: options?.variableValues,
           useStreaming: false,
         };
       } else {
         // Validate interviewer config before processing
         if (!configOrWorkflowId) {
           throw new Error('No configuration provided for conversation');
         }
         // Process interviewer config with variable substitution
         this.config = this.processInterviewerConfig(configOrWorkflowId, options?.variableValues || {});
       }

      // Test service connections
      const servicesHealthy = await this.checkServicesHealth();
      if (!servicesHealthy) {
        throw new Error('One or more services are not available');
      }

      // Initialize audio capture
      await this.initializeAudioCapture();

      // Add system message to conversation
      if (this.config.systemPrompt) {
        this.conversationHistory.push({
          role: 'system',
          content: this.config.systemPrompt,
        });
      }

      this.setStatus(CallStatus.ACTIVE);
      this.callbacks.onCallStart?.();

      // Send initial greeting only once
      if (!this.hasStarted) {
        this.hasStarted = true;
        await this.generateAndPlayResponse("Hello! Thank you for taking the time to speak with me today. I'm excited to learn more about you and your experience.");
      }

    } catch (error) {
      logger.error('ConversationHandler', 'Failed to start conversation', error);
      this.callbacks.onError?.(error as Error);
      this.setStatus(CallStatus.FINISHED);
    }
  }

  async stop() {
    logger.info('ConversationHandler', 'Stopping conversation');
    
    // Clear any timeouts first
    if (this.stateTimeoutId) {
      clearTimeout(this.stateTimeoutId);
      this.stateTimeoutId = null;
    }
    
    if (this.speechStartTimer) {
      clearTimeout(this.speechStartTimer);
      this.speechStartTimer = null;
    }
    
    // Reset flags
    this.hasStarted = false;
    this.isGeneratingResponse = false;
    this.isManualRecording = false;
    this.audioChunks = [];
    
    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
      this.mediaRecorder = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    // Clean up keyboard listeners
    if (this.keyboardCleanup) {
      this.keyboardCleanup();
      this.keyboardCleanup = null;
    }

    this.setStatus(CallStatus.FINISHED);
    this.callbacks.onCallEnd?.();
  }

  private async checkServicesHealth(): Promise<boolean> {
    // Skip health checks if environment variable is set
    if (process.env.NEXT_PUBLIC_SKIP_HEALTH_CHECKS === 'true') {
      logger.info('ConversationHandler', 'Skipping health checks due to NEXT_PUBLIC_SKIP_HEALTH_CHECKS=true');
      return true;
    }

    logger.debug('ConversationHandler', 'Checking services health');
    
    try {
      const [ttsHealthy, sttHealthy, llmHealthy] = await Promise.all([
        edgeTTSClient.testConnection(),
        whisperSTTClient.testConnection(),
        clientOllamaAdapter.testConnection(),
      ]);

      const allHealthy = ttsHealthy && sttHealthy && llmHealthy;
      logger.info('ConversationHandler', 'Services health check completed', {
        tts: ttsHealthy,
        stt: sttHealthy,
        llm: llmHealthy,
        overall: allHealthy,
      });

      return allHealthy;
    } catch (error) {
      logger.error('ConversationHandler', 'Health check failed - likely mixed content issue', error);
      
      // Check if we're in a mixed content environment (HTTPS page, HTTP services)
      const isHTTPS = typeof window !== 'undefined' && window.location.protocol === 'https:';
      if (isHTTPS) {
        logger.warn('ConversationHandler', 'Mixed content detected. Consider using ngrok or setting NEXT_PUBLIC_SKIP_HEALTH_CHECKS=true');
      }
      
      return false;
    }
  }

  private async initializeAudioCapture() {
    logger.debug('ConversationHandler', 'Initializing audio capture');

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: AUDIO_CONFIG.SAMPLE_RATE,
          channelCount: AUDIO_CONFIG.CHANNELS,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });

      this.audioContext = new AudioContext({ sampleRate: AUDIO_CONFIG.SAMPLE_RATE });
      
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        logger.info('ConversationHandler', 'MediaRecorder stopped', {
          audioChunksCount: this.audioChunks.length,
          isGeneratingResponse: this.isGeneratingResponse,
        });

        // Clear any existing timeout
        if (this.stateTimeoutId) {
          clearTimeout(this.stateTimeoutId);
          this.stateTimeoutId = null;
        }

        // Set a timeout to prevent getting stuck in transcribing state
        this.stateTimeoutId = setTimeout(() => {
          logger.warn('ConversationHandler', 'Transcription timeout - forcing state reset');
          this.forceResetStates();
        }, 30000); // 30 second timeout

        try {
          if (this.audioChunks.length > 0) {
            this.callbacks.onSpeechEnd?.();

            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            logger.info('ConversationHandler', 'Created audio blob', {
              size: audioBlob.size,
              type: audioBlob.type,
            });
            
            this.audioChunks = [];

            // Convert to WAV for Whisper
            logger.debug('ConversationHandler', 'Converting audio to WAV');
            const wavBlob = await this.convertToWav(audioBlob);
            logger.info('ConversationHandler', 'Audio converted to WAV', {
              originalSize: audioBlob.size,
              wavSize: wavBlob.size,
            });
            
            // Transcribe
            logger.debug('ConversationHandler', 'Starting transcription');
            const transcription = await whisperSTTClient.transcribe(wavBlob);
            logger.info('ConversationHandler', 'Transcription completed', {
              text: transcription.text,
              textLength: transcription.text.length,
            });
            
            if (transcription.text.trim()) {
              // Emit user message
              this.emitMessage({
                role: 'user',
                content: transcription.text,
              });

              // Generate AI response (not the greeting)
              logger.debug('ConversationHandler', 'Starting AI response generation');
              await this.generateAndPlayResponse();
            } else {
              logger.warn('ConversationHandler', 'Empty transcription received');
              // Reset transcribing state even for empty transcriptions
              this.callbacks.onSpeechEnd?.();
            }
          } else {
            logger.warn('ConversationHandler', 'MediaRecorder stopped but no audio to process', {
              audioChunksCount: this.audioChunks.length,
            });
            // Signal speech end even when no audio was processed
            this.callbacks.onSpeechEnd?.();
          }
        } catch (error) {
          logger.error('ConversationHandler', 'Audio processing failed', error);
          this.callbacks.onError?.(error as Error);
          
          // Ensure we reset states on error to prevent getting stuck
          this.isGeneratingResponse = false;
          this.isManualRecording = false;
          this.callbacks.onSpeechEnd?.();
        } finally {
          // Clear timeout since processing completed
          if (this.stateTimeoutId) {
            clearTimeout(this.stateTimeoutId);
            this.stateTimeoutId = null;
          }
        }
      };

      // Disable automatic voice activity detection - we'll use manual hold-to-speak instead
      logger.info('ConversationHandler', 'Audio capture initialized for manual recording mode (hold-to-speak)');

    } catch (error) {
      logger.error('ConversationHandler', 'Failed to initialize audio capture', error);
      throw error;
    }
  }

  private async convertToWav(audioBlob: Blob): Promise<Blob> {
    // Simple conversion - in production, you might want a more robust solution
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    const wavBuffer = this.audioBufferToWav(audioBuffer);
    return new Blob([wavBuffer], { type: 'audio/wav' });
  }

  private audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
    const length = buffer.length * buffer.numberOfChannels * 2;
    const arrayBuffer = new ArrayBuffer(44 + length);
    const view = new DataView(arrayBuffer);
    
    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, buffer.numberOfChannels, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * 2 * buffer.numberOfChannels, true);
    view.setUint16(32, buffer.numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length, true);

    // PCM data
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return arrayBuffer;
  }

  private async generateAndPlayResponse(overrideText?: string) {
    // Prevent concurrent response generation
    if (this.isGeneratingResponse && !overrideText) {
      logger.warn('ConversationHandler', 'Response generation already in progress - skipping');
      return;
    }

    this.isGeneratingResponse = true;
    logger.debug('ConversationHandler', 'Setting isGeneratingResponse = true');

    try {
      let responseText = overrideText;
      
      if (!responseText) {
        // Prepare conversation for LLM
        const messages: ChatMessage[] = this.conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.content,
        }));

        logger.info('ConversationHandler', 'Sending AI request', {
          messageCount: messages.length,
          lastUserMessage: messages.filter(m => m.role === 'user').slice(-1)[0]?.content?.slice(0, 100),
          conversationHistory: messages.map(m => ({ role: m.role, contentLength: m.content.length }))
        });

        const startTime = Date.now();
        responseText = await clientOllamaAdapter.generateResponse(messages);
        const duration = Date.now() - startTime;

        logger.info('ConversationHandler', 'AI response received', {
          responseLength: responseText.length,
          responsePreview: responseText.slice(0, 100),
          durationMs: duration
        });

        // Filter out stage directions and unwanted formatting
        responseText = this.filterResponse(responseText);
      }

      // Emit assistant message
      this.emitMessage({
        role: 'assistant',
        content: responseText,
      });

      // Generate and play audio
      logger.debug('ConversationHandler', 'Starting TTS synthesis');
      const audioBuffer = await edgeTTSClient.synthesize(responseText);
      
      // Play audio and wait for completion
      await this.playAudio(audioBuffer);

      logger.debug('ConversationHandler', 'Response generation and playback completed');

    } catch (error) {
      logger.error('ConversationHandler', 'Failed to generate response', error);
      this.callbacks.onError?.(error as Error);
    } finally {
      // Always reset the generation flag
      this.isGeneratingResponse = false;
      logger.debug('ConversationHandler', 'Setting isGeneratingResponse = false');
      
      // Add a small delay to ensure state is properly reset before next interaction
      setTimeout(() => {
        logger.debug('ConversationHandler', 'Response generation cycle completed - ready for next input');
      }, 100);
    }
  }

  private filterResponse(response: string): string {
    let filtered = response;
    
    // Remove text in parentheses (stage directions)
    filtered = filtered.replace(/\([^)]*\)/g, '');
    
    // Remove text in square brackets
    filtered = filtered.replace(/\[[^\]]*\]/g, '');
    
    // Remove text in curly braces
    filtered = filtered.replace(/\{[^}]*\}/g, '');
    
    // Remove multiple spaces and line breaks
    filtered = filtered.replace(/\s+/g, ' ').trim();
    
    // Remove any remaining formatting artifacts
    filtered = filtered.replace(/^\s*[-*]\s*/gm, ''); // Remove bullet points
    filtered = filtered.replace(/\*\*(.*?)\*\*/g, '$1'); // Remove bold markdown
    filtered = filtered.replace(/\*(.*?)\*/g, '$1'); // Remove italic markdown
    
    logger.debug('ConversationHandler', 'Response filtered', {
      originalLength: response.length,
      filteredLength: filtered.length,
      originalPreview: response.slice(0, 100),
      filteredPreview: filtered.slice(0, 100)
    });
    
    return filtered;
  }

  private async playAudio(audioBuffer: ArrayBuffer) {
    try {
      if (!this.audioContext) return;

      const audioBufferDecoded = await this.audioContext.decodeAudioData(audioBuffer.slice(0));
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBufferDecoded;
      source.connect(this.audioContext.destination);
      
      source.start();
      
      // Wait for audio to finish
      await new Promise(resolve => {
        source.onended = resolve;
      });

    } catch (error) {
      logger.error('ConversationHandler', 'Failed to play audio', error);
    }
  }

  private buildSystemPrompt(variables: Record<string, string>): string {
    let prompt = `You are a professional job interviewer conducting a real-time voice interview with a candidate. Your goal is to assess their qualifications, motivation, and fit for the role.

Interview Guidelines:`;

    if (variables.questions) {
      prompt += `\nFollow the structured question flow:\n${variables.questions}\n`;
    }

    prompt += `
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

Conclude the interview properly:
Thank the candidate for their time.
Inform them that the company will reach out soon with feedback.
End the conversation on a polite and positive note.

CRITICAL RESPONSE RULES:
- Be firm and authoritative when dealing with misconduct - you control this interview
- Keep responses short and direct for voice conversation
- NEVER include stage directions, parenthetical notes, or bracketed commentary
- Speak only what should be heard - no internal thoughts or directions
- Do not apologize for candidate misconduct - be firm and professional instead
- Do not invent or hallucinate any company-specific information
- Be honest when you don't know specific details about the company or role`;

    return prompt;
  }

  // Method to handle template variable substitution for interviewer config
  private processInterviewerConfig(config: ConversationConfig, variables: Record<string, string>): ConversationConfig {
    // Ensure config exists and has required properties
    if (!config || !config.systemPrompt) {
      logger.error('ConversationHandler', 'Invalid interviewer config provided', { config });
      throw new Error('Invalid interviewer configuration: missing systemPrompt');
    }

    let processedPrompt = config.systemPrompt;
    
    // Replace template variables
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      processedPrompt = processedPrompt.replace(new RegExp(placeholder, 'g'), value);
    });

    return {
      ...config,
      systemPrompt: processedPrompt,
      variables,
    };
  }

  getConversationHistory(): ConversationMessage[] {
    return [...this.conversationHistory];
  }

  getStatus(): CallStatus {
    return this.status;
  }

  // Method to force reset states when stuck
  private forceResetStates() {
    logger.info('ConversationHandler', 'Force resetting all states');
    this.isGeneratingResponse = false;
    this.isManualRecording = false;
    this.audioChunks = [];
    this.callbacks.onSpeechEnd?.();
  }

  // Public method to reset states (for debugging)
  public resetStates() {
    this.forceResetStates();
  }
}

export const conversationHandler = new ConversationHandler(); 