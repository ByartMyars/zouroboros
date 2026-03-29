/**
 * SWARM-bench: Schema Validation Test
 * 
 * Validates all benchmark instances conform to the schema.
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { parseArgs } from 'util';

const SCHEMA_TYPES = [
  'code-generation',
  'code-review',
  'refactoring',
  'bug-fix',
  'documentation',
  'test-generation',
  'analysis',
  'multi-file',
  'cross-repo'
];

const DIFFICULTY_LEVELS = ['easy', 'medium', 'hard', 'expert'];

const AC_TYPES = [
  'file-exists',
  'file-not-exists',
  'content-match',
  'content-contains',
  'content-regex',
  'output-contains',
  'output-regex',
  'schema-valid',
  'command-exec',
  'no-error-pattern',
  'all-of',
  'any-of'
];

interface ValidationError {
  file: string;
  field: string;
  message: string;
}

async function main() {
  const benchmarksDir = join(__dirname, '../benchmarks');
  const files = readdirSync(benchmarksDir).filter(f => f.endsWith('.json'));
  
  console.log(`\n🔍 Validating ${files.length} benchmark instances...\n`);
  
  const errors: ValidationError[] = [];
  let valid = 0;
  
  for (const file of files) {
    const path = join(benchmarksDir, file);
    const content = readFileSync(path, 'utf-8');
    let instance: any;
    
    try {
      instance = JSON.parse(content);
    } catch (e) {
      errors.push({ file, field: 'json', message: 'Invalid JSON' });
      continue;
    }
    
    // Required fields
    if (!instance.id) errors.push({ file, field: 'id', message: 'Missing required field' });
    if (!instance.name) errors.push({ file, field: 'name', message: 'Missing required field' });
    if (!instance.category) errors.push({ file, field: 'category', message: 'Missing required field' });
    if (!instance.difficulty) errors.push({ file, field: 'difficulty', message: 'Missing required field' });
    if (!instance.task) errors.push({ file, field: 'task', message: 'Missing required field' });
    if (!instance.task?.prompt) errors.push({ file, field: 'task.prompt', message: 'Missing required field' });
    if (!instance.acceptanceCriteria) errors.push({ file, field: 'acceptanceCriteria', message: 'Missing required field' });
    if (!instance.metadata) errors.push({ file, field: 'metadata', message: 'Missing required field' });
    
    // Type checks
    if (instance.category && !SCHEMA_TYPES.includes(instance.category)) {
      errors.push({ file, field: 'category', message: `Invalid category: ${instance.category}` });
    }
    
    if (instance.difficulty && !DIFFICULTY_LEVELS.includes(instance.difficulty)) {
      errors.push({ file, field: 'difficulty', message: `Invalid difficulty: ${instance.difficulty}` });
    }
    
    // AC validation
    if (instance.acceptanceCriteria) {
      if (!Array.isArray(instance.acceptanceCriteria)) {
        errors.push({ file, field: 'acceptanceCriteria', message: 'Must be an array' });
      } else {
        instance.acceptanceCriteria.forEach((ac: any, i: number) => {
          if (!ac.id) errors.push({ file, field: `AC[${i}].id`, message: 'Missing AC id' });
          if (!ac.type) errors.push({ file, field: `AC[${i}].type`, message: 'Missing AC type' });
          if (ac.type && !AC_TYPES.includes(ac.type)) {
            errors.push({ file, field: `AC[${i}].type`, message: `Invalid AC type: ${ac.type}` });
          }
        });
      }
    }
    
    if (errors.filter(e => e.file === file).length === 0) {
      console.log(`  ✅ ${file}`);
      valid++;
    }
  }
  
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${valid}/${files.length} valid`);
  
  if (errors.length > 0) {
    console.log(`\n❌ ${errors.length} errors found:\n`);
    errors.forEach(e => {
      console.log(`  ${e.file}: ${e.field} — ${e.message}`);
    });
    process.exit(1);
  } else {
    console.log(`\n✅ All benchmarks are valid!`);
  }
}

main().catch(console.error);
