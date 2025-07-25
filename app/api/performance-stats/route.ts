import { NextResponse } from 'next/server';
import { httpConnectionPool } from '@/lib/services/http_pool_manager';
import { requestQueue } from '@/lib/services/request_queue_manager';
import { globalCache } from '@/lib/services/global_cache_system';
import { logger } from '@/lib/services/logger';

export async function GET() {
  try {
    logger.info('PerformanceStats', 'Retrieving comprehensive performance statistics');

    // Get statistics from all performance systems
    const [poolStats, queueStats, cacheStats] = await Promise.all([
      Promise.resolve(httpConnectionPool.getPoolStats()),
      Promise.resolve(requestQueue.getDetailedStats()),
      Promise.resolve(globalCache.getDetailedStats()),
    ]);

    // Calculate overall system health metrics
    const queueLoad = requestQueue.getCurrentLoad();
    const isHighLoad = requestQueue.isHighLoad();
    
    // Aggregate statistics
    const performanceData = {
      timestamp: new Date().toISOString(),
      systemHealth: {
        isHighLoad,
        status: isHighLoad ? 'warning' : 'healthy',
        loadDistribution: queueLoad
      },
      connectionPool: {
        ...poolStats,
        efficiency: {
          totalConnectionsCreated: Object.values(poolStats.hosts).reduce((acc: number, host: any) => acc + host.totalConnections, 0),
          totalActiveConnections: Object.values(poolStats.hosts).reduce((acc: number, host: any) => acc + host.activeConnections, 0),
          reuseRate: Object.values(poolStats.hosts).length > 0 ? 
            ((Object.values(poolStats.hosts).reduce((acc: number, host: any) => acc + host.totalConnections, 0) / poolStats.activeRequests) * 100).toFixed(2) : 0
        }
      },
      requestQueue: {
        ...queueStats,
        performance: {
          averageWaitTime: Object.values(queueStats.queues).reduce((acc: number, queue: any) => acc + (queue.avgWaitTime || 0), 0) / Object.keys(queueStats.queues).length,
          averageProcessingTime: Object.values(queueStats.queues).reduce((acc: number, queue: any) => acc + (queue.avgProcessingTime || 0), 0) / Object.keys(queueStats.queues).length,
          totalThroughput: Object.values(queueStats.queues).reduce((acc: number, queue: any) => acc + (queue.throughputPerMinute || 0), 0)
        }
      },
      globalCache: {
        ...cacheStats,
        performance: {
          hitRateGrade: cacheStats.hitRate >= 80 ? 'excellent' : 
                       cacheStats.hitRate >= 60 ? 'good' : 
                       cacheStats.hitRate >= 40 ? 'fair' : 'poor',
          memoryUtilization: (cacheStats.estimatedMemoryMB / cacheStats.config.maxMemoryMB * 100).toFixed(2) + '%',
          entriesUtilization: (cacheStats.totalEntries / (cacheStats.config.maxEntries * 2) * 100).toFixed(2) + '%' // 2 types of cache
        }
      },
      recommendations: generatePerformanceRecommendations(poolStats, queueStats, cacheStats, isHighLoad)
    };

    logger.info('PerformanceStats', 'Performance statistics retrieved successfully', {
      systemHealth: performanceData.systemHealth.status,
      cacheHitRate: cacheStats.hitRate,
      activeConnections: poolStats.activeRequests,
      totalQueueLength: queueStats.totalPending
    });

    return NextResponse.json({
      success: true,
      data: performanceData,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('PerformanceStats', 'Failed to retrieve performance statistics', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }, 
      { status: 500 }
    );
  }
}

// Generate performance recommendations based on current metrics
function generatePerformanceRecommendations(
  poolStats: any, 
  queueStats: any, 
  cacheStats: any, 
  isHighLoad: boolean
): string[] {
  const recommendations: string[] = [];

  // Connection Pool Recommendations
  if (poolStats.activeRequests > poolStats.maxConcurrentRequests * 0.8) {
    recommendations.push('Consider increasing HTTP connection pool size - currently at 80%+ capacity');
  }

  // Queue Recommendations
  if (queueStats.totalPending > 50) {
    recommendations.push('High request queue backlog detected - consider scaling backend services');
  }

  // Cache Recommendations
  if (cacheStats.hitRate < 50) {
    recommendations.push('Low cache hit rate detected - review cache key generation strategy');
  }

  if (cacheStats.estimatedMemoryMB > cacheStats.config.maxMemoryMB * 0.9) {
    recommendations.push('Cache memory usage is high - consider reducing TTL or increasing memory limit');
  }

  // System Load Recommendations
  if (isHighLoad) {
    recommendations.push('System is under high load - consider implementing circuit breaker patterns');
  }

  // Performance-specific recommendations
  const avgWaitTime = Object.values(queueStats.queues).reduce((acc: number, queue: any) => acc + (queue.avgWaitTime || 0), 0) / Object.keys(queueStats.queues).length;
  if (avgWaitTime > 5000) { // 5 seconds
    recommendations.push('High average queue wait times - consider optimizing request processing or adding capacity');
  }

  if (recommendations.length === 0) {
    recommendations.push('System performance is operating within optimal parameters');
  }

  return recommendations;
}

// Alternative endpoint for lightweight health check
export async function HEAD() {
  try {
    const isHighLoad = requestQueue.isHighLoad();
    const cacheStats = globalCache.getCacheStats();
    const poolStats = httpConnectionPool.getPoolStats();

    // Simple health indicators
    const isHealthy = !isHighLoad && 
                     cacheStats.hitRate > 30 && 
                     poolStats.activeRequests < poolStats.maxConcurrentRequests;

    return new Response(null, { 
      status: isHealthy ? 200 : 503,
      headers: {
        'X-System-Health': isHealthy ? 'healthy' : 'degraded',
        'X-Cache-Hit-Rate': cacheStats.hitRate.toString(),
        'X-Active-Requests': poolStats.activeRequests.toString(),
        'X-High-Load': isHighLoad.toString()
      }
    });
  } catch (error) {
    return new Response(null, { status: 500 });
  }
} 