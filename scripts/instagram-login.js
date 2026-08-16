// One-time (re-runnable) helper: opens a real, visible browser to log into Instagram,
// then saves the resulting session (cookies + storage) to auth/ig-session.json.
// This is only needed for the one-time full backfill (scripts/fetch-all-posts.js) —
// daily automation (scripts/sync-recent-posts.js) fetches anonymously and never touches
// this session or any credentials.
//
// Two modes:
//   - Automated: set IG_LOGIN_USERNAME + IG_LOGIN_PASSWORD env vars (not in .env, not
//     committed — pass them inline on the command line for this one run) and the form
//     is filled/submitted automatically. If Instagram still shows a checkpoint/2FA
//     screen, the visible browser window lets you complete it by hand.
//   - Manual: leave those env vars unset and log in yourself in the opened window.
//
// Run locally: npm run login:ig

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const AUTH_DIR = path.join(__dirname, '..', 'auth');
const SESSION_PATH = path.join(AUTH_DIR, 'ig-session.json');
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const IG_LOGIN_USERNAME = process.env.IG_LOGIN_USERNAME || '';
const IG_LOGIN_PASSWORD = process.env.IG_LOGIN_PASSWORD || '';

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function main() {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded' });

  if (IG_LOGIN_USERNAME && IG_LOGIN_PASSWORD) {
    log('Filling login form automatically...');
    try {
      await page.fill('input[name="username"]', IG_LOGIN_USERNAME, { timeout: 15000 });
      await page.fill('input[name="password"]', IG_LOGIN_PASSWORD, { timeout: 15000 });
      await page.click('button[type="submit"]', { timeout: 15000 });
    } catch (e) {
      log(`Auto-fill failed (${e.message}) — falling back to manual login in the open window.`);
    }
  }

  console.log('\nA browser window has opened.');
  console.log('Complete login there, including any checkpoint/2FA/OTP screen.');
  console.log('This waits for an actual authenticated session cookie (not just the URL,');
  console.log('since Instagram can redirect to the home page before OTP is even resolved),');
  console.log('until login finishes or 5 minutes pass.\n');

  const start = Date.now();
  let loggedIn = false;
  while (Date.now() - start < LOGIN_TIMEOUT_MS) {
    const cookies = await context.cookies('https://www.instagram.com');
    const sessionCookie = cookies.find((c) => c.name === 'sessionid' && c.value);
    if (sessionCookie) {
      loggedIn = true;
      break;
    }
    await page.waitForTimeout(2000);
  }

  if (!loggedIn) {
    console.error('Timed out waiting for login to complete. Run "npm run login:ig" again.');
    await browser.close();
    process.exit(1);
  }

  log('Authenticated session detected.');
  await page.waitForTimeout(2000);
  await context.storageState({ path: SESSION_PATH });

  log(`Session saved to ${SESSION_PATH}`);
  console.log('\nNext step: npm run fetch:posts   # one-time backfill of all existing posts');
  console.log('This session is only used locally for the backfill — daily automation never');
  console.log('touches it (it fetches anonymously instead), so nothing needs to go into CI.');

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
