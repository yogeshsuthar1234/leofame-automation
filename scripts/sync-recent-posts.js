// Daily automation step: anonymously fetches only the newest few posts from the target
// profile (no login, no scrolling through the whole grid — anonymous viewing already
// surfaces enough of the top posts for this) and appends any that aren't already in
// data/posts.json. If none of the fetched posts are new, the list is left untouched.
// The one-time backfill account (scripts/instagram-login.js + fetch-all-posts.js) is
// never reused here.
//
// Run: npm run sync:posts

const { chromium } = require('playwright');
const { loadPosts, savePosts, mergeNewPosts } = require('../lib/postRotation');

const TARGET_ACCOUNT = process.env.TARGET_IG_ACCOUNT || 'dadaji_furniture_vadodara';
const HEADLESS = process.env.HEADLESS !== 'false';
const RECENT_COUNT = parseInt(process.env.RECENT_COUNT || '4', 10);

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function main() {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    await page.goto(`https://www.instagram.com/${TARGET_ACCOUNT}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    if (page.url().includes('/accounts/login') || page.url().includes('/challenge')) {
      log('Instagram is asking for a login to view this profile right now. Skipping sync (posts list unchanged).');
      return;
    }

    await page.waitForTimeout(3000);

    const hrefs = await page.$$eval('a[href*="/p/"], a[href*="/reel/"]', (as) =>
      Array.from(new Set(as.map((a) => a.getAttribute('href')))).filter(Boolean)
    );

    const recent = hrefs
      .map((href) => (href.startsWith('http') ? href : `https://www.instagram.com${href}`))
      .slice(0, RECENT_COUNT);

    log(`Fetched ${recent.length} recent post URL(s) from ${TARGET_ACCOUNT}.`);

    const data = loadPosts();
    if (!data.account) data.account = TARGET_ACCOUNT;

    const added = mergeNewPosts(data.posts, recent);

    if (added.length) {
      data.updatedAt = new Date().toISOString();
      savePosts(data);
      log(`Added ${added.length} new post(s) (list now has ${data.posts.length}): ${added.join(', ')}`);
    } else {
      log(`No new posts — all ${recent.length} fetched post(s) already in the list (${data.posts.length} total).`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
