// Minimal local Upstash/Vercel-KV REST-compatible shim for LOCAL DEV ONLY.
// Implements just enough of the Upstash REST protocol for QuickShare's
// lib/session-manager.ts: it accepts POST of a JSON command array
// (e.g. ["SET","key","val","EX","900"] or ["GET","key"]) with a Bearer
// token and returns { result }. In-memory store with TTL. Not for prod.
import http from 'node:http';

const PORT = process.env.DEV_KV_PORT ? Number(process.env.DEV_KV_PORT) : 8079;
const TOKEN = process.env.DEV_KV_TOKEN || 'local-dev-token';

const store = new Map(); // key -> { value, expireAt|null }

function isExpired(entry) {
  return entry.expireAt !== null && Date.now() > entry.expireAt;
}

function get(key) {
  const e = store.get(key);
  if (!e) return null;
  if (isExpired(e)) {
    store.delete(key);
    return null;
  }
  return e.value;
}

function runCommand(cmd) {
  const op = String(cmd[0]).toUpperCase();
  switch (op) {
    case 'SET': {
      const [, key, value, ...rest] = cmd;
      let expireAt = null;
      for (let i = 0; i < rest.length; i++) {
        if (String(rest[i]).toUpperCase() === 'EX') {
          expireAt = Date.now() + Number(rest[i + 1]) * 1000;
        }
      }
      store.set(key, { value: String(value), expireAt });
      return 'OK';
    }
    case 'GET':
      return get(cmd[1]);
    case 'DEL': {
      let n = 0;
      for (let i = 1; i < cmd.length; i++) if (store.delete(cmd[i])) n++;
      return n;
    }
    case 'PING':
      return 'PONG';
    default:
      throw new Error(`Unsupported command: ${op}`);
  }
}

const server = http.createServer((req, res) => {
  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${TOKEN}`) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    try {
      const cmd = JSON.parse(body || '[]');
      const result = runCommand(cmd);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ result }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err && err.message ? err.message : err) }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`[dev-kv] listening on http://127.0.0.1:${PORT} (token=${TOKEN})`);
});
