import { SERVICES_CONFIG } from '../config/services';
import { logger } from './logger';
import { httpConnectionPool } from './http_pool_manager';
import { requestQueue, RequestType, RequestPriority } from './request_queue_manager';

export class EdgeTTSClient {
  private baseUrl: string;
  private voiceId: string;

  constructor() {
    this.baseUrl = SERVICES_CONFIG.EDGE_TTS.URL;
    this.voiceId = SERVICES_CONFIG.EDGE_TTS.VOICE_ID;
    logger.info('EdgeTTSClient', 'Initialized Edge TTS client', {
      baseUrl: this.baseUrl,
      voiceId: this.voiceId,
    });
  }

  async synthesize(text: string, voiceId?: string): Promise<ArrayBuffer> {
    const voice = voiceId || this.voiceId;
    logger.debug('EdgeTTSClient', 'Starting speech synthesis with optimized connection pooling', {
      text: text.substring(0, 100) + '...',
      voiceId: voice,
    });

    // Use request queue to manage TTS concurrency
    return await requestQueue.enqueueTTSRequest(async () => {
      logger.debug('EdgeTTSClient', 'Making pooled TTS request', {
        textLength: text.length,
        voice
      });

      // Use HTTP connection pool with optimized timeout
      const audioBuffer = await httpConnectionPool.post<ArrayBuffer>(
        `${this.baseUrl}/synthesize`,
        JSON.stringify({
          text,
          voice: voice,
        }),
        {
          'Content-Type': 'application/json',
        },
        8000 // 8 second timeout for TTS
      );

      logger.info('EdgeTTSClient', 'Speech synthesis completed', {
        audioSize: audioBuffer.byteLength,
        textLength: text.length,
      });

      return audioBuffer;
    }, RequestPriority.NORMAL); // Normal priority for TTS synthesis
  }

  async testConnection(): Promise<boolean> {
    try {
      logger.debug('EdgeTTSClient', 'Testing TTS service connection with connection pooling');
      
      // Use request queue for health checks with low priority
      const response = await requestQueue.enqueueHealthCheckRequest(async () => {
        return await httpConnectionPool.get<any>(`${this.baseUrl}/health`, {}, 5000);
      });
      
      const isHealthy = true; // If we got here without throwing, the service is healthy
      
      logger.info('EdgeTTSClient', 'TTS service health check', {
        status: 'healthy',
        poolStats: httpConnectionPool.getPoolStats()
      });

      return isHealthy;
    } catch (error) {
      logger.error('EdgeTTSClient', 'TTS service health check failed', error);
      return false;
    }
  }
}

export const edgeTTSClient = new EdgeTTSClient(); 