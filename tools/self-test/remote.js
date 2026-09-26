#!/usr/bin/env node
/**
 * Runs the Figma self-test from a terminal (or from Claude Code) while the
 * Copydesk Self-Test window is open in Figma desktop.
 *
 *   npm run self-test:remote            # the 24 tests
 *   npm run self-test:remote -- perf    # the 5,000-layer timing run
 *   npm run self-test:remote -- run --timeout 300
 *
 * The plugin window polls http://localhost:3847 for a command and posts each
 * outcome and the final report back. Exit code: 0 all passed, 1 a test failed,
 * 2 the window never connected or the run timed out. Plain HTTP and no
 * dependencies, so it runs anywhere Node 22 does.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3847;
const args = process.argv.slice(2);
const kind = args.find((a) => a === 'run' || a === 'perf') ?? 'run';
const timeoutAt = args.indexOf('--timeout');
const timeoutSec = timeoutAt === -1 ? (kind === 'perf' ? 900 : 300) : Number(args[timeoutAt + 1]);
const bundle = path.join(__dirname, 'dist', 'code.js');

let command = kind;
let connected = false;

function finish(code, message) {
  if (message) console.log(message);
  server.close();
  process.exit(code);
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
  });
}

const server = http.createServer(async (req, res) => {
  // The plugin iframe has a null origin; allow it. Requests are text/plain
  // "simple" requests, but Chromium still preflights a public page reaching
  // localhost (Private Network Access), so answer that preflight too.
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method === 'GET' && req.url === '/command') {
    if (!connected) {
      connected = true;
      console.log('Connected to the Self-Test window.');
    }
    res.end(JSON.stringify({ command }));
    command = null;
    return;
  }
  if (req.method === 'POST' && req.url === '/outcome') {
    const { outcome } = JSON.parse(await readBody(req));
    console.log(`${outcome.ok ? 'PASS' : 'FAIL'}  ${outcome.name}${outcome.detail ? ` — ${outcome.detail}` : ''}`);
    res.end('ok');
    return;
  }
  if (req.method === 'POST' && req.url === '/report') {
    const report = JSON.parse(await readBody(req));
    res.end('ok');
    const built = fs.existsSync(bundle) ? fs.statSync(bundle).mtimeMs : 0;
    if (report.builtAt && built && built - report.builtAt > 1000) {
      console.log(
        '\nWARNING: Figma ran an older build than tools/self-test/dist/code.js. ' +
          'Close and reopen the Self-Test window to load the new one, then run again.'
      );
    }
    finish(report.failed === 0 ? 0 : 1, `\n${report.summary}`);
    return;
  }
  res.statusCode = 404;
  res.end();
});

server.on('error', (error) => {
  finish(2, error.code === 'EADDRINUSE' ? `Port ${PORT} is in use: is another self-test:remote running?` : String(error));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Waiting for the Copydesk Self-Test window in Figma desktop (localhost:${PORT})…`);
  console.log('If it is not open: Plugins → Development → Copydesk Self-Test (dev only).');
});

setTimeout(() => {
  finish(
    2,
    connected
      ? `Timed out after ${timeoutSec}s without a report.`
      : `No Self-Test window connected within ${timeoutSec}s. Open it in Figma desktop and run this again.`
  );
}, timeoutSec * 1000);
