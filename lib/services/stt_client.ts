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

  constructor() {
    this.baseUrl = SERVICES_CONFIG.WHISPER_STT.URL;
    logger.info('WhisperSTTClient', 'Initialized Whisper STT client', {
      baseUrl: this.baseUrl,
    });
  }

  async transcribe(audioBlob: Blob): Promise<TranscriptionResult> {
    logger.debug('WhisperSTTClient', 'Starting speech transcription with optimized connection pooling', {
      audioSize: audioBlob.size,
      audioType: audioBlob.type,
    });

    // Use request queue to manage concurrency and avoid connection exhaustion
    return await requestQueue.enqueueSTTRequest(async () => {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'audio.wav');

      logger.debug('WhisperSTTClient', 'Making pooled STT request', {
        audioSize: audioBlob.size,
      });

      // Use HTTP connection pool with optimized timeout (10s instead of 30s)
      const result = await httpConnectionPool.post<any>(
        `${this.baseUrl}/transcribe`,
        formData,
        {}, // Let browser set Content-Type with boundary for FormData
        10000 // 10 second timeout
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