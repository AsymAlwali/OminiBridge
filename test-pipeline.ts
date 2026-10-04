import { OmniBridge } from './packages/sdk-ts/src/index.js';
import app from './packages/core-api/src/index.js';

async function runTests() {
  console.log('🚀 Starting OmniBridge Integration Testing Matrix...\n');

  // 1. Initialize local SDK pointing to our local Hono setup
  const omni = new OmniBridge({
    apiKey: 'omni_test_secret_key_123',
    baseUrl: 'http://localhost:3000'
  });

  // 2. Test Case A: Human Mode Chat completion routing
  console.log('--- Test Case A: Human Mode Model Request ---');
  const humanResponse = await omni.complete({
    provider: 'openai',
    messages: [{ role: 'user', content: 'Generate a short onboarding message.' }],
    agentMode: false
  });
  console.log('Status:', humanResponse.success ? '✅ PASSED' : '❌ FAILED');
  console.log('Payload Type Registered:', humanResponse.identity);

  // 3. Test Case B: Agent Mode with Dynamic Schema Configuration
  console.log('\n--- Test Case B: Agent Mode Execution Request ---');
  const agentResponse = await omni.complete({
    provider: 'anthropic',
    messages: [{ role: 'user', content: 'Run automated background database cleanup sequence.' }],
    agentMode: true
  });
  console.log('Status:', agentResponse.success ? '✅ PASSED' : '❌ FAILED');
  console.log('Payload Type Registered:', agentResponse.identity);

  // 4. Test Case C: Live Web Search Grounding Extraction
  console.log('\n--- Test Case C: Unified Search Plug Request ---');
  const searchResponse = await omni.search({
    query: 'What are the top open source AI repositories in 2026?',
    engine: 'google',
    maxResults: 3
  });
  console.log('Status:', searchResponse.success ? '✅ PASSED' : '❌ FAILED');
  console.log('Engine Utilized:', searchResponse.engine);
  console.log('Sample Snippet:', searchResponse.results?.[0]?.snippet || 'Mock-data passed.');

  console.log('\n🏁 System Validation Completed.');
}

runTests().catch(console.error);
