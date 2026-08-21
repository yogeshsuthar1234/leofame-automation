// Local admin UI for data/posts.json — lets you paste Instagram post/reel URLs in by
// hand instead of relying on the anonymous scraper in scripts/sync-recent-posts.js,
// which Instagram's bot detection sometimes blocks entirely on CI runners.
//
// Run: npm run posts:ui   (opens http://localhost:4321)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadPosts, savePosts, mergeNewPosts, removePost } = require('../lib/postRotation');

const PORT = process.env.PORT || 4321;
const PUBLIC_DIR = path.join(__dirname, 'public');

const CONTENT_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function isInstagramPostUrl(url) {
  return typeof url === 'string' && /instagram\.com\/(?:[^/]+\/)?(p|reel)\/[^/?]+/.test(url);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  const requestedPath = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(PUBLIC_DIR, requestedPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const type = CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/api/posts' && req.method === 'GET') {
      return sendJson(res, 200, loadPosts());
    }

    if (req.url === '/api/posts' && req.method === 'POST') {
      const { url } = await readJsonBody(req);
      if (!isInstagramPostUrl(url)) {
        return sendJson(res, 400, { error: 'Paste a valid instagram.com post or reel URL.' });
      }
      const data = loadPosts();
      const added = mergeNewPosts(data.posts, [url]);
      if (!added.length) {
        return sendJson(res, 409, { error: 'That post is already in the list.' });
      }
      data.updatedAt = new Date().toISOString();
      savePosts(data);
      return sendJson(res, 200, data);
    }

    if (req.url === '/api/posts' && req.method === 'DELETE') {
      const { url } = await readJsonBody(req);
      const data = loadPosts();
      const removed = removePost(data.posts, url || '');
      if (!removed) {
        return sendJson(res, 404, { error: 'That post was not found in the list.' });
      }
      data.updatedAt = new Date().toISOString();
      savePosts(data);
      return sendJson(res, 200, data);
    }

    if (req.method === 'GET') {
      return serveStatic(req, res);
    }

    res.writeHead(404);
    res.end('Not found');
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Posts admin UI running at http://localhost:${PORT}`);
});
