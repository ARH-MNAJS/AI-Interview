import { SERVICES_CONFIG } from '../config/services';
import { logger } from './logger';
import { httpConnectionPool } from './http_pool_manager';
import { requestQueue, RequestType, RequestPriority } from './request_queue_manager';

export interface TranscriptionResult {
  text: string;
  confidence?: number;
  duration?: number;
}

export class WhisperSTTClient {
  private baseUrl: string;
  private maxChunkSizeMB = 25; // Maximum chunk size for processing

  constructor() {
    this.baseUrl = SERVICES_CONFIG.WHISPER_STT.URL;
    logger.info('WhisperSTTClient', 'Initialized Whisper STT client', {
      baseUrl: this.baseUrl,
      maxChunkSizeMB: this.maxChunkSizeMB
    });
  }

  async transcribe(audioBlob: Blob): Promise<TranscriptionResult> {
    logger.debug('WhisperSTTClient', 'Starting speech transcription with optimized connection pooling', {
      audioSize: audioBlob.size,
      audioType: audioBlob.type,
    });

    // Check if audio is too large and needs chunking
    const audioSizeMB = audioBlob.size / (1024 * 1024);
    if (audioSizeMB > this.maxChunkSizeMB) {
      logger.warn('WhisperSTTClient', 'Audio file too large - using chunked processing', {
        audioSizeMB: audioSizeMB.toFixed(2),
        maxChunkSizeMB: this.maxChunkSizeMB
      });
      return await this.transcribeWithChunking(audioBlob);
    }

    // Calculate dynamic timeout based on audio size
    // Estimate: ~1MB per minute of audio, allow 30 seconds per MB minimum, with 60s minimum
    const estimatedAudioMinutes = audioSizeMB;
    const dynamicTimeout = Math.max(60000, estimatedAudioMinutes * 30000); // Min 60s, 30s per estimated minute
    
    logger.info('WhisperSTTClient', 'Using dynamic timeout for STT request', {
      audioSize: audioBlob.size,
      estimatedMinutes: estimatedAudioMinutes.toFixed(2),
      timeoutMs: dynamicTimeout
    });

    // Use request queue to manage concurrency and avoid connection exhaustion
    return await requestQueue.enqueueSTTRequest(async () => {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'audio.wav');

      logger.debug('WhisperSTTClient', 'Making pooled STT request', {
        audioSize: audioBlob.size,
        timeoutMs: dynamicTimeout,
      });

      // Use HTTP connection pool with dynamic timeout based on audio duration
      const result = await httpConnectionPool.post<any>(
        `${this.baseUrl}/transcribe`,
        formData,
        {}, // Let browser set Content-Type with boundary for FormData
        dynamicTimeout // Dynamic timeout based on audio size
      );

      logger.info('WhisperSTTClient', 'Speech transcription completed', {
        text: result.text?.substring(0, 100) + (result.text?.length > 100 ? '...' : ''),
        textLength: result.text?.length || 0,
        confidence: result.confidence,
        duration: result.duration,
      });

      return {
        text: result.text || '',
        confidence: result.confidence,
        duration: result.duration,
      };
    }, RequestPriority.HIGH); // High priority for user speech transcription
  }

  async transcribeWithChunking(audioBlob: Blob): Promise<TranscriptionResult> {
    logger.info('WhisperSTTClient', 'Starting chunked transcription for large audio file', {
      audioSize: audioBlob.size,
      audioSizeMB: (audioBlob.size / (1024 * 1024)).toFixed(2)
    });

    try {
      // Convert to audio buffer for chunking
      const arrayBuffer = await audioBlob.arrayBuffer();
      const chunkSizeBytes = this.maxChunkSizeMB * 1024 * 1024;
      const chunks: Blob[] = [];
      
      // Split audio into chunks
      for (let offset = 0; offset < arrayBuffer.byteLength; offset += chunkSizeBytes) {
        const chunkBuffer = arrayBuffer.slice(offset, offset + chunkSizeBytes);
        chunks.push(new Blob([chunkBuffer], { type: audioBlob.type }));
      }

      logger.info('WhisperSTTClient', 'Audio split into chunks', {
        totalChunks: chunks.length,
        chunkSizeMB: this.maxChunkSizeMB
      });

      // Process chunks sequentially
      const transcriptions: string[] = [];
      let totalConfidence = 0;
      let validConfidenceCount = 0;

      for (let i = 0; i < chunks.length; i++) {
        logger.debug('WhisperSTTClient', `Processing chunk ${i + 1}/${chunks.length}`, {
          chunkSize: chunks[i].size
        });

        try {
          const result = await this.transcribeSingleChunk(chunks[i]);
          if (result.text.trim()) {
            transcriptions.push(result.text.trim());
          }
          
          if (result.confidence !== undefined) {
            totalConfidence += result.confidence;
            validConfidenceCount++;
          }
        } catch (error) {
          logger.warn('WhisperSTTClient', `Chunk ${i + 1} transcription failed`, error);
          // Continue with other chunks
        }
      }

      const combinedText = transcriptions.join(' ');
      const averageConfidence = validConfidenceCount > 0 ? totalConfidence / validConfidenceCount : undefined;

      logger.info('WhisperSTTClient', 'Chunked transcription completed', {
        totalChunks: chunks.length,
        successfulChunks: transcriptions.length,
        combinedTextLength: combinedText.length,
        averageConfidence
      });

      return {
        text: combinedText,
        confidence: averageConfidence,
        duration: undefined // Cannot calculate total duration from chunks
      };

    } catch (error) {
      logger.error('WhisperSTTClient', 'Chunked transcription failed', error);
      throw error;
    }
  }

  private async transcribeSingleChunk(audioBlob: Blob): Promise<TranscriptionResult> {
    // Calculate timeout for chunk (smaller than main transcribe method)
    const audioSizeMB = audioBlob.size / (1024 * 1024);
    const dynamicTimeout = Math.max(30000, audioSizeMB * 20000); // Min 30s, 20s per MB for chunks
    
    return await requestQueue.enqueueSTTRequest(async () => {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'audio.wav');

      const result = await httpConnectionPool.post<any>(
        `${this.baseUrl}/transcribe`,
        formData,
        {},
        dynamicTimeout
      );

      return {
        text: result.text || '',
        confidence: result.confidence,
        duration: result.duration,
      };
    }, RequestPriority.HIGH);
  }

  async transcribeStream(audioChunk: ArrayBuffer): Promise<TranscriptionResult> {
    logger.debug('WhisperSTTClient', 'Starting stream transcription', {
      chunkSize: audioChunk.byteLength,
    });

    try {
      const blob = new Blob([audioChunk], { type: 'audio/wav' });
      return await this.transcribe(blob);
    } catch (error) {
      logger.error('WhisperSTTClient', 'Stream transcription failed', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      logger.debug('WhisperSTTClient', 'Testing STT service connection with connection pooling');
      
      // Use request queue for health checks with low priority
      const response = await requestQueue.enqueueHealthCheckRequest(async () => {
        return await httpConnectionPool.get<any>(`${this.baseUrl}/health`, {}, 5000);
      });
      
      const isHealthy = true; // If we got here without throwing, the service is healthy
      
      logger.info('WhisperSTTClient', 'STT service health check', {
        status: 'healthy',
        poolStats: httpConnectionPool.getPoolStats()
      });

      return isHealthy;
    } catch (error) {
      logger.error('WhisperSTTClient', 'STT service health check failed', error);
      return false;
    }
  }
}

export const whisperSTTClient = new WhisperSTTClient(); 