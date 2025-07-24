import { SERVICES_CONFIG } from '../config/services';
import { logger } from './logger';

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
    logger.debug('WhisperSTTClient', 'Starting speech transcription', {
      audioSize: audioBlob.size,
      audioType: audioBlob.type,
    });

    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'audio.wav');

        logger.debug('WhisperSTTClient', `Transcription attempt ${attempt}/${maxRetries}`, {
          audioSize: audioBlob.size,
        });

        // Add timeout and better error handling
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        const response = await fetch(`${this.baseUrl}/transcribe`, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
          headers: {
            // Don't set Content-Type, let browser set it with boundary for FormData
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`STT service responded with status: ${response.status}, body: ${errorText}`);
        }

        const result = await response.json();
        logger.info('WhisperSTTClient', 'Speech transcription completed', {
          text: result.text?.substring(0, 100) + (result.text?.length > 100 ? '...' : ''),
          textLength: result.text?.length || 0,
          confidence: result.confidence,
          duration: result.duration,
          attempt,
        });

        return {
          text: result.text || '',
          confidence: result.confidence,
          duration: result.duration,
        };
      } catch (error) {
        lastError = error as Error;
        logger.warn('WhisperSTTClient', `Transcription attempt ${attempt} failed`, {
          error: lastError.message,
          attempt,
          willRetry: attempt < maxRetries,
        });

        if (attempt < maxRetries) {
          // Wait before retry (exponential backoff)
          const waitTime = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
          logger.debug('WhisperSTTClient', `Waiting ${waitTime}ms before retry`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    logger.error('WhisperSTTClient', 'All transcription attempts failed', lastError);
    throw lastError || new Error('Transcription failed after all retries');
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
      logger.debug('WhisperSTTClient', 'Testing STT service connection');
      const response = await fetch(`${this.baseUrl}/health`);
      const isHealthy = response.ok;
      
      logger.info('WhisperSTTClient', 'STT service health check', {
        status: isHealthy ? 'healthy' : 'unhealthy',
        statusCode: response.status,
      });

      return isHealthy;
    } catch (error) {
      logger.error('WhisperSTTClient', 'STT service health check failed', error);
      return false;
    }
  }
}

export const whisperSTTClient = new WhisperSTTClient(); 