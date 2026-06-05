# 🧠 OracleX Brain — one brain, every machine

> "สมองเดียวบนเครื่องแม่ ต่อจากที่ไหนก็ได้" — supermemory for your AI, over plain HTTPS.

A tiny **MCP-over-HTTP** server that turns one machine (your *mother* server) into a
shared memory brain. Any Claude (or MCP client) on any machine connects with a single
**URL + token** — searches and adds knowledge to the *same* brain. No SSH, no file sync,
no conflicts, no extra app.

Built on [arra-oracle-v3](https://github.com/Soul-Brews-Studio/arra-oracle-v3) (the search+learn
knowledge layer) — this is the thin, secure HTTP front door to it.

```
   MacBook ─┐
   Phone ───┤── HTTPS + Bearer token ──▶  brain-mcp.yourdomain.com  ──▶  arra brain (one DB)
   Server ──┘                                    (mother machine)
```

## Why

- **Real sync** — every client hits the *same* brain DB on the mother. Nothing to merge.
- **Secure** — bearer token over HTTPS (put Cloudflare in front for TLS + WAF/DDoS). The DB
  never leaves the mother; no SSH keys handed out; reject-by-default without the exact token.
- **Easy** — clients add one MCP entry (a URL + header). No code to install per machine.
- **Tools**: `brain_search` (recall) · `brain_learn` (add when not found) · `brain_recent` · `brain_stats`.

## Install — client (any machine)

You need: the brain **URL** (`https://brain-mcp.<your-domain>/mcp`) and the **token** from the mother.

```bash
./install-client.sh https://brain-mcp.example.com/mcp <YOUR_TOKEN>
# or manually add to ~/.claude.json → mcpServers:
#   "oraclex-brain": { "type":"http", "url":"https://.../mcp",
#                      "headers": { "Authorization": "Bearer <TOKEN>" } }
```

Restart Claude. You now have `brain_search` / `brain_learn` everywhere.

## Install — server (the mother, once)

Prereqs: [bun](https://bun.sh), an arra-oracle brain running locally (default `http://localhost:47778`),
a reverse proxy for HTTPS (Caddy/Cloudflare).

```bash
export BRAIN_TOKEN="$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 40)"   # keep this secret
export BRAIN_PORT=8096
export ARRA_URL=http://localhost:47778          # your arra-oracle brain
bun run oraclex-brain-mcp.ts
```

Then reverse-proxy `brain-mcp.<domain>` → `localhost:8096` (no SSO — the token *is* the auth):

```
brain-mcp.example.com {
    reverse_proxy localhost:8096
}
```

Persist with pm2: `pm2 start oraclex-brain-mcp.ts --name oraclex-brain` (export `BRAIN_TOKEN` first).

## Security model

| Layer | What |
|-------|------|
| **Token** | 40-char random bearer; server rejects every request without an exact match (`401`). Never commit it. |
| **Transport** | HTTPS only. Front with Cloudflare (proxied) for an edge cert + WAF + DDoS. |
| **Blast radius** | The brain DB stays on the mother. No shell, no SSH key, no file system exposed — only the 4 tools. |
| **Harden more** | Rotate the token (`~/.config/oraclex-brain/token`), add Cloudflare Access or an IP allow-list, run the proxy on a private network. |

## How it works

`POST /mcp` speaks the MCP **Streamable HTTP** JSON-RPC dialect (stateless): `initialize`,
`tools/list`, `tools/call`. `brain_search`/`brain_stats` proxy the local arra HTTP API;
`brain_learn` writes a front-mattered markdown note into the mother's vault
(`ψ/memory/learnings/`) and runs the incremental indexer so it's recall-able at once.

## The Oracle principle

> One backend, many faces. The data always flows through the mother brain.

Knowledge lives in **one** place and is *connected to*, never copied. Move between machines
freely — your AI remembers, because it's the same mind.

---

MIT · part of the OracleX system · 🤖 built with Claude Code
