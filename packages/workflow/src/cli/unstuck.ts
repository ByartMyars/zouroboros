#!/usr/bin/env bun
/**
 * CLI for unstuck lateral thinking
 * 
 * Usage: zouroboros-unstuck [--problem <problem>] [--persona <persona>]
 */

import { parseArgs } from 'util';
import { autoSelectPersona, getStrategy, getAllPersonas, STRATEGIES } from '../unstuck/strategies.js';
import type { UnstuckPersona } from '../unstuck/types.js';

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    problem: { type: 'string', short: 'p' },
    persona: { type: 'string' },
    list: { type: 'boolean', short: 'l' },
    help: { type: 'boolean', short: 'h' }
  },
  strict: false
});

function printHelp() {
  console.log(`
zouroboros-unstuck — Lateral thinking toolkit for breaking stagnation

USAGE:
  zouroboros-unstuck --problem "I'm stuck because..."
  zouroboros-unstuck --problem "..." --persona hacker
  zouroboros-unstuck --list

OPTIONS:
  --problem, -p   Describe what you're stuck on
  --persona       Specific persona to use (hacker|researcher|simplifier|architect|contrarian)
  --list, -l      List all available personas
  --help, -h      Show this help

PERSONAS:
  hacker      — Find workarounds and bypasses for constraints
  researcher  — Stop coding, investigate the root cause
  simplifier  — Cut scope to the essential MVP
  architect   — Fix structural problems in the codebase
  contrarian  — Question assumptions and reframe the problem

EXAMPLES:
  zouroboros-unstuck --problem "The API keeps returning 403 errors"
  zouroboros-unstuck --problem "This refactor touches 20 files" --persona architect
  zouroboros-unstuck --list
`);
}

function printPersona(persona: UnstuckPersona) {
  const strategy = getStrategy(persona);
  
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  ${strategy.name.toUpperCase().padEnd(61)}║
╠════════════════════════════════════════════════════════════════╣

Philosophy:
  ${strategy.philosophy}

Approach:
${strategy.approach.map(step => `  • ${step}`).join('\n')}

Best For:
${strategy.bestFor.map(use => `  • ${use}`).join('\n')}

`);
}

async function main() {
  if (values.help) {
    printHelp();
    process.exit(0);
  }

  // List all personas
  if (values.list) {
    console.log('\nAvailable Unstuck Personas:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    for (const key of getAllPersonas()) {
      const strategy = getStrategy(key);
      console.log(`${key.padEnd(12)} — ${strategy.philosophy.substring(0, 50)}...`);
    }
    console.log('');
    process.exit(0);
  }

  // Require problem
  if (!values.problem) {
    console.error('Error: --problem is required (describe what you\'re stuck on)');
    console.log('\nTip: Use --list to see available personas');
    process.exit(1);
  }

  // Determine persona
  let persona: UnstuckPersona;
  
  if (values.persona) {
    const validPersonas = getAllPersonas();
    if (!validPersonas.includes(values.persona as UnstuckPersona)) {
      console.error(`Error: Unknown persona "${values.persona}"`);
      console.log(`Valid personas: ${validPersonas.join(', ')}`);
      process.exit(1);
    }
    persona = values.persona as UnstuckPersona;
  } else {
    // Auto-select based on problem
    const selection = autoSelectPersona(values.problem);
    persona = selection.persona;
    
    console.log(`\n🎯 Auto-selected persona: ${persona} (${(selection.confidence * 100).toFixed(0)}% confidence)`);
    if (selection.signals.length > 0) {
      console.log(`   Detected signals: ${selection.signals.join(', ')}`);
    }
    console.log('');
  }

  // Print persona guidance
  printPersona(persona);

  // Print problem-specific advice
  console.log('Application to Your Problem:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const strategy = getStrategy(persona);
  
  console.log(`Given: "${values.problem}"\n`);
  console.log('Try this:');
  
  switch (persona) {
    case 'hacker':
      console.log('  1. List every constraint blocking you (technical, time, budget)');
      console.log('  2. For each: Is this truly required? What happens if you ignore it?');
      console.log('  3. Look for edge cases: when does the constraint NOT apply?');
      console.log('  4. Can you solve a different but related problem?');
      break;
      
    case 'researcher':
      console.log('  1. Write down exactly what you don\'t understand');
      console.log('  2. Read the official docs (not Stack Overflow)');
      console.log('  3. Create a minimal test case that reproduces the issue');
      console.log('  4. Check version numbers and changelogs');
      break;
      
    case 'simplifier':
      console.log('  1. List every component/feature in your current plan');
      console.log('  2. For each: "What breaks if we remove this?"');
      console.log('  3. Find the 1-thing version that solves the core problem');
      console.log('  4. Implement that first, then add back if needed');
      break;
      
    case 'architect':
      console.log('  1. Map which files/modules depend on the change area');
      console.log('  2. Identify if the problem is structural (coupling) or localized');
      console.log('  3. Ask: What minimal abstraction would make this change trivial?');
      console.log('  4. Consider: Is a refactor prerequisite to this feature?');
      break;
      
    case 'contrarian':
      console.log('  1. List all assumptions you\'re making about this problem');
      console.log('  2. For each: What if the opposite were true?');
      console.log('  3. Question: Is this the root problem or a symptom?');
      console.log('  4. Consider: What would happen if you did nothing?');
      break;
  }
  
  console.log('\n');
}

main().catch(console.error);
