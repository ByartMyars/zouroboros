/**
 * Main persona generator
 * 
 * Creates all files needed for a complete persona setup.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { PersonaConfig, PhaseResult } from '../types.js';
import { generateSOUL } from '../templates/soul.js';
import { generateIdentity } from '../templates/identity.js';
import { generatePrompt } from '../templates/prompt.js';
import { generateSafetyMarkdown } from '../templates/safety.js';

export interface GenerationOptions {
  outputDir: string;
  skipSOUL?: boolean;
  skipSkill?: boolean;
}

export async function generatePersona(
  config: PersonaConfig,
  options: GenerationOptions
): Promise<PhaseResult[]> {
  const results: PhaseResult[] = [];
  
  // Phase 1: Create directory structure
  const personaDir = join(options.outputDir, config.slug);
  mkdirSync(personaDir, { recursive: true });
  mkdirSync(join(personaDir, 'IDENTITY'), { recursive: true });
  
  results.push({
    phase: 1,
    name: 'Directory Structure',
    status: 'complete',
    output: personaDir,
  });

  // Phase 2: Generate SOUL.md
  if (!options.skipSOUL) {
    const soulContent = generateSOUL(config);
    writeFileSync(join(personaDir, 'SOUL.md'), soulContent);
    results.push({
      phase: 2,
      name: 'SOUL.md (Constitution)',
      status: 'complete',
    });
  } else {
    results.push({
      phase: 2,
      name: 'SOUL.md (Constitution)',
      status: 'skipped',
    });
  }

  // Phase 3: Generate IDENTITY.md
  const identityContent = generateIdentity(config);
  writeFileSync(join(personaDir, 'IDENTITY', `${config.slug}.md`), identityContent);
  results.push({
    phase: 3,
    name: 'IDENTITY.md (Presentation)',
    status: 'complete',
  });

  // Phase 4: Generate Safety Rules
  const safetyContent = generateSafetyMarkdown(config);
  writeFileSync(join(personaDir, 'SAFETY.md'), safetyContent);
  results.push({
    phase: 4,
    name: 'SAFETY.md (Guardrails)',
    status: 'complete',
  });

  // Phase 5: Generate Prompt
  const promptContent = generatePrompt(config);
  writeFileSync(join(personaDir, 'PROMPT.md'), promptContent);
  results.push({
    phase: 5,
    name: 'PROMPT.md (System Prompt)',
    status: 'complete',
  });

  // Phase 6: Create Skill Directory (optional)
  if (!options.skipSkill) {
    const skillDir = join(options.outputDir, '..', 'Skills', `${config.slug}-skill`);
    mkdirSync(skillDir, { recursive: true });
    mkdirSync(join(skillDir, 'scripts'), { recursive: true });
    
    // Create basic SKILL.md
    const skillContent = `---
name: ${config.slug}-skill
description: ${config.description}
compatibility: Created for Zo Computer
metadata:
  author: zo.computer
  version: 1.0.0
---

# ${config.name} Skill

${config.description}

## Quick Start

\`\`\`bash
cd Skills/${config.slug}-skill/scripts
bun ${config.slug}.ts --help
\`\`\`

## Capabilities

${config.capabilities.map(cap => `- ${cap}`).join('\n')}

${config.requiresApiKey ? `## API Keys

Required environment variable:
- \`${config.apiKeyName}\` — Add in Settings > Developers
` : ''}

## Safety

${config.safetyRules.slice(0, 3).map(rule => `- ${rule}`).join('\n')}

See \`SAFETY.md\` for complete rules.
`;
    
    writeFileSync(join(skillDir, 'SKILL.md'), skillContent);
    
    // Create basic script template
    const scriptContent = `#!/usr/bin/env bun
/**
 * ${config.name} Skill
 */

${config.requiresApiKey ? `const API_KEY = process.env.${config.apiKeyName};

if (!API_KEY) {
  console.error('❌ Error: ${config.apiKeyName} not set');
  console.error('Add it in Settings > Developers');
  process.exit(1);
}` : ''}

function help() {
  console.log(\`
${config.name} Skill

Usage: bun ${config.slug}.ts <command>

Commands:
  status    Check skill status
  help      Show this help
\`);
}

async function main() {
  const command = process.argv[2];
  
  if (!command || command === 'help') {
    help();
    return;
  }
  
  switch (command) {
    case 'status':
      console.log('✅ ${config.name} skill active');
      ${config.requiresApiKey ? `console.log('API Key:', API_KEY ? 'Set' : 'Missing');` : ''}
      break;
      
    default:
      console.error(\`Unknown command: \${command}\`);
      help();
      process.exit(1);
  }
}

main();
`;
    
    writeFileSync(join(skillDir, 'scripts', `${config.slug}.ts`), scriptContent);
    
    results.push({
      phase: 6,
      name: 'Skill Structure',
      status: 'complete',
      output: skillDir,
    });
  } else {
    results.push({
      phase: 6,
      name: 'Skill Structure',
      status: 'skipped',
    });
  }

  return results;
}
