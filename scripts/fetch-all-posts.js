// One-time backfill: scrolls the target profile's grid to the very bottom, collecting
// every post/reel URL, and writes the full list to data/posts.json. Run this once
// locally (after npm run login:ig) to seed the list — daily automation only ever
// calls scripts/sync-recent-posts.js after this, which fetches a handful of posts
// instead of scrolling through everything again.
//
// Run locally: npm run fetch:posts

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { loadPosts, savePosts } = require('../lib/postRotation');

const SESSION_PATH = path.join(__dirname, '..', 'auth', 'ig-session.json');
const TARGET_ACCOUNT = process.env.TARGET_IG_ACCOUNT || 'dadaji_furniture_vadodara';
const HEADLESS = process.env.HEADLESS === 'true';
const STABLE_ROUNDS_TO_STOP = 10;
const MAX_RUNTIME_MS = 15 * 60 * 1000;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function collectPostLinks(page) {
  return page.$$eval('a[href*="/p/"], a[href*="/reel/"]', (as) =>
    Array.from(new Set(as.map((a) => a.getAttribute('href')))).filter(Boolean)
  );
}

async function main() {
  if (!fs.existsSync(SESSION_PATH)) {
    throw new Error(`No saved Instagram session at ${SESSION_PATH}. Run "npm run login:ig" first.`);
  }

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ storageState: SESSION_PATH });
  const page = await context.newPage();

  try {
    await page.goto(`https://www.instagram.com/${TARGET_ACCOUNT}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    if (page.url().includes('/accounts/login') || page.url().includes('/challenge')) {
      throw new Error('Instagram session is expired/invalid. Run "npm run login:ig" again.');
    }

    const seen = new Set();
    let stableRounds = 0;
    const startTime = Date.now();

    while (stableRounds < STABLE_ROUNDS_TO_STOP && Date.now() - startTime < MAX_RUNTIME_MS) {
      const links = await collectPostLinks(page);
      const before = seen.size;
      links.forEach((l) => seen.add(l));

      if (seen.size === before) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
        log(`Collected ${seen.size} post URLs so far...`);
      }

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.mouse.wheel(0, 6000);
      // Instagram's lazy-load gets slower (soft rate limiting) the further you scroll,
      // so wait longer between checks the more consecutive no-growth rounds we've seen.
      await page.waitForTimeout(2500 + stableRounds * 1000);
    }

    const posts = Array.from(seen).map((href) =>
      href.startsWith('http') ? href : `https://www.instagram.com${href}`
    );

    log(`Done. Found ${posts.length} total post URLs for ${TARGET_ACCOUNT}.`);

    const data = loadPosts();
    data.account = TARGET_ACCOUNT;
    data.posts = posts;
    data.updatedAt = new Date().toISOString();
    savePosts(data);

    log('Saved to data/posts.json');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
