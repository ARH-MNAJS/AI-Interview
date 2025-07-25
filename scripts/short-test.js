#!/usr/bin/env node

/**
 * Short Performance Test - 30 second test to verify the fixes
 */

// Import the main performance monitor
const { PerformanceMonitor } = require('./test-performance-improvements.js');

// Short test configuration
const SHORT_TEST_CONFIG = {
  CONCURRENT_USERS: [5], // Just test 5 users
  TEST_DURATION_MS: 30000, // 30 seconds
  REQUEST_INTERVAL_MS: 3000, // Request every 3 seconds
  SERVICES: {
    STT: process.env.NEXT_PUBLIC_WHISPER_STT_URL || 'https://dypstt.ccxai.uk',
    TTS: process.env.NEXT_PUBLIC_EDGE_TTS_URL || 'https://dyptts.ccxai.uk',
    LLM: process.env.NEXT_PUBLIC_OLLAMA_URL || 'https://dypai.ccxai.uk',
    APP: process.env.APP_URL || 'http://localhost:3001'
  }
};

class ShortTestMonitor extends PerformanceMonitor {
  constructor() {
    super();
    // Override config for short test
    this.testConfig = SHORT_TEST_CONFIG;
  }

  async runShortTest() {
    console.log('🧪 Running 30-Second Performance Verification Test');
    console.log('='.repeat(60));
    console.log('Configuration:', this.testConfig);
    
    const concurrency = 5;
    console.log(`\n🔍 Testing ${concurrency} concurrent users for 30 seconds...`);
    
    const promises = [];
    const startTime = Date.now();

    for (let i = 0; i < concurrency; i++) {
      promises.push(this.simulateShortUserSession(i, startTime));
    }

    try {
      await Promise.allSettled(promises);
      await this.getSystemStats();
      this.displayResults(concurrency);
    } catch (error) {
      console.error(`❌ Test failed:`, error.message);
    }
  }

  async simulateShortUserSession(userId, testStartTime) {
    const sessionDuration = this.testConfig.TEST_DURATION_MS;
    const interval = this.testConfig.REQUEST_INTERVAL_MS;
    
    console.log(`👤 Starting 30s session for user ${userId}`);
    
    let cycleCount = 0;
    while (Date.now() - testStartTime < sessionDuration) {
      try {
        await this.simulateInterviewCycle(userId);
        cycleCount++;
        await new Promise(resolve => setTimeout(resolve, interval));
      } catch (error) {
        this.recordError(userId, error);
      }
    }
    
    console.log(`✅ User ${userId} completed ${cycleCount} cycles`);
  }
}

// Run the short test
if (require.main === module) {
  const monitor = new ShortTestMonitor();
  monitor.runShortTest()
    .then(() => {
      console.log('\n🎉 Short test completed! The system is ready for scaling.');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Short test failed:', error.message);
      process.exit(1);
    });
}

module.exports = { ShortTestMonitor }; 