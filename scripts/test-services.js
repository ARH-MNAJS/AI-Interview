#!/usr/bin/env node

/**
 * Service Testing Script for Open-Source AI Interview Platform
 * 
 * This script validates that all required services are running and properly configured:
 * - Edge TTS (localhost:5000)
 * - Whisper STT (localhost:5001) 
 * - Ollama LLM (localhost:11434)
 */

const https = require('https');
const http = require('http');

const SERVICES = {
  edgeTTS: {
    name: 'Edge TTS',
    url: 'https://dyptts.ccxai.uk',
    healthPath: '/health',
    testPath: '/synthesize',
    port: 5000,
    description: 'Text-to-Speech synthesis service'
  },
  whisperSTT: {
    name: 'Whisper STT',
    url: 'https://dypstt.ccxai.uk',
    healthPath: '/health', 
    testPath: '/transcribe',
    port: 5001,
    description: 'Speech-to-Text transcription service'
  },
  ollama: {
    name: 'Ollama LLM',
    url: 'https://dypai.ccxai.uk',
    healthPath: '/api/tags',
    testPath: '/api/chat',
    port: 11434,
    description: 'Large Language Model inference service'
  }
};

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });
    
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function testService(service) {
  console.log(`\n🔍 Testing ${service.name} (${service.description})`);
  console.log(`   URL: ${service.url}`);
  console.log(`   Port: ${service.port}`);
  
  try {
    // Test basic connectivity
    const response = await makeRequest(`${service.url}${service.healthPath}`);
    
    if (response.statusCode === 200) {
      console.log(`   ✅ ${service.name} is healthy`);
      
      // Parse response data if possible
      try {
        const data = JSON.parse(response.data);
        if (service.name === 'Ollama LLM' && data.models) {
          console.log(`   📦 Available models: ${data.models.map(m => m.name).slice(0, 3).join(', ')}${data.models.length > 3 ? '...' : ''}`);
          
          // Check if Gemma model is available
          const hasGemma = data.models.some(m => m.name.includes('gemma'));
          if (hasGemma) {
            console.log(`   ✅ Gemma model is available`);
          } else {
            console.log(`   ⚠️  Gemma model not found. Run: ollama pull gemma3:latest`);
          }
        }
      } catch (parseError) {
        // Non-JSON response is OK for some services
      }
      
      return true;
    } else {
      console.log(`   ❌ ${service.name} returned status ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ ${service.name} is not accessible: ${error.message}`);
    console.log(`   💡 Make sure the service is running on port ${service.port}`);
    return false;
  }
}

async function testFullPipeline() {
  console.log('\n🔄 Testing full conversation pipeline...');
  
  try {
    // Test TTS synthesis
    console.log('   1. Testing TTS synthesis...');
    const ttsResponse = await makeRequest(`${SERVICES.edgeTTS.url}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hello, this is a test.', voice_id: 'Lisa' })
    });
    
    if (ttsResponse.statusCode === 200) {
      console.log('   ✅ TTS synthesis working');
    } else {
      console.log('   ❌ TTS synthesis failed');
      return false;
    }
    
    // Test LLM chat
    console.log('   2. Testing LLM chat...');
    const llmResponse = await makeRequest(`${SERVICES.ollama.url}/api/chat`, {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma3:latest',
        messages: [{ role: 'user', content: 'Say hello in one word.' }],
        stream: false
      })
    });
    
    if (llmResponse.statusCode === 200) {
      try {
        const llmData = JSON.parse(llmResponse.data);
        console.log(`   ✅ LLM chat working: "${llmData.message?.content?.trim() || 'Response received'}"`);
      } catch {
        console.log('   ✅ LLM chat working');
      }
    } else {
      console.log('   ❌ LLM chat failed');
      return false;
    }
    
    console.log('   ✅ Full pipeline test passed!');
    return true;
    
  } catch (error) {
    console.log(`   ❌ Pipeline test failed: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 AI Interview Platform - Service Health Check');
  console.log('================================================');
  
  const results = [];
  
  // Test each service
  for (const [key, service] of Object.entries(SERVICES)) {
    const isHealthy = await testService(service);
    results.push({ name: service.name, healthy: isHealthy });
  }
  
  // Summary
  console.log('\n📊 Service Health Summary');
  console.log('=========================');
  
  const healthyCount = results.filter(r => r.healthy).length;
  const totalCount = results.length;
  
  results.forEach(result => {
    const status = result.healthy ? '✅' : '❌';
    console.log(`   ${status} ${result.name}`);
  });
  
  console.log(`\n🎯 Overall Status: ${healthyCount}/${totalCount} services healthy`);
  
  if (healthyCount === totalCount) {
    console.log('🎉 All services are running! Testing full pipeline...');
    const pipelineWorking = await testFullPipeline();
    
    if (pipelineWorking) {
      console.log('\n🎊 SUCCESS! Your AI Interview platform is ready to use.');
      console.log('\n🚀 Next steps:');
      console.log('   1. Start your Next.js application: npm run dev');
      console.log('   2. Open http://localhost:3000 in your browser');
      console.log('   3. Create an interview and test the voice conversation');
    } else {
      console.log('\n⚠️  Services are running but pipeline test failed.');
      console.log('   Check service configurations and try again.');
    }
  } else {
    console.log('\n❌ Some services are not running. Please start the missing services:');
    
    results.filter(r => !r.healthy).forEach(result => {
      const service = Object.values(SERVICES).find(s => s.name === result.name);
      console.log(`\n   ${result.name}:`);
      console.log(`   - Check if service is running on port ${service.port}`);
      console.log(`   - Service URL: ${service.url}`);
    });
    
    console.log('\n💡 Service setup instructions:');
    console.log('   Edge TTS: Set up according to your TTS service documentation');
    console.log('   Whisper STT: Set up according to your STT service documentation'); 
    console.log('   Ollama: Install Ollama and run "ollama pull gemma3:latest"');
  }
  
  process.exit(healthyCount === totalCount ? 0 : 1);
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Test script failed:', error);
    process.exit(1);
  });
}

module.exports = { testService, testFullPipeline, SERVICES }; 