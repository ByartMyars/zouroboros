import { describe, test, expect, beforeEach } from 'bun:test';
import { SkillsMPClient } from '../skillsmp';

// Use a mock manifest for offline testing
const MOCK_MANIFEST = {
  tarball_url: 'https://example.com/skills.tar.gz',
  archive_root: 'skills-main',
  skills: [
    { slug: 'web-scraper', name: 'Web Scraper', description: 'Scrape web pages', author: 'alice', version: '1.0.0', tags: ['web', 'scraping'], stars: 42 },
    { slug: 'data-viz', name: 'Data Visualizer', description: 'Create charts and graphs', author: 'bob', version: '2.1.0', tags: ['data', 'visualization'], stars: 88 },
    { slug: 'code-review', name: 'Code Review', description: 'Automated code review tool', author: 'alice', version: '1.5.0', tags: ['code', 'review', 'quality'], stars: 65 },
    { slug: 'api-tester', name: 'API Tester', description: 'Test REST APIs', author: 'charlie', version: '3.0.0', tags: ['api', 'testing'], stars: 120 },
    { slug: 'web-monitor', name: 'Web Monitor', description: 'Monitor website uptime', author: 'bob', version: '1.0.0', tags: ['web', 'monitoring'], stars: 30 },
  ],
};

class MockSkillsMPClient extends SkillsMPClient {
  constructor() {
    super('https://example.com/manifest.json');
  }

  async fetchManifest() {
    (this as any).cachedManifest = MOCK_MANIFEST;
    (this as any).cacheExpiry = Date.now() + 300000;
    return MOCK_MANIFEST;
  }
}

describe('SkillsMPClient', () => {
  let client: MockSkillsMPClient;

  beforeEach(() => {
    client = new MockSkillsMPClient();
  });

  describe('search', () => {
    test('returns all skills without filters', async () => {
      const results = await client.search();
      expect(results.length).toBe(5);
    });

    test('filters by query string', async () => {
      const results = await client.search({ query: 'web' });
      expect(results.length).toBe(2); // web-scraper, web-monitor
    });

    test('filters by tags', async () => {
      const results = await client.search({ tags: ['testing'] });
      expect(results.length).toBe(1);
      expect(results[0].slug).toBe('api-tester');
    });

    test('filters by author', async () => {
      const results = await client.search({ author: 'alice' });
      expect(results.length).toBe(2);
    });

    test('sorts by stars', async () => {
      const results = await client.search({ sortBy: 'stars' });
      expect(results[0].slug).toBe('api-tester');
      expect(results[0].stars).toBe(120);
    });

    test('sorts by name', async () => {
      const results = await client.search({ sortBy: 'name' });
      expect(results[0].slug).toBe('api-tester');
    });

    test('limits results', async () => {
      const results = await client.search({ limit: 2 });
      expect(results.length).toBe(2);
    });

    test('combines filters', async () => {
      const results = await client.search({ query: 'web', author: 'bob' });
      expect(results.length).toBe(1);
      expect(results[0].slug).toBe('web-monitor');
    });
  });

  describe('getSkill', () => {
    test('returns skill by slug', async () => {
      const skill = await client.getSkill('data-viz');
      expect(skill).not.toBeNull();
      expect(skill!.name).toBe('Data Visualizer');
    });

    test('returns null for unknown slug', async () => {
      const skill = await client.getSkill('nonexistent');
      expect(skill).toBeNull();
    });
  });

  describe('caching', () => {
    test('uses cached manifest on subsequent calls', async () => {
      await client.search();
      // Second call should use cache
      const results = await client.search({ query: 'api-tester' });
      expect(results.length).toBe(1);
    });
  });
});
