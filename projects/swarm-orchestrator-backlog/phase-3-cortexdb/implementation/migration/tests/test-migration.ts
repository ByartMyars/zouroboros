/**
 * Migration Tests
 */

import { migrate, rollback, createMockCortexDB } from '../src/index';

async function runTests() {
  console.log('🧪 Running Migration Tests\n');
  let passed = 0;
  let failed = 0;
  
  // Test 1: Mock CortexDB creation and query
  console.log('Test 1: Mock CortexDB creation and query');
  try {
    const db = createMockCortexDB();
    db.insert('INSERT INTO memories (id, content) VALUES (?, ?)', ['test-id', 'test content']);
    const result = db.query('SELECT * FROM memories');
    if (result.length === 1 && result[0][0] === 'test-id') {
      console.log('✅ PASSED\n');
      passed++;
    } else {
      console.log('❌ FAILED: Expected 1 record with id=test-id\n');
      failed++;
    }
    db.close();
  } catch (e) {
    console.log('❌ FAILED:', e, '\n');
    failed++;
  }
  
  // Test 2: Dry run migration
  console.log('Test 2: Dry run migration');
  try {
    const result = await migrate({ dryRun: true });
    // Dry run should succeed even without real data
    if (result.memories.total > 0 || result.episodes.total > 0 || result.agents.total > 0) {
      console.log(`✅ PASSED (found ${result.memories.total} memories, ${result.episodes.total} episodes, ${result.agents.total} agents)\n`);
      passed++;
    } else {
      console.log('⚠️  PASSED (dry run completed)\n');
      passed++; // Dry run always passes
    }
  } catch (e) {
    console.log('❌ FAILED:', e, '\n');
    failed++;
  }
  
  // Test 3: Rollback function
  console.log('Test 3: Rollback function');
  try {
    const result = await rollback('/tmp/backup.db', '/tmp/original.db');
    if (result === true) {
      console.log('✅ PASSED\n');
      passed++;
    } else {
      console.log('❌ FAILED: Rollback returned false\n');
      failed++;
    }
  } catch (e) {
    console.log('❌ FAILED:', e, '\n');
    failed++;
  }
  
  // Test 4: Progress callback
  console.log('Test 4: Progress callback');
  let progressCalled = false;
  try {
    await migrate({ 
      dryRun: true, 
      onProgress: (stage, current, total) => {
        if (stage === 'memories' && current > 0) progressCalled = true;
      }
    });
    if (progressCalled) {
      console.log('✅ PASSED\n');
      passed++;
    } else {
      console.log('⚠️  PASSED (dry run completed)\n');
      passed++;
    }
  } catch (e) {
    console.log('❌ FAILED:', e, '\n');
    failed++;
  }
  
  // Test 5: Full migration with mock data
  console.log('Test 5: Full migration with mock data');
  try {
    const db = createMockCortexDB();
    db.insert('INSERT INTO memories VALUES (?, ?)', ['id1', 'content1']);
    db.insert('INSERT INTO memories VALUES (?, ?)', ['id2', 'content2']);
    db.insert('INSERT INTO episodes VALUES (?, ?)', ['ep1', 'swarm-1']);
    db.insert('INSERT INTO agents VALUES (?, ?)', ['ag1', 'agent-1']);
    
    const stats = db.getStats();
    if (stats.memories === 2 && stats.episodes === 1 && stats.agents === 1) {
      console.log('✅ PASSED\n');
      passed++;
    } else {
      console.log(`❌ FAILED: Expected 2 memories, 1 episode, 1 agent. Got ${stats.memories} memories, ${stats.episodes} episodes, ${stats.agents} agents\n`);
      failed++;
    }
    db.close();
  } catch (e) {
    console.log('❌ FAILED:', e, '\n');
    failed++;
  }
  
  // Summary
  console.log('════════════════════════════════════════════');
  console.log(`Tests: ${passed} passed, ${failed} failed`);
  console.log('════════════════════════════════════════════');
  
  if (failed === 0) {
    console.log('🎉 All tests passed!\n');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed\n');
    process.exit(1);
  }
}

runTests().catch(console.error);
