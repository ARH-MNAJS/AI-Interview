// Service configuration for open-source stack
export const SERVICES_CONFIG = {
  EDGE_TTS: {
    URL: process.env.NEXT_PUBLIC_EDGE_TTS_URL || 'https://dyptts.ccxai.uk',
    VOICE_ID: process.env.NEXT_PUBLIC_TTS_VOICE_ID || 'en-IN-NeerjaExpressiveNeural',
  },
  WHISPER_STT: {
    URL: process.env.NEXT_PUBLIC_WHISPER_STT_URL || 'https://dypstt.ccxai.uk',
  },
  OLLAMA: {
    URL: process.env.NEXT_PUBLIC_OLLAMA_URL || 'https://dypai.ccxai.uk',
    MODEL: process.env.NEXT_PUBLIC_OLLAMA_MODEL || 'gemma3:latest',
  },
} as const;

// Audio configuration
export const AUDIO_CONFIG = {
  SAMPLE_RATE: 16000,
  CHANNELS: 1,
  CHUNK_SIZE: 1024,
  MIME_TYPE: 'audio/wav',
} as const;

// WebRTC configuration
export const WEBRTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
} as const; 