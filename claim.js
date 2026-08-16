// Claims your own daily free trial on leofame.com (followers, likes, or views).
// Runs once per invocation — schedule it at most once every 24h (see .github/workflows/daily-claim.yml),
// matching leofame's own stated reset window. Does not create accounts or bypass any limits.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  CLAIM_TYPE: (process.env.CLAIM_TYPE || 'likes').toLowerCase(), // followers | likes | views
  INSTAGRAM_USERNAME: process.env.INSTAGRAM_USERNAME || '',
  INSTAGRAM_POST_URL: process.env.INSTAGRAM_POST_URL || '',
  HEADLESS: process.env.HEADLESS !== undefined ? process.env.HEADLESS === 'true' : !!process.env.CI,
  NAV_TIMEOUT: parseInt(process.env.NAV_TIMEOUT || '45000', 10),
  RESULT_WAIT: parseInt(process.env.RESULT_WAIT || '20000', 10),
};

const PAGES = {
  followers: 'https://leofame.com/free-instagram-followers',
  likes: 'https://leofame.com/free-instagram-likes',
  views: 'https://leofame.com/free-instagram-views',
};

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function screenshot(page, name) {
  try {
    if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: true });
  } catch (e) {
    log(`Screenshot failed (${name}): ${e.message}`);
  }
}

async function claim() {
  const claimType = CONFIG.CLAIM_TYPE;
  const url = PAGES[claimType];
  if (!url) {
    throw new Error(`Unknown CLAIM_TYPE "${claimType}". Use one of: followers, likes, views`);
  }

  const linkValue = claimType === 'followers' ? CONFIG.INSTAGRAM_USERNAME : CONFIG.INSTAGRAM_POST_URL;
  if (!linkValue) {
    throw new Error(
      claimType === 'followers'
        ? 'INSTAGRAM_USERNAME is required for CLAIM_TYPE=followers'
        : 'INSTAGRAM_POST_URL is required for CLAIM_TYPE=likes/views'
    );
  }

  log(`Starting leofame ${claimType} claim for: ${linkValue}`);

  const browser = await chromium.launch({ headless: CONFIG.HEADLESS });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CONFIG.NAV_TIMEOUT });
    await page.waitForSelector('#free-form', { timeout: CONFIG.NAV_TIMEOUT });
    await screenshot(page, `${claimType}-loaded`);

    const submitButton = page.locator('#checkout-continue');
    const buttonText = ((await submitButton.textContent()) || '').trim();
    const isDisabled = await submitButton.isDisabled();

    if (isDisabled || /maintenance/i.test(buttonText)) {
      log(`Claim unavailable right now (button: "${buttonText}", disabled: ${isDisabled}). Skipping.`);
      await screenshot(page, `${claimType}-unavailable`);
      return { status: 'unavailable', buttonText };
    }

    await page.fill('#free_link', linkValue);
    await screenshot(page, `${claimType}-filled`);

    await submitButton.click();
    log('Submitted claim, waiting for confirmation...');

    await page
      .waitForSelector('#FreeProgressContainer:not(.d-none)', { timeout: CONFIG.RESULT_WAIT })
      .catch(() => {});
    await page.waitForTimeout(CONFIG.RESULT_WAIT);
    await screenshot(page, `${claimType}-submitted`);

    log('Claim flow finished. Check the screenshot to confirm it went through.');
    return { status: 'submitted' };
  } catch (err) {
    log(`Error: ${err.message}`);
    await screenshot(page, `${claimType}-error`);
    throw err;
  } finally {
    await browser.close();
  }
}

claim()
  .then((result) => {
    log(`Done: ${JSON.stringify(result)}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
