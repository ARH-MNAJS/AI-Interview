import { NextRequest, NextResponse } from 'next/server';
import { edgeTTSClient } from '@/lib/services/tts_client';
import { whisperSTTClient } from '@/lib/services/stt_client';
import { clientOllamaAdapter } from '@/lib/services/client_ollama_adapter';
import { logger } from '@/lib/services/logger';

export async function GET(request: NextRequest) {
  logger.info('HealthCheck', 'Checking all services health');

  try {
    const [ttsHealth, sttHealth, llmHealth] = await Promise.all([
      edgeTTSClient.testConnection(),
      whisperSTTClient.testConnection(),
      clientOllamaAdapter.testConnection(),
    ]);

    const servicesStatus = {
      edgeTTS: {
        status: ttsHealth ? 'healthy' : 'unhealthy',
        service: 'Edge TTS',
        port: 5000,
        note: !ttsHealth ? 'Connection failed' : undefined,
      },
      whisperSTT: {
        status: sttHealth ? 'healthy' : 'unhealthy',
        service: 'Whisper STT',
        port: 5001,
        note: !sttHealth ? 'Connection failed' : undefined,
      },
      ollama: {
        status: llmHealth ? 'healthy' : 'unhealthy',
        service: 'Ollama LLM',
        port: 11434,
        note: !llmHealth ? 'Connection failed' : undefined,
      },
    };

    // Don't require Ollama for overall health since it works client-side
    const allHealthy = ttsHealth && sttHealth;

    logger.info('HealthCheck', 'Health check completed', {
      overall: allHealthy ? 'healthy' : 'unhealthy',
      services: servicesStatus,
    });

    return NextResponse.json({
      status: allHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: servicesStatus,
      ready: allHealthy,
    }, {
      status: allHealthy ? 200 : 503,
    });

  } catch (error) {
    logger.error('HealthCheck', 'Health check failed', error);
    return NextResponse.json({
      status: 'error',
      error: 'Failed to check services health',
      timestamp: new Date().toISOString(),
    }, {
      status: 500,
    });
  }
} 