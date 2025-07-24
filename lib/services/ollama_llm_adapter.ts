import { SERVICES_CONFIG } from '../config/services';
import { logger } from './logger';

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

export class OllamaLLMAdapter {
  private baseUrl: string;
  private model: string;

  constructor() {
    this.baseUrl = SERVICES_CONFIG.OLLAMA.URL;
    this.model = SERVICES_CONFIG.OLLAMA.MODEL;
    logger.info('OllamaLLMAdapter', 'Initialized Ollama LLM adapter', {
      baseUrl: this.baseUrl,
      model: this.model,
    });
  }

  async generateResponse(messages: ChatMessage[]): Promise<string> {
    logger.debug('OllamaLLMAdapter', 'Starting LLM generation', {
      messageCount: messages.length,
      model: this.model,
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
        throw new Error(`Ollama responded with status: ${response.status}`);
      }

      const data: ChatResponse = await response.json();
      const content = data.message.content;

      logger.info('OllamaLLMAdapter', 'LLM generation completed', {
        responseLength: content.length,
        totalDuration: data.total_duration,
        evalCount: data.eval_count,
      });

      return content;
    } catch (error) {
      logger.error('OllamaLLMAdapter', 'LLM generation failed', error);
      throw error;
    }
  }

  async *generateStreamingResponse(messages: ChatMessage[]): AsyncGenerator<string, void, unknown> {
    logger.debug('OllamaLLMAdapter', 'Starting streaming LLM generation', {
      messageCount: messages.length,
      model: this.model,
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
        throw new Error(`Ollama responded with status: ${response.status}`);
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
                  logger.info('OllamaLLMAdapter', 'Streaming LLM generation completed');
                  return;
                }
              } catch (parseError) {
                logger.warn('OllamaLLMAdapter', 'Failed to parse streaming response line', { line });
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      logger.error('OllamaLLMAdapter', 'Streaming LLM generation failed', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      logger.debug('OllamaLLMAdapter', 'Testing Ollama service connection');
      const response = await fetch(`${this.baseUrl}/api/tags`);
      const isHealthy = response.ok;
      
      if (isHealthy) {
        const data = await response.json();
        const hasModel = data.models?.some((model: any) => model.name.includes(this.model.split(':')[0]));
        logger.info('OllamaLLMAdapter', 'Ollama service health check', {
          status: 'healthy',
          modelAvailable: hasModel,
          availableModels: data.models?.map((m: any) => m.name) || [],
        });
        return hasModel;
      } else {
        logger.info('OllamaLLMAdapter', 'Ollama service health check', {
          status: 'unhealthy',
          statusCode: response.status,
        });
        return false;
      }
    } catch (error) {
      logger.error('OllamaLLMAdapter', 'Ollama service health check failed', error);
      return false;
    }
  }

  async pullModel(): Promise<boolean> {
    try {
      logger.info('OllamaLLMAdapter', 'Pulling model', { model: this.model });
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: this.model,
        }),
      });

      return response.ok;
    } catch (error) {
      logger.error('OllamaLLMAdapter', 'Model pull failed', error);
      return false;
    }
  }
}

export const ollamaLLMAdapter = new OllamaLLMAdapter(); 