import { SERVICES_CONFIG } from '../config/services';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class ClientOllamaAdapter {
  private baseUrl: string;
  private model: string;

  constructor() {
    // Use environment variables with fallback
    // Always use proxy in browser to avoid CORS issues
    if (typeof window !== 'undefined') {
      this.baseUrl = '/api/ollama-proxy';
    } else {
      this.baseUrl = process.env.NEXT_PUBLIC_OLLAMA_URL || 'https://dypai.ccxai.uk';
    }
    
    this.model = process.env.NEXT_PUBLIC_OLLAMA_MODEL || 'gemma3:latest';
    
    console.log('ClientOllamaAdapter initialized:', {
      baseUrl: this.baseUrl,
      model: this.model,
    });
  }

  async generateResponse(messages: ChatMessage[]): Promise<string> {
    console.log('Starting client-side LLM generation', {
      messageCount: messages.length,
      model: this.model,
      baseUrl: this.baseUrl,
    });

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama responded with status: ${response.status} - ${response.statusText}`);
      }

      const data: ChatResponse = await response.json();
      const content = data.message.content;

      console.log('Client-side LLM generation completed', {
        responseLength: content.length,
        totalDuration: data.total_duration,
        evalCount: data.eval_count,
      });

      return content;
    } catch (error) {
      console.error('Client-side LLM generation failed:', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      console.log('Testing client-side Ollama connection');
      const response = await fetch(`${this.baseUrl}/api/tags`);
      const isHealthy = response.ok;
      
      if (isHealthy) {
        const data = await response.json();
        const hasModel = data.models?.some((model: any) => model.name.includes(this.model.split(':')[0]));
        console.log('Client-side Ollama health check:', {
          status: 'healthy',
          modelAvailable: hasModel,
          availableModels: data.models?.map((m: any) => m.name) || [],
        });
        return hasModel;
      } else {
        console.log('Client-side Ollama health check:', {
          status: 'unhealthy',
          statusCode: response.status,
        });
        return false;
      }
    } catch (error) {
      console.error('Client-side Ollama health check failed:', error);
      return false;
    }
  }
}

export const clientOllamaAdapter = new ClientOllamaAdapter();