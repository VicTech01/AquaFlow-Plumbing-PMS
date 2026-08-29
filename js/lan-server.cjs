/* AquaFlow PMS — LAN sync server.
   Pure Node (no Electron deps) so it runs inside the desktop app AND in tests.
   Serves: the web app (so phones on the same Wi-Fi can install it as a PWA)
   and a full-state sync API:  GET /api/sync  ·  POST /api/sync.
   Sync is full-state: the client always pulls, merges locally, then pushes the
   merged state (POST replaces the server copy). */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const APP_VERSION = '1.3.0';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8'
};

function lanIP() {
  let fallback = '127.0.0.1';
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const i of ifaces[name] || []) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return fallback;
}

function start({ rootDir, port = 8484, initialDb = null, onPush = null, stateFile = null }) {
  let latest = initialDb || null; // JSON string of the full db
  if (stateFile) {
    try {
      if (fs.existsSync(stateFile) && !latest) latest = fs.readFileSync(stateFile, 'utf8');
    } catch (e) {}
  }
  const persist = () => {
    if (!stateFile || !latest) return;
    try {
      fs.mkdirSync(path.dirname(stateFile), { recursive: true });
      fs.writeFileSync(stateFile, latest);
    } catch (e) {}
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (code, body, type) => {
      res.writeHead(code, {
        'Content-Type': type || 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-store'
      });
      res.end(body);
    };
    if (req.method === 'OPTIONS') return send(204, '');

    try {
      if (url.pathname === '/api/health') {
        return send(200, JSON.stringify({ ok: true, app: 'aquaflow-pms', version: APP_VERSION, ip: lanIP(), port }));
      }
      if (url.pathname === '/api/sync' && req.method === 'GET') {
        if (!latest) return send(404, JSON.stringify({ error: 'no data on this device yet' }));
        return send(200, JSON.stringify({ db: JSON.parse(latest), version: APP_VERSION, at: new Date().toISOString() }));
      }
      if (url.pathname === '/api/sync' && req.method === 'POST') {
        let body = '';
        req.on('data', c => { body += c; if (body.length > 15 * 1024 * 1024) req.destroy(); });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            const d = parsed && parsed.db ? parsed.db : parsed;
            if (d && d.v === 1 && Array.isArray(d.customers) && Array.isArray(d.jobs) && d.counters) {
              latest = JSON.stringify(d);
              persist();
              if (onPush) { try { onPush(JSON.parse(latest)); } catch (e) {} }
              return send(200, JSON.stringify({ ok: true, at: new Date().toISOString() }));
            }
            return send(400, JSON.stringify({ error: 'invalid db payload' }));
          } catch (e) {
            return send(400, JSON.stringify({ error: 'bad json' }));
          }
        });
        return;
      }

      // static app files
      let p = decodeURIComponent(url.pathname);
      if (p === '/') p = '/index.html';
      const filePath = path.normalize(path.join(rootDir, p));
      if (!filePath.startsWith(path.normalize(rootDir))) return send(403, 'forbidden', 'text/plain');
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        return send(200, fs.readFileSync(filePath), MIME[ext] || 'application/octet-stream');
      }
      // SPA fallback → index.html
      const idx = path.join(rootDir, 'index.html');
      if (fs.existsSync(idx)) return send(200, fs.readFileSync(idx), 'text/html; charset=utf-8');
      return send(404, 'not found', 'text/plain');
    } catch (e) {
      return send(500, JSON.stringify({ error: String(e.message || e) }));
    }
  });

  return new Promise(resolve => {
    server.listen(port, '0.0.0.0', () => {
      const api = {
        server,
        setDb(json) { latest = json; persist(); },
        getDb() { return latest ? JSON.parse(latest) : null; },
        info() {
          const a = server.address() || {};
          return { on: true, port: a.port || port, ip: lanIP(), url: `http://${lanIP()}:${a.port || port}` };
        },
        stop() { return new Promise(r => server.close(r)); }
      };
      resolve(api);
    });
  });
}

module.exports = { start, lanIP, APP_VERSION };
