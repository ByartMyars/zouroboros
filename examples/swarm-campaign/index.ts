#!/usr/bin/env bun
/**
 * Swarm Campaign Example
 * 
 * Demonstrates running a multi-agent orchestration campaign
 */

import { SwarmOrchestrator } from 'zouroboros-swarm';
import { readFileSync } from 'fs';

async function main() {
  console.log('🐝 Swarm Campaign Example\n');

  // Load campaign definition
  const campaign = JSON.parse(readFileSync('./campaign.json', 'utf-8'));
  
  console.log(`Campaign: ${campaign.name}`);
  console.log(`Description: ${campaign.description}`);
  console.log(`Tasks: ${campaign.tasks.length}\n`);

  // Show task dependencies
  console.log('Task DAG:');
  for (const task of campaign.tasks) {
    const deps = task.dependsOn?.join(', ') || 'none';
    console.log(`  ${task.id} → depends on: [${deps}]`);
  }
  console.log();

  // Initialize orchestrator
  const orchestrator = new SwarmOrchestrator({
    localConcurrency: campaign.config.localConcurrency,
    timeoutSeconds: campaign.config.timeoutSeconds,
    routingStrategy: campaign.config.routingStrategy,
    dagMode: campaign.config.dagMode,
  });

  // Run the campaign
  console.log('🚀 Running campaign...\n');
  
  const results = await orchestrator.run({
    tasks: campaign.tasks,
    onProgress: (progress) => {
      const bar = '█'.repeat(progress.percentComplete / 5).padEnd(20, '░');
      process.stdout.write(`\r  ${bar} ${progress.percentComplete}% (${progress.completed}/${progress.totalTasks})`);
    },
  });

  console.log('\n\n📊 Results:\n');

  let successCount = 0;
  let failedCount = 0;

  for (const result of results) {
    const icon = result.success ? '✅' : '❌';
    const status = result.success ? 'SUCCESS' : 'FAILED';
    console.log(`  ${icon} ${result.task.id} (${result.task.persona})`);
    console.log(`     Status: ${status}`);
    console.log(`     Duration: ${result.durationMs}ms`);
    
    if (result.success) {
      successCount++;
    } else {
      failedCount++;
      console.log(`     Error: ${result.error}`);
    }
    console.log();
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total: ${results.length} | ✅ ${successCount} | ❌ ${failedCount}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (failedCount === 0) {
    console.log('✨ Campaign completed successfully!');
    console.log('Results saved to ./results/');
  } else {
    console.log('⚠️  Some tasks failed. Check ./results/ for details.');
    process.exit(1);
  }
}

main().catch(console.error);