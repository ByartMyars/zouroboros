#!/usr/bin/env bun
/**
 * graph.ts — Knowledge Graph CLI for zo-memory-system
 *
 * Commands:
 *   link              Create a link between two facts
 *   unlink            Remove a link between two facts
 *   show              Show all links for an entity or fact
 *   find-connections  BFS path finding between two entities
 *   knowledge-gaps    Orphan & cluster analysis
 */

import { Database } from "bun:sqlite";
import { getMemoryDbPath } from "zouroboros-core";

const DB_PATH = getMemoryDbPath();

function getDb(): Database {
  const db = new Database(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  // Ensure fact_links table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS fact_links (
      source_id TEXT NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
      relation TEXT NOT NULL DEFAULT 'related',
      weight REAL DEFAULT 1.0,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      PRIMARY KEY (source_id, target_id, relation)
    );
    CREATE INDEX IF NOT EXISTS idx_fact_links_source ON fact_links(source_id);
    CREATE INDEX IF NOT EXISTS idx_fact_links_target ON fact_links(target_id);
  `);
  return db;
}

// --- Link Management ---

function link(db: Database, sourceId: string, targetId: string, relation: string, weight: number): void {
  // Validate both facts exist
  const source = db.prepare("SELECT id, entity, key, value FROM facts WHERE id = ?").get(sourceId) as any;
  const target = db.prepare("SELECT id, entity, key, value FROM facts WHERE id = ?").get(targetId) as any;

  if (!source) { console.error(`Source fact not found: ${sourceId}`); process.exit(1); }
  if (!target) { console.error(`Target fact not found: ${targetId}`); process.exit(1); }

  db.prepare(`
    INSERT OR REPLACE INTO fact_links (source_id, target_id, relation, weight)
    VALUES (?, ?, ?, ?)
  `).run(sourceId, targetId, relation, weight);

  console.log(`Linked: [${source.entity}.${source.key || "_"}] --${relation}--> [${target.entity}.${target.key || "_"}]`);
  console.log(`  weight: ${weight}`);
}

function unlink(db: Database, sourceId: string, targetId: string, relation?: string): void {
  if (relation) {
    db.prepare("DELETE FROM fact_links WHERE source_id = ? AND target_id = ? AND relation = ?")
      .run(sourceId, targetId, relation);
  } else {
    db.prepare("DELETE FROM fact_links WHERE source_id = ? AND target_id = ?")
      .run(sourceId, targetId);
  }
  console.log(`Unlinked: ${sourceId} --> ${targetId}${relation ? ` (${relation})` : " (all relations)"}`);
}

function show(db: Database, entityOrId: string): void {
  // Try as fact ID first
  const fact = db.prepare("SELECT id, entity, key, value FROM facts WHERE id = ?").get(entityOrId) as any;

  let factIds: string[];
  if (fact) {
    factIds = [fact.id];
    console.log(`Links for fact: [${fact.entity}.${fact.key || "_"}] ${fact.value.slice(0, 60)}\n`);
  } else {
    // Treat as entity name — find all facts for this entity
    const facts = db.prepare("SELECT id, entity, key, value FROM facts WHERE entity = ?").all(entityOrId) as any[];
    if (facts.length === 0) {
      console.log(`No facts found for entity or ID: ${entityOrId}`);
      return;
    }
    factIds = facts.map((f: any) => f.id);
    console.log(`Links for entity: ${entityOrId} (${facts.length} facts)\n`);
  }

  const placeholders = factIds.map(() => "?").join(",");

  // Outbound links
  const outbound = db.prepare(`
    SELECT fl.*, f.entity as target_entity, f.key as target_key, f.value as target_value
    FROM fact_links fl
    JOIN facts f ON fl.target_id = f.id
    WHERE fl.source_id IN (${placeholders})
    ORDER BY fl.weight DESC
  `).all(...factIds) as any[];

  // Inbound links
  const inbound = db.prepare(`
    SELECT fl.*, f.entity as source_entity, f.key as source_key, f.value as source_value
    FROM fact_links fl
    JOIN facts f ON fl.source_id = f.id
    WHERE fl.target_id IN (${placeholders})
    ORDER BY fl.weight DESC
  `).all(...factIds) as any[];

  if (outbound.length === 0 && inbound.length === 0) {
    console.log("  No links found.");
    return;
  }

  if (outbound.length > 0) {
    console.log(`Outbound (${outbound.length}):`);
    for (const link of outbound) {
      console.log(`  --${link.relation}--> [${link.target_entity}.${link.target_key || "_"}] ${(link.target_value as string).slice(0, 60)} (w=${link.weight})`);
    }
  }

  if (inbound.length > 0) {
    console.log(`\nInbound (${inbound.length}):`);
    for (const link of inbound) {
      console.log(`  <--${link.relation}-- [${link.source_entity}.${link.source_key || "_"}] ${(link.source_value as string).slice(0, 60)} (w=${link.weight})`);
    }
  }
}

// --- BFS Path Finding ---

interface PathNode {
  factId: string;
  entity: string;
  key: string | null;
  value: string;
  relation?: string;
  direction?: "forward" | "backward";
}

function findConnections(db: Database, fromEntity: string, toEntity: string, maxDepth: number = 5): void {
  // Get all fact IDs for the source and target entities
  const fromFacts = db.prepare("SELECT id, entity, key, value FROM facts WHERE entity = ?").all(fromEntity) as any[];
  const toFacts = db.prepare("SELECT id, entity, key, value FROM facts WHERE entity = ?").all(toEntity) as any[];

  if (fromFacts.length === 0) {
    console.log(`No facts found for entity: ${fromEntity}`);
    return;
  }
  if (toFacts.length === 0) {
    console.log(`No facts found for entity: ${toEntity}`);
    return;
  }

  const targetIds = new Set(toFacts.map((f: any) => f.id));

  // BFS
  const visited = new Set<string>();
  const parent = new Map<string, { from: string; relation: string; direction: string }>();
  const queue: Array<{ id: string; depth: number }> = [];

  // Seed with all source entity facts
  for (const f of fromFacts) {
    queue.push({ id: f.id, depth: 0 });
    visited.add(f.id);
  }

  // Preload all links into memory for fast traversal
  const allLinks = db.prepare("SELECT source_id, target_id, relation, weight FROM fact_links").all() as any[];
  const adjacency = new Map<string, Array<{ neighbor: string; relation: string; direction: string }>>();

  for (const link of allLinks) {
    // Forward: source -> target
    if (!adjacency.has(link.source_id)) adjacency.set(link.source_id, []);
    adjacency.get(link.source_id)!.push({ neighbor: link.target_id, relation: link.relation, direction: "forward" });

    // Backward: target -> source (bidirectional traversal)
    if (!adjacency.has(link.target_id)) adjacency.set(link.target_id, []);
    adjacency.get(link.target_id)!.push({ neighbor: link.source_id, relation: link.relation, direction: "backward" });
  }

  let found: string | null = null;

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (targetIds.has(current.id)) {
      found = current.id;
      break;
    }

    if (current.depth >= maxDepth) continue;

    const neighbors = adjacency.get(current.id) || [];
    for (const { neighbor, relation, direction } of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        parent.set(neighbor, { from: current.id, relation, direction });
        queue.push({ id: neighbor, depth: current.depth + 1 });
      }
    }
  }

  if (!found) {
    console.log(`No connection found between "${fromEntity}" and "${toEntity}" (max depth: ${maxDepth})`);

    // Show direct neighbors for each
    const fromNeighborCount = fromFacts.reduce((sum: number, f: any) => sum + (adjacency.get(f.id)?.length || 0), 0);
    const toNeighborCount = toFacts.reduce((sum: number, f: any) => sum + (adjacency.get(f.id)?.length || 0), 0);
    console.log(`\nDirect connections for "${fromEntity}": ${fromNeighborCount} links`);
    console.log(`Direct connections for "${toEntity}": ${toNeighborCount} links`);
    return;
  }

  // Reconstruct path
  const path: PathNode[] = [];
  let current = found;

  while (current) {
    const fact = db.prepare("SELECT id, entity, key, value FROM facts WHERE id = ?").get(current) as any;
    const parentInfo = parent.get(current);

    path.unshift({
      factId: fact.id,
      entity: fact.entity,
      key: fact.key,
      value: fact.value,
      relation: parentInfo?.relation,
      direction: parentInfo?.direction as "forward" | "backward" | undefined,
    });

    current = parentInfo?.from || "";
    if (!parent.has(current) && !fromFacts.some((f: any) => f.id === current)) break;
    if (fromFacts.some((f: any) => f.id === current)) {
      const startFact = db.prepare("SELECT id, entity, key, value FROM facts WHERE id = ?").get(current) as any;
      path.unshift({
        factId: startFact.id,
        entity: startFact.entity,
        key: startFact.key,
        value: startFact.value,
      });
      break;
    }
  }

  console.log(`Path found (${path.length - 1} hops):\n`);
  for (let i = 0; i < path.length; i++) {
    const node = path[i];
    console.log(`  [${node.entity}.${node.key || "_"}] "${node.value.slice(0, 60)}"`);

    if (i < path.length - 1) {
      const next = path[i + 1];
      const arrow = next.direction === "backward" ? "<--" : "-->";
      console.log(`    ${arrow}${next.relation}${arrow === "<--" ? "--" : ""}`);
    }
  }
}

// --- Knowledge Gaps Analysis ---

function knowledgeGaps(db: Database): void {
  const allFacts = db.prepare("SELECT id, entity, key, value FROM facts").all() as any[];
  const allLinks = db.prepare("SELECT source_id, target_id, relation FROM fact_links").all() as any[];

  const totalFacts = allFacts.length;

  // Build adjacency (undirected)
  const adj = new Map<string, Set<string>>();
  const inbound = new Map<string, number>();
  const outbound = new Map<string, number>();

  for (const fact of allFacts) {
    adj.set(fact.id, new Set());
    inbound.set(fact.id, 0);
    outbound.set(fact.id, 0);
  }

  for (const link of allLinks) {
    adj.get(link.source_id)?.add(link.target_id);
    adj.get(link.target_id)?.add(link.source_id);
    outbound.set(link.source_id, (outbound.get(link.source_id) || 0) + 1);
    inbound.set(link.target_id, (inbound.get(link.target_id) || 0) + 1);
  }

  // Classify facts
  const orphans: any[] = [];
  const deadEnds: any[] = [];
  const weaklyLinked: any[] = [];
  const linkedFacts = new Set<string>();

  for (const fact of allFacts) {
    const neighbors = adj.get(fact.id)!;
    const inCount = inbound.get(fact.id) || 0;
    const outCount = outbound.get(fact.id) || 0;

    if (neighbors.size === 0) {
      orphans.push(fact);
    } else {
      linkedFacts.add(fact.id);
      if (inCount > 0 && outCount === 0) {
        deadEnds.push({ ...fact, inCount, outCount });
      }
      if (neighbors.size === 1) {
        weaklyLinked.push({ ...fact, linkCount: 1 });
      }
    }
  }

  // Connected components via BFS
  const componentOf = new Map<string, number>();
  let componentCount = 0;
  const components: Array<{ id: number; members: string[]; hub: any; hubLinks: number }> = [];

  for (const fact of allFacts) {
    if (componentOf.has(fact.id)) continue;
    if ((adj.get(fact.id)?.size || 0) === 0) continue; // Skip orphans

    const component: string[] = [];
    const queue = [fact.id];
    componentOf.set(fact.id, componentCount);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);

      for (const neighbor of adj.get(current) || []) {
        if (!componentOf.has(neighbor)) {
          componentOf.set(neighbor, componentCount);
          queue.push(neighbor);
        }
      }
    }

    // Find hub (most connections)
    let hubId = component[0];
    let hubLinks = adj.get(component[0])?.size || 0;
    for (const id of component) {
      const links = adj.get(id)?.size || 0;
      if (links > hubLinks) {
        hubId = id;
        hubLinks = links;
      }
    }

    const hubFact = allFacts.find((f: any) => f.id === hubId);
    components.push({ id: componentCount, members: component, hub: hubFact, hubLinks });
    componentCount++;
  }

  // Output
  console.log("Knowledge Gap Analysis");
  console.log("======================");
  console.log(`Total facts: ${totalFacts}`);
  console.log(`Linked facts: ${linkedFacts.size} (${totalFacts > 0 ? ((linkedFacts.size / totalFacts) * 100).toFixed(1) : 0}%)`);
  console.log(`Orphan facts: ${orphans.length} (${totalFacts > 0 ? ((orphans.length / totalFacts) * 100).toFixed(1) : 0}%)`);

  if (deadEnds.length > 0) {
    console.log(`\nDead ends (targets only, never source):`);
    for (const de of deadEnds.slice(0, 10)) {
      console.log(`  - [${de.entity}.${de.key || "_"}] "${de.value.slice(0, 50)}" (${de.inCount} inbound, ${de.outCount} outbound)`);
    }
    if (deadEnds.length > 10) console.log(`  ... and ${deadEnds.length - 10} more`);
  }

  if (weaklyLinked.length > 0) {
    console.log(`\nWeakly linked (only 1 connection):`);
    for (const wl of weaklyLinked.slice(0, 10)) {
      console.log(`  - [${wl.entity}.${wl.key || "_"}] "${wl.value.slice(0, 50)}" (${wl.linkCount} link)`);
    }
    if (weaklyLinked.length > 10) console.log(`  ... and ${weaklyLinked.length - 10} more`);
  }

  if (components.length > 0) {
    console.log(`\nConnected components: ${components.length}`);
    for (const comp of components.sort((a, b) => b.members.length - a.members.length)) {
      console.log(`  Cluster ${comp.id + 1} (${comp.members.length} facts): hub = [${comp.hub.entity}.${comp.hub.key || "_"}] (${comp.hubLinks} links)`);
    }
  } else {
    console.log("\nConnected components: 0 (no linked facts)");
  }

  // Suggest links for orphans that share entities with linked facts
  const linkedEntities = new Set<string>();
  for (const id of linkedFacts) {
    const fact = allFacts.find((f: any) => f.id === id);
    if (fact) linkedEntities.add(fact.entity);
  }

  const suggestable = orphans.filter((o: any) => linkedEntities.has(o.entity));
  if (suggestable.length > 0) {
    console.log(`\nSuggested: ${suggestable.length} orphan facts share entities with linked facts and could be connected.`);
  }
}

// --- CLI ---

function printUsage() {
  console.log(`
zo-memory-system graph — Knowledge Graph CLI

Usage:
  bun graph.ts <command> [options]

Commands:
  link               Create a link between two facts
  unlink             Remove a link between two facts
  show               Show links for an entity or fact ID
  find-connections   Find shortest path between two entities
  knowledge-gaps     Analyze orphans, dead ends, and clusters

Link options:
  --source <id>      Source fact ID (required)
  --target <id>      Target fact ID (required)
  --relation <type>  Relation type (default: "related")
  --weight <n>       Link weight 0.0-1.0 (default: 1.0)

Unlink options:
  --source <id>      Source fact ID (required)
  --target <id>      Target fact ID (required)
  --relation <type>  Only remove specific relation (optional)

Show options:
  --entity <name>    Entity name to show links for
  --id <id>          Fact ID to show links for

Find-connections options:
  --from <entity>    Source entity name (required)
  --to <entity>      Target entity name (required)
  --max-depth <n>    Maximum hops (default: 5)

Examples:
  bun graph.ts link --source abc123 --target def456 --relation "depends_on"
  bun graph.ts show --entity "project.ffb-site"
  bun graph.ts find-connections --from "project.ffb-site" --to "system.zo"
  bun graph.ts knowledge-gaps
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "help" || command === "--help") {
    printUsage();
    process.exit(0);
  }

  // Parse flags
  const flags: Record<string, string> = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      flags[args[i].slice(2)] = args[i + 1] || "";
      i++;
    }
  }

  const db = getDb();

  switch (command) {
    case "link": {
      if (!flags.source || !flags.target) {
        console.error("Error: --source and --target are required");
        process.exit(1);
      }
      link(db, flags.source, flags.target, flags.relation || "related", parseFloat(flags.weight) || 1.0);
      break;
    }

    case "unlink": {
      if (!flags.source || !flags.target) {
        console.error("Error: --source and --target are required");
        process.exit(1);
      }
      unlink(db, flags.source, flags.target, flags.relation);
      break;
    }

    case "show": {
      const target = flags.entity || flags.id;
      if (!target) {
        console.error("Error: --entity or --id is required");
        process.exit(1);
      }
      show(db, target);
      break;
    }

    case "find-connections": {
      if (!flags.from || !flags.to) {
        console.error("Error: --from and --to are required");
        process.exit(1);
      }
      findConnections(db, flags.from, flags.to, parseInt(flags["max-depth"]) || 5);
      break;
    }

    case "knowledge-gaps": {
      knowledgeGaps(db);
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }

  db.close();
}

main().catch(console.error);
