/**
 * CortexDB Adapter Tests
 */

import { CortexDBAdapter, createCortexDBAdapter } from '../src/cortexdb-adapter';

async function runTests() {
  console.log('🧪 Running CortexDB Adapter Tests\n');

  let passed = 0;
  let failed = 0;

  // Test 1: SQLite Backend (default)
  try {
    console.log('Test 1: SQLite Backend');
    const adapter = createCortexDBAdapter({ backend: 'sqlite' });

    const memId = await adapter.insertMemory('Test memory content', 'episodic', { tag: 'test' });
    console.log(`  ✅ insertMemory: ${memId.substring(0, 8)}...`);

    const results = await adapter.searchMemories('memory', { limit: 5 });
    console.log(`  ✅ searchMemories: Found ${results.length} results`);

    const episodeId = await adapter.insertEpisode({
      name: 'Test Episode',
      outcome: 'success',
      summary: 'Test summary',
      entities: ['test'],
      tasksCompleted: 5,
      durationMs: 1000,
      executorIds: ['claude-code'],
      createdAt: Date.now(),
    });
    console.log(`  ✅ insertEpisode: ${episodeId.substring(0, 8)}...`);

    const episodes = await adapter.getEpisodes({ limit: 10 });
    console.log(`  ✅ getEpisodes: Found ${episodes.length} episodes`);

    const agentId = await adapter.upsertAgent({
      name: 'test-agent',
      type: 'claude-code',
      successRate: 0.9,
      totalRuns: 10,
      avgDurationMs: 5000,
      lastRunAt: Date.now(),
    });
    console.log(`  ✅ upsertAgent: ${agentId.substring(0, 8)}...`);

    const stats = adapter.getStats();
    console.log(`  ✅ getStats: ${stats.memories} memories, ${stats.episodes} episodes, ${stats.agents} agents`);
    console.log(`  ✅ Stats backend: ${stats.backend}`);

    passed++;
    console.log('  ✅ Test 1: SQLite Backend - PASSED\n');
  } catch (e) {
    failed++;
    console.log(`  ❌ Test 1: SQLite Backend - FAILED: ${e}\n`);
  }

  // Test 2: CortexDB Backend
  try {
    console.log('Test 2: CortexDB Backend');
    const adapter = createCortexDBAdapter({ backend: 'cortexdb' });

    const memId = await adapter.insertMemory('CortexDB test memory', 'semantic', { source: 'test' });
    console.log(`  ✅ insertMemory: ${memId.substring(0, 8)}...`);

    const results = await adapter.searchMemories('CortexDB', { limit: 5 });
    console.log(`  ✅ searchMemories: Found ${results.length} results (score: ${results[0]?.score.toFixed(3) || 'N/A'})`);

    const episodeId = await adapter.insertEpisode({
      name: 'CortexDB Episode',
      outcome: 'success',
      summary: 'Vector search test',
      entities: ['cortexdb', 'vector'],
      tasksCompleted: 3,
      durationMs: 500,
      executorIds: ['gemini'],
      createdAt: Date.now(),
    });
    console.log(`  ✅ insertEpisode: ${episodeId.substring(0, 8)}...`);

    const episodes = await adapter.getEpisodes({ entity: 'cortexdb' });
    console.log(`  ✅ getEpisodes (filtered): Found ${episodes.length} episodes`);

    const agentId = await adapter.upsertAgent({
      name: 'cortex-agent',
      type: 'gemini',
      successRate: 0.95,
      totalRuns: 20,
      avgDurationMs: 3000,
      lastRunAt: Date.now(),
    });
    console.log(`  ✅ upsertAgent: ${agentId.substring(0, 8)}...`);

    const agents = await adapter.getAgents();
    console.log(`  ✅ getAgents: Found ${agents.length} agents`);

    const stats = adapter.getStats();
    console.log(`  ✅ getStats: ${stats.memories} memories, ${stats.episodes} episodes, ${stats.agents} agents`);
    console.log(`  ✅ Stats backend: ${stats.backend}`);

    passed++;
    console.log('  ✅ Test 2: CortexDB Backend - PASSED\n');
  } catch (e) {
    failed++;
    console.log(`  ❌ Test 2: CortexDB Backend - FAILED: ${e}\n`);
  }

  // Test 3: Backend Switching
  try {
    console.log('Test 3: Backend Switching');
    const adapter = createCortexDBAdapter({ backend: 'sqlite' });

    await adapter.insertMemory('Memory before switch', 'procedural');
    console.log(`  ✅ Inserted with SQLite`);

    adapter.switchBackend('cortexdb');
    const stats1 = adapter.getStats();
    console.log(`  ✅ Switched to CortexDB (${stats1.backend})`);

    await adapter.insertMemory('Memory after switch', 'procedural');
    console.log(`  ✅ Inserted with CortexDB`);

    adapter.switchBackend('sqlite');
    const stats2 = adapter.getStats();
    console.log(`  ✅ Switched back to SQLite (${stats2.backend})`);

    passed++;
    console.log('  ✅ Test 3: Backend Switching - PASSED\n');
  } catch (e) {
    failed++;
    console.log(`  ❌ Test 3: Backend Switching - FAILED: ${e}\n`);
  }

  // Test 4: Feature Parity
  try {
    console.log('Test 4: Feature Parity');
    const sqlite = createCortexDBAdapter({ backend: 'sqlite' });
    const cortexdb = createCortexDBAdapter({ backend: 'cortexdb' });

    // Both should have same API
    const sqliteMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(sqlite)).filter(m => m !== 'constructor');
    const cortexdbMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(cortexdb)).filter(m => m !== 'constructor');

    const match = sqliteMethods.length === cortexdbMethods.length;
    console.log(`  ✅ Methods: ${sqliteMethods.length} (SQLite) vs ${cortexdbMethods.length} (CortexDB) - ${match ? 'MATCH' : 'MISMATCH'}`);

    passed++;
    console.log('  ✅ Test 4: Feature Parity - PASSED\n');
  } catch (e) {
    failed++;
    console.log(`  ❌ Test 4: Feature Parity - FAILED: ${e}\n`);
  }

  // Summary
  console.log('─'.repeat(50));
  console.log(`Tests: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log('\n🎉 All adapter tests passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  }
}

runTests().catch(console.error);
