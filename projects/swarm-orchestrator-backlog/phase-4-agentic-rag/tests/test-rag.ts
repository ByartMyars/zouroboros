/**
 * Agentic RAG Integration Tests
 */

import { AgenticRAGClient, createRAGTool, AVAILABLE_SDKS } from '../src/mcp-rag-client';
import { MCPServerWrapper, createSwarmRAGIntegration } from '../src/mcp-server-wrapper';

async function runTests() {
  console.log('🧪 Running Agentic RAG Integration Tests\n');
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: Client instantiation
  try {
    const client = new AgenticRAGClient({
      enabled: true,
      sdks: ['claude-sdk', 'langchain'],
    });
    console.log('✅ Test 1: Client instantiation');
    passed++;
  } catch (e) {
    console.log('❌ Test 1: Client instantiation - FAILED:', e);
    failed++;
  }
  
  // Test 2: Client connection
  try {
    const client = new AgenticRAGClient({ enabled: true });
    const connected = await client.connect();
    if (connected) {
      console.log('✅ Test 2: Client connection');
      passed++;
    } else {
      console.log('❌ Test 2: Client connection - FAILED: Not connected');
      failed++;
    }
  } catch (e) {
    console.log('❌ Test 2: Client connection - FAILED:', e);
    failed++;
  }
  
  // Test 3: RAG search
  try {
    const client = new AgenticRAGClient({ enabled: true });
    await client.connect();
    
    const result = await client.search('Claude SDK messages create', { topK: 3 });
    if (result.success && result.results && result.results.length > 0) {
      console.log(`✅ Test 3: RAG search (${result.results.length} results, ${result.latencyMs}ms)`);
      passed++;
    } else {
      console.log('❌ Test 3: RAG search - FAILED: No results');
      failed++;
    }
  } catch (e) {
    console.log('❌ Test 3: RAG search - FAILED:', e);
    failed++;
  }
  
  // Test 4: RAG tool creation
  try {
    const tool = createRAGTool({ enabled: true });
    if (tool.name === 'rag_search' && tool.execute) {
      console.log('✅ Test 4: RAG tool creation');
      passed++;
    } else {
      console.log('❌ Test 4: RAG tool creation - FAILED: Invalid tool');
      failed++;
    }
  } catch (e) {
    console.log('❌ Test 4: RAG tool creation - FAILED:', e);
    failed++;
  }
  
  // Test 5: MCP server wrapper
  try {
    const server = new MCPServerWrapper({ autoStart: true });
    const started = await server.start();
    if (started) {
      console.log('✅ Test 5: MCP server wrapper');
      await server.stop();
      passed++;
    } else {
      console.log('❌ Test 5: MCP server wrapper - FAILED: Server not started');
      failed++;
    }
  } catch (e) {
    console.log('❌ Test 5: MCP server wrapper - FAILED:', e);
    failed++;
  }
  
  // Test 6: Swarm RAG integration
  try {
    const integration = createSwarmRAGIntegration({
      enabled: true,
      injectIntoContext: true,
    });
    
    const task = { id: 'test-1', prompt: 'Create a Claude message' };
    const enriched = integration.injectTool(task);
    
    if (enriched.tools && (enriched.tools as unknown[]).length > 0) {
      console.log('✅ Test 6: Swarm RAG integration');
      passed++;
    } else {
      console.log('❌ Test 6: Swarm RAG integration - FAILED: Tools not injected');
      failed++;
    }
  } catch (e) {
    console.log('❌ Test 6: Swarm RAG integration - FAILED:', e);
    failed++;
  }
  
  // Test 7: SDK availability
  try {
    if (AVAILABLE_SDKS.length > 10) {
      console.log(`✅ Test 7: SDK availability (${AVAILABLE_SDKS.length} SDKs)`);
      passed++;
    } else {
      console.log('❌ Test 7: SDK availability - FAILED: Not enough SDKs');
      failed++;
    }
  } catch (e) {
    console.log('❌ Test 7: SDK availability - FAILED:', e);
    failed++;
  }
  
  // Summary
  console.log(`\n═══════════════════════════════════════`);
  console.log(`Tests: ${passed} passed, ${failed} failed`);
  console.log(`═══════════════════════════════════════`);
  
  if (failed === 0) {
    console.log('🎉 All tests passed!\n');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed\n');
    process.exit(1);
  }
}

runTests().catch(console.error);
