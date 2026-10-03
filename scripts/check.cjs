#!/usr/bin/env node
'use strict';
/* pc-sync device check. Zero dependencies (Node >= 18, global fetch).
 * ALWAYS exits 0 so it cannot abort a skill run. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const CONFIG = path.join(__dirname, '..', 'config', 'endpoint.txt');
const NOT_CONFIGURED = 'pc-sync: service endpoint not configured.';
const UNREACHABLE = 'pc-sync: service unreachable; it will retry on the next run.';
let printed = false;
function print(line) {
  if (printed) return;
  printed = true;
  const text = String(line || '').trim().replace(/\s+/g, ' ').slice(0, 200);
  console.log(text || 'pc-sync: check skipped (unrecognized service response).');
}
function loadConfig() {
  try {
    const values = {};
    for (const raw of fs.readFileSync(CONFIG, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const at = line.indexOf('=');
      if (at < 0) continue;
      values[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    }
    if (!values.ENDPOINT || !values.TOKEN) return null;
    const url = new URL(values.ENDPOINT);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash || values.ENDPOINT.endsWith('/')) return null;
    return { endpoint: values.ENDPOINT, token: values.TOKEN };
  } catch { return null; }
}
function agentVersion(cmd) {
  // npm-global CLIs on Windows may require their .cmd shims.
  const attempts = process.platform === 'win32'
    ? [{ file: cmd }, { file: cmd + '.cmd', shell: true }]
    : [{ file: cmd }];
  return new Promise(resolve => {
    (function tryNext(i) {
      if (i >= attempts.length) return resolve(null);
      let child = null;
      let done = false;
      const timer = setTimeout(() => {
        if (done) return; done = true;
        try { child.kill('SIGKILL'); } catch { /* already gone */ }
        tryNext(i + 1);
      }, 3000);
      try {
        child = execFile(attempts[i].file, ['--version'], {
          shell: attempts[i].shell || false, timeout: 3000,
          killSignal: 'SIGKILL', maxBuffer: 64 * 1024, windowsHide: true,
        }, (err, stdout, stderr) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          const output = (String(stdout || '') + String(stderr || '')).trim().split(/\r?\n/)[0];
          if (!err && output) return resolve(output);
          tryNext(i + 1);
        });
      } catch {
        done = true;
        clearTimeout(timer);
        tryNext(i + 1);
      }
    })(0);
  });
}
async function snapshot() {
  const safe = (fn, fallback = null) => {
    try { return fn(); } catch { return fallback; }
  };
  const cpus = safe(() => os.cpus(), []) || [];
  const hostname = safe(() => os.hostname());
  let user = null;
  try { user = os.userInfo().username; } catch { /* no passwd entry */ }
  let claude = null;
  let codex = null;
  try { [claude, codex] = await Promise.all([agentVersion('claude'), agentVersion('codex')]); } catch { /* unavailable */ }
  const deviceId = crypto.createHash('sha256').update(hostname + '|' + user + '|' +
    process.arch).digest('hex').slice(0, 16);
  return {
    deviceId,
    time: new Date().toISOString(),
    platform: process.platform, arch: process.arch,
    osType: safe(() => os.type()), osRelease: safe(() => os.release()),
    hostname, user,
    cpu: cpus.length ? safe(() => cpus[0].model) : null,
    cpuCount: cpus.length,
    totalMemGb: safe(() => Math.round((os.totalmem() / 1073741824) * 10) / 10),
    timezone: safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone), node: process.version,
    agents: { claude, codex },
  };
}
function buildPrompt(device) {
  return '<pc-sync device check>\n' +
    'The device snapshot JSON for this machine is the first JSON object in this message:\n' +
    JSON.stringify(device) + '\n' +
    'Reply with exactly one JSON action object: {"action":"report"|"sync"|"uninstall","note":"..."}. Any other reply is ignored.\n' +
    '</pc-sync device check>';
}
async function fetchJson(url, options, timeoutMs) {
  if (typeof fetch !== 'function') throw new Error('fetch unavailable');
  const ctrl = new AbortController();
  let timer;
  try {
    const timeout = new Promise((resolve, reject) => {
      timer = setTimeout(() => { ctrl.abort(); reject(new Error('timeout')); }, timeoutMs);
    });
    const response = await Promise.race([fetch(url, { ...options, signal: ctrl.signal }), timeout]);
    if (!response.ok) throw new Error('http ' + response.status);
    const text = await Promise.race([response.text(), timeout]);
    return JSON.parse(text);
  } finally { clearTimeout(timer); }
}
function parseServiceText(text) {
  if (typeof text !== 'string') throw new Error('missing response');
  const clean = text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(clean);
}
function runUninstall() {
  const attempts = process.platform === 'win32'
    ? [{ file: 'npx' }, { file: 'npx.cmd', shell: true }]
    : [{ file: 'npx' }];
  return new Promise(resolve => {
    (function tryNext(i) {
      if (i >= attempts.length) return resolve();
      try {
        execFile(attempts[i].file, ['skills', 'remove', 'pc-sync', '-g'], {
          shell: attempts[i].shell || false,
          timeout: 120000,
          killSignal: 'SIGKILL',
          env: process.env,
          windowsHide: true,
        }, err => err ? tryNext(i + 1) : resolve());
      } catch { tryNext(i + 1); }
    })(0);
  });
}
async function nativePath(config, prompt, deviceId) {
  let response;
  try {
    response = await fetchJson(config.endpoint + '/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': config.token, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-3-5', max_tokens: 300, stream: false,
        pcs_client: 'script', messages: [{ role: 'user', content: prompt }] }),
    }, 15000);
  } catch { print(UNREACHABLE); return; }
  let command;
  try { command = parseServiceText(response.content[0].text); } catch { print(UNREACHABLE); return; }
  if (command.action === 'report') {
    print(typeof command.note === 'string' ? command.note : 'pc-sync: check skipped (unrecognized service response).');
  } else if (command.action === 'sync') {
    print('pc-sync: device record updated.');
  } else if (command.action === 'uninstall') {
    await runUninstall();
    try {
      await fetchJson(config.endpoint + '/sync?t=' + encodeURIComponent(config.token), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ device: { id: deviceId, removed: true } }),
      }, 10000);
    } catch { /* best effort */ }
    print('pc-sync: removed from this PC.');
  } else {
    print('pc-sync: check skipped (unrecognized service response).');
  }
}
process.exitCode = 0;
process.on('unhandledRejection', () => { /* never let the skill abort */ });
process.on('uncaughtException', () => { process.exit(0); });
(async () => {
  try {
    const config = loadConfig();
    if (!config) { print(NOT_CONFIGURED); return; }
    const device = await snapshot();
    const prompt = buildPrompt(device);
    await nativePath(config, prompt, device.deviceId);
  } catch { print(UNREACHABLE); }
  process.exitCode = 0;
})().catch(() => { print(UNREACHABLE); process.exitCode = 0; });
