import { edgeTTSClient } from './tts_client';
import { whisperSTTClient } from './stt_client';
import { clientOllamaAdapter, type ChatMessage } from './client_ollama_adapter';
import { logger } from './logger';
import { AUDIO_CONFIG } from '../config/services';
import { globalCache } from './global_cache_system';
import { voiceBiometricsAnalyzer } from './voice_biometrics_analyzer';
import { 
  CallStatus, 
  ConversationConfig, 
  ConversationMessage, 
  ConversationEventCallbacks,
  VoiceChangeResult 
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
  
  // 🚀 NEW: Audio queue management for streaming playback
  private audioPlaybackQueue: ArrayBuffer[] = [];
  private isPlayingAudio = false;
  private sentenceSequence = 0; // Track sentence order
  private sentenceTracker = new Map<ArrayBuffer, { sequenceNumber: number, text: string }>(); // Track sentence content
  
  // 🚀 SEQUENTIAL AUDIO MANAGEMENT: Ensure correct playback order
  private sequentialAudioBuffer = new Map<number, { audioBuffer: ArrayBuffer, text: string }>(); // Store by sequence number
  private nextExpectedSentence = 1; // Track which sentence should play next
  private totalExpectedSentences = 0; // Track total sentences for this response
  
  // 🚀 OPTIMIZED: Use global caching instead of per-user instances to prevent memory leaks
  private lastHealthCheck = new Map<string, number>();
  private preWarmPromise: Promise<void> | null = null;
  
  // 🎯 VOICE CHANGE DETECTION
  private voiceChangeCallbacks: {
    onVoiceChangeDetected?: (result: VoiceChangeResult) => void;
  } = {};
  private isVoiceAnalysisEnabled = true; // Enabled for voice change detection

  // ⏱️ COMPREHENSIVE PERFORMANCE TIMING SYSTEM
  private performanceTimers = {
    recordingStartTime: 0,
    recordingEndTime: 0,
    audioConversionStartTime: 0,
    audioConversionEndTime: 0,
    sttStartTime: 0,
    sttEndTime: 0,
    aiGenerationStartTime: 0,
    aiGenerationEndTime: 0,
    ttsStartTime: 0,
    ttsEndTime: 0,
    audioPlaybackStartTime: 0,
    audioPlaybackEndTime: 0,
    totalPipelineStartTime: 0,
    totalPipelineEndTime: 0
  };

  constructor() {
    logger.info('ConversationHandler', 'Initialized conversation handler');
  }

  // ⏱️ PERFORMANCE TIMING METHODS
  private logPerformanceMetrics(): void {
    const metrics = {
      userSpeakingTime: this.performanceTimers.recordingEndTime - this.performanceTimers.recordingStartTime,
      audioConversionTime: this.performanceTimers.audioConversionEndTime - this.performanceTimers.audioConversionStartTime,
      speechToTextTime: this.performanceTimers.sttEndTime - this.performanceTimers.sttStartTime,
      aiResponseTime: this.performanceTimers.aiGenerationEndTime - this.performanceTimers.aiGenerationStartTime,
      textToSpeechTime: this.performanceTimers.ttsEndTime - this.performanceTimers.ttsStartTime,
      agentSpeakingTime: this.performanceTimers.audioPlaybackEndTime - this.performanceTimers.audioPlaybackStartTime,
      totalPipelineTime: this.performanceTimers.totalPipelineEndTime - this.performanceTimers.totalPipelineStartTime
    };

    const formattedMetrics = {
      userSpeakingTime: `${(metrics.userSpeakingTime / 1000).toFixed(2)}s`,
      audioConversionTime: `${metrics.audioConversionTime}ms`,
      speechToTextTime: `${(metrics.speechToTextTime / 1000).toFixed(2)}s`,
      aiResponseTime: `${(metrics.aiResponseTime / 1000).toFixed(2)}s`,
      textToSpeechTime: `${(metrics.textToSpeechTime / 1000).toFixed(2)}s`,
      agentSpeakingTime: `${(metrics.agentSpeakingTime / 1000).toFixed(2)}s`,
      totalPipelineTime: `${(metrics.totalPipelineTime / 1000).toFixed(2)}s`,
      breakdown: {
        userSpeakingPercent: `${((metrics.userSpeakingTime / metrics.totalPipelineTime) * 100).toFixed(1)}%`,
        audioConversionPercent: `${((metrics.audioConversionTime / metrics.totalPipelineTime) * 100).toFixed(1)}%`,
        speechToTextPercent: `${((metrics.speechToTextTime / metrics.totalPipelineTime) * 100).toFixed(1)}%`,
        aiResponsePercent: `${((metrics.aiResponseTime / metrics.totalPipelineTime) * 100).toFixed(1)}%`,
        textToSpeechPercent: `${((metrics.textToSpeechTime / metrics.totalPipelineTime) * 100).toFixed(1)}%`,
        agentSpeakingPercent: `${((metrics.agentSpeakingTime / metrics.totalPipelineTime) * 100).toFixed(1)}%`
      }
    };

    logger.info('ConversationHandler', '⏱️ 📊 COMPLETE PERFORMANCE METRICS', formattedMetrics);
    
    // Also log to console for easy terminal viewing
    console.log('\n🚀 ⏱️ CONVERSATION PERFORMANCE METRICS');
    console.log('=====================================');
    console.log(`👤 User Speaking Time:     ${formattedMetrics.userSpeakingTime} (${formattedMetrics.breakdown.userSpeakingPercent})`);
    console.log(`🔄 Audio Conversion:       ${formattedMetrics.audioConversionTime} (${formattedMetrics.breakdown.audioConversionPercent})`);
    console.log(`🗣️  Speech-to-Text:        ${formattedMetrics.speechToTextTime} (${formattedMetrics.breakdown.speechToTextPercent})`);
    console.log(`🤖 AI Response Generation: ${formattedMetrics.aiResponseTime} (${formattedMetrics.breakdown.aiResponsePercent})`);
    console.log(`🔊 Text-to-Speech:         ${formattedMetrics.textToSpeechTime} (${formattedMetrics.breakdown.textToSpeechPercent})`);
    console.log(`🎵 Agent Speaking Time:    ${formattedMetrics.agentSpeakingTime} (${formattedMetrics.breakdown.agentSpeakingPercent})`);
    console.log(`⏱️  TOTAL PIPELINE TIME:   ${formattedMetrics.totalPipelineTime}`);
    console.log('=====================================\n');
  }

  private resetPerformanceTimers(): void {
    Object.keys(this.performanceTimers).forEach(key => {
      (this.performanceTimers as any)[key] = 0;
    });
  }

  // 🚀 OPTIMIZED: Use global caching system instead of per-user caches
  private generateConversationContext(messages: ChatMessage[]): string {
    // Create deterministic conversation context for global caching
    const recentMessages = messages.slice(-3); // Last 3 messages for context
    const contextString = recentMessages.map(m => 
      `${m.role}:${m.content.slice(0, 100).toLowerCase().trim()}`
    ).join('|');
    
    logger.debug('ConversationHandler', 'Generated conversation context for global cache', {
      messageCount: messages.length,
      recentMessageCount: recentMessages.length,
      contextLength: contextString.length
    });
    
    return contextString;
  }

  // 🚀 NEW: Helper methods for parallel processing
  private async preWarmLLMConnection(): Promise<void> {
    try {
      // 🚀 PERFORMANCE: Cache health check to avoid repeated calls
      const cacheKey = 'llm_health';
      const now = Date.now();
      const lastCheck = this.lastHealthCheck.get(cacheKey) || 0;
      
      // Only check every 30 seconds
      if (now - lastCheck < 30000) {
        logger.debug('ConversationHandler', 'Skipping LLM health check - recently cached');
        return;
      }
      
      // Quick health check to warm up connection
      await clientOllamaAdapter.testConnection();
      this.lastHealthCheck.set(cacheKey, now);
      logger.debug('ConversationHandler', 'LLM connection pre-warmed successfully');
    } catch (error) {
      logger.warn('ConversationHandler', 'LLM pre-warm failed', error);
    }
  }

  // 🚀 NEW: Comprehensive pipeline analysis method
  private async analyzePipelineFailure(messages: ChatMessage[], rawResponse: string, filteredResponse: string): Promise<void> {
    logger.error('ConversationHandler', '🔍 COMPREHENSIVE PIPELINE ANALYSIS', {
      timestamp: new Date().toISOString(),
      pipelineStage: 'EMPTY_RESPONSE_ANALYSIS',
      analysis: {
        userInput: {
          lastMessage: messages.filter(m => m.role === 'user').slice(-1)[0]?.content || 'NO_USER_MESSAGE',
          messageLength: messages.filter(m => m.role === 'user').slice(-1)[0]?.content?.length || 0,
          conversationLength: messages.length,
          userSpeaking: messages.filter(m => m.role === 'user').length,
          aiResponses: messages.filter(m => m.role === 'assistant').length
        },
        aiResponse: {
          rawLength: rawResponse.length,
          filteredLength: filteredResponse.length,
          rawContent: rawResponse,
          filteredContent: filteredResponse,
          containsOnlyWhitespace: rawResponse.length > 0 && rawResponse.trim().length === 0,
          wasFilteredToEmpty: rawResponse.length > 0 && filteredResponse.length === 0
        },
        possibleCauses: [
          rawResponse.length === 0 ? 'AI_MODEL_RETURNED_NOTHING' : null,
          rawResponse.length > 0 && filteredResponse.length === 0 ? 'FILTERING_REMOVED_EVERYTHING' : null,
          messages.length > 20 ? 'CONVERSATION_TOO_LONG' : null,
          messages.filter(m => m.role === 'user').slice(-1)[0]?.content?.length > 1000 ? 'USER_MESSAGE_TOO_LONG' : null,
          !messages.filter(m => m.role === 'user').slice(-1)[0]?.content ? 'NO_USER_INPUT' : null
        ].filter(Boolean)
      }
    });
  }

  // 🚀 NEW: Diagnostic method for AI response issues
  private async diagnoseEmptyResponse(messages: ChatMessage[]): Promise<string> {
    logger.info('ConversationHandler', 'Diagnosing empty response issue', {
      messageCount: messages.length,
      lastFewMessages: messages.slice(-2).map(m => ({
        role: m.role,
        contentLength: m.content.length,
        preview: m.content.slice(0, 50)
      }))
    });
    
    // Check if the conversation context is too long
    if (messages.length > 20) {
      logger.warn('ConversationHandler', 'Conversation may be too long for AI model');
      return "I think our conversation has gotten quite lengthy. Let me focus on your latest point.";
    }
    
    // Check if user message is very long
    const lastUserMessage = messages.filter(m => m.role === 'user').slice(-1)[0];
    if (lastUserMessage && lastUserMessage.content.length > 500) {
      logger.info('ConversationHandler', 'User provided detailed response, acknowledging');
      return "Thank you for that detailed explanation. That gives me great insight into your experience. Can you tell me more about the specific technical challenges you encountered?";
    }
    
    // Default contextual response
    return "I appreciate you sharing that with me. Could you elaborate on the most challenging aspect of what you just described?";
  }

  private async prepareConversationContext(): Promise<any> {
    // Pre-prepare context data while other operations run
    return {
      timestamp: new Date().toISOString(),
      messageCount: this.conversationHistory.length
    };
  }

  private async optimizeConversationHistory(): Promise<ChatMessage[]> {
    // Optimize/truncate conversation history while STT runs
    return this.conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  // 🚀 NEW: Streaming response methods
  private isCompleteSentence(text: string): boolean {
    // More robust sentence detection for streaming
    const trimmed = text.trim();
    
    // Must end with sentence punctuation
    const endsWithPunctuation = /[.!?]$/.test(trimmed);
    
    // Must have minimum length (avoid tiny fragments)
    const hasMinLength = trimmed.length >= 10;
    
    // Check for clear sentence patterns
    const hasCompleteSentence = /[.!?]\s*$/.test(trimmed) && hasMinLength;
    
    return endsWithPunctuation && hasMinLength && hasCompleteSentence;
  }

  private async synthesizeAndQueueAudio(text: string, isFirst: boolean): Promise<void> {
    try {
      // 🔍 DETAILED SENTENCE TTS ORDER LOGGING
      const currentSentenceNumber = this.sentenceSequence;
      logger.info('ConversationHandler', '🎯 SENTENCE ORDER: Starting TTS Synthesis', {
        sentenceNumber: currentSentenceNumber,
        sentenceFull: text,
        sentencePreview: text.slice(0, 50) + '...',
        isFirstSentence: isFirst,
        currentQueueLength: this.audioPlaybackQueue.length,
        processingOrder: 'SENDING_TO_TTS'
      });
      
      // 🚀 GLOBAL CACHE OPTIMIZATION: Check global cache first
      let audioBuffer = globalCache.getCachedAudio(text);
      
      if (!audioBuffer) {
        // ⏱️ START TTS TIMING
        this.performanceTimers.ttsStartTime = Date.now();
        
        // Cache miss - synthesize and cache globally
        logger.debug('ConversationHandler', '⏱️ Global cache miss - synthesizing audio');
        audioBuffer = await edgeTTSClient.synthesize(text);
        
        const cacheSuccess = globalCache.setCachedAudio(text, audioBuffer);
        if (!cacheSuccess) {
          logger.warn('ConversationHandler', 'Failed to cache audio in global cache - likely due to memory limits');
        }
        
        // ⏱️ END TTS TIMING
        this.performanceTimers.ttsEndTime = Date.now();
        const ttsTime = this.performanceTimers.ttsEndTime - this.performanceTimers.ttsStartTime;
        
        logger.info('ConversationHandler', '⏱️ TTS synthesis completed', {
          ttsTime: `${(ttsTime / 1000).toFixed(2)}s`,
          textLength: text.length,
          audioSize: audioBuffer.byteLength
        });
      } else {
        logger.debug('ConversationHandler', '⏱️ Global TTS cache hit - no synthesis needed');
      }
      
      // 🔍 DETAILED SENTENCE QUEUE ORDER LOGGING
      logger.info('ConversationHandler', '🎯 SENTENCE ORDER: Adding to Audio Queue', {
        sentenceNumber: currentSentenceNumber,
        sentencePreview: text.slice(0, 50) + '...',
        audioSize: audioBuffer.byteLength,
        fromCache: globalCache.getCachedAudio(text) !== null,
        currentQueueLength: this.audioPlaybackQueue.length,
        processingOrder: 'ADDING_TO_QUEUE'
      });
      
      // 🚀 SEQUENTIAL AUDIO MANAGEMENT: Store by sequence number instead of immediate queue
      this.sequentialAudioBuffer.set(currentSentenceNumber, {
        audioBuffer: audioBuffer,
        text: text
      });
      
      logger.info('ConversationHandler', '🎯 SENTENCE ORDER: Audio Ready - Checking Sequential Order', {
        sentenceNumber: currentSentenceNumber,
        sentencePreview: text.slice(0, 50) + '...',
        nextExpectedSentence: this.nextExpectedSentence,
        totalBufferedSentences: this.sequentialAudioBuffer.size,
        totalExpectedSentences: this.totalExpectedSentences
      });
      
      // 🚀 SEQUENTIAL PLAYBACK: Check if we can play the next expected sentence(s)
      this.processSequentialAudio();
    } catch (error) {
      logger.error('ConversationHandler', 'Audio synthesis failed', error);
    }
  }

  // 🚀 NEW: Sequential audio processing to maintain correct order
  private async processSequentialAudio(): Promise<void> {
    // Check if we can play the next expected sentence(s) in order
    while (this.sequentialAudioBuffer.has(this.nextExpectedSentence)) {
      const sentenceData = this.sequentialAudioBuffer.get(this.nextExpectedSentence)!;
      
      logger.info('ConversationHandler', '🎯 SENTENCE ORDER: Playing Sentence in Correct Order', {
        sentenceNumber: this.nextExpectedSentence,
        sentenceContent: sentenceData.text,
        sentencePreview: sentenceData.text.slice(0, 50) + '...',
        isCorrectSequentialOrder: true,
        processingOrder: 'SEQUENTIAL_PLAYBACK'
      });
      
      // Add to traditional queue for immediate playback
      this.audioPlaybackQueue.push(sentenceData.audioBuffer);
      
      // Track for cleanup
      this.sentenceTracker.set(sentenceData.audioBuffer, {
        sequenceNumber: this.nextExpectedSentence,
        text: sentenceData.text
      });
      
      // Remove from sequential buffer
      this.sequentialAudioBuffer.delete(this.nextExpectedSentence);
      
      // Move to next expected sentence
      this.nextExpectedSentence++;
      
      // Start playback if not already playing
      if (!this.isPlayingAudio) {
        this.processAudioQueue();
      }
    }
    
    // Log current state for debugging
    logger.debug('ConversationHandler', '🎯 SENTENCE ORDER: Sequential Audio State', {
      nextExpectedSentence: this.nextExpectedSentence,
      bufferedSentences: Array.from(this.sequentialAudioBuffer.keys()).sort(),
      totalExpectedSentences: this.totalExpectedSentences,
      waitingForSentences: this.totalExpectedSentences > 0 ? 
        Array.from({length: this.totalExpectedSentences}, (_, i) => i + 1)
          .filter(n => n >= this.nextExpectedSentence && !this.sequentialAudioBuffer.has(n)) : []
    });
  }

  private async processAudioQueue(): Promise<void> {
    if (this.isPlayingAudio || this.audioPlaybackQueue.length === 0) {
      return;
    }

    this.isPlayingAudio = true;
    let playbackSequence = 0;

    // 🔍 DETAILED AUDIO PLAYBACK ORDER LOGGING
    logger.info('ConversationHandler', '🎯 SENTENCE ORDER: Starting Audio Queue Processing', {
      totalAudioChunks: this.audioPlaybackQueue.length,
      processingOrder: 'STARTING_PLAYBACK'
    });

    while (this.audioPlaybackQueue.length > 0) {
      playbackSequence++;
      const audioBuffer = this.audioPlaybackQueue.shift()!;
      
      // 🔍 LOG EACH AUDIO CHUNK PLAYBACK WITH SENTENCE CONTENT
      const sentenceInfo = this.sentenceTracker.get(audioBuffer);
      logger.info('ConversationHandler', '🎯 SENTENCE ORDER: Playing Audio Chunk', {
        playbackSequence: playbackSequence,
        originalSentenceNumber: sentenceInfo?.sequenceNumber || 'UNKNOWN',
        sentenceContent: sentenceInfo?.text || 'UNKNOWN',
        sentencePreview: sentenceInfo?.text?.slice(0, 50) + '...' || 'UNKNOWN',
        audioBufferSize: audioBuffer.byteLength,
        remainingInQueue: this.audioPlaybackQueue.length,
        processingOrder: 'ACTUALLY_PLAYING',
        isCorrectOrder: playbackSequence === sentenceInfo?.sequenceNumber
      });
      
      await this.playAudio(audioBuffer);
      
      // 🔍 CLEAN UP SENTENCE TRACKER
      this.sentenceTracker.delete(audioBuffer);
    }

    this.isPlayingAudio = false;
    
    // 🔍 FINAL ORDER SUMMARY
    logger.info('ConversationHandler', '🎯 SENTENCE ORDER: Audio Queue Processing Complete', {
      totalSentencesPlayed: playbackSequence,
      processingOrder: 'PLAYBACK_COMPLETE'
    });
  }

  // Manual recording methods for hold-to-speak functionality
  startManualRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'inactive' && !this.isGeneratingResponse) {
      // ⏱️ START PERFORMANCE TIMING
      this.resetPerformanceTimers();
      this.performanceTimers.recordingStartTime = Date.now();
      this.performanceTimers.totalPipelineStartTime = Date.now();
      
      this.isManualRecording = true;
      this.audioChunks = [];
      this.callbacks.onSpeechStart?.();
      this.mediaRecorder.start();
      logger.info('ConversationHandler', '⏱️ Manual recording started (hold-to-speak)', {
        recordingStartTime: new Date(this.performanceTimers.recordingStartTime).toISOString()
      });
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
      // ⏱️ RECORD TIMING: User finished speaking
      this.performanceTimers.recordingEndTime = Date.now();
      
      this.isManualRecording = false;
      this.mediaRecorder.stop();
      
      const userSpeakingDuration = this.performanceTimers.recordingEndTime - this.performanceTimers.recordingStartTime;
      logger.info('ConversationHandler', '⏱️ Manual recording stopped (hold-to-speak)', {
        userSpeakingTime: `${(userSpeakingDuration / 1000).toFixed(2)}s`,
        recordingEndTime: new Date(this.performanceTimers.recordingEndTime).toISOString()
      });
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
      case 'voice-change':
        this.callbacks.onVoiceChangeDetected = callback as (result: VoiceChangeResult) => void;
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
      case 'voice-change':
        this.callbacks.onVoiceChangeDetected = undefined;
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
      
      // Reset voice analysis for new conversation
      voiceBiometricsAnalyzer.resetBaseline();

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
        const greetingText = "Hello! Thank you for taking the time to speak with me today. I'm excited to learn more about you and your experience.";
        
        // Use streaming if enabled in config, otherwise use regular method
        if (this.config.useStreaming) {
          // For greeting, we can use the original method since it's a single short message
          await this.generateAndPlayResponse(greetingText);
        } else {
          await this.generateAndPlayResponse(greetingText);
        }
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
    
              // 🚀 Reset audio queue states
    this.audioPlaybackQueue = [];
    this.isPlayingAudio = false;
    this.sentenceSequence = 0;
    this.sentenceTracker.clear(); // Clear sentence tracking
    
    // 🚀 Reset sequential audio state
    this.sequentialAudioBuffer.clear();
    this.nextExpectedSentence = 1;
    this.totalExpectedSentences = 0;
      
      // 🔍 PIPELINE CONFIRMATION LOG
      logger.info('ConversationHandler', '📊 PIPELINE SUMMARY: Conversation Ended', {
        pipelineMode: 'COMPLETE_USER_MESSAGES_ONLY',
        notStreamingUserSpeech: true,
        processFlow: 'RECORD_COMPLETE → STT_COMPLETE → AI_COMPLETE → TTS_COMPLETE',
        userSpeechHandling: 'WAIT_FOR_COMPLETE_AUDIO_THEN_PROCESS'
      });
      
      // 🚀 GLOBAL CACHE: Log cache statistics for monitoring
      const cacheStats = globalCache.getCacheStats();
      logger.info('ConversationHandler', 'Conversation ended - Global cache statistics', {
        totalEntries: cacheStats.totalEntries,
        memoryUsageMB: cacheStats.estimatedMemoryMB,
        hitRate: cacheStats.hitRate,
        totalRequests: cacheStats.totalRequests
      });
    
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
        logger.info('ConversationHandler', 'MediaRecorder stopped - starting parallel processing', {
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
            
            // Check for very large audio files that might cause timeout issues
            const estimatedDurationMinutes = audioBlob.size / (1024 * 1024); // Rough MB estimate
            if (estimatedDurationMinutes > 2) {
              logger.warn('ConversationHandler', '⚠️ Large audio detected - may cause processing delays', {
                audioSize: audioBlob.size,
                estimatedMinutes: estimatedDurationMinutes.toFixed(1),
                recommendation: 'Consider shorter speech segments for better performance'
              });
            }
            
            // 🔍 DETAILED AUDIO PIPELINE LOGGING
            logger.info('ConversationHandler', '📊 PIPELINE STEP 1: Audio Recording Complete', {
              audioChunksCount: this.audioChunks.length,
              totalAudioSize: audioBlob.size,
              audioType: audioBlob.type,
              recordingDurationEstimate: audioBlob.size / 1000 + 's',
              estimatedMinutes: estimatedDurationMinutes.toFixed(1),
              chunks: this.audioChunks.map((chunk, i) => ({
                chunkIndex: i,
                chunkSize: chunk.size,
                chunkType: chunk.type
              }))
            });
            
            this.audioChunks = [];

            // 🎯 VOICE CHANGE DETECTION DEBUG: Always log the check
            logger.info('ConversationHandler', '🔍 Voice Analysis Check', {
              isVoiceAnalysisEnabled: this.isVoiceAnalysisEnabled,
              audioSize: audioBlob.size,
              audioType: audioBlob.type,
              sizeMeetsThreshold: audioBlob.size > 1000,
              willAnalyze: this.isVoiceAnalysisEnabled && audioBlob.size > 1000
            });

            // 🎯 VOICE CHANGE DETECTION: Analyze voice in parallel (non-blocking)
            if (this.isVoiceAnalysisEnabled && audioBlob.size > 1000) { // Only analyze if audio is substantial
              logger.info('ConversationHandler', '🎯 Starting voice change analysis', {
                audioSize: audioBlob.size,
                audioType: audioBlob.type
              });
              
              // Run voice analysis in parallel without blocking the main pipeline
              this.analyzeVoiceChangeAsync(audioBlob).catch((error: any) => {
                logger.error('ConversationHandler', '❌ Voice analysis failed (non-blocking)', {
                  error: error?.message || 'Unknown error',
                  audioSize: audioBlob.size,
                  stack: error?.stack
                });
              });
            } else {
              logger.warn('ConversationHandler', '⚠️ Voice analysis skipped', {
                reason: !this.isVoiceAnalysisEnabled ? 'disabled' : 'audio too small',
                audioSize: audioBlob.size,
                enabled: this.isVoiceAnalysisEnabled
              });
            }

            // 🚀 PARALLEL OPTIMIZATION 1: Start multiple operations concurrently
            const parallelProcessingPromises = [
              // Convert audio in parallel with other prep work
              this.convertToWav(audioBlob),
              // Pre-warm LLM connection while audio processes
              this.preWarmLLMConnection(),
              // Prepare conversation context
              this.prepareConversationContext()
            ];

            const [wavBlob, , conversationContext] = await Promise.all(parallelProcessingPromises);

            // 🔍 DETAILED AUDIO PROCESSING LOGGING
            logger.info('ConversationHandler', '📊 PIPELINE STEP 2: Audio Processing Complete', {
              originalAudioSize: audioBlob.size,
              convertedWavSize: wavBlob.size,
              sizeIncrease: ((wavBlob.size - audioBlob.size) / audioBlob.size * 100).toFixed(1) + '%',
              contextReady: !!conversationContext,
              audioConversionTime: Date.now() - Date.now() // This will be updated in next step
            });

            // 🔍 VERIFY AUDIO INTEGRITY
            if (wavBlob.size === 0) {
              logger.error('ConversationHandler', '🚨 CRITICAL: WAV conversion resulted in empty blob!', {
                originalSize: audioBlob.size,
                originalType: audioBlob.type
              });
            }

            // 🚀 SIMPLIFIED: Just perform STT (context will be optimized when needed)
            // ⏱️ START STT TIMING
            this.performanceTimers.sttStartTime = Date.now();
            
            const transcription = await whisperSTTClient.transcribe(wavBlob);
            
            // ⏱️ END STT TIMING
            this.performanceTimers.sttEndTime = Date.now();
            const sttTime = this.performanceTimers.sttEndTime - this.performanceTimers.sttStartTime;

            // 🔍 DETAILED STT PIPELINE LOGGING
            logger.info('ConversationHandler', '⏱️📊 PIPELINE STEP 3: STT Transcription Complete', {
              transcribedText: transcription.text,
              textLength: transcription.text.length,
              textPreview: transcription.text.slice(0, 100) + (transcription.text.length > 100 ? '...' : ''),
              confidence: transcription.confidence,
              duration: transcription.duration,
              historyLength: this.conversationHistory.length,
              isEmpty: !transcription.text || transcription.text.trim().length === 0,
              sttProcessingTime: `${(sttTime / 1000).toFixed(2)}s`
            });

            // 🔍 VERIFY STT OUTPUT INTEGRITY
            if (!transcription.text || transcription.text.trim().length === 0) {
              logger.error('ConversationHandler', '🚨 CRITICAL: STT returned empty transcription!', {
                wavBlobSize: wavBlob.size,
                originalAudioSize: audioBlob.size,
                sttResponse: transcription
              });
            }
            
            if (transcription.text.trim()) {
              // 🔍 VERIFY COMPLETE USER MESSAGE PROCESSING
              logger.info('ConversationHandler', '📊 PIPELINE STEP 3.5: User Message Processing', {
                completeUserMessage: transcription.text,
                messageLength: transcription.text.length,
                isCompleteMessage: true, // Confirming this is the COMPLETE message, not streaming
                processingMode: 'COMPLETE_MESSAGE_AFTER_STT',
                notStreamingUserSpeech: true
              });
              
              // Emit user message immediately
              this.emitMessage({
                role: 'user',
                content: transcription.text,
              });

              // 🚀 BUG FIX: Use current conversation history that includes the just-added user message
              // The optimizedHistory was prepared BEFORE the user message was emitted, so it's missing the latest input
              logger.debug('ConversationHandler', 'Starting streaming AI response generation with current history');
              await this.generateAndPlayStreamingResponse(); // Let it use this.conversationHistory which now includes the user message
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
          const errorMessage = (error as Error).message;
          const isTimeoutError = errorMessage.includes('signal is aborted') || 
                                errorMessage.includes('timeout') ||
                                errorMessage.includes('Request failed after all retries');
          
          if (isTimeoutError) {
            logger.error('ConversationHandler', 'STT processing timeout - audio too long or service overloaded', {
              error: errorMessage,
              audioChunksCount: this.audioChunks.length,
              suggestion: 'Try shorter speech segments or check service status'
            });
            
            // Show user-friendly error for timeout
            this.callbacks.onError?.(new Error(
              'Speech processing timed out. Please try speaking for shorter periods (under 2 minutes) or check your connection.'
            ));
          } else {
            logger.error('ConversationHandler', 'Parallel processing failed', error);
            this.callbacks.onError?.(error as Error);
          }
          
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
    // ⏱️ START AUDIO CONVERSION TIMING
    this.performanceTimers.audioConversionStartTime = Date.now();
    
    // 🚀 OPTIMIZATION: Cache audio context to avoid re-creation overhead
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: AUDIO_CONFIG.SAMPLE_RATE });
    }
    
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    
    // 🚀 OPTIMIZATION: More efficient WAV conversion
    const wavBuffer = this.audioBufferToWav(audioBuffer);
    const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
    
    // ⏱️ END AUDIO CONVERSION TIMING
    this.performanceTimers.audioConversionEndTime = Date.now();
    const conversionTime = this.performanceTimers.audioConversionEndTime - this.performanceTimers.audioConversionStartTime;
    
    logger.info('ConversationHandler', '⏱️ Audio conversion completed', {
      conversionTime: `${conversionTime}ms`,
      originalSize: audioBlob.size,
      convertedSize: wavBlob.size
    });
    
    return wavBlob;
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

      // ⏱️ END TOTAL PIPELINE TIMING (Non-streaming path)
      this.performanceTimers.totalPipelineEndTime = Date.now();

      logger.debug('ConversationHandler', '⏱️ Response generation and playback completed');
      
      // ⏱️ LOG COMPLETE PERFORMANCE METRICS
      this.logPerformanceMetrics();

    } catch (error) {
      logger.error('ConversationHandler', 'Failed to generate response', error);
      this.callbacks.onError?.(error as Error);
    } finally {
      // Always reset the generation flag
      this.isGeneratingResponse = false;
      logger.debug('ConversationHandler', '⏱️ Setting isGeneratingResponse = false');
      
      // Add a small delay to ensure state is properly reset before next interaction
      setTimeout(() => {
        logger.debug('ConversationHandler', '⏱️ Response generation cycle completed - ready for next input');
      }, 100);
    }
  }

  // 🚀 NEW: Streaming response pipeline for optimized performance
  private async generateAndPlayStreamingResponse(conversationHistory?: ChatMessage[]) {
    if (this.isGeneratingResponse) {
      logger.warn('ConversationHandler', 'Response generation already in progress');
      return;
    }

    // ⏱️ START AI GENERATION TIMING
    this.performanceTimers.aiGenerationStartTime = Date.now();

    this.isGeneratingResponse = true;
    logger.debug('ConversationHandler', '⏱️ Starting streaming response generation', {
      aiGenerationStartTime: new Date(this.performanceTimers.aiGenerationStartTime).toISOString()
    });

    try {
      const messages = conversationHistory || this.conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content,
      }));
      
      // 🔍 BUG FIX VERIFICATION: Log the conversation history being used
      logger.info('ConversationHandler', '🔧 BUG FIX: Conversation history being sent to AI', {
        messageCount: messages.length,
        conversationHistorySource: conversationHistory ? 'PROVIDED_PARAMETER' : 'CURRENT_CONVERSATION_HISTORY',
        lastUserMessageInHistory: messages.filter(m => m.role === 'user').slice(-1)[0]?.content || 'NO_USER_MESSAGE',
        fullConversation: messages.map((msg, i) => ({
          index: i,
          role: msg.role,
          content: msg.content.slice(0, 50) + (msg.content.length > 50 ? '...' : '')
        }))
      });

      // 🚀 GLOBAL CACHE OPTIMIZATION: Check global cache for cached response
      const conversationContext = this.generateConversationContext(messages);
      let cachedResponse = globalCache.getCachedResponse(conversationContext);
      
      if (cachedResponse) {
        logger.info('ConversationHandler', 'Using globally cached AI response', {
          conversationContext: conversationContext.slice(0, 50),
          responseLength: cachedResponse.length,
          cacheStats: globalCache.getCacheStats()
        });
        
        // Play cached response immediately
        const filteredResponse = this.filterResponse(cachedResponse);
        if (filteredResponse.length > 0) {
          await this.synthesizeAndQueueAudio(filteredResponse, true);
        }
        
        // Emit cached message
        this.emitMessage({
          role: 'assistant',
          content: filteredResponse,
        });
        
        return;
      }

      const actualLastUserMessage = messages.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
      
      // 🔍 DETAILED AI INPUT LOGGING
      logger.info('ConversationHandler', '📊 PIPELINE STEP 4: Sending to AI (LLM)', {
        messageCount: messages.length,
        lastUserMessage: actualLastUserMessage.slice(0, 100) + (actualLastUserMessage.length > 100 ? '...' : ''),
        lastUserMessageLength: actualLastUserMessage.length,
        lastUserMessageFull: actualLastUserMessage, // Log the COMPLETE message being sent
        useOptimizedHistory: !!conversationHistory,
        conversationContext: conversationContext.slice(0, 100),
        fullConversationContext: messages.map((msg, i) => ({
          index: i,
          role: msg.role,
          contentLength: msg.content.length,
          contentPreview: msg.content.slice(0, 50) + (msg.content.length > 50 ? '...' : ''),
          contentFull: msg.content // Complete message for debugging
        }))
      });

      // 🔍 VERIFY AI INPUT INTEGRITY
      if (!actualLastUserMessage || actualLastUserMessage.trim().length === 0) {
        logger.error('ConversationHandler', '🚨 CRITICAL: Sending empty user message to AI!', {
          messagesArray: messages,
          conversationLength: messages.length
        });
      }

      // 🚀 STREAMING OPTIMIZATION: Process response as it comes
      let fullResponse = '';
      let currentSentence = '';
      let audioQueue: Promise<void>[] = [];
      let isFirstSentence = true;
      this.sentenceSequence = 0; // Reset sequence counter
      this.sentenceTracker.clear(); // Clear sentence tracking for new response
      
      // 🚀 RESET SEQUENTIAL AUDIO STATE for new response
      this.sequentialAudioBuffer.clear();
      this.nextExpectedSentence = 1;
      this.totalExpectedSentences = 0;
      
      const startTime = Date.now();

      // Use the existing streaming capability with fallback
      let chunkCount = 0;
      try {
        for await (const chunk of clientOllamaAdapter.generateStreamingResponse(messages)) {
          chunkCount++;
          fullResponse += chunk;
          currentSentence += chunk;
          
          // 🚀 DEBUGGING: Log streaming chunks
          logger.debug('ConversationHandler', 'Received streaming chunk', {
            chunkNumber: chunkCount,
            chunkLength: chunk.length,
            chunkPreview: chunk.slice(0, 50),
            totalResponseLength: fullResponse.length,
            currentSentenceLength: currentSentence.length
          });

          // 🚀 PIPELINE OPTIMIZATION: Start TTS on complete sentences
          if (this.isCompleteSentence(currentSentence)) {
            const sentenceToSynthesize = this.filterResponse(currentSentence.trim());
            
            if (sentenceToSynthesize.length > 0) {
              this.sentenceSequence++;
              
              // 🔍 DETAILED SENTENCE ORDER LOGGING
              logger.info('ConversationHandler', '🎯 SENTENCE ORDER: AI Generated Sentence', {
                sentenceNumber: this.sentenceSequence,
                sentenceFull: sentenceToSynthesize,
                sentencePreview: sentenceToSynthesize.slice(0, 50) + '...',
                isFirstSentence: isFirstSentence,
                processingOrder: 'FROM_AI_STREAM',
                totalSentencesProcessed: this.sentenceSequence
              });
              
              // 🚀 SEQUENTIAL PROCESSING: Process sentences in order
              const audioPromise = this.synthesizeAndQueueAudio(sentenceToSynthesize, isFirstSentence);
              audioQueue.push(audioPromise);
              isFirstSentence = false;
            }
            
            currentSentence = '';
          }
        }
        
        // 🔍 DETAILED AI OUTPUT LOGGING
        logger.info('ConversationHandler', '📊 PIPELINE STEP 5: AI Streaming Response Complete', {
          totalChunks: chunkCount,
          finalResponseLength: fullResponse.length,
          finalResponsePreview: fullResponse.slice(0, 200) + (fullResponse.length > 200 ? '...' : ''),
          finalResponseFull: fullResponse, // Complete AI response for debugging
          isEmpty: !fullResponse || fullResponse.trim().length === 0,
          hasOnlyWhitespace: fullResponse.trim().length === 0 && fullResponse.length > 0,
          responseCharCodes: fullResponse.split('').slice(0, 20).map(char => ({
            char: char,
            code: char.charCodeAt(0),
            isWhitespace: /\s/.test(char)
          }))
        });

        // 🔍 VERIFY AI OUTPUT INTEGRITY
        if (!fullResponse || fullResponse.trim().length === 0) {
          logger.error('ConversationHandler', '🚨 CRITICAL: AI returned empty response!', {
            totalChunksReceived: chunkCount,
            rawResponseLength: fullResponse.length,
            rawResponseCharCodes: fullResponse.split('').map(char => char.charCodeAt(0)),
            userInputWas: actualLastUserMessage.slice(0, 100),
            conversationContextSent: messages.length
          });
        }
        
        // 🚀 SET TOTAL EXPECTED SENTENCES for sequential audio management
        this.totalExpectedSentences = this.sentenceSequence;
        logger.info('ConversationHandler', '🎯 SENTENCE ORDER: AI Streaming Complete - Setting Total Expected', {
          totalExpectedSentences: this.totalExpectedSentences,
          totalSentencesGenerated: this.sentenceSequence
        });
      } catch (streamingError) {
        logger.warn('ConversationHandler', 'Streaming failed, falling back to non-streaming', streamingError);
        
        // 🔄 FALLBACK: Use non-streaming response if streaming fails
        fullResponse = await clientOllamaAdapter.generateResponse(messages);
        const filteredResponse = this.filterResponse(fullResponse);
        
        // Process the complete response as one audio chunk
        if (filteredResponse.length > 0) {
          const audioPromise = this.synthesizeAndQueueAudio(filteredResponse, true);
          audioQueue.push(audioPromise);
        }
      }

      // Handle any remaining text
      if (currentSentence.trim()) {
        const sentenceToSynthesize = this.filterResponse(currentSentence.trim());
        if (sentenceToSynthesize.length > 0) {
          logger.debug('ConversationHandler', 'Processing final sentence for TTS', {
            sentence: sentenceToSynthesize.slice(0, 50) + '...'
          });
          const audioPromise = this.synthesizeAndQueueAudio(sentenceToSynthesize, false);
          audioQueue.push(audioPromise);
        }
      }

      const duration = Date.now() - startTime;
      
      // 🔍 DETAILED FILTERING PIPELINE LOGGING
      logger.info('ConversationHandler', '📊 PIPELINE STEP 6: Response Filtering', {
        rawResponse: fullResponse,
        rawLength: fullResponse.length,
        rawHasContent: fullResponse.trim().length > 0,
        rawPreview: fullResponse.slice(0, 100) + (fullResponse.length > 100 ? '...' : '')
      });
      
      const filteredFullResponse = this.filterResponse(fullResponse);
      
      // 🔍 VERIFY FILTERING INTEGRITY
      logger.info('ConversationHandler', '📊 PIPELINE STEP 7: Response Filtering Complete', {
        originalLength: fullResponse.length,
        filteredLength: filteredFullResponse.length,
        originalPreview: fullResponse.slice(0, 100),
        filteredPreview: filteredFullResponse.slice(0, 100),
        filteredFull: filteredFullResponse, // Complete filtered response
        filteringRemovedEverything: fullResponse.length > 0 && filteredFullResponse.trim().length === 0,
        filteringStats: {
          removedCharacters: fullResponse.length - filteredFullResponse.length,
          removalPercentage: fullResponse.length > 0 ? ((fullResponse.length - filteredFullResponse.length) / fullResponse.length * 100).toFixed(1) + '%' : '0%'
        }
      });
      
      // 🚀 IMPROVED EMPTY RESPONSE HANDLING: Investigate and retry instead of generic fallback
      if (!filteredFullResponse || filteredFullResponse.trim().length === 0) {
        // 🔍 COMPREHENSIVE ANALYSIS OF PIPELINE FAILURE
        await this.analyzePipelineFailure(messages, fullResponse, filteredFullResponse);
        
        logger.error('ConversationHandler', '🚨 PIPELINE STEP 8: Empty Response Investigation', {
          rawResponse: fullResponse,
          rawLength: fullResponse.length,
          filteredLength: filteredFullResponse.length,
          lastUserMessage: messages.filter(m => m.role === 'user').slice(-1)[0]?.content,
          conversationLength: messages.length,
          investigationComplete: true
        });
        
        // 🔄 RETRY LOGIC: Try once more with simplified context
        logger.info('ConversationHandler', 'Retrying AI request with simplified context');
        try {
          const simplifiedMessages = messages.slice(-3); // Last 3 messages only
          const retryResponse = await clientOllamaAdapter.generateResponse(simplifiedMessages);
          const retryFiltered = this.filterResponse(retryResponse);
          
          if (retryFiltered && retryFiltered.trim().length > 0) {
            logger.info('ConversationHandler', 'Retry successful', {
              retryResponse: retryFiltered.slice(0, 100)
            });
            
            await this.synthesizeAndQueueAudio(retryFiltered, true);
            this.emitMessage({
              role: 'assistant',
              content: retryFiltered,
            });
            
            // Cache the successful retry in global cache
            try {
              const retryContext = this.generateConversationContext(simplifiedMessages);
              const cacheSuccess = globalCache.setCachedResponse(retryContext, retryFiltered);
              if (!cacheSuccess) {
                logger.warn('ConversationHandler', 'Failed to cache retry response in global cache - likely due to memory limits');
              }
            } catch (cacheError) {
              logger.warn('ConversationHandler', 'Failed to cache retry response in global cache', cacheError);
            }
            
            return;
          }
        } catch (retryError) {
          logger.error('ConversationHandler', 'Retry also failed', retryError);
        }
        
                 // 🆘 LAST RESORT: Intelligent contextual fallback
         const intelligentFallback = await this.diagnoseEmptyResponse(messages);
         
         // 🔍 FINAL SUMMARY OF WHAT WENT WRONG
         logger.error('ConversationHandler', '📊 PIPELINE FINAL SUMMARY: Empty Response Root Cause', {
           userSpeechWasCompletelyTranscribed: true,
           aiReceivedCompleteUserMessage: true,
           notStreamingUserSpeechToAI: true,
           pipelineFlow: 'USER_SPOKE → COMPLETE_STT → SENT_TO_AI → AI_RETURNED_EMPTY',
           rootCause: fullResponse.length === 0 ? 'AI_MODEL_ISSUE' : 'FILTERING_ISSUE',
           usingFallback: intelligentFallback,
           globalCacheStats: globalCache.getCacheStats()
         });
         
         logger.warn('ConversationHandler', 'Using intelligent contextual fallback', {
           fallback: intelligentFallback
         });
        
        await this.synthesizeAndQueueAudio(intelligentFallback, true);
        
        this.emitMessage({
          role: 'assistant',
          content: intelligentFallback,
        });
        
        return;
      }

      // ⏱️ END AI GENERATION TIMING
      this.performanceTimers.aiGenerationEndTime = Date.now();
      const aiGenerationTime = this.performanceTimers.aiGenerationEndTime - this.performanceTimers.aiGenerationStartTime;

      logger.info('ConversationHandler', '⏱️ Streaming AI response completed', {
        responseLength: filteredFullResponse.length,
        responsePreview: filteredFullResponse.slice(0, 100),
        durationMs: duration,
        sentencesProcessed: audioQueue.length,
        aiGenerationTime: `${(aiGenerationTime / 1000).toFixed(2)}s`
      });

      // 🚀 GLOBAL CACHE OPTIMIZATION: Cache successful response globally
      try {
        const cacheSuccess = globalCache.setCachedResponse(conversationContext, filteredFullResponse);
        if (!cacheSuccess) {
          logger.warn('ConversationHandler', 'Failed to cache response in global cache - likely due to memory limits');
        }
      } catch (cacheError) {
        logger.warn('ConversationHandler', 'Failed to cache response in global cache', cacheError);
      }

      // Emit the complete assistant message
      this.emitMessage({
        role: 'assistant',
        content: filteredFullResponse,
      });

      // Wait for all audio to be processed and played
      await Promise.all(audioQueue);

      // ⏱️ END TOTAL PIPELINE TIMING
      this.performanceTimers.totalPipelineEndTime = Date.now();

      logger.info('ConversationHandler', '⏱️ Streaming response and audio playback completed');

      // ⏱️ LOG COMPLETE PERFORMANCE METRICS
      this.logPerformanceMetrics();

    } catch (error) {
      logger.error('ConversationHandler', 'Streaming response failed', error);
      this.callbacks.onError?.(error as Error);
    } finally {
      this.isGeneratingResponse = false;
      logger.debug('ConversationHandler', '⏱️ Streaming response generation completed - ready for next input');
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

  private async playAudio(audioBuffer: ArrayBuffer): Promise<void> {
    try {
      if (!this.audioContext) return;

      const audioBufferDecoded = await this.audioContext.decodeAudioData(audioBuffer.slice(0));
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBufferDecoded;
      source.connect(this.audioContext.destination);
      
      // ⏱️ START AUDIO PLAYBACK TIMING
      this.performanceTimers.audioPlaybackStartTime = Date.now();
      
      logger.debug('ConversationHandler', '⏱️ Starting audio playback', {
        duration: audioBufferDecoded.duration,
        queueRemaining: this.audioPlaybackQueue.length,
        audioPlaybackStartTime: new Date(this.performanceTimers.audioPlaybackStartTime).toISOString()
      });
      
      source.start();
      
      // 🚀 NON-BLOCKING: Wait for audio to finish but allow concurrent processing
      // This allows the next audio chunk to be prepared while current one plays
      return new Promise(resolve => {
        source.onended = () => {
          // ⏱️ END AUDIO PLAYBACK TIMING  
          this.performanceTimers.audioPlaybackEndTime = Date.now();
          const audioPlaybackTime = this.performanceTimers.audioPlaybackEndTime - this.performanceTimers.audioPlaybackStartTime;
          
          logger.debug('ConversationHandler', '⏱️ Audio chunk playback completed', {
            duration: audioBufferDecoded.duration,
            queueRemaining: this.audioPlaybackQueue.length,
            actualPlaybackTime: `${(audioPlaybackTime / 1000).toFixed(2)}s`,
            audioPlaybackEndTime: new Date(this.performanceTimers.audioPlaybackEndTime).toISOString()
          });
          resolve();
        };
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
    
    // 🚀 Reset audio queue states
    this.audioPlaybackQueue = [];
    this.isPlayingAudio = false;
    this.sentenceSequence = 0;
    this.sentenceTracker.clear(); // Clear sentence tracking
    
    // 🚀 Reset sequential audio state
    this.sequentialAudioBuffer.clear();
    this.nextExpectedSentence = 1;
    this.totalExpectedSentences = 0;
    
    this.callbacks.onSpeechEnd?.();
  }

  // Public method to reset states (for debugging)
  public resetStates() {
    this.forceResetStates();
  }

  /**
   * Analyze voice change asynchronously without blocking main pipeline
   */
  private async analyzeVoiceChangeAsync(audioBlob: Blob): Promise<void> {
    try {
      logger.info('ConversationHandler', '🎯 Starting async voice analysis', {
        audioSize: audioBlob.size,
        audioType: audioBlob.type,
        timestamp: new Date().toISOString()
      });

             // Add timeout to prevent hanging (reduced to 3 seconds for faster response)
       const timeoutPromise = new Promise<never>((_, reject) => {
         setTimeout(() => reject(new Error('Voice analysis timeout')), 3000);
       });

      const analysisPromise = voiceBiometricsAnalyzer.analyzeVoiceChange(audioBlob);
      
      const voiceChangeResult = await Promise.race([analysisPromise, timeoutPromise]);
      
      logger.info('ConversationHandler', '✅ Voice analysis completed', {
        similarity: voiceChangeResult.similarity,
        isVoiceChanged: voiceChangeResult.isVoiceChanged,
        confidence: voiceChangeResult.confidence,
        reason: voiceChangeResult.reason,
                 threshold: 0.90,
        timestamp: new Date().toISOString()
      });
      
      if (voiceChangeResult.isVoiceChanged) {
        logger.warn('ConversationHandler', '🚨 VOICE CHANGE DETECTED!', {
          similarity: voiceChangeResult.similarity,
          confidence: voiceChangeResult.confidence,
          reason: voiceChangeResult.reason,
          timestamp: new Date().toISOString()
        });
        
        // Trigger voice change callback
        try {
          this.callbacks.onVoiceChangeDetected?.(voiceChangeResult);
          this.voiceChangeCallbacks.onVoiceChangeDetected?.(voiceChangeResult);
          logger.info('ConversationHandler', '✅ Voice change notification sent successfully');
        } catch (callbackError) {
          logger.error('ConversationHandler', 'Voice change callback failed', callbackError);
        }
      } else {
        logger.debug('ConversationHandler', '✅ Voice matches baseline', {
          similarity: voiceChangeResult.similarity,
          confidence: voiceChangeResult.confidence
        });
      }
    } catch (error) {
      logger.error('ConversationHandler', 'Voice analysis failed with error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        audioSize: audioBlob.size
      });
      
      // If voice analysis fails, we could optionally disable it temporarily
      if (error instanceof Error && error.message.includes('timeout')) {
        logger.warn('ConversationHandler', 'Voice analysis timed out - consider disabling for this session');
        // Optionally: this.isVoiceAnalysisEnabled = false;
      }
    }
  }

  /**
   * Set voice change detection callbacks
   */
  setVoiceChangeCallbacks(callbacks: { onVoiceChangeDetected?: (result: VoiceChangeResult) => void }): void {
    this.voiceChangeCallbacks = callbacks;
  }

  /**
   * Enable or disable voice change detection
   */
  setVoiceAnalysisEnabled(enabled: boolean): void {
    this.isVoiceAnalysisEnabled = enabled;
    logger.info('ConversationHandler', `Voice analysis ${enabled ? 'enabled' : 'disabled'}`);
    
    if (enabled) {
      logger.info('ConversationHandler', '🎯 Voice change detection enabled - will monitor for speaker changes');
    }
  }

  /**
   * Configure voice analysis sensitivity
   */
  setVoiceSimilarityThreshold(threshold: number): void {
    voiceBiometricsAnalyzer.setSimilarityThreshold(threshold);
  }

  /**
   * Reset voice baseline (useful for new interviews)
   */
  resetVoiceBaseline(): void {
    voiceBiometricsAnalyzer.resetBaseline();
    logger.info('ConversationHandler', 'Voice baseline reset');
  }

  /**
   * Get voice analysis configuration
   */
  getVoiceAnalysisConfig(): { enabled: boolean; threshold: number; hasBaseline: boolean } {
    const config = voiceBiometricsAnalyzer.getConfiguration();
    return {
      enabled: this.isVoiceAnalysisEnabled,
      threshold: config.threshold,
      hasBaseline: config.hasBaseline
    };
  }
}

export const conversationHandler = new ConversationHandler(); 