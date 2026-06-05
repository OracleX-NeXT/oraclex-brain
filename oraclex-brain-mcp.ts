#!/usr/bin/env bun
/**
 * OracleX Brain — MCP-over-HTTP server (the "supermemory" hub).
 * One brain on the mother (OracleX), reachable from ANY machine's Claude via
 * a single HTTPS URL + bearer token. No SSH, no file sync, no conflict.
 *
 * Transport: MCP Streamable HTTP (stateless JSON-RPC over POST /mcp).
 * Auth: Authorization: Bearer <BRAIN_TOKEN>  (env; never committed).
 * Backed by the local arra-oracle brain (search proxy + incremental learn).
 *
 * Tools: brain_search · brain_learn · brain_recent · brain_stats
 */
import { Database } from "bun:sqlite";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const HOME = os.homedir();
const PORT = Number(process.env.BRAIN_PORT || 8096);
const ARRA = process.env.ARRA_URL || "http://localhost:47778";
const TOKEN = process.env.BRAIN_TOKEN || "";
const VAULT = process.env.ORACLE_DATA_DIR || path.join(HOME, ".arra-oracle-v2");
const LEARN_DIR = path.join(VAULT, "ψ", "memory", "learnings");
const INDEXER = path.join(HOME, "ai-agent-stack/memory/arra-oracle-v3/src/indexer/cli.ts");
const DB = path.join(VAULT, "oracle.db");
const NAME = "oraclex-brain";
const VERSION = "1.0.0";

if (!TOKEN) console.warn("[brain] WARNING: BRAIN_TOKEN not set — refusing all auth");

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9ก-๙]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "note";
const today = () => new Date(Number(process.env.BRAIN_NOW) || Date.now()).toISOString().slice(0, 10);

// ── tools ────────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "brain_search",
    description: "ค้นหาความรู้ในสมอง OracleX (semantic + full-text across all indexed Oracle knowledge). Use to recall past learnings, principles, ops, retros before answering.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "what to recall" }, limit: { type: "number", description: "max results (default 8)" }, type: { type: "string", description: "filter: learning|principle|retro|all" } }, required: ["query"] },
  },
  {
    name: "brain_learn",
    description: "บันทึกความรู้ใหม่เข้าสมอง OracleX เมื่อค้นแล้วไม่เจอ (add when not found). Persists a markdown note to the mother vault and indexes it immediately for future recall.",
    inputSchema: { type: "object", properties: { title: { type: "string" }, content: { type: "string" }, concepts: { type: "array", items: { type: "string" } }, type: { type: "string", description: "learning|principle (default learning)" } }, required: ["title", "content"] },
  },
  { name: "brain_recent", description: "ดูความรู้ล่าสุดที่เพิ่งเรียนรู้", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
  { name: "brain_stats", description: "สถิติสมอง OracleX (จำนวนความรู้แยกตามชนิด)", inputSchema: { type: "object", properties: {} } },
];

async function arraSearch(q: string, limit = 8, type = "all") {
  const u = `${ARRA}/api/search?q=${encodeURIComponent(q)}&limit=${limit}&type=${encodeURIComponent(type)}`;
  const r = await fetch(u);
  const d: any = await r.json();
  const res = d.results || [];
  if (!res.length) return `(ไม่เจอในสมอง) — query: "${q}". ถ้าเป็นความรู้ใหม่ ใช้ brain_learn บันทึกไว้`;
  return res.map((x: any, i: number) => {
    const title = String(x.content || "").split("\n").find((l: string) => l.trim()) || x.id;
    return `${i + 1}. [${x.type}] ${title.replace(/^#+\s*/, "").slice(0, 90)}\n   ${String(x.content || "").replace(/\s+/g, " ").slice(0, 220)}\n   (src: ${x.source_file} · score ${(+x.score || 0).toFixed(2)})`;
  }).join("\n\n");
}

async function brainLearn(title: string, content: string, concepts: string[] = [], type = "learning") {
  fs.mkdirSync(LEARN_DIR, { recursive: true });
  const id = `${today()}_${slug(title)}`;
  const file = path.join(LEARN_DIR, `${id}.md`);
  const fm = [
    "---", `id: learning_${id}`, `type: ${type}`, `title: ${title.replace(/\n/g, " ")}`,
    `concepts: [${concepts.map((c) => JSON.stringify(c)).join(", ")}]`,
    `created: ${today()}`, "source: brain-http", "---", "", `# ${title}`, "", content, "",
  ].join("\n");
  fs.writeFileSync(file, fm, "utf8");
  // incremental index (best-effort, fast — hash-based skip of unchanged)
  let indexed = false;
  try {
    const p = Bun.spawn(["bun", INDEXER], { cwd: path.dirname(path.dirname(INDEXER)), env: { ...process.env, ORACLE_REPO_ROOT: VAULT }, stdout: "ignore", stderr: "ignore" });
    await Promise.race([p.exited, new Promise((r) => setTimeout(r, 12000))]);
    indexed = true;
  } catch {}
  return `✅ บันทึกเข้าสมองแล้ว: "${title}"\n   file: ψ/memory/learnings/${id}.md${indexed ? " · indexed" : " · (จะ index รอบถัดไป)"}`;
}

async function brainStats() {
  try { const r = await fetch(`${ARRA}/api/stats`); const d: any = await r.json(); return `สมอง OracleX: ${d.total} ความรู้ · ${JSON.stringify(d.by_type)} · indexed ${d.last_indexed}`; }
  catch { const db = new Database(DB, { readonly: true }); const n: any = db.query("select count(*) c from oracle_documents").get(); return `สมอง OracleX: ${n.c} ความรู้`; }
}
async function brainRecent(limit = 8) {
  const db = new Database(DB, { readonly: true });
  const rows = db.query(`select type, source_file, created_at from oracle_documents order by created_at desc limit ?`).all(limit) as any[];
  return rows.map((r, i) => `${i + 1}. [${r.type}] ${r.source_file}`).join("\n") || "(ว่าง)";
}

async function callTool(name: string, args: any): Promise<string> {
  if (name === "brain_search") return arraSearch(String(args.query), args.limit || 8, args.type || "all");
  if (name === "brain_learn") return brainLearn(String(args.title), String(args.content), args.concepts || [], args.type || "learning");
  if (name === "brain_recent") return brainRecent(args.limit || 8);
  if (name === "brain_stats") return brainStats();
  throw new Error(`unknown tool: ${name}`);
}

// ── MCP Streamable HTTP (stateless JSON-RPC over POST) ─────────────────────
const rpcOk = (id: any, result: any) => ({ jsonrpc: "2.0", id, result });
const rpcErr = (id: any, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

async function handleRpc(msg: any) {
  const { id, method, params } = msg;
  if (method === "initialize")
    return rpcOk(id, { protocolVersion: params?.protocolVersion || "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: NAME, version: VERSION } });
  if (method === "tools/list") return rpcOk(id, { tools: TOOLS });
  if (method === "ping") return rpcOk(id, {});
  if (method === "tools/call") {
    try { const text = await callTool(params.name, params.arguments || {}); return rpcOk(id, { content: [{ type: "text", text }] }); }
    catch (e: any) { return rpcOk(id, { content: [{ type: "text", text: `error: ${e?.message || e}` }], isError: true }); }
  }
  if (method?.startsWith("notifications/")) return null; // no response for notifications
  return rpcErr(id, -32601, `method not found: ${method}`);
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") return new Response(JSON.stringify({ ok: true, name: NAME, version: VERSION }), { headers: { "content-type": "application/json" } });
    if (url.pathname !== "/mcp") return new Response("OracleX Brain MCP — POST /mcp", { status: 404 });
    // auth
    const auth = req.headers.get("authorization") || "";
    if (!TOKEN || auth !== `Bearer ${TOKEN}`) return new Response(JSON.stringify(rpcErr(null, -32000, "unauthorized")), { status: 401, headers: { "content-type": "application/json" } });
    if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
    let body: any;
    try { body = await req.json(); } catch { return new Response(JSON.stringify(rpcErr(null, -32700, "parse error")), { status: 400, headers: { "content-type": "application/json" } }); }
    const msgs = Array.isArray(body) ? body : [body];
    const out: any[] = [];
    for (const m of msgs) { const r = await handleRpc(m); if (r) out.push(r); }
    if (!out.length) return new Response(null, { status: 202 });
    return new Response(JSON.stringify(Array.isArray(body) ? out : out[0]), { headers: { "content-type": "application/json" } });
  },
});
console.log(`[oraclex-brain] MCP-over-HTTP on :${PORT} /mcp (arra=${ARRA}, token=${TOKEN ? "set" : "MISSING"})`);
