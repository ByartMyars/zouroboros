#!/usr/bin/env bun
/**
 * Vault Schema Migration (T1)
 * Creates vault_files and vault_meta tables in shared-facts.db
 * Idempotent — safe to run multiple times.
 */

import { Database } from "bun:sqlite";

const DEFAULT_DB = "/home/workspace/.zo/memory/shared-facts.db";
const DB_PATH = process.env.ZO_MEMORY_DB || DEFAULT_DB;

const db = new Database(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

// Track what we actually create
const created: string[] = [];

// --- vault_files ---
db.exec(`
  CREATE TABLE IF NOT EXISTS vault_files (
    id            TEXT PRIMARY KEY,
    file_path     TEXT NOT NULL UNIQUE,
    title         TEXT,
    tags          TEXT DEFAULT '[]',
    personas      TEXT DEFAULT '[]',
    last_indexed  INTEGER,
    mtime         INTEGER,
    link_count    INTEGER DEFAULT 0,
    backlink_count INTEGER DEFAULT 0
  );
`);

// Check if we just created it (rowcount proxy: table will be empty if new)
const vfInfo = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='vault_files'").get();
if (vfInfo) created.push("vault_files");

db.exec(`CREATE INDEX IF NOT EXISTS idx_vault_files_path ON vault_files(file_path);`);

// --- vault_meta ---
db.exec(`
  CREATE TABLE IF NOT EXISTS vault_meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

const vmInfo = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='vault_meta'").get();
if (vmInfo) created.push("vault_meta");

db.close();

console.log(`[vault-schema] Database: ${DB_PATH}`);
console.log(`[vault-schema] Tables verified: ${created.join(", ")}`);
console.log("[vault-schema] Migration complete (idempotent).");
