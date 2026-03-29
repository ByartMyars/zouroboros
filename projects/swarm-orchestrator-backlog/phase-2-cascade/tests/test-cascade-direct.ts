/**
 * Cascade Mitigation Tests - Direct Import
 */

import { 
  CascadePolicy,
  analyzeCascade,
  createCascadeTask,
} from '../src/cascade-policy';
import { CascadeAwareExecutor } from '../src/dag-executor';
import { CascadeMonitor } from '../src/cascade-monitor';
import type { Task } from '../src/dag-executor';
import type { CascadeEvent } from '../src/dag-executor';

async function runTests() {
  console.log('🧪 Running Cascade Mitigation Tests\n');
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: Basic execution with no failures
  try {
    const executor1 = new CascadeAwareExecutor();
    const tasks1: Task[] = [
      {
        id: 'task-1',
        dependencies: [],
        execute: async () => ({ success: true, output: 'result-1' }),
      },
      {
        id: 'task-2',
        dependencies: ['task-1'],
        execute: async (ctx) => ({ success: true, output: `result-2: ${JSON.stringify(ctx)}` }),
      },
    ];
    
    const stats1 = await executor1.execute(tasks1);
    
    if (stats1.completed === 2 && stats1.failed === 0) {
      console.log('✅ Test 1: Basic execution - PASSED');
      passed++;
    } else {
      throw new Error(`Expected 2 completed, got ${stats1.completed}`);
    }
  } catch (e) {
    console.log('❌ Test 1: Basic execution - FAILED:', e);
    failed++;
  }
  
  // Test 2: Cascade abort
  try {
    const executor2 = new CascadeAwareExecutor();
    const tasks2: Task[] = [
      {
        id: 'root-fail',
        dependencies: [],
        execute: async () => ({ success: false, error: 'Root failure' }),
      },
      {
        id: 'dependent-1',
        dependencies: ['root-fail'],
        execute: async () => ({ success: true, output: 'should-not-run' }),
      },
    ];
    
    const stats2 = await executor2.execute(tasks2);
    
    if (stats2.completed === 0 && stats2.failed === 2) {
      console.log('✅ Test 2: Cascade abort - PASSED');
      passed++;
    } else {
      throw new Error(`Expected 0 completed, 2 failed. Got ${stats2.completed} completed, ${stats2.failed} failed`);
    }
  } catch (e) {
    console.log('❌ Test 2: Cascade abort - FAILED:', e);
    failed++;
  }
  
  // Test 3: Degrade policy
  try {
    const executor3 = new CascadeAwareExecutor();
    const tasks3: Task[] = [
      {
        id: 'failed-task',
        dependencies: [],
        execute: async () => ({ success: false, error: 'Partial failure' }),
      },
      {
        id: 'degraded-task',
        dependencies: ['failed-task'],
        execute: async (ctx) => ({ 
          success: true, 
          output: `ran with ${Object.keys(ctx).length} inputs`,
        }),
        policy: { onDependencyFailure: 'degrade' },
      },
    ];
    
    const stats3 = await executor3.execute(tasks3);
    const degradedResult = executor3.getResults().get('degraded-task');
    
    // Verify degraded execution:
    // - failed-task: success=false, degraded=undefined (counts as failed)
    // - degraded-task: success=true, degraded=true (counts as degraded)
    if (stats3.failed === 1 && stats3.degraded === 1 && degradedResult?.degraded) {
      console.log('✅ Test 3: Degrade policy - PASSED');
      passed++;
    } else {
      throw new Error(`Expected 1 failed, 1 degraded. Got ${stats3.failed} failed, ${stats3.degraded} degraded`);
    }
  } catch (e) {
    console.log('❌ Test 3: Degrade policy - FAILED:', e);
    failed++;
  }
  
  // Test 4: Cascade monitor
  try {
    const monitor = new CascadeMonitor();
    monitor.recordEvents([
      {
        timestamp: new Date(),
        taskId: 'task-2',
        failedDependencyId: 'task-1',
        policy: 'abort',
        decision: 'abort' as const,
        reason: 'Dependency failed',
      },
    ]);
    
    const report = monitor.generateReport();
    
    if (report.totalCascades >= 1) {
      console.log('✅ Test 4: Cascade monitor - PASSED');
      passed++;
    } else {
      throw new Error('Monitor did not generate expected report');
    }
  } catch (e) {
    console.log('❌ Test 4: Cascade monitor - FAILED:', e);
    failed++;
  }
  
  // Summary
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Tests: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  }
}

runTests().catch(console.error);
