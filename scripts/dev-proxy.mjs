#!/usr/bin/env node
/**
 * 本地静态服务 + STOP API 反向代理
 *
 * 原 demo/stop.html 默认走同源路径：
 *   /stop-work-api  → http://111.56.250.18:8081/api
 *   /stop-base-api  → http://111.56.250.18:25100/api   （登录 /v1/user/login）
 *   /stop-analysis  → http://111.56.250.18:9528
 *
 * 纯 npx serve / python -m http.server 没有代理 → 登录会 404。
 * 请用本脚本启动（默认端口 5173）。
 */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || '127.0.0.1';

const PROXIES = [
  { prefix: '/stop-work-api', target: 'http://111.56.250.18:8081/api' },
  { prefix: '/stop-base-api', target: 'http://111.56.250.18:25100/api' },
  { prefix: '/stop-analysis', target: 'http://111.56.250.18:9528' },
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
  '.map': 'application/json',
  '.webp': 'image/webp',
};

function matchProxy(pathname) {
  for (const p of PROXIES) {
    if (pathname === p.prefix || pathname.startsWith(p.prefix + '/')) {
      const rest = pathname.slice(p.prefix.length) || '/';
      return { targetBase: p.target, rest };
    }
  }
  return null;
}

function proxyRequest(req, res, targetBase, rest) {
  const incoming = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const dest = new URL(targetBase.replace(/\/$/, '') + rest);
  dest.search = incoming.search;

  const lib = dest.protocol === 'https:' ? https : http;
  const headers = { ...req.headers };
  // 避免把本地 Host 传给上游
  headers.host = dest.host;
  delete headers['accept-encoding']; // 简化：拿明文响应

  const upstream = lib.request(
    dest,
    { method: req.method, headers },
    (up) => {
      const outHeaders = { ...up.headers };
      // 同源代理，去掉上游 CORS，避免重复
      delete outHeaders['access-control-allow-origin'];
      delete outHeaders['access-control-allow-credentials'];
      delete outHeaders['access-control-allow-headers'];
      delete outHeaders['access-control-allow-methods'];
      res.writeHead(up.statusCode || 502, outHeaders);
      up.pipe(res);
    }
  );
  upstream.on('error', (err) => {
    console.error('[proxy]', dest.href, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    res.end(JSON.stringify({ code: 0, message: 'STOP 上游代理失败: ' + err.message, data: null }));
  });
  req.pipe(upstream);
}

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  let rel = decoded === '/' ? '/index.html' : decoded;
  // 去掉首斜杠
  rel = rel.replace(/^\/+/, '');
  const full = path.normalize(path.join(root, rel));
  if (!full.startsWith(root)) return null;
  return full;
}

function sendFile(res, filePath) {
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const hit = matchProxy(u.pathname);
  if (hit) {
    console.log(`[proxy] ${req.method} ${u.pathname} -> ${hit.targetBase}${hit.rest}`);
    proxyRequest(req, res, hit.targetBase, hit.rest);
    return;
  }

  // 静态
  let filePath = safeJoin(ROOT, u.pathname);
  if (!filePath) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.stat(filePath, (err, st) => {
    if (!err && st.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    sendFile(res, filePath);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`STOP 本地演示服务已启动: http://${HOST}:${PORT}/`);
  console.log(`  stop.html: http://${HOST}:${PORT}/stop.html`);
  console.log('代理映射:');
  for (const p of PROXIES) console.log(`  ${p.prefix}  →  ${p.target}`);
  console.log('提示: 请勿用裸 npx serve（无代理会导致 /stop-base-api 登录 404）');
});
