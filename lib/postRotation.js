const fs = require('fs');
const path = require('path');

const POSTS_PATH = path.join(__dirname, '..', 'data', 'posts.json');
const ROTATION_PATH = path.join(__dirname, '..', 'data', 'rotation-state.json');

function loadPosts() {
  if (!fs.existsSync(POSTS_PATH)) return { account: '', posts: [], updatedAt: null };
  return JSON.parse(fs.readFileSync(POSTS_PATH, 'utf8'));
}

function savePosts(data) {
  if (!fs.existsSync(path.dirname(POSTS_PATH))) fs.mkdirSync(path.dirname(POSTS_PATH), { recursive: true });
  fs.writeFileSync(POSTS_PATH, JSON.stringify(data, null, 2) + '\n');
}

function loadRotationState() {
  if (!fs.existsSync(ROTATION_PATH)) return { lastIndex: -1 };
  return JSON.parse(fs.readFileSync(ROTATION_PATH, 'utf8'));
}

function saveRotationState(state) {
  if (!fs.existsSync(path.dirname(ROTATION_PATH))) fs.mkdirSync(path.dirname(ROTATION_PATH), { recursive: true });
  fs.writeFileSync(ROTATION_PATH, JSON.stringify(state, null, 2) + '\n');
}

// Collapses any post/reel URL down to a canonical https://www.instagram.com/p|reel/<code>/ form
// so the same post fetched via different link styles is never double-added to the list.
function normalizePostUrl(url) {
  const match = url.match(/\/(p|reel)\/([^/?]+)/);
  if (!match) return url.split('?')[0].replace(/\/$/, '') + '/';
  return `https://www.instagram.com/${match[1]}/${match[2]}/`;
}

function mergeNewPosts(existingPosts, freshUrls) {
  const known = new Set(existingPosts.map(normalizePostUrl));
  const added = [];
  for (const url of freshUrls) {
    const normalized = normalizePostUrl(url);
    if (!known.has(normalized)) {
      known.add(normalized);
      existingPosts.push(normalized);
      added.push(normalized);
    }
  }
  return added;
}

function getNextPostUrl() {
  const { posts } = loadPosts();
  if (!posts.length) return null;
  const state = loadRotationState();
  const nextIndex = (state.lastIndex + 1) % posts.length;
  saveRotationState({ lastIndex: nextIndex });
  return posts[nextIndex];
}

module.exports = {
  POSTS_PATH,
  ROTATION_PATH,
  loadPosts,
  savePosts,
  loadRotationState,
  saveRotationState,
  normalizePostUrl,
  mergeNewPosts,
  getNextPostUrl,
};
