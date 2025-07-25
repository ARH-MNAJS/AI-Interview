import { logger } from './logger';

// Request priority levels
export enum RequestPriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  CRITICAL = 4
}

// Request types for different services
export enum RequestType {
  STT = 'STT',
  TTS = 'TTS',
  LLM = 'LLM',
  HEALTH_CHECK = 'HEALTH_CHECK'
}

// Queued request interface
interface QueuedRequest<T = any> {
  id: string;
  type: RequestType;
  priority: RequestPriority;
  requestFn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timestamp: number;
  timeout?: number;
  retries: number;
  maxRetries: number;
}

// Queue configuration per service type
interface QueueConfig {
  maxConcurrent: number;
  maxQueueSize: number;
  defaultTimeout: number;
  maxRetries: number;
  retryDelay: number;
}

// Queue statistics for monitoring
interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  avgProcessingTime: number;
  avgWaitTime: number;
  throughputPerMinute: number;
}

export class RequestQueueManager {
  private queues: Map<RequestType, QueuedRequest[]> = new Map();
  private processing: Map<RequestType, Set<string>> = new Map();
  private configs: Map<RequestType, QueueConfig> = new Map();
  private stats: Map<RequestType, QueueStats> = new Map();
  private processingTimes: Map<RequestType, number[]> = new Map();
  private waitTimes: Map<RequestType, number[]> = new Map();
  private requestCounter = 0;

  constructor() {
    this.initializeQueues();
    this.startQueueProcessor();
    this.startStatsUpdater();

    logger.info('RequestQueueManager', 'Initialized with optimized request queuing', {
      queueTypes: Array.from(this.configs.keys()),
      configs: Object.fromEntries(this.configs.entries())
    });
  }

  private initializeQueues(): void {
    // Configure queues for different service types - SCALED FOR 100 CONCURRENT INTERVIEWS
    const configs: Record<RequestType, QueueConfig> = {
      [RequestType.STT]: {
        maxConcurrent: 25, // Increased from 5 - handles 25 simultaneous speech transcriptions
        maxQueueSize: 150, // Increased from 50 - accommodate spikes in speech requests
        defaultTimeout: 20000, // Increased from 15000 - more time for high load
        maxRetries: 2,
        retryDelay: 1000
      },
      [RequestType.TTS]: {
        maxConcurrent: 30, // Increased from 8 - handles 30 simultaneous speech generations
        maxQueueSize: 200, // Increased from 100 - accommodate AI response bursts
        defaultTimeout: 15000, // Increased from 10000 - more time for audio generation under load
        maxRetries: 2,
        retryDelay: 1000
      },
      [RequestType.LLM]: {
        maxConcurrent: 35, // Increased from 3 - CRITICAL: handles 35 simultaneous AI generations
        maxQueueSize: 100, // Increased from 30 - accommodate conversation peaks
        defaultTimeout: 45000, // Increased from 30000 - more time for complex AI responses
        maxRetries: 1,
        retryDelay: 2000
      },
      [RequestType.HEALTH_CHECK]: {
        maxConcurrent: 20, // Increased from 10 - more health checks under high load
        maxQueueSize: 40, // Increased from 20 - accommodate monitoring spikes
        defaultTimeout: 8000, // Increased from 5000 - more time for health checks under load
        maxRetries: 1,
        retryDelay: 500
      }
    };

    for (const [type, config] of Object.entries(configs)) {
      const requestType = type as RequestType;
      this.configs.set(requestType, config);
      this.queues.set(requestType, []);
      this.processing.set(requestType, new Set());
      this.stats.set(requestType, {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        avgProcessingTime: 0,
        avgWaitTime: 0,
        throughputPerMinute: 0
      });
      this.processingTimes.set(requestType, []);
      this.waitTimes.set(requestType, []);
    }
  }

  private startQueueProcessor(): void {
    // Process queues every 100ms for responsive handling
    setInterval(() => {
      for (const type of this.configs.keys()) {
        this.processQueue(type);
      }
    }, 100);
  }

  private startStatsUpdater(): void {
    // Update throughput statistics every minute
    setInterval(() => {
      this.updateThroughputStats();
    }, 60000);
  }

  // Enqueue a request with priority and type
  async enqueueRequest<T>(
    type: RequestType,
    requestFn: () => Promise<T>,
    options: {
      priority?: RequestPriority;
      timeout?: number;
      maxRetries?: number;
    } = {}
  ): Promise<T> {
    const config = this.configs.get(type);
    if (!config) {
      throw new Error(`Unknown request type: ${type}`);
    }

    const queue = this.queues.get(type)!;
    
    // Check queue size limits
    if (queue.length >= config.maxQueueSize) {
      throw new Error(`Queue for ${type} is full (${config.maxQueueSize} requests)`);
    }

    // Generate unique request ID
    const requestId = `${type}_${Date.now()}_${++this.requestCounter}`;
    
    return new Promise<T>((resolve, reject) => {
      const queuedRequest: QueuedRequest<T> = {
        id: requestId,
        type,
        priority: options.priority || RequestPriority.NORMAL,
        requestFn,
        resolve,
        reject,
        timestamp: Date.now(),
        timeout: options.timeout || config.defaultTimeout,
        retries: 0,
        maxRetries: options.maxRetries || config.maxRetries
      };

      // Insert request based on priority (higher priority first)
      const insertIndex = queue.findIndex(req => req.priority < queuedRequest.priority);
      if (insertIndex === -1) {
        queue.push(queuedRequest);
      } else {
        queue.splice(insertIndex, 0, queuedRequest);
      }

      // Update stats
      const stats = this.stats.get(type)!;
      stats.pending++;

      logger.debug('RequestQueueManager', 'Request enqueued', {
        requestId,
        type,
        priority: RequestPriority[queuedRequest.priority],
        queuePosition: insertIndex === -1 ? queue.length : insertIndex + 1,
        queueSize: queue.length,
        processing: this.processing.get(type)!.size
      });
    });
  }

  private async processQueue(type: RequestType): Promise<void> {
    const config = this.configs.get(type)!;
    const queue = this.queues.get(type)!;
    const processing = this.processing.get(type)!;
    const stats = this.stats.get(type)!;

    // Check if we can process more requests
    if (processing.size >= config.maxConcurrent || queue.length === 0) {
      return;
    }

    // Get next request
    const request = queue.shift()!;
    processing.add(request.id);
    stats.pending--;
    stats.processing++;

    // Calculate wait time
    const waitTime = Date.now() - request.timestamp;
    this.waitTimes.get(type)!.push(waitTime);

    logger.debug('RequestQueueManager', 'Processing request', {
      requestId: request.id,
      type,
      priority: RequestPriority[request.priority],
      waitTimeMs: waitTime,
      concurrentProcessing: processing.size
    });

    // Process request with timeout and retry logic
    this.executeRequest(request, type);
  }

  private async executeRequest<T>(request: QueuedRequest<T>, type: RequestType): Promise<void> {
    const config = this.configs.get(type)!;
    const processing = this.processing.get(type)!;
    const stats = this.stats.get(type)!;
    const startTime = Date.now();

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Request ${request.id} timed out after ${request.timeout}ms`));
        }, request.timeout);
      });

      // Race between request and timeout
      const result = await Promise.race([
        request.requestFn(),
        timeoutPromise
      ]);

      // Request succeeded
      const processingTime = Date.now() - startTime;
      this.processingTimes.get(type)!.push(processingTime);

      processing.delete(request.id);
      stats.processing--;
      stats.completed++;

      request.resolve(result);

      logger.debug('RequestQueueManager', 'Request completed successfully', {
        requestId: request.id,
        type,
        processingTimeMs: processingTime,
        remainingProcessing: processing.size
      });

    } catch (error) {
      // Request failed - check if we should retry
      const processingTime = Date.now() - startTime;
      
      if (request.retries < request.maxRetries) {
        request.retries++;
        processing.delete(request.id);
        stats.processing--;

        logger.warn('RequestQueueManager', 'Request failed, retrying', {
          requestId: request.id,
          type,
          error: (error as Error).message,
          retryAttempt: request.retries,
          maxRetries: request.maxRetries
        });

        // Add back to queue with delay
        setTimeout(() => {
          const queue = this.queues.get(type)!;
          queue.unshift(request); // Add to front for retry
          stats.pending++;
        }, config.retryDelay * Math.pow(2, request.retries - 1)); // Exponential backoff

      } else {
        // All retries exhausted
        processing.delete(request.id);
        stats.processing--;
        stats.failed++;

        request.reject(error as Error);

        logger.error('RequestQueueManager', 'Request failed after all retries', {
          requestId: request.id,
          type,
          error: (error as Error).message,
          retriesAttempted: request.retries,
          processingTimeMs: processingTime
        });
      }
    }
  }

  private updateThroughputStats(): void {
    for (const [type, stats] of this.stats.entries()) {
      // Calculate average processing time (last 100 requests)
      const processingTimes = this.processingTimes.get(type)!;
      if (processingTimes.length > 0) {
        const recent = processingTimes.slice(-100);
        stats.avgProcessingTime = recent.reduce((a, b) => a + b, 0) / recent.length;
        
        // Keep only last 100 measurements to prevent memory growth
        if (processingTimes.length > 100) {
          this.processingTimes.set(type, recent);
        }
      }

      // Calculate average wait time (last 100 requests)
      const waitTimes = this.waitTimes.get(type)!;
      if (waitTimes.length > 0) {
        const recent = waitTimes.slice(-100);
        stats.avgWaitTime = recent.reduce((a, b) => a + b, 0) / recent.length;
        
        // Keep only last 100 measurements
        if (waitTimes.length > 100) {
          this.waitTimes.set(type, recent);
        }
      }

      // Calculate throughput (completed requests per minute)
      stats.throughputPerMinute = stats.completed; // This gets reset each minute by monitoring
    }
  }

  // Convenience methods for different service types
  async enqueueSTTRequest<T>(requestFn: () => Promise<T>, priority?: RequestPriority): Promise<T> {
    return this.enqueueRequest(RequestType.STT, requestFn, { priority });
  }

  async enqueueTTSRequest<T>(requestFn: () => Promise<T>, priority?: RequestPriority): Promise<T> {
    return this.enqueueRequest(RequestType.TTS, requestFn, { priority });
  }

  async enqueueLLMRequest<T>(requestFn: () => Promise<T>, priority?: RequestPriority): Promise<T> {
    return this.enqueueRequest(RequestType.LLM, requestFn, { priority });
  }

  async enqueueHealthCheckRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    return this.enqueueRequest(RequestType.HEALTH_CHECK, requestFn, { priority: RequestPriority.LOW });
  }

  // Get queue statistics for monitoring
  getQueueStats(): Record<string, QueueStats> {
    const result: Record<string, QueueStats> = {};
    for (const [type, stats] of this.stats.entries()) {
      result[type] = { ...stats };
    }
    return result;
  }

  // Get detailed queue information
  getDetailedStats(): Record<string, any> {
    const stats: Record<string, any> = {
      queues: {},
      totalPending: 0,
      totalProcessing: 0,
      configs: Object.fromEntries(this.configs.entries())
    };

    for (const [type, queue] of this.queues.entries()) {
      const processing = this.processing.get(type)!;
      const queueStats = this.stats.get(type)!;
      
      stats.queues[type] = {
        ...queueStats,
        queueSize: queue.length,
        processingCount: processing.size,
        priorityDistribution: this.getPriorityDistribution(queue)
      };

      stats.totalPending += queue.length;
      stats.totalProcessing += processing.size;
    }

    return stats;
  }

  private getPriorityDistribution(queue: QueuedRequest[]): Record<string, number> {
    const distribution: Record<string, number> = {
      [RequestPriority.LOW]: 0,
      [RequestPriority.NORMAL]: 0,
      [RequestPriority.HIGH]: 0,
      [RequestPriority.CRITICAL]: 0
    };

    for (const request of queue) {
      distribution[request.priority]++;
    }

    return distribution;
  }

  // Force clear all queues (useful for testing or emergency situations)
  clearAllQueues(): void {
    let totalCleared = 0;

    for (const [type, queue] of this.queues.entries()) {
      const cleared = queue.length;
      totalCleared += cleared;

      // Reject all pending requests
      for (const request of queue) {
        request.reject(new Error('Queue cleared'));
      }

      queue.length = 0; // Clear the queue
      
      // Reset stats
      const stats = this.stats.get(type)!;
      stats.pending = 0;
    }

    logger.info('RequestQueueManager', 'Cleared all queues', {
      totalRequestsCleared: totalCleared,
      queuesCleared: this.queues.size
    });
  }

  // Clear specific queue type
  clearQueue(type: RequestType): void {
    const queue = this.queues.get(type);
    if (!queue) {
      throw new Error(`Unknown queue type: ${type}`);
    }

    const cleared = queue.length;
    
    // Reject all pending requests
    for (const request of queue) {
      request.reject(new Error(`Queue ${type} cleared`));
    }

    queue.length = 0;
    
    // Reset stats
    const stats = this.stats.get(type)!;
    stats.pending = 0;

    logger.info('RequestQueueManager', 'Cleared queue', {
      type,
      requestsCleared: cleared
    });
  }

  // Get current load information
  getCurrentLoad(): Record<string, number> {
    const load: Record<string, number> = {};
    
    for (const [type, config] of this.configs.entries()) {
      const processing = this.processing.get(type)!.size;
      const loadPercentage = (processing / config.maxConcurrent) * 100;
      load[type] = Math.round(loadPercentage);
    }

    return load;
  }

  // Check if system is under high load
  isHighLoad(): boolean {
    const loads = Object.values(this.getCurrentLoad());
    const avgLoad = loads.reduce((a, b) => a + b, 0) / loads.length;
    return avgLoad > 80; // Consider >80% as high load
  }
}

// Global singleton instance
export const requestQueue = new RequestQueueManager(); 