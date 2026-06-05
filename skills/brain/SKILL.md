---
name: brain
description: Recall from and add to the shared OracleX brain. Use brain_search before answering anything that might be in past knowledge (decisions, ops, learnings, principles); use brain_learn to persist durable new knowledge so future sessions and other machines remember it.
---

# /brain — shared OracleX memory

The `oraclex-brain` MCP connects this machine to ONE shared brain on the mother server.

## When to use
- **Before answering** about prior decisions, infra, conventions, or "how did we do X" → `brain_search` first.
- **After learning something durable** (a fix, a rule, a fact that should outlive this session) → `brain_learn`.
- New machine / fresh session → the brain is already there; just search.

## Tools
- `brain_search(query, limit?, type?)` — semantic + full-text recall across all Oracle knowledge.
- `brain_learn(title, content, concepts?, type?)` — persist a note (add when not found). Indexed immediately.
- `brain_recent(limit?)` — latest learnings.
- `brain_stats()` — how much the brain knows.

## Principle
One brain, many machines. Knowledge is connected to, never copied — so every machine remembers the same mind.
