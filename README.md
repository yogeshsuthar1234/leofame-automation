# leofame-automation

Automates claiming **your own** daily free trial (followers, likes, views, saves, or
shares) on [leofame.com](https://leofame.com/) for your Instagram posts. It does not
create accounts and does not touch your Instagram login/password (leofame's free
trial only ever asks for a public username or post URL).

There are two ways to run this, and only one should be scheduled at a time (see
below): a single round-robin claim once a day (`claim.js`), or the full daily sweep
that boosts every known post across all 4 metrics (`scripts/traverse-claim.js`).

## Files

| File | Purpose |
|------|---------|
| `claim.js` | Single-claim mode: submits one post (round-robin) to one leofame page |
| `scripts/traverse-claim.js` | Full-sweep mode: submits every known post to all 4 leofame pages |
| `lib/postRotation.js` | Reads/writes `data/posts.json` and picks the next post round-robin |
| `scripts/instagram-login.js` | One-time: log into Instagram yourself, saves the session locally |
| `scripts/fetch-all-posts.js` | One-time backfill: scrolls the full profile grid, saves every post URL |
| `scripts/sync-recent-posts.js` | Daily: fetches only the newest ~4 posts and appends any not already known |
| `data/posts.json` | The growing list of known post URLs for the tracked account |
| `data/rotation-state.json` | Which post the round-robin (`claim.js`) claimed last |
| `.env.example` | Config template |
| `.github/workflows/daily-claim.yml` | Single round-robin claim — manual trigger only (see below) |
| `.github/workflows/daily-full-traverse.yml` | Full sweep of every post × all 4 metrics, runs nightly |

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env   # then edit .env with your details
node claim.js
```

## Configuration (`.env`)

| Variable | Meaning |
|---|---|
| `CLAIM_TYPE` | `followers`, `likes`, or `views` |
| `INSTAGRAM_USERNAME` | Your own public username (only for `followers`) |
| `INSTAGRAM_POST_URL` | Link to your own public post (`likes`/`views`). Leave blank to auto-pick from `data/posts.json` instead |
| `HEADLESS` | `true` for headless (default in CI), `false` to watch it run locally |
| `TARGET_IG_ACCOUNT` | Instagram account tracked in `data/posts.json` (default `dadaji_furniture_vadodara`) |

Note: as of this writing, leofame's **free followers** trial button shows
"Under maintenance" on their site — `claim.js` detects this and skips
cleanly instead of failing. Likes and views trials were active.

## Tracking posts without re-scraping everything daily

Scraping all 142 posts every day is slow and more likely to trip Instagram's
anti-bot limits. Instead:

1. **One-time setup** (run locally — use a separate/throwaway Instagram account for
   this login, since it's the only script that ever authenticates):
   ```bash
   npm run login:ig      # opens a real browser — log in yourself, incl. any 2FA/OTP
   npm run fetch:posts   # scrolls the whole profile, saves every post URL to data/posts.json
   ```
2. Commit the resulting `data/posts.json` (it only contains public post URLs).
3. From then on, daily automation only calls `npm run sync:posts`, which fetches
   **anonymously** (no login, no session file) — just the newest ~4 posts
   (`RECENT_COUNT` env var, default 4) — and:
   - if all of them are already in `data/posts.json` → does nothing, list stays as-is
   - if any are new → appends just those, so the list grows over time
   Anonymous profile views on Instagram surface roughly the newest dozen posts, which is
   comfortably enough for a top-4 check — the login account from step 1 is never reused here.
4. `claim.js` picks the next post from that list round-robin (via
   `lib/postRotation.js`) whenever `INSTAGRAM_POST_URL` isn't explicitly set, so claims
   cycle through every known post instead of hammering one link.

`auth/ig-session.json` (created by `npm run login:ig`) stays local only — it's
gitignored and never uploaded anywhere, since daily CI doesn't need it.

## Full daily sweep: every post × likes/views/saves/shares

`scripts/traverse-claim.js` walks every post in `data/posts.json` and submits each one
to all 4 leofame pages, waiting 90 seconds after each submit for the claim to register
before moving on:

- `https://leofame.com/free-instagram-likes`
- `https://leofame.com/free-instagram-views`
- `https://leofame.com/free-instagram-saves`
- `https://leofame.com/free-instagram-shares`

At 142 posts this is 142 × 4 × 90s ≈ 14 hours, and grows as the list grows — far beyond
GitHub Actions' hard 6-hour-per-job limit (a platform limit, not a billing one, so it
applies even on a free public repo). `.github/workflows/daily-full-traverse.yml` works
around this by sharding the list across 8 parallel matrix jobs (`NUM_SHARDS` env in that
file) — each shard only handles every 8th post, so the whole sweep fits comfortably
inside one job's runtime even as the list grows. If the list eventually grows large
enough that a shard is approaching several hours, bump `NUM_SHARDS` and add the new
index to the `matrix.shard` list.

Verified before turning this on: leofame processes different post URLs to the same
page independently in one session — it doesn't block a second post's claim just
because a different post was already claimed that day.

To try it locally on a small slice first (recommended before relying on the nightly
run):
```bash
SHARD_INDEX=0 TOTAL_SHARDS=142 HEADLESS=false npm run traverse   # just 1 post, visibly
```

## Running on GitHub Actions

Only one of these two workflows should have an active `schedule:` trigger at a time —
running both would double-submit likes/views for the same posts.

**Full sweep (`daily-full-traverse.yml`, recommended — this is the one currently scheduled):**
1. Push this repo to GitHub (including the `data/posts.json` you backfilled locally).
2. Repo → Settings → Actions → General → Workflow permissions → **Read and write
   permissions** (needed so the workflow can commit `data/posts.json` updates back).
3. Optionally set repository variable `TARGET_IG_ACCOUNT`.
4. Runs daily at 00:00 UTC (and can be triggered manually from the Actions tab): syncs
   the latest posts anonymously, commits any change, then runs the sharded sweep.
   Screenshots from each shard are uploaded as separate artifacts.

**Single round-robin claim (`daily-claim.yml`, manual-only for now):**
Its `schedule:` trigger is disabled since the full sweep above already covers
likes/views for every post. It's left as `workflow_dispatch`-only — useful for a one-off
`CLAIM_TYPE=followers` run (followers aren't part of the per-post sweep) via secrets
`INSTAGRAM_USERNAME`/`INSTAGRAM_POST_URL` and repository variable `CLAIM_TYPE`.
