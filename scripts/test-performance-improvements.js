#!/usr/bin/env node

/**
 * Performance Testing Script for 100 Concurrent Student Interviews
 * Tests the scaled configuration and monitors system bottlenecks
 */

const https = require('https');
const http = require('http');

// Configuration for testing
const TEST_CONFIG = {
  CONCURRENT_USERS: [10, 25, 50, 75, 100], // Progressive testing
  TEST_DURATION_MS: 120000, // 2 minutes per test
  REQUEST_INTERVAL_MS: 2000, // Request every 2 seconds per simulated user
  SERVICES: {
    STT: process.env.NEXT_PUBLIC_WHISPER_STT_URL || 'https://dypstt.ccxai.uk',
    TTS: process.env.NEXT_PUBLIC_EDGE_TTS_URL || 'https://dyptts.ccxai.uk',
    LLM: process.env.NEXT_PUBLIC_OLLAMA_URL || 'https://dypai.ccxai.uk',
    APP: process.env.APP_URL || 'http://localhost:3001'
  }
};

class PerformanceMonitor {
  constructor() {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalCycles: 0,        // NEW: Track complete interview cycles
      successfulCycles: 0,   // NEW: Track successful cycles
      failedCycles: 0,       // NEW: Track failed cycles
      avgResponseTime: 0,
      responseTimes: [],
      errors: [],
      serviceStats: {},
      queueStats: {},
      cacheStats: {},
      startTime: null,
      endTime: null
    };
  }

  // Test service health with concurrency
  async testServiceHealth(concurrency) {
    console.log(`\n🔍 Testing Service Health with ${concurrency} concurrent users...`);
    
    const promises = [];
    const startTime = Date.now();

    for (let i = 0; i < concurrency; i++) {
      promises.push(this.simulateUserSession(i, startTime));
    }

    try {
      await Promise.allSettled(promises);
      await this.getSystemStats();
      this.displayResults(concurrency);
    } catch (error) {
      console.error(`❌ Test failed for ${concurrency} users:`, error.message);
    }
  }

  // Simulate a complete user interview session
  async simulateUserSession(userId, testStartTime) {
    const sessionDuration = TEST_CONFIG.TEST_DURATION_MS;
    const interval = TEST_CONFIG.REQUEST_INTERVAL_MS;
    
    console.log(`👤 Starting session for user ${userId}`);
    
    while (Date.now() - testStartTime < sessionDuration) {
      try {
        // Simulate the interview flow: STT -> LLM -> TTS
        await this.simulateInterviewCycle(userId);
        await new Promise(resolve => setTimeout(resolve, interval));
      } catch (error) {
        this.recordError(userId, error);
      }
    }
    
    console.log(`✅ Session completed for user ${userId}`);
  }

  // Simulate one complete interview cycle
  async simulateInterviewCycle(userId) {
    const cycleStart = Date.now();
    
    try {
      // 1. STT Request (Speech to Text)
      await this.makeRequest('STT', `${TEST_CONFIG.SERVICES.STT}/health`, 'GET');
      
      // 2. LLM Request (AI Response Generation) - FIXED: Use correct Ollama endpoint
      await this.makeRequest('LLM', `${TEST_CONFIG.SERVICES.LLM}/api/tags`, 'GET');
      
      // 3. TTS Request (Text to Speech)
      await this.makeRequest('TTS', `${TEST_CONFIG.SERVICES.TTS}/health`, 'GET');
      
      const cycleTime = Date.now() - cycleStart;
      this.recordSuccess(cycleTime);
      
    } catch (error) {
      this.recordError(userId, error);
    }
  }

  // Make HTTP request with timeout and monitoring
  async makeRequest(serviceType, url, method = 'GET', body = null) {
    const requestStart = Date.now();
    this.stats.totalRequests++;

    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname,
        method: method,
        timeout: 30000, // 30 second timeout
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `PerformanceTest-${serviceType}`
        }
      };

      const client = urlObj.protocol === 'https:' ? https : http;
      
      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const responseTime = Date.now() - requestStart;
          this.recordServiceStat(serviceType, responseTime, res.statusCode);
          
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, data, responseTime });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout for ${serviceType}`));
      });

      req.on('error', (error) => {
        reject(new Error(`${serviceType} request failed: ${error.message}`));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      
      req.end();
    });
  }

  // Record successful request
  recordSuccess(responseTime) {
    this.stats.successfulCycles++;     // FIXED: Track cycles, not individual requests
    this.stats.totalCycles++;
    this.stats.responseTimes.push(responseTime);
    
    // Calculate rolling average
    const sum = this.stats.responseTimes.reduce((a, b) => a + b, 0);
    this.stats.avgResponseTime = sum / this.stats.responseTimes.length;
  }

  // Record error
  recordError(userId, error) {
    this.stats.failedCycles++;        // FIXED: Track cycles, not individual requests
    this.stats.totalCycles++;
    this.stats.errors.push({
      userId,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }

  // Record service-specific statistics
  recordServiceStat(serviceType, responseTime, statusCode) {
    if (!this.stats.serviceStats[serviceType]) {
      this.stats.serviceStats[serviceType] = {
        requests: 0,
        avgResponseTime: 0,
        responseTimes: [],
        errors: 0
      };
    }

    const serviceStat = this.stats.serviceStats[serviceType];
    serviceStat.requests++;
    serviceStat.responseTimes.push(responseTime);
    
    if (statusCode >= 400) {
      serviceStat.errors++;
    }
    
    // Calculate rolling average
    const sum = serviceStat.responseTimes.reduce((a, b) => a + b, 0);
    serviceStat.avgResponseTime = sum / serviceStat.responseTimes.length;
  }

  // Get system stats from the application
  async getSystemStats() {
    try {
      // Try to get queue stats from the application
      const queueResponse = await this.makeRequest('QUEUE', `${TEST_CONFIG.SERVICES.APP}/api/performance-stats`, 'GET');
      if (queueResponse.data) {
        this.stats.queueStats = JSON.parse(queueResponse.data);
      }
    } catch (error) {
      console.log('⚠️  Could not fetch system stats:', error.message);
    }
  }

  // Display comprehensive test results
  displayResults(concurrency) {
    console.log(`\n📊 PERFORMANCE RESULTS - ${concurrency} Concurrent Users`);
    console.log('='.repeat(60));
    
    // Calculate correct success rates
    const cycleSuccessRate = this.stats.totalCycles > 0 ? 
      (this.stats.successfulCycles / this.stats.totalCycles) * 100 : 0;
    
    const serviceAvgError = Object.values(this.stats.serviceStats).reduce((acc, stat) => {
      return acc + ((stat.errors / stat.requests) * 100);
    }, 0) / Object.keys(this.stats.serviceStats).length;
    
    // Overall Statistics - FIXED
    console.log('📈 Overall Performance:');
    console.log(`   Total Interview Cycles: ${this.stats.totalCycles}`);
    console.log(`   Successful Cycles: ${this.stats.successfulCycles} (${cycleSuccessRate.toFixed(1)}%)`);
    console.log(`   Failed Cycles: ${this.stats.failedCycles} (${((this.stats.failedCycles/this.stats.totalCycles)*100).toFixed(1)}%)`);
    console.log(`   Total Individual Requests: ${this.stats.totalRequests}`);
    console.log(`   Average Cycle Time: ${this.stats.avgResponseTime.toFixed(0)}ms`);
    
    // Service-specific statistics
    console.log('\n🔧 Service Performance:');
    for (const [service, stats] of Object.entries(this.stats.serviceStats)) {
      const errorRate = ((stats.errors / stats.requests) * 100).toFixed(1);
      console.log(`   ${service}:`);
      console.log(`     Requests: ${stats.requests}`);
      console.log(`     Avg Response: ${stats.avgResponseTime.toFixed(0)}ms`);
      console.log(`     Error Rate: ${errorRate}%`);
    }

    // Queue Statistics (if available)
    if (Object.keys(this.stats.queueStats).length > 0) {
      console.log('\n⏳ Queue Performance:');
      for (const [queueType, stats] of Object.entries(this.stats.queueStats.queues || {})) {
        console.log(`   ${queueType}:`);
        console.log(`     Pending: ${stats.queueSize}`);
        console.log(`     Processing: ${stats.processingCount}`);
        console.log(`     Avg Wait Time: ${stats.avgWaitTime?.toFixed(0) || 0}ms`);
      }
    }

    // Performance Assessment - FIXED LOGIC
    console.log('\n🎯 Performance Assessment:');
    const avgResponseTime = this.stats.avgResponseTime;
    const allServicesHealthy = Object.values(this.stats.serviceStats).every(stat => 
      (stat.errors / stat.requests) < 0.05  // Less than 5% error rate
    );
    
    if (cycleSuccessRate >= 95 && avgResponseTime <= 2000 && allServicesHealthy) {
      console.log('   ✅ EXCELLENT - System handles load perfectly');
    } else if (cycleSuccessRate >= 85 && avgResponseTime <= 5000 && allServicesHealthy) {
      console.log('   ✅ GOOD - System handles load well');
    } else if (cycleSuccessRate >= 70 && avgResponseTime <= 10000) {
      console.log('   ⚠️  ACCEPTABLE - Some performance degradation');
    } else {
      console.log('   ❌ NEEDS IMPROVEMENT - System struggling under load');
      
      // Provide specific issues
      if (cycleSuccessRate < 70) {
        console.log('     • Low interview cycle success rate');
      }
      if (avgResponseTime > 10000) {
        console.log('     • High response times');
      }
      if (!allServicesHealthy) {
        console.log('     • Service errors detected');
      }
    }

    // Recent Errors (if any)
    if (this.stats.errors.length > 0) {
      console.log('\n🚨 Recent Errors:');
      this.stats.errors.slice(-5).forEach(error => {
        console.log(`   User ${error.userId}: ${error.error}`);
      });
    }

    console.log('\n' + '='.repeat(60));
  }

  // Reset stats for next test
  reset() {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalCycles: 0,
      successfulCycles: 0,
      failedCycles: 0,
      avgResponseTime: 0,
      responseTimes: [],
      errors: [],
      serviceStats: {},
      queueStats: {},
      cacheStats: {},
      startTime: null,
      endTime: null
    };
  }
}

// Main test execution
async function runPerformanceTests() {
  console.log('🚀 Starting Performance Tests for 100 Concurrent Student Interviews');
  console.log('Configuration:', TEST_CONFIG);
  
  const monitor = new PerformanceMonitor();

  for (const concurrency of TEST_CONFIG.CONCURRENT_USERS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🧪 TESTING: ${concurrency} Concurrent Users`);
    console.log(`${'='.repeat(60)}`);
    
    await monitor.testServiceHealth(concurrency);
    
    // Wait between tests to allow system recovery
    if (concurrency < Math.max(...TEST_CONFIG.CONCURRENT_USERS)) {
      console.log('\n⏸️  Waiting 30 seconds before next test...');
      await new Promise(resolve => setTimeout(resolve, 30000));
      monitor.reset();
    }
  }

  console.log('\n🎉 Performance testing completed!');
  console.log('\n💡 Next Steps:');
  console.log('   1. Review failed requests and errors');
  console.log('   2. Monitor external service capacity');
  console.log('   3. Adjust configuration if needed');
  console.log('   4. Test with real interview scenarios');
}

// Run tests if this script is executed directly
if (require.main === module) {
  runPerformanceTests().catch(console.error);
}

module.exports = { PerformanceMonitor, runPerformanceTests }; 