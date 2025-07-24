import { NextResponse } from 'next/server';
import { edgeTTSClient } from '@/lib/services/tts_client';
import { whisperSTTClient } from '@/lib/services/stt_client';
import { clientOllamaAdapter } from '@/lib/services/client_ollama_adapter';
import { logger } from '@/lib/services/logger';

export async function GET() {
  try {
    logger.info('ServicesStatus', 'Checking all services status');

    const [ttsStatus, sttStatus, llmStatus] = await Promise.allSettled([
      edgeTTSClient.testConnection(),
      whisperSTTClient.testConnection(),
      clientOllamaAdapter.testConnection(),
    ]);

    const results = {
          tts: {
      status: ttsStatus.status === 'fulfilled' ? (ttsStatus.value ? 'healthy' : 'unhealthy') : 'error',
      error: ttsStatus.status === 'rejected' ? ttsStatus.reason?.message : null,
      service: 'Edge TTS',
      url: 'https://dyptts.ccxai.uk',
    },
    stt: {
      status: sttStatus.status === 'fulfilled' ? (sttStatus.value ? 'healthy' : 'unhealthy') : 'error',
      error: sttStatus.status === 'rejected' ? sttStatus.reason?.message : null,
      service: 'Whisper STT',
      url: 'https://dypstt.ccxai.uk',
    },
    llm: {
      status: llmStatus.status === 'fulfilled' ? (llmStatus.value ? 'healthy' : 'unhealthy') : 'error',
      error: llmStatus.status === 'rejected' ? llmStatus.reason?.message : null,
      service: 'Ollama',
      url: 'https://dypai.ccxai.uk',
    },
    };

    // Don't require Ollama for overall health since it now works client-side
    const allHealthy = results.tts.status === 'healthy' && results.stt.status === 'healthy';

    logger.info('ServicesStatus', 'Services status check completed', {
      results,
      allHealthy,
    });

    return NextResponse.json({
      success: true,
      allHealthy,
      services: results,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('ServicesStatus', 'Failed to check services status', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
} 