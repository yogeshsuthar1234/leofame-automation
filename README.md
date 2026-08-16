# leofame-automation

Automates claiming **your own** daily free trial (followers, likes, or views) on
[leofame.com](https://leofame.com/) once a day — matching the reset window leofame
itself advertises. It does not create accounts, does not touch your Instagram
login/password (leofame's free trial only ever asks for a public username or post
URL), and does not attempt to claim more than once per day.

## Files

| File | Purpose |
|------|---------|
| `claim.js` | Opens the relevant leofame free-trial page and submits your link |
| `.env.example` | Config template |
| `.github/workflows/daily-claim.yml` | Runs the claim once every 24h on GitHub Actions |

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
| `INSTAGRAM_POST_URL` | Link to your own public post (only for `likes`/`views`) |
| `HEADLESS` | `true` for headless (default in CI), `false` to watch it run locally |

Note: as of this writing, leofame's **free followers** trial button shows
"Under maintenance" on their site — `claim.js` detects this and skips
cleanly instead of failing. Likes and views trials were active.

## Running on GitHub Actions (once/day)

1. Push this repo to GitHub.
2. Repo → Settings → Secrets and variables → Actions:
   - Add secret `INSTAGRAM_USERNAME` and/or `INSTAGRAM_POST_URL`.
   - Add repository variable `CLAIM_TYPE` (`followers`/`likes`/`views`).
3. The `daily-claim` workflow runs on a daily cron (and can be triggered manually
   from the Actions tab). Screenshots from each run are uploaded as an artifact
   so you can confirm the claim went through.
