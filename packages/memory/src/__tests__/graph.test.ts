import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  buildEntityGraph,
  getRelatedEntities,
  extractQueryEntities,
} from '../graph.js';
import { initDatabase, closeDatabase, getDatabase } from '../database.js';
import type { MemoryConfig } from 'zouroboros-core';

const TEST_CONFIG: MemoryConfig = {
  enabled: true,
  dbPath: ':memory:',
  vectorEnabled: false,
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'nomic-embed-text',
  autoCapture: false,
  captureIntervalMinutes: 30,
  graphBoost: false,
  hydeExpansion: false,
  decayConfig: { permanent: 99999, long: 365, medium: 90, short: 30 },
};

function seedTestData() {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);

  // Create episodes with linked entities
  db.run("INSERT INTO episodes (id, summary, outcome, happened_at) VALUES ('ep1', 'Deploy API', 'success', ?)", [now]);
  db.run("INSERT INTO episodes (id, summary, outcome, happened_at) VALUES ('ep2', 'Fix memory bug', 'success', ?)", [now]);
  db.run("INSERT INTO episodes (id, summary, outcome, happened_at) VALUES ('ep3', 'Optimize search', 'success', ?)", [now]);

  db.run("INSERT INTO episode_entities (episode_id, entity) VALUES ('ep1', 'API')");
  db.run("INSERT INTO episode_entities (episode_id, entity) VALUES ('ep1', 'Swarm')");
  db.run("INSERT INTO episode_entities (episode_id, entity) VALUES ('ep2', 'Memory')");
  db.run("INSERT INTO episode_entities (episode_id, entity) VALUES ('ep2', 'SQLite')");
  db.run("INSERT INTO episode_entities (episode_id, entity) VALUES ('ep3', 'Memory')");
  db.run("INSERT INTO episode_entities (episode_id, entity) VALUES ('ep3', 'Ollama')");

  // Create facts
  db.run("INSERT INTO facts (id, entity, value, text, created_at) VALUES ('f1', 'Memory', 'Uses SQLite', 'Memory Uses SQLite', ?)", [now]);
  db.run("INSERT INTO facts (id, entity, value, text, created_at) VALUES ('f2', 'Ollama', 'Runs embeddings', 'Ollama Runs embeddings', ?)", [now]);
  db.run("INSERT INTO facts (id, entity, value, text, created_at) VALUES ('f3', 'API', 'REST endpoints', 'API REST endpoints', ?)", [now]);
}

beforeEach(() => {
  initDatabase(TEST_CONFIG);
  seedTestData();
});

afterEach(() => {
  closeDatabase();
});

describe('buildEntityGraph', () => {
  test('finds all entities', () => {
    const graph = buildEntityGraph();
    const nodeIds = graph.nodes.map(n => n.id);
    expect(nodeIds).toContain('API');
    expect(nodeIds).toContain('Swarm');
    expect(nodeIds).toContain('Memory');
    expect(nodeIds).toContain('SQLite');
    expect(nodeIds).toContain('Ollama');
  });

  test('creates co-occurrence edges', () => {
    const graph = buildEntityGraph();
    expect(graph.edges.length).toBeGreaterThan(0);

    // API and Swarm co-occur in ep1
    const apiSwarm = graph.edges.find(
      e => (e.source === 'API' && e.target === 'Swarm') ||
           (e.source === 'Swarm' && e.target === 'API')
    );
    expect(apiSwarm).toBeDefined();
    expect(apiSwarm!.weight).toBe(1);

    // Memory and SQLite co-occur in ep2
    const memSql = graph.edges.find(
      e => (e.source === 'Memory' && e.target === 'SQLite') ||
           (e.source === 'SQLite' && e.target === 'Memory')
    );
    expect(memSql).toBeDefined();
  });
});

describe('getRelatedEntities', () => {
  test('finds directly connected entities', () => {
    const related = getRelatedEntities('Memory');
    const entities = related.map(r => r.entity);
    expect(entities).toContain('SQLite');
    expect(entities).toContain('Ollama');
  });

  test('scores closer entities higher', () => {
    const related = getRelatedEntities('Memory');
    // Direct neighbors should have higher scores than distant ones
    if (related.length > 1) {
      expect(related[0].score).toBeGreaterThanOrEqual(related[related.length - 1].score);
    }
  });

  test('respects depth limit', () => {
    const shallow = getRelatedEntities('API', { depth: 1 });
    const deep = getRelatedEntities('API', { depth: 3 });
    expect(deep.length).toBeGreaterThanOrEqual(shallow.length);
  });

  test('returns empty for isolated entity', () => {
    const db = getDatabase();
    db.run("INSERT INTO facts (id, entity, value, text) VALUES ('f99', 'Isolated', 'alone', 'Isolated alone')");
    const related = getRelatedEntities('Isolated');
    expect(related.length).toBe(0);
  });
});

describe('extractQueryEntities', () => {
  test('matches known entities from query', () => {
    const entities = extractQueryEntities('search Memory for SQLite facts');
    expect(entities).toContain('Memory');
  });

  test('returns empty for unrecognized terms', () => {
    const entities = extractQueryEntities('what is the meaning of life');
    expect(entities.length).toBe(0);
  });
});
