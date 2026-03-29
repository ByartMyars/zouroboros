/**
 * Cascade Mitigation Tests
 */

import { 
  CascadeAwareExecutor, 
  CascadeMonitor,
  type Task,
} from '../src/index';

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
        execute: async (ctx) => ({ success: true, output: `result-2: ${ctx['task-1']}` }),
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
      {
        id: 'dependent-2',
        dependencies: ['dependent-1'],
        execute: async () => ({ success: true, output: 'also-should-not-run' }),
      },
    ];
    
    const stats2 = await executor2.execute(tasks2);
    
    if (stats2.completed === 0 && stats2.failed === 3) {
      console.log('✅ Test 2: Cascade abort - PASSED');
      passed++;
    } else {
      throw new Error(`Expected 0 completed, 3 failed. Got ${stats2.completed} completed, ${stats2.failed} failed`);
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
          degraded: (ctx as any)['_degradedContext'] !== undefined,
        }),
        policy: { onDependencyFailure: 'degrade' },
      },
    ];
    
    const stats3 = await executor3.execute(tasks3);
    const degradedResult = executor3.getResults().get('degraded-task');
    
    if (stats3.completed === 1 && stats3.degraded === 1 && degradedResult?.degraded) {
      console.log('✅ Test 3: Degrade policy - PASSED');
      passed++;
    } else {
      throw new Error(`Expected 1 degraded task. Got ${stats3.degraded} degraded`);
    }
  } catch (e) {
    console.log('❌ Test 3: Degrade policy - FAILED:', e);
    failed++;
  }
  
  // Test 4: Skip policy
  try {
    const executor4 = new CascadeAwareExecutor();
    const tasks4: Task[] = [
      {
        id: 'skipped-fail',
        dependencies: [],
        execute: async () => ({ success: false, error: 'Will fail' }),
      },
      {
        id: 'skipped-success',
        dependencies: ['skipped-fail'],
        execute: async () => ({ success: true, output: 'ran anyway' }),
        policy: { onDependencyFailure: 'skip' },
      },
    ];
    
    const stats4 = await executor4.execute(tasks4);
    
    if (stats4.completed === 1 && stats4.failed === 1) {
      console.log('✅ Test 4: Skip policy - PASSED');
      passed++;
    } else {
      throw new Error(`Expected 1 completed, 1 failed. Got ${stats4.completed} completed, ${stats4.failed} failed`);
    }
  } catch (e) {
    console.log('❌ Test 4: Skip policy - FAILED:', e);
    failed++;
  }
  
  // Test 5: Cascade monitor
  try {
    const monitor = new CascadeMonitor();
    monitor.recordEvents([
      {
        timestamp: new Date(),
        taskId: 'task-2',
        failedDependencyId: 'task-1',
        policy: 'abort',
        decision: 'abort',
        reason: 'Dependency failed',
      },
      {
        timestamp: new Date(),
        taskId: 'task-3',
        failedDependencyId: 'task-1',
        policy: 'degrade',
        decision: 'execute',
        reason: 'Degraded due to task-1 failure',
      },
    ]);
    
    const report = monitor.generateReport();
    
    if (report.totalCascades >= 1 && report.recommendations.length > 0) {
      console.log('✅ Test 5: Cascade monitor - PASSED');
      console.log(`   Recommendations: ${report.recommendations.length}`);
      passed++;
    } else {
      throw new Error('Monitor did not generate expected report');
    }
  } catch (e) {
    console.log('❌ Test 5: Cascade monitor - FAILED:', e);
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
