#!/usr/bin/env bun
/**
 * CLI for spec-first interview
 * 
 * Usage: zouroboros-interview [--topic <topic>] [--request <request>] [--from <notes>]
 */

import { parseArgs } from 'util';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { scoreAmbiguity, generateSeedTemplate } from '../interview/ambiguity.js';

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    topic: { type: 'string', short: 't' },
    request: { type: 'string', short: 'r' },
    from: { type: 'string', short: 'f' },
    output: { type: 'string', short: 'o', default: '.' },
    help: { type: 'boolean', short: 'h' }
  },
  allowPositionals: true,
  strict: false
});

function printHelp() {
  console.log(`
zouroboros-interview — Socratic interview & seed specification generator

USAGE:
  zouroboros-interview [subcommand] [options]

SUBCOMMANDS:
  interview   Start or display interview prompts (default)
  seed        Generate a seed YAML from interview notes
  score       Score ambiguity of a request

OPTIONS:
  --topic, -t     Topic for interview
  --request, -r   Request text to score ambiguity
  --from, -f      Path to interview notes markdown file
  --output, -o    Output directory (default: current dir)
  --help, -h      Show this help

EXAMPLES:
  zouroboros-interview --topic "Build a webhook retry system"
  zouroboros-interview score --request "Make the site faster"
  zouroboros-interview seed --from ./interview-notes.md
`);
}

async function main() {
  if (values.help) {
    printHelp();
    process.exit(0);
  }

  const subcommand = positionals[0] || 'interview';

  switch (subcommand) {
    case 'score': {
      if (!values.request) {
        console.error('Error: --request is required for score subcommand');
        process.exit(1);
      }
      const score = scoreAmbiguity(values.request);
      console.log('\nAmbiguity Score:');
      console.log(`  Goal clarity:        ${(score.goal * 100).toFixed(0)}%`);
      console.log(`  Constraint clarity:  ${(score.constraints * 100).toFixed(0)}%`);
      console.log(`  Success criteria:    ${(score.success * 100).toFixed(0)}%`);
      console.log(`  Overall ambiguity:   ${(score.ambiguity * 100).toFixed(0)}%`);
      console.log(`\nAssessment: ${score.assessment}`);
      break;
    }

    case 'seed': {
      const seed = generateSeedTemplate(values.topic || 'Untitled', values.from);
      const outputPath = join(values.output!, `seed-${Date.now()}.yaml`);
      
      if (!existsSync(values.output!)) {
        mkdirSync(values.output!, { recursive: true });
      }
      
      writeFileSync(outputPath, seed);
      console.log(`✓ Seed specification written to: ${outputPath}`);
      break;
    }

    case 'interview':
    default: {
      console.log(`
╔════════════════════════════════════════════════════════════════╗
║          ZOUROBOROS SPEC-FIRST INTERVIEW                       ║
╠════════════════════════════════════════════════════════════════╣

${values.topic ? `Topic: ${values.topic}` : 'No topic specified. Use --topic to set.'}

The Socratic Interview Process:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Ask focused questions to clarify the goal
2. Probe constraints and limitations
3. Define measurable success criteria
4. Track ambiguity score

Interview passes when ambiguity ≤ 20% (80% clarity)

Key Questions to Ask:
─────────────────────
• What exactly are we building?
• What constraints must we respect?
• How will we know it's successful?
• What are we assuming?

After the interview, generate a seed:
  zouroboros-interview seed --topic "Your Topic" --from notes.md

`);
      break;
    }
  }
}

main().catch(console.error);
