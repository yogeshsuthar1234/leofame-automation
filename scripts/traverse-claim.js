// Daily "boost every known post" sweep: for each post in data/posts.json assigned to
// this shard, submits it to all 4 leofame free-trial pages (likes, views, saves,
// shares), waiting for each claim to register before moving to the next page/post.
//
// Runs as one lane of a sharded GitHub Actions matrix (see
// .github/workflows/daily-full-traverse.yml) so the whole list finishes within a single
// job's runtime limit even as data/posts.json keeps growing.
//
// Env vars:
//   SHARD_INDEX   - 0-based index of this shard (default 0)
//   TOTAL_SHARDS  - total number of shards (default 1 = process everything, one lane)
//   CLAIM_WAIT_MS - ms to wait after clicking submit on each page (default 90000 = 1:30)
//   HEADLESS      - true/false (default true)

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { loadPosts } = require('../lib/postRotation');

const SHARD_INDEX = parseInt(process.env.SHARD_INDEX || '0', 10);
const TOTAL_SHARDS = parseInt(process.env.TOTAL_SHARDS || '1', 10);
const CLAIM_WAIT_MS = parseInt(process.env.CLAIM_WAIT_MS || '90000', 10);
const HEADLESS = process.env.HEADLESS !== 'false';
const NAV_TIMEOUT = parseInt(process.env.NAV_TIMEOUT || '45000', 10);

const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

const PAGES = [
  { key: 'likes', url: 'https://leofame.com/free-instagram-likes' },
  { key: 'views', url: 'https://leofame.com/free-instagram-views' },
  { key: 'saves', url: 'https://leofame.com/free-instagram-saves' },
  { key: 'shares', url: 'https://leofame.com/free-instagram-shares' },
];

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function screenshot(page, name) {
  try {
    if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`) });
  } catch (e) {
    log(`Screenshot failed (${name}): ${e.message}`);
  }
}

function shortcodeOf(url) {
  const match = url.match(/\/(p|reel)\/([^/?]+)/);
  return match ? match[2] : url.replace(/[^a-zA-Z0-9]/g, '_');
}

async function submitOne(context, postUrl, pageDef) {
  const label = `${shortcodeOf(postUrl)}-${pageDef.key}`;
  const page = await context.newPage();
  try {
    await page.goto(pageDef.url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await page.waitForSelector('#free-form', { timeout: NAV_TIMEOUT });

    const submitButton = page.locator('#checkout-continue');
    const buttonText = ((await submitButton.textContent()) || '').trim();
    const isDisabled = await submitButton.isDisabled();

    if (isDisabled || /maintenance/i.test(buttonText)) {
      log(`[${label}] Unavailable right now (button: "${buttonText}"). Skipping.`);
      return 'unavailable';
    }

    await page.fill('#free_link', postUrl);
    await submitButton.click();
    log(`[${label}] Submitted, waiting ${Math.round(CLAIM_WAIT_MS / 1000)}s...`);

    await page.waitForSelector('#FreeProgressContainer:not(.d-none)', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(CLAIM_WAIT_MS);
    await screenshot(page, label);

    log(`[${label}] Done.`);
    return 'submitted';
  } catch (err) {
    log(`[${label}] Error: ${err.message}`);
    await screenshot(page, `${label}-error`);
    return 'error';
  } finally {
    await page.close();
  }
}

async function main() {
  const { posts } = loadPosts();
  if (!posts.length) {
    log('No posts in data/posts.json — nothing to do.');
    return;
  }

  const shardPosts = posts.filter((_, i) => i % TOTAL_SHARDS === SHARD_INDEX);
  log(`Shard ${SHARD_INDEX}/${TOTAL_SHARDS}: ${shardPosts.length} of ${posts.length} total posts assigned.`);

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  const summary = { submitted: 0, unavailable: 0, error: 0 };

  try {
    for (let i = 0; i < shardPosts.length; i += 1) {
      const postUrl = shardPosts[i];
      log(`Post ${i + 1}/${shardPosts.length}: ${postUrl}`);
      for (const pageDef of PAGES) {
        const status = await submitOne(context, postUrl, pageDef);
        summary[status] = (summary[status] || 0) + 1;
      }
    }
  } finally {
    await browser.close();
  }

  log(`Shard ${SHARD_INDEX} finished. ${JSON.stringify(summary)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
