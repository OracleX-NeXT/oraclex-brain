#!/usr/bin/env bash
# OracleX Brain — offline mirror (one-way: mother → this machine).
# Uses SQLite .backup (consistent snapshot, safe on a live WAL db) — NOT raw rsync.
# One-way → never writes back → no conflict. Online: write to mother (brain_learn).
set -uo pipefail
HOST="${BRAIN_HOST:-oraclex}"
LOCAL="$HOME/.arra-oracle-v2"
SNAP="/tmp/oraclex-brain-snap.db"
mkdir -p "$LOCAL/ψ"
log(){ echo "[brain-mirror $(date '+%H:%M:%S')] $*"; }

# 1. consistent snapshot on the mother
if ! ssh -o ConnectTimeout=10 "$HOST" "sqlite3 ~/.arra-oracle-v2/oracle.db \".backup $SNAP\"" 2>/dev/null; then
  log "ERROR: snapshot on mother failed (offline?) — keeping existing local cache"; exit 1
fi
# 2. pull snapshot, swap atomically, kill stale WAL/shm (critical)
cp "$LOCAL/oracle.db" "$LOCAL/oracle.db.premirror" 2>/dev/null || true
if scp -q "$HOST:$SNAP" "$LOCAL/oracle.db.new" 2>/dev/null; then
  mv "$LOCAL/oracle.db.new" "$LOCAL/oracle.db"
  rm -f "$LOCAL/oracle.db-wal" "$LOCAL/oracle.db-shm"
else
  log "ERROR: pull failed — keeping existing local cache"; ssh "$HOST" "rm -f $SNAP" 2>/dev/null; exit 1
fi
ssh "$HOST" "rm -f $SNAP" 2>/dev/null || true
# 3. mirror ψ source files (one-way)
rsync -az --timeout=60 "$HOST:.arra-oracle-v2/ψ/" "$LOCAL/ψ/" 2>/dev/null || true
# 4. verify
integ=$(sqlite3 "$LOCAL/oracle.db" "PRAGMA integrity_check" 2>&1 | head -1)
n=$(sqlite3 "$LOCAL/oracle.db" "select count(*) from oracle_documents" 2>&1)
if [ "$integ" = "ok" ]; then log "OK — mirrored mother → local: $n docs (integrity ok)"; else log "WARN integrity: $integ"; fi
