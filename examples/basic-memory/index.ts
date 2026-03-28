#!/usr/bin/env bun
/**
 * Basic Memory Example
 * 
 * Demonstrates storing and retrieving facts from Zouroboros memory
 */

import { Memory } from 'zouroboros-memory';

async function main() {
  console.log('🧠 Basic Memory Example\n');

  // Initialize memory
  const memory = new Memory({
    dbPath: './memory.db',
  });

  // Store some facts
  console.log('Storing facts...');
  
  await memory.store({
    entity: 'user',
    key: 'name',
    value: 'Alice',
    category: 'preference',
    decayClass: 'permanent',
  });

  await memory.store({
    entity: 'user',
    key: 'favorite_language',
    value: 'TypeScript',
    category: 'preference',
    decayClass: 'permanent',
  });

  await memory.store({
    entity: 'project',
    key: 'name',
    value: 'Zouroboros Demo',
    category: 'fact',
    decayClass: 'active',
  });

  console.log('✅ Facts stored\n');

  // Search memory
  console.log('Searching memory...');
  
  const results = await memory.search({
    query: 'user preferences',
    limit: 10,
  });

  console.log(`Found ${results.length} results:\n`);
  
  for (const result of results) {
    console.log(`  📌 [[${result.entity}]].${result.key}`);
    console.log(`     ${result.value}`);
    console.log(`     Category: ${result.category} | Decay: ${result.decayClass}\n`);
  }

  // Store an episode
  console.log('Capturing episode...');
  
  await memory.captureEpisode({
    summary: 'User learned about Zouroboros memory system',
    outcome: 'success',
    entities: ['user', 'zouroboros', 'memory'],
  });

  console.log('✅ Episode captured\n');

  // Search episodes
  console.log('Searching episodes...');
  
  const episodes = await memory.searchEpisodes({
    entity: 'user',
    limit: 5,
  });

  console.log(`Found ${episodes.length} episodes:\n`);
  
  for (const episode of episodes) {
    console.log(`  📅 ${new Date(episode.happenedAt * 1000).toISOString()}`);
    console.log(`     ${episode.summary}`);
    console.log(`     Outcome: ${episode.outcome}\n`);
  }

  console.log('✨ Example complete!');
}

main().catch(console.error);