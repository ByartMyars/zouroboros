import { test, expect, describe } from "bun:test";
import { buildDepGraph, type DepGraphResult, type DepGraphOptions } from "../dep-graph";
import { join } from "path";

const SWARM_SRC = join(import.meta.dir, "../../src");
const WORKSPACE = process.env.SWARM_WORKSPACE || "/home/workspace";

describe("dep-graph", () => {
  let graph: DepGraphResult;

  test("builds graph for swarm/src", async () => {
    graph = await buildDepGraph({ path: SWARM_SRC });
    expect(graph.files.length).toBeGreaterThan(30);
    expect(graph.edges.length).toBeGreaterThan(30);
    expect(graph.root).toBe(SWARM_SRC);
  });

  test("identifies types.ts as critical path leader", async () => {
    graph ??= await buildDepGraph({ path: SWARM_SRC });
    const top = graph.criticalPath[0];
    expect(top.file).toBe("types.ts");
    expect(top.dependentCount).toBeGreaterThan(10);
  });

  test("computes impact radius for specific files", async () => {
    const result = await buildDepGraph({
      path: SWARM_SRC,
      impactFiles: ["types.ts", "circuit/breaker.ts"],
    });
    expect(Object.keys(result.impactRadius).length).toBeGreaterThanOrEqual(1);
    const typesRadius = result.impactRadius["types.ts"];
    expect(typesRadius).toBeDefined();
    expect(typesRadius!.length).toBeGreaterThan(5);
  });

  test("detects no cycles in swarm/src", async () => {
    graph ??= await buildDepGraph({ path: SWARM_SRC });
    expect(graph.cycles.length).toBe(0);
  });

  test("identifies orphan files", async () => {
    graph ??= await buildDepGraph({ path: SWARM_SRC });
    expect(graph.orphans.length).toBeGreaterThan(0);
    for (const orphan of graph.orphans) {
      const hasEdge = graph.edges.some(e => e.from === orphan || e.to === orphan);
      expect(hasEdge).toBe(false);
    }
  });

  test("resolves .js → .ts imports", async () => {
    graph ??= await buildDepGraph({ path: SWARM_SRC });
    const bridgeEdge = graph.edges.find(
      e => e.from.includes("bridge-transport") && e.to === "types.ts"
    );
    expect(bridgeEdge).toBeDefined();
  });
});

describe("dep-graph preflight integration", () => {
  test("detects overlapping impact radii between tasks", async () => {
    const depGraph = await buildDepGraph({
      path: SWARM_SRC,
      impactFiles: ["types.ts", "transport/types.ts", "transport/bridge-transport.ts"],
    });

    const taskA = { id: "task-a", paths: ["types.ts"] };
    const taskB = { id: "task-b", paths: ["transport/types.ts", "transport/bridge-transport.ts"] };

    const radiusA = new Set(taskA.paths.flatMap(p => depGraph.impactRadius[p] || []));
    const radiusB = new Set(taskB.paths.flatMap(p => depGraph.impactRadius[p] || []));

    const aAffectsB = taskB.paths.some(p => radiusA.has(p));
    const bAffectsA = taskA.paths.some(p => radiusB.has(p));

    expect(aAffectsB).toBe(true);
    expect(bAffectsA).toBe(false);
  });

  test("does NOT flag independent tasks as conflicting", async () => {
    const depGraph = await buildDepGraph({
      path: SWARM_SRC,
      impactFiles: ["types.ts", "README.md"],
    });

    const taskA = { id: "task-a", paths: ["types.ts"] };
    const taskC = { id: "task-c", paths: ["README.md"] };

    const radiusA = new Set(taskA.paths.flatMap(p => depGraph.impactRadius[p] || []));
    const radiusC = new Set(taskC.paths.flatMap(p => depGraph.impactRadius[p] || []));

    const aAffectsC = taskC.paths.some(p => radiusA.has(p));
    const cAffectsA = taskA.paths.some(p => radiusC.has(p));

    expect(aAffectsC).toBe(false);
    expect(cAffectsA).toBe(false);
  });

  test("full monorepo scan completes under 5s", async () => {
    const start = Date.now();
    const result = await buildDepGraph({ path: join(WORKSPACE, "zouroboros") });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5000);
    expect(result.files.length).toBeGreaterThan(100);
    expect(result.edges.length).toBeGreaterThan(100);
    console.log(`  Monorepo: ${result.files.length} files, ${result.edges.length} edges in ${elapsed}ms`);
  });
});
