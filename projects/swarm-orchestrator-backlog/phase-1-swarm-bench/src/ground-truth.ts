/**
 * SWARM-bench: Ground Truth Comparison Engine
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Inline similarity functions
function levenshteinSimilarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(s1: string, s2: string): number {
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

export function jaccardSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  return intersection.size / union.size;
}

export class GroundTruthEngine {
  private baselineDir: string;
  
  constructor(baselineDir: string = './results/baselines') {
    this.baselineDir = baselineDir;
  }
  
  /**
   * Compare current output against baseline
   */
  compareWithBaseline(instanceId: string, currentOutput: string): {
    similarity: number;
    isRegression: boolean;
    details: string;
  } {
    const baselinePath = join(this.baselineDir, `${instanceId}-baseline.txt`);
    
    if (!existsSync(baselinePath)) {
      return {
        similarity: 0,
        isRegression: false,
        details: 'No baseline found - skipping comparison'
      };
    }
    
    const baselineOutput = readFileSync(baselinePath, 'utf-8');
    const similarity = levenshteinSimilarity(currentOutput, baselineOutput);
    
    return {
      similarity,
      isRegression: similarity < 0.8, // 80% threshold
      details: `Similarity: ${(similarity * 100).toFixed(0)}%`
    };
  }
}

export default GroundTruthEngine;
