#!/usr/bin/env bun
/**
 * Zouroboros Doctor — standalone health check
 *
 * Usage: bun doctor.ts [--fix] [--json]
 */

import { execSync } from "child_process";
import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { parseArgs } from "util";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    fix: { type: "boolean" },
    json: { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
  strict: false,
});

if (values.help) {
  console.log(`
zouroboros doctor — health check for Zouroboros installation

USAGE:
  bun doctor.ts [--fix] [--json]

OPTIONS:
  --fix    Attempt to auto-fix issues
  --json   Output results as JSON
  --help   Show this help
`);
  process.exit(0);
}

const WORKSPACE = process.env.ZO_WORKSPACE || "/home/workspace";
const SKILL_DIR = join(WORKSPACE, "Skills/zouroboros");
const DB_PATH = join(WORKSPACE, ".zo/memory/shared-facts.db");

interface Check {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  fix?: string;
}

const checks: Check[] = [];

function runQuiet(cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: "pipe", timeout: 10000 }).trim();
  } catch {
    return null;
  }
}

// 1. Bun runtime
const bunVersion = runQuiet("bun --version");
checks.push({
  name: "Bun runtime",
  status: bunVersion ? "pass" : "fail",
  detail: bunVersion ? `v${bunVersion}` : "Not installed",
  fix: "curl -fsSL https://bun.sh/install | bash",
});

// 2. SQLite3
const sqliteVersion = runQuiet("sqlite3 --version");
checks.push({
  name: "SQLite3 CLI",
  status: sqliteVersion ? "pass" : "warn",
  detail: sqliteVersion?.split(" ")[0] || "Not installed",
  fix: "apt install -y sqlite3",
});

// 3. Memory database
const dbExists = existsSync(DB_PATH);
let dbDetail = "Not found";
if (dbExists) {
  const tableCount = runQuiet(`sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM sqlite_master WHERE type='table'"`);
  const factCount = runQuiet(`sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM facts"`);
  dbDetail = `${tableCount || "?"} tables, ${factCount || "0"} facts`;
}
checks.push({
  name: "Memory database",
  status: dbExists ? "pass" : "fail",
  detail: dbDetail,
  fix: "bun Skills/zouroboros/scripts/install.ts",
});

// 4. Ollama
const ollamaVersion = runQuiet("ollama --version");
checks.push({
  name: "Ollama",
  status: ollamaVersion ? "pass" : "warn",
  detail: ollamaVersion || "Not installed (vector search limited)",
  fix: "curl -fsSL https://ollama.com/install.sh | sh",
});

// 5. Embedding model
if (ollamaVersion) {
  const models = runQuiet("ollama list") || "";
  const hasNomic = models.includes("nomic-embed-text");
  const hasQwen = models.includes("qwen2.5:1.5b");
  checks.push({
    name: "Embedding model",
    status: hasNomic ? "pass" : "warn",
    detail: hasNomic ? "nomic-embed-text installed" : "Missing nomic-embed-text",
    fix: "ollama pull nomic-embed-text",
  });
  checks.push({
    name: "Classifier model",
    status: hasQwen ? "pass" : "warn",
    detail: hasQwen ? "qwen2.5:1.5b installed" : "Missing (memory gate disabled)",
    fix: "ollama pull qwen2.5:1.5b",
  });
}

// 6. Sub-skills present
const subSkills = ["memory", "swarm", "selfheal", "workflow"];
for (const sub of subSkills) {
  const subDir = join(SKILL_DIR, "skills", sub);
  const scriptsDir = join(subDir, "scripts");
  const hasScripts = existsSync(scriptsDir);
  let scriptCount = 0;
  if (hasScripts) {
    // Count .ts files at top level and one level deep (workflow has subdirs)
    for (const entry of readdirSync(scriptsDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".ts")) scriptCount++;
      if (entry.isDirectory()) {
        const nested = join(scriptsDir, entry.name);
        scriptCount += readdirSync(nested).filter((f) => f.endsWith(".ts")).length;
      }
    }
  }
  checks.push({
    name: `Skill: ${sub}`,
    status: scriptCount > 0 ? "pass" : "fail",
    detail: `${scriptCount} scripts`,
  });
}

// 7. MCP SDK dependency
const nmPath = join(SKILL_DIR, "scripts/node_modules/@modelcontextprotocol");
checks.push({
  name: "MCP SDK",
  status: existsSync(nmPath) ? "pass" : "warn",
  detail: existsSync(nmPath) ? "Installed" : "Not installed (MCP servers won't work)",
  fix: `cd ${SKILL_DIR}/scripts && bun install`,
});

// 8. Swarm executors
const executors = [
  { name: "Claude Code", cmd: "claude --version" },
  { name: "Gemini CLI", cmd: "gemini --version" },
  { name: "Codex CLI", cmd: "codex --version" },
  { name: "Hermes", cmd: "hermes --version" },
];
let execCount = 0;
for (const ex of executors) {
  const ok = runQuiet(ex.cmd);
  if (ok) execCount++;
}
checks.push({
  name: "Swarm executors",
  status: execCount > 0 ? (execCount >= 2 ? "pass" : "warn") : "warn",
  detail: `${execCount}/4 available`,
});

// Output
if (values.json) {
  console.log(JSON.stringify({ checks, summary: { pass: checks.filter((c) => c.status === "pass").length, warn: checks.filter((c) => c.status === "warn").length, fail: checks.filter((c) => c.status === "fail").length } }, null, 2));
} else {
  console.log("\n🐍⭕ Zouroboros Doctor\n");
  for (const c of checks) {
    const icon = c.status === "pass" ? "✅" : c.status === "warn" ? "⚠️ " : "❌";
    console.log(`  ${icon} ${c.name}: ${c.detail}`);
  }

  const pass = checks.filter((c) => c.status === "pass").length;
  const warn = checks.filter((c) => c.status === "warn").length;
  const fail = checks.filter((c) => c.status === "fail").length;
  console.log(`\n  ${pass} pass, ${warn} warn, ${fail} fail\n`);

  if (fail > 0 && values.fix) {
    console.log("🔧 Attempting fixes...\n");
    for (const c of checks) {
      if ((c.status === "fail" || c.status === "warn") && c.fix) {
        console.log(`  Fixing: ${c.name}`);
        try {
          execSync(c.fix, { stdio: "inherit", timeout: 120000 });
        } catch {}
      }
    }
  } else if (fail > 0) {
    console.log("Run with --fix to attempt auto-repair.\n");
  }
}

process.exit(checks.some((c) => c.status === "fail") ? 1 : 0);
