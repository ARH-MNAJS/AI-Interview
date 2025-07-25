import { SERVICES_CONFIG } from '../config/services';
import { httpConnectionPool } from './http_pool_manager';
import { requestQueue, RequestType, RequestPriority } from './request_queue_manager';

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

export interface StreamingChatResponse {
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

export class ClientOllamaAdapter {
  private baseUrl: string;
  private model: string;

  constructor() {
    // 🚀 PROXY CONNECTION: Use Next.js API proxy to avoid CORS issues in production
    this.baseUrl = '/api/ollama-proxy';
    this.model = process.env.NEXT_PUBLIC_OLLAMA_MODEL || 'gemma3:latest';
    
    console.log('ClientOllamaAdapter initialized with proxy connection:', {
      baseUrl: this.baseUrl,
      model: this.model,
      note: 'Using Next.js proxy to avoid CORS restrictions'
    });
  }

  async generateResponse(messages: ChatMessage[]): Promise<string> {
    console.log('Starting client-side LLM generation with optimized connection pooling', {
      messageCount: messages.length,
      model: this.model,
      baseUrl: this.baseUrl,
    });

    // Use request queue to manage LLM concurrency
    return await requestQueue.enqueueLLMRequest(async () => {
      console.log('Making pooled LLM request', {
        messageCount: messages.length,
        model: this.model
      });

      // Use HTTP connection pool with proper timeout for LLM requests
      const data: ChatResponse = await httpConnectionPool.post<ChatResponse>(
        `${this.baseUrl}/api/chat`,
        JSON.stringify({
          model: this.model,
          messages,
          stream: false,
        }),
        {
          'Content-Type': 'application/json',
        },
        25000 // 25 second timeout for LLM
      );

      const content = data.message.content;

      console.log('Client-side LLM generation completed', {
        responseLength: content.length,
        totalDuration: data.total_duration,
        evalCount: data.eval_count,
      });

      return content;
    }, RequestPriority.HIGH); // High priority for LLM responses
  }

  async *generateStreamingResponse(messages: ChatMessage[]): AsyncGenerator<string, void, unknown> {
    console.log('Starting client-side streaming LLM generation', {
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
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama responded with status: ${response.status} - ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              try {
                const data: StreamingChatResponse = JSON.parse(line);
                if (data.message?.content) {
                  yield data.message.content;
                }
                if (data.done) {
                  console.log('Client-side streaming LLM generation completed');
                  return;
                }
              } catch (parseError) {
                console.warn('Client-side failed to parse streaming response line:', { line });
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      console.error('Client-side streaming LLM generation failed:', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      console.log('Testing client-side Ollama connection with connection pooling');
      
      // Use request queue for health checks with low priority
      const data = await requestQueue.enqueueHealthCheckRequest(async () => {
        return await httpConnectionPool.get<any>(`${this.baseUrl}/api/tags`, {}, 8000);
      });
      
      const hasModel = data.models?.some((model: any) => model.name.includes(this.model.split(':')[0]));
      console.log('Client-side Ollama health check:', {
        status: 'healthy',
        modelAvailable: hasModel,
        availableModels: data.models?.map((m: any) => m.name) || [],
        poolStats: httpConnectionPool.getPoolStats()
      });
      return hasModel;
      
    } catch (error) {
      console.error('Client-side Ollama health check failed:', error);
      return false;
    }
  }
}

export const clientOllamaAdapter = new ClientOllamaAdapter();