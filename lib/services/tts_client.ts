import { SERVICES_CONFIG } from '../config/services';
import { logger } from './logger';

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
    logger.debug('EdgeTTSClient', 'Starting speech synthesis', {
      text: text.substring(0, 100) + '...',
      voiceId: voice,
    });

    try {
      const response = await fetch(`${this.baseUrl}/synthesize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          voice: voice,
        }),
      });

      if (!response.ok) {
        throw new Error(`TTS service responded with status: ${response.status}`);
      }

      const audioBuffer = await response.arrayBuffer();
      logger.info('EdgeTTSClient', 'Speech synthesis completed', {
        audioSize: audioBuffer.byteLength,
        textLength: text.length,
      });

      return audioBuffer;
    } catch (error) {
      logger.error('EdgeTTSClient', 'Speech synthesis failed', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      logger.debug('EdgeTTSClient', 'Testing TTS service connection');
      const response = await fetch(`${this.baseUrl}/health`);
      const isHealthy = response.ok;
      
      logger.info('EdgeTTSClient', 'TTS service health check', {
        status: isHealthy ? 'healthy' : 'unhealthy',
        statusCode: response.status,
      });

      return isHealthy;
    } catch (error) {
      logger.error('EdgeTTSClient', 'TTS service health check failed', error);
      return false;
    }
  }
}

export const edgeTTSClient = new EdgeTTSClient(); 