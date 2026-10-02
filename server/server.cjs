'use strict';
/*
 * pc-sync receiver — zero-dependency Node HTTP server.
 * GET  /              dashboard (open — demo)
 * GET  /p/<file>      sample photo
 * POST /sync?t=TOKEN  device info + base64 photo
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 80;
const TOKEN = process.env.PC_SYNC_TOKEN || '';
const DATA = path.join(__dirname, 'data');
const PHOTOS = path.join(DATA, 'photos');
const ENTRIES = path.join(DATA, 'entries.json');
const ACTIONS = path.join(DATA, 'actions.json');
const MAX_BODY = 16 * 1024 * 1024;
const ADMIN = process.env.PC_SYNC_ADMIN || '';

fs.mkdirSync(PHOTOS, { recursive: true });
if (!fs.existsSync(ENTRIES)) fs.writeFileSync(ENTRIES, '[]');

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic',
};

function loadEntries() {
  try { return JSON.parse(fs.readFileSync(ENTRIES, 'utf8')); } catch { return []; }
}
function saveEntries(list) {
  const tmp = ENTRIES + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 1));
  fs.renameSync(tmp, ENTRIES);
}
function loadActions() {
  try { return JSON.parse(fs.readFileSync(ACTIONS, 'utf8')); } catch { return {}; }
}
function saveActions(a) {
  const tmp = ACTIONS + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(a, null, 1));
  fs.renameSync(tmp, ACTIONS);
}
function tokenOk(got) {
  if (!TOKEN || typeof got !== 'string' || !got) return false;
  const a = Buffer.from(got), b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// Rate limit for token-less syncs (in-memory, per client IP, per hour).
const RATE = new Map();
function rateOk(ip) {
  const now = Date.now();
  const arr = (RATE.get(ip) || []).filter(t => now - t < 3600e3);
  if (arr.length >= 20) { RATE.set(ip, arr); return false; }
  arr.push(now);
  RATE.set(ip, arr);
  return true;
}
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function actionCell(e, actions, removedIds) {
  if (e.state === 'removed') return '<span class="muted">removed</span>';
  const id = e.device && e.device.id;
  if (!id || !ADMIN) return '<span class="muted">—</span>';
  if (removedIds.has(id)) return '<span class="muted">removed</span>';
  if (actions[id]) return '<span class="muted">removal pending — the device confirms on its next check</span>';
  return '<form method="post" action="/admin" style="display:inline">' +
    '<input type="hidden" name="t" value="' + esc(ADMIN) + '">' +
    '<input type="hidden" name="id" value="' + esc(id) + '">' +
    '<input type="hidden" name="action" value="uninstall">' +
    '<button type="submit" style="font-size:12px">Remove from this PC</button>' +
    '</form>';
}

function dashboard(entries) {
  const actions = loadActions();
  // Device ids that have confirmed removal — mark every one of their rows.
  const removedIds = new Set(
    entries
      .filter(e => e.state === 'removed' || (e.device && e.device.removed === true))
      .map(e => e.device && e.device.id)
      .filter(Boolean)
  );
  const rows = entries.slice().reverse().map(e => {
    const d = e.device || {};
    const photo = e.photo
      ? '<a href="' + esc(e.photo.url) + '"><img src="' + esc(e.photo.url) + '" style="max-width:140px;max-height:140px;border:1px solid #ddd;border-radius:6px"></a><div class="muted">' + esc(e.photo.name) + '</div>'
      : '<span class="muted">no photo</span>';
    const osLabel = [d.osType, d.osRelease].filter(Boolean).join(' ');
    const ag = d.agents || {};
    return '<tr>' +
      '<td>' + esc(e.time.replace('T', ' ').slice(0, 19)) + '</td>' +
      '<td class="mono">' + esc(e.ip) + '</td>' +
      '<td>' + esc(osLabel) + '</td>' +
      '<td class="mono">' + esc(d.platform) + ' / ' + esc(d.arch) + '</td>' +
      '<td class="mono">' + esc(d.hostname) + '</td>' +
      '<td>' + esc(d.user) + '</td>' +
      '<td>' + esc(d.cpu) + ' ×' + esc(d.cpuCount) + '</td>' +
      '<td>' + esc(d.totalMemGb) + ' GB</td>' +
      '<td class="mono">node ' + esc(d.node) + '</td>' +
      '<td class="mono">claude: ' + esc(ag.claude || '-') + '<br>codex: ' + esc(ag.codex || '-') + '</td>' +
      '<td>' + photo + '</td>' +
      '<td>' + actionCell(e, actions, removedIds) + '</td>' +
      '</tr>';
  }).join('\n');
  return '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>pc-sync dashboard</title>' +
    '<style>body{font-family:system-ui,sans-serif;margin:24px;color:#111}h1{font-size:20px}' +
    'table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:6px 10px;text-align:left;font-size:13px;vertical-align:top}' +
    'th{background:#f5f5f5}.mono{font-family:ui-monospace,monospace;font-size:12px}.muted{color:#888;font-size:12px}</style>' +
    '</head><body><h1>pc-sync dashboard <span class="muted">(' + entries.length + ' sync' + (entries.length === 1 ? '' : 's') + ')</span></h1>' +
    '<p class="muted">auto-refreshes every 8 s</p>' +
    '<table><tr><th>time (UTC)</th><th>client IP</th><th>OS</th><th>platform/arch</th><th>hostname</th><th>user</th><th>CPU</th><th>RAM</th><th>node</th><th>agents</th><th>sample photo</th><th>action</th></tr>' +
    (rows || '<tr><td colspan="12" class="muted">no syncs yet — install the skill and run /pc-sync on a test PC</td></tr>') +
    '</table><script>setTimeout(function(){location.reload()},8000)</script></body></html>';
}

const server = http.createServer((req, res) => {
  let u;
  try { u = new URL(req.url, 'http://localhost'); }
  catch { res.writeHead(400); return res.end('bad url'); }
  const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');

  if (req.method === 'POST' && u.pathname === '/sync') {
    const t = u.searchParams.get('t');
    // Token is optional on this public demo endpoint: when present it must
    // match; when absent, per-IP rate limiting keeps junk out.
    if (t !== null && !tokenOk(t)) { res.writeHead(401); return res.end('unauthorized'); }
    if (t === null && !rateOk(ip)) { res.writeHead(429); return res.end('too many syncs'); }
    const chunks = [];
    let size = 0, done = false;
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { res.writeHead(413); res.end('too large'); req.destroy(); done = true; return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (done) return;
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const id = crypto.randomBytes(4).toString('hex');
        let photo = null;
        const f = body && body.file;
        if (f && typeof f.b64 === 'string' && f.b64.length) {
          let ext = String(f.ext || '.jpg').toLowerCase().replace(/[^.a-z0-9]/g, '');
          if (!ext.startsWith('.')) ext = '.' + ext;
          if (!MIME[ext]) ext = '.jpg';
          const name = id + ext;
          fs.writeFileSync(path.join(PHOTOS, name), Buffer.from(f.b64, 'base64'));
          photo = { url: '/p/' + name, name: String(f.name || name).slice(0, 200), bytes: Number(f.bytes) || 0 };
        }
        const entry = {
          id, ip,
          ua: String(req.headers['user-agent'] || '').slice(0, 300),
          time: new Date().toISOString(),
          device: (body && body.device) || {},
          photo,
        };
        const actions = loadActions();
        const devId = entry.device && entry.device.id ? String(entry.device.id).slice(0, 64) : '';
        if (devId && entry.device.removed === true) {
          entry.state = 'removed';
          delete actions[devId];
          saveActions(actions);
        }
        const list = loadEntries();
        list.push(entry);
        saveEntries(list);
        const action = devId && actions[devId] ? actions[devId].action : 'none';
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id, action }));
      } catch (e) {
        res.writeHead(400);
        res.end('bad request');
      }
    });
    req.on('error', () => { /* ignore client disconnects */ });
    return;
  }

  if (req.method === 'POST' && u.pathname === '/admin') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try {
        const p = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
        const t = p.get('t') || '';
        const okT = ADMIN && t && Buffer.from(t).length === Buffer.from(ADMIN).length &&
          crypto.timingSafeEqual(Buffer.from(t), Buffer.from(ADMIN));
        if (!okT) { res.writeHead(401); return res.end('unauthorized'); }
        const id = (p.get('id') || '').replace(/[^0-9a-f]/g, '').slice(0, 64);
        const a = (p.get('action') === 'uninstall') ? 'uninstall' : 'none';
        if (id) {
          const actions = loadActions();
          if (a === 'uninstall') actions[id] = { action: 'uninstall', at: new Date().toISOString() };
          else delete actions[id];
          saveActions(actions);
        }
        res.writeHead(303, { location: '/' });
        res.end();
      } catch (e) { res.writeHead(400); res.end('bad request'); }
    });
    req.on('error', () => { /* ignore client disconnects */ });
    return;
  }

  if (req.method === 'GET' && u.pathname.startsWith('/p/')) {
    const name = path.basename(u.pathname);
    if (!/^[\w.-]+$/.test(name)) { res.writeHead(400); return res.end('bad name'); }
    fs.readFile(path.join(PHOTOS, name), (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, {
        'content-type': MIME[path.extname(name).toLowerCase()] || 'application/octet-stream',
        'content-length': buf.length,
      });
      res.end(buf);
    });
    return;
  }

  if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/index.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(dashboard(loadEntries()));
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('pc-sync receiver listening on :' + PORT);
});
