import { logger } from './logger';

// HTTP connection pool configuration
interface PoolConfig {
  maxConnections: number;
  keepAlive: boolean;
  keepAliveMsecs: number;
  timeout: number;
  retryDelay: number;
  maxRetries: number;
}

interface RequestConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string | FormData;
  timeout?: number;
  retries?: number;
}

interface PooledConnection {
  controller: AbortController;
  lastUsed: number;
  inUse: boolean;
  host: string;
}

export class HTTPConnectionPoolManager {
  private pools: Map<string, PooledConnection[]> = new Map();
  private config: PoolConfig;
  private activeRequests = 0;
  private maxConcurrentRequests = 200; // Increased from 50 - SCALED FOR 100 CONCURRENT INTERVIEWS

  constructor(config?: Partial<PoolConfig>) {
    this.config = {
      maxConnections: 50, // Increased from 20 - more connections per host for high concurrency
      keepAlive: true,
      keepAliveMsecs: 30000, // 30 seconds
      timeout: 15000, // Increased from 10000 - more time for requests under high load
      retryDelay: 1000, // 1 second base delay
      maxRetries: 3,
      ...config
    };

    // Clean up stale connections every 30 seconds
    setInterval(() => this.cleanupStaleConnections(), 30000);

    logger.info('HTTPConnectionPoolManager', 'Initialized with optimized connection pooling', {
      maxConnections: this.config.maxConnections,
      timeout: this.config.timeout,
      keepAlive: this.config.keepAlive,
      maxConcurrentRequests: this.maxConcurrentRequests
    });
  }

  private getHostFromUrl(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }

  private getAvailableConnection(host: string): PooledConnection | null {
    const pool = this.pools.get(host) || [];
    const available = pool.find(conn => !conn.inUse);
    
    if (available) {
      available.inUse = true;
      available.lastUsed = Date.now();
      return available;
    }

    // Create new connection if under limit
    if (pool.length < this.config.maxConnections) {
      const newConnection: PooledConnection = {
        controller: new AbortController(),
        lastUsed: Date.now(),
        inUse: true,
        host
      };
      
      pool.push(newConnection);
      this.pools.set(host, pool);
      
      logger.debug('HTTPConnectionPoolManager', 'Created new pooled connection', {
        host,
        poolSize: pool.length,
        activeRequests: this.activeRequests
      });
      
      return newConnection;
    }

    return null;
  }

  private releaseConnection(connection: PooledConnection): void {
    connection.inUse = false;
    connection.lastUsed = Date.now();
  }

  private cleanupStaleConnections(): void {
    const now = Date.now();
    const staleThreshold = 60000; // 1 minute

    for (const [host, pool] of this.pools.entries()) {
      const activePools = pool.filter(conn => {
        if (!conn.inUse && (now - conn.lastUsed) > staleThreshold) {
          try {
            conn.controller.abort();
          } catch (error) {
            // Connection may already be cleaned up
          }
          return false;
        }
        return true;
      });

      if (activePools.length !== pool.length) {
        logger.debug('HTTPConnectionPoolManager', 'Cleaned up stale connections', {
          host,
          removed: pool.length - activePools.length,
          remaining: activePools.length
        });
      }

      if (activePools.length === 0) {
        this.pools.delete(host);
      } else {
        this.pools.set(host, activePools);
      }
    }
  }

  async request<T = any>(config: RequestConfig): Promise<T> {
    // Global concurrency limit
    if (this.activeRequests >= this.maxConcurrentRequests) {
      throw new Error(`Maximum concurrent requests (${this.maxConcurrentRequests}) exceeded`);
    }

    this.activeRequests++;
    const startTime = Date.now();
    const host = this.getHostFromUrl(config.url);
    let connection: PooledConnection | null = null;
    let lastError: Error | null = null;

    try {
      const maxRetries = config.retries ?? this.config.maxRetries;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // Get or create pooled connection
          connection = this.getAvailableConnection(host);
          
          if (!connection) {
            // Wait for available connection with exponential backoff
            const waitTime = Math.min(this.config.retryDelay * Math.pow(2, attempt - 1), 5000);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }

          // Set up timeout
          const timeout = config.timeout ?? this.config.timeout;
          const timeoutId = setTimeout(() => {
            connection?.controller.abort();
          }, timeout);

          // Prepare headers with keep-alive optimization
          const headers: Record<string, string> = {
            'Connection': this.config.keepAlive ? 'keep-alive' : 'close',
            'Keep-Alive': `timeout=${Math.floor(this.config.keepAliveMsecs / 1000)}`,
            ...config.headers
          };

          // Remove Content-Type for FormData (let browser set it)
          if (config.body instanceof FormData && headers['Content-Type']) {
            delete headers['Content-Type'];
          }

          logger.debug('HTTPConnectionPoolManager', 'Making pooled request', {
            url: config.url,
            method: config.method,
            attempt,
            host,
            poolSize: this.pools.get(host)?.length || 0,
            activeRequests: this.activeRequests
          });

          // Make the actual request
          const response = await fetch(config.url, {
            method: config.method,
            headers,
            body: config.body,
            signal: connection.controller.signal
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          // Determine response type and parse accordingly
          const contentType = response.headers.get('content-type') || '';
          let result: T;

          if (contentType.includes('application/json')) {
            result = await response.json() as T;
          } else if (contentType.includes('application/octet-stream') || 
                     contentType.includes('audio/')) {
            result = await response.arrayBuffer() as T;
          } else {
            result = await response.text() as T;
          }

          const duration = Date.now() - startTime;
          logger.info('HTTPConnectionPoolManager', 'Request completed successfully', {
            url: config.url,
            method: config.method,
            duration: `${duration}ms`,
            attempt,
            host,
            responseType: typeof result,
            responseSize: result instanceof ArrayBuffer ? result.byteLength : 
                         typeof result === 'string' ? result.length : 
                         JSON.stringify(result).length
          });

          return result;

        } catch (error) {
          lastError = error as Error;
          
          logger.warn('HTTPConnectionPoolManager', `Request attempt ${attempt} failed`, {
            url: config.url,
            error: lastError.message,
            attempt,
            willRetry: attempt < maxRetries
          });

          if (attempt < maxRetries) {
            // Exponential backoff before retry
            const waitTime = this.config.retryDelay * Math.pow(2, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        } finally {
          if (connection) {
            this.releaseConnection(connection);
          }
        }
      }

      throw lastError || new Error('All retry attempts failed');

    } finally {
      this.activeRequests--;
    }
  }

  // Convenience methods for different HTTP verbs
  async get<T = any>(url: string, headers?: Record<string, string>, timeout?: number): Promise<T> {
    return this.request<T>({ url, method: 'GET', headers, timeout });
  }

  async post<T = any>(url: string, body?: string | FormData, headers?: Record<string, string>, timeout?: number): Promise<T> {
    return this.request<T>({ url, method: 'POST', body, headers, timeout });
  }

  async put<T = any>(url: string, body?: string | FormData, headers?: Record<string, string>, timeout?: number): Promise<T> {
    return this.request<T>({ url, method: 'PUT', body, headers, timeout });
  }

  async delete<T = any>(url: string, headers?: Record<string, string>, timeout?: number): Promise<T> {
    return this.request<T>({ url, method: 'DELETE', headers, timeout });
  }

  // Get pool statistics for monitoring
  getPoolStats(): Record<string, any> {
    const stats: Record<string, any> = {
      totalHosts: this.pools.size,
      activeRequests: this.activeRequests,
      maxConcurrentRequests: this.maxConcurrentRequests,
      config: this.config,
      hosts: {}
    };

    for (const [host, pool] of this.pools.entries()) {
      stats.hosts[host] = {
        totalConnections: pool.length,
        activeConnections: pool.filter(c => c.inUse).length,
        idleConnections: pool.filter(c => !c.inUse).length
      };
    }

    return stats;
  }

  // Force cleanup of all connections (useful for testing)
  async cleanup(): Promise<void> {
    logger.info('HTTPConnectionPoolManager', 'Force cleaning up all connections');
    
    for (const [host, pool] of this.pools.entries()) {
      for (const connection of pool) {
        try {
          connection.controller.abort();
        } catch (error) {
          // Connection may already be cleaned up
        }
      }
    }
    
    this.pools.clear();
    this.activeRequests = 0;
  }
}

// Global singleton instance
export const httpConnectionPool = new HTTPConnectionPoolManager(); 