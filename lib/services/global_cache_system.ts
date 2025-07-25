import { logger } from './logger';

// Cache entry interface
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  lastAccessed: number;
  accessCount: number;
  size: number; // Estimated size in bytes
}

// Cache configuration
interface CacheConfig {
  maxEntries: number;
  maxMemoryMB: number;
  ttlMs: number; // Time to live
  cleanupIntervalMs: number;
}

// Cache statistics for monitoring
interface CacheStats {
  totalEntries: number;
  estimatedMemoryMB: number;
  hitRate: number;
  missRate: number;
  totalRequests: number;
  hits: number;
  misses: number;
  lastCleanup: Date;
}

export class GlobalCacheSystem {
  private responseCache = new Map<string, CacheEntry<string>>();
  private audioCache = new Map<string, CacheEntry<ArrayBuffer>>();
  private config: CacheConfig;
  private stats = {
    totalRequests: 0,
    hits: 0,
    misses: 0,
    lastCleanup: new Date()
  };

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      maxEntries: 2500, // Increased from 1000 - more cache entries for 100 concurrent users
      maxMemoryMB: 1000, // Increased from 500 - more memory for high-concurrency caching
      ttlMs: 7200000, // Increased from 3600000 (2 hours) - longer cache retention for repeated content
      cleanupIntervalMs: 180000, // Reduced from 300000 (3 minutes) - more frequent cleanup under high load
      ...config
    };

    // Start periodic cleanup
    setInterval(() => this.performCleanup(), this.config.cleanupIntervalMs);

    logger.info('GlobalCacheSystem', 'Initialized with memory-optimized caching', {
      maxEntries: this.config.maxEntries,
      maxMemoryMB: this.config.maxMemoryMB,
      ttlHours: this.config.ttlMs / 3600000,
      cleanupIntervalMinutes: this.config.cleanupIntervalMs / 60000
    });
  }

  // Estimate size of cached content
  private estimateSize(value: string | ArrayBuffer): number {
    if (typeof value === 'string') {
      // Rough estimate: 2 bytes per character for UTF-16
      return value.length * 2;
    } else if (value instanceof ArrayBuffer) {
      return value.byteLength;
    }
    return 0;
  }

  // Generate cache key with better collision resistance
  private generateCacheKey(prefix: string, content: string): string {
    // Create a simple hash for better key distribution
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return `${prefix}_${Math.abs(hash)}_${content.length}`;
  }

  // Set cached response with memory management
  setCachedResponse(conversationContext: string, response: string): boolean {
    const cacheKey = this.generateCacheKey('response', conversationContext);
    const size = this.estimateSize(response);
    const now = Date.now();

    // Check if adding this entry would exceed memory limits
    if (this.shouldRejectEntry(size)) {
      logger.debug('GlobalCacheSystem', 'Rejecting cache entry due to memory limits', {
        key: cacheKey.slice(0, 50),
        sizeMB: (size / 1024 / 1024).toFixed(2)
      });
      return false;
    }

    const entry: CacheEntry<string> = {
      value: response,
      timestamp: now,
      lastAccessed: now,
      accessCount: 1,
      size
    };

    // Remove existing entry if present (to update size calculation)
    if (this.responseCache.has(cacheKey)) {
      this.responseCache.delete(cacheKey);
    }

    this.responseCache.set(cacheKey, entry);

    // Trigger cleanup if needed
    if (this.responseCache.size > this.config.maxEntries * 0.8) {
      this.performPartialCleanup(this.responseCache);
    }

    logger.debug('GlobalCacheSystem', 'Cached response', {
      key: cacheKey.slice(0, 50),
      responseLengthChars: response.length,
      sizeMB: (size / 1024 / 1024).toFixed(2),
      totalEntries: this.responseCache.size
    });

    return true;
  }

  // Get cached response
  getCachedResponse(conversationContext: string): string | null {
    const cacheKey = this.generateCacheKey('response', conversationContext);
    this.stats.totalRequests++;

    const entry = this.responseCache.get(cacheKey);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if entry has expired
    const now = Date.now();
    if (now - entry.timestamp > this.config.ttlMs) {
      this.responseCache.delete(cacheKey);
      this.stats.misses++;
      logger.debug('GlobalCacheSystem', 'Cache entry expired', { key: cacheKey.slice(0, 50) });
      return null;
    }

    // Update access statistics
    entry.lastAccessed = now;
    entry.accessCount++;
    this.stats.hits++;

    logger.debug('GlobalCacheSystem', 'Cache hit for response', {
      key: cacheKey.slice(0, 50),
      accessCount: entry.accessCount,
      ageMinutes: ((now - entry.timestamp) / 60000).toFixed(1)
    });

    return entry.value;
  }

  // Set cached audio with memory management
  setCachedAudio(text: string, audioBuffer: ArrayBuffer): boolean {
    const cacheKey = this.generateCacheKey('audio', text);
    const size = this.estimateSize(audioBuffer);
    const now = Date.now();

    // Check if adding this entry would exceed memory limits
    if (this.shouldRejectEntry(size)) {
      logger.debug('GlobalCacheSystem', 'Rejecting audio cache entry due to memory limits', {
        key: cacheKey.slice(0, 50),
        sizeMB: (size / 1024 / 1024).toFixed(2)
      });
      return false;
    }

    const entry: CacheEntry<ArrayBuffer> = {
      value: audioBuffer,
      timestamp: now,
      lastAccessed: now,
      accessCount: 1,
      size
    };

    // Remove existing entry if present
    if (this.audioCache.has(cacheKey)) {
      this.audioCache.delete(cacheKey);
    }

    this.audioCache.set(cacheKey, entry);

    // Trigger cleanup if needed
    if (this.audioCache.size > this.config.maxEntries * 0.8) {
      this.performPartialCleanup(this.audioCache);
    }

    logger.debug('GlobalCacheSystem', 'Cached audio', {
      key: cacheKey.slice(0, 50),
      textLength: text.length,
      audioSizeMB: (size / 1024 / 1024).toFixed(2),
      totalEntries: this.audioCache.size
    });

    return true;
  }

  // Get cached audio
  getCachedAudio(text: string): ArrayBuffer | null {
    const cacheKey = this.generateCacheKey('audio', text);
    this.stats.totalRequests++;

    const entry = this.audioCache.get(cacheKey);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if entry has expired
    const now = Date.now();
    if (now - entry.timestamp > this.config.ttlMs) {
      this.audioCache.delete(cacheKey);
      this.stats.misses++;
      logger.debug('GlobalCacheSystem', 'Audio cache entry expired', { key: cacheKey.slice(0, 50) });
      return null;
    }

    // Update access statistics
    entry.lastAccessed = now;
    entry.accessCount++;
    this.stats.hits++;

    logger.debug('GlobalCacheSystem', 'Cache hit for audio', {
      key: cacheKey.slice(0, 50),
      accessCount: entry.accessCount,
      ageMinutes: ((now - entry.timestamp) / 60000).toFixed(1)
    });

    return entry.value;
  }

  // Check if we should reject a new entry based on memory limits
  private shouldRejectEntry(newEntrySize: number): boolean {
    const currentMemoryUsage = this.getEstimatedMemoryUsage();
    const newTotalMB = (currentMemoryUsage + newEntrySize) / 1024 / 1024;
    
    return newTotalMB > this.config.maxMemoryMB;
  }

  // Calculate estimated memory usage
  private getEstimatedMemoryUsage(): number {
    let totalSize = 0;
    
    for (const entry of this.responseCache.values()) {
      totalSize += entry.size;
    }
    
    for (const entry of this.audioCache.values()) {
      totalSize += entry.size;
    }
    
    return totalSize;
  }

  // Perform partial cleanup to stay within limits
  private performPartialCleanup<T>(cache: Map<string, CacheEntry<T>>): void {
    const entries = Array.from(cache.entries());
    const now = Date.now();

    // Sort by access patterns (LRU + frequency)
    entries.sort(([, a], [, b]) => {
      // Prioritize removing old, infrequently accessed items
      const aScore = a.accessCount / ((now - a.lastAccessed) / 60000 + 1);
      const bScore = b.accessCount / ((now - b.lastAccessed) / 60000 + 1);
      return aScore - bScore;
    });

    // Remove bottom 20% of entries
    const removeCount = Math.floor(entries.length * 0.2);
    const toRemove = entries.slice(0, removeCount);

    let removedSize = 0;
    for (const [key, entry] of toRemove) {
      cache.delete(key);
      removedSize += entry.size;
    }

    logger.debug('GlobalCacheSystem', 'Performed partial cleanup', {
      cacheType: cache === this.responseCache ? 'response' : 'audio',
      removedEntries: removeCount,
      removedSizeMB: (removedSize / 1024 / 1024).toFixed(2),
      remainingEntries: cache.size
    });
  }

  // Perform full cleanup based on TTL and memory pressure
  private performCleanup(): void {
    const now = Date.now();
    this.stats.lastCleanup = new Date();
    
    let totalRemoved = 0;
    let totalSizeRemoved = 0;

    // Cleanup response cache
    const responseCleanup = this.cleanupExpiredEntries(this.responseCache, now);
    totalRemoved += responseCleanup.count;
    totalSizeRemoved += responseCleanup.size;

    // Cleanup audio cache
    const audioCleanup = this.cleanupExpiredEntries(this.audioCache, now);
    totalRemoved += audioCleanup.count;
    totalSizeRemoved += audioCleanup.size;

    // Force cleanup if still over memory limit
    const currentMemoryMB = this.getEstimatedMemoryUsage() / 1024 / 1024;
    if (currentMemoryMB > this.config.maxMemoryMB) {
      logger.warn('GlobalCacheSystem', 'Memory limit exceeded, forcing aggressive cleanup', {
        currentMemoryMB: currentMemoryMB.toFixed(2),
        limitMB: this.config.maxMemoryMB
      });
      
      this.performPartialCleanup(this.audioCache); // Audio is typically larger
      if (this.getEstimatedMemoryUsage() / 1024 / 1024 > this.config.maxMemoryMB) {
        this.performPartialCleanup(this.responseCache);
      }
    }

    if (totalRemoved > 0) {
      logger.info('GlobalCacheSystem', 'Cleanup completed', {
        removedEntries: totalRemoved,
        removedSizeMB: (totalSizeRemoved / 1024 / 1024).toFixed(2),
        remainingResponseEntries: this.responseCache.size,
        remainingAudioEntries: this.audioCache.size,
        currentMemoryMB: (this.getEstimatedMemoryUsage() / 1024 / 1024).toFixed(2)
      });
    }
  }

  // Cleanup expired entries from a specific cache
  private cleanupExpiredEntries<T>(cache: Map<string, CacheEntry<T>>, now: number): { count: number, size: number } {
    let removedCount = 0;
    let removedSize = 0;

    for (const [key, entry] of cache.entries()) {
      if (now - entry.timestamp > this.config.ttlMs) {
        cache.delete(key);
        removedCount++;
        removedSize += entry.size;
      }
    }

    return { count: removedCount, size: removedSize };
  }

  // Get comprehensive cache statistics
  getCacheStats(): CacheStats {
    const memoryUsage = this.getEstimatedMemoryUsage();
    const hitRate = this.stats.totalRequests > 0 ? (this.stats.hits / this.stats.totalRequests) * 100 : 0;
    const missRate = this.stats.totalRequests > 0 ? (this.stats.misses / this.stats.totalRequests) * 100 : 0;

    return {
      totalEntries: this.responseCache.size + this.audioCache.size,
      estimatedMemoryMB: Number((memoryUsage / 1024 / 1024).toFixed(2)),
      hitRate: Number(hitRate.toFixed(2)),
      missRate: Number(missRate.toFixed(2)),
      totalRequests: this.stats.totalRequests,
      hits: this.stats.hits,
      misses: this.stats.misses,
      lastCleanup: this.stats.lastCleanup
    };
  }

  // Get detailed cache information for monitoring
  getDetailedStats(): Record<string, any> {
    const stats = this.getCacheStats();
    
    return {
      ...stats,
      responseCacheEntries: this.responseCache.size,
      audioCacheEntries: this.audioCache.size,
      config: this.config,
      memoryDistribution: {
        responseCacheMB: Number((this.calculateCacheMemory(this.responseCache) / 1024 / 1024).toFixed(2)),
        audioCacheMB: Number((this.calculateCacheMemory(this.audioCache) / 1024 / 1024).toFixed(2))
      }
    };
  }

  // Calculate memory usage for a specific cache
  private calculateCacheMemory<T>(cache: Map<string, CacheEntry<T>>): number {
    let total = 0;
    for (const entry of cache.values()) {
      total += entry.size;
    }
    return total;
  }

  // Clear all caches (useful for testing or memory pressure relief)
  clearAll(): void {
    const responseEntries = this.responseCache.size;
    const audioEntries = this.audioCache.size;
    const memoryFreed = this.getEstimatedMemoryUsage();

    this.responseCache.clear();
    this.audioCache.clear();
    
    // Reset stats
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.totalRequests = 0;

    logger.info('GlobalCacheSystem', 'Cleared all caches', {
      responseEntriesCleared: responseEntries,
      audioEntriesCleared: audioEntries,
      memoryFreedMB: (memoryFreed / 1024 / 1024).toFixed(2)
    });
  }

  // Clear specific cache type
  clearResponseCache(): void {
    const cleared = this.responseCache.size;
    this.responseCache.clear();
    logger.info('GlobalCacheSystem', 'Cleared response cache', { entriesCleared: cleared });
  }

  clearAudioCache(): void {
    const cleared = this.audioCache.size;
    this.audioCache.clear();
    logger.info('GlobalCacheSystem', 'Cleared audio cache', { entriesCleared: cleared });
  }
}

// Global singleton instance
export const globalCache = new GlobalCacheSystem(); 