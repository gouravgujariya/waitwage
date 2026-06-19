# Kickback Status — Scale Plan: Private Beta to 1,000 Developers

## Reality Check (Current Gaps)

| What exists | What is missing |
|---|---|
| Extension + task/terminal hooks | Auth on any route |
| Round-robin ad serving | Invite gate |
| Local earnings store (globalState) | JWT / SecretStorage |
| SQLite backend | Rate limiting, input validation |
| Admin dashboard | Admin login |
| Mock backend for local dev | HTTPS, payout pipeline |

Anyone who finds the backend URL can POST fake impressions today. Every section below fixes that.

---

## Section 1 — Invite System

**Decision: Email allowlist + one-time 16-char invite codes. No OAuth.**

GitHub OAuth adds dependency complexity for 50 people. Invite codes prevent sharing (each code is single-use) and give you a clean beta roster.

**New DB tables (`server/db.js`):**

```sql
CREATE TABLE IF NOT EXISTS beta_invites (
  code        TEXT PRIMARY KEY,   -- e.g. KICK-ABCD-1234-XY
  email       TEXT NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  used_at     INTEGER,
  used_by_user_id TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,   -- UUID, server-minted at registration
  email       TEXT NOT NULL UNIQUE,
  invite_code TEXT NOT NULL,
  upi_id      TEXT,               -- set later via kickbackStatus.setPayoutUPI
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  status      TEXT NOT NULL DEFAULT 'active'  -- active | revoked
);
```

**Invite code script (`scripts/gen-invites.js`):**
Reads a list of emails from a file and inserts rows into `beta_invites`. Run once per cohort.

---

## Section 2 — JWT Flow

### 2a. Token issuance (`server/auth.js` — new file)

```js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET; // 64-byte hex in env, never in source

function signToken(userId) {
  return jwt.sign(
    { sub: userId },
    JWT_SECRET,
    { expiresIn: '90d', issuer: 'kickback-status' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, { issuer: 'kickback-status' });
}

module.exports = { signToken, verifyToken };
```

### 2b. Registration endpoint (`server/backend.js`)

```js
app.post('/v1/register', (req, res) => {
  const { inviteCode } = req.body;
  const invite = db.prepare(
    'SELECT * FROM beta_invites WHERE code = ? AND used_at IS NULL'
  ).get(inviteCode?.toUpperCase().trim());

  if (!invite) return res.status(403).json({ error: 'invalid or already used code' });

  const userId = randomUUID();
  db.prepare('INSERT INTO users (id, email, invite_code) VALUES (?, ?, ?)')
    .run(userId, invite.email, invite.code);
  db.prepare('UPDATE beta_invites SET used_at = ?, used_by_user_id = ? WHERE code = ?')
    .run(Math.floor(Date.now() / 1000), userId, invite.code);

  res.json({ token: signToken(userId), userId });
});
```

### 2c. Auth middleware (`server/middleware.js` — new file)

```js
const { verifyToken } = require('./auth');

function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'missing token' });

  try {
    const claims = verifyToken(header.slice(7));
    const user = db.prepare('SELECT status FROM users WHERE id = ?').get(claims.sub);
    if (!user || user.status === 'revoked') return res.status(403).json({ error: 'account_revoked' });
    req.userId = claims.sub; // server sets this — body userId is ignored
    next();
  } catch (e) {
    const code = e.name === 'TokenExpiredError' ? 'token_expired' : 'invalid_token';
    res.status(401).json({ error: code });
  }
}

module.exports = { requireAuth };
```

Apply to all `/v1/` routes: `app.use('/v1', requireAuth);`

### 2d. Token storage in extension (`src/authStore.ts` — new file)

```typescript
import * as vscode from 'vscode';

export class AuthStore {
  constructor(private context: vscode.ExtensionContext) {}

  async getToken(): Promise<string | undefined> {
    return this.context.secrets.get('kickbackStatus.jwt');
  }

  async setToken(token: string, userId: string): Promise<void> {
    await this.context.secrets.store('kickbackStatus.jwt', token);
    await this.context.globalState.update('kickbackStatus.userId', userId);
  }

  async clearToken(): Promise<void> {
    await this.context.secrets.delete('kickbackStatus.jwt');
    await this.context.globalState.update('kickbackStatus.userId', undefined);
  }

  getUserId(): string | undefined {
    return this.context.globalState.get<string>('kickbackStatus.userId');
  }
}
```

`vscode.SecretStorage` uses the OS keychain (not a plain JSON file like `globalState`).

### 2e. Registration command (`src/extension.ts`)

```typescript
vscode.commands.registerCommand('kickbackStatus.activate', async () => {
  const code = await vscode.window.showInputBox({
    prompt: 'Enter your Kickback Status invite code',
    placeHolder: 'KICK-XXXX-XXXX-XX',
    ignoreFocusOut: true,
  });
  if (!code) return;
  try {
    const result = await sponsorClient.register(code.trim());
    await authStore.setToken(result.token, result.userId);
    vscode.window.showInformationMessage('Kickback Status activated. You will start earning on your next build.');
  } catch {
    vscode.window.showErrorMessage('Invalid or already used invite code.');
  }
})
```

### 2f. Token refresh

- Add `POST /v1/token/refresh` — accepts a valid (non-expired) token, returns a new 90-day token.
- Extension checks on startup: if last-refresh was >83 days ago, refresh silently.
- If `401 token_expired` received mid-session, prompt user to run `kickbackStatus.activate` again.

### 2g. SponsorClient changes

All `/v1/` calls must include `Authorization: Bearer <token>` header. Update the `request()` method to accept an optional auth token passed from `AuthStore`.

---

## Section 3 — Impression Integrity

After the JWT change, `req.userId` comes from the verified token — the client body is ignored. This blocks cross-user inflation.

**Per-user rate limit (in `server/middleware.js`):**

```js
const impressionCounts = new Map(); // userId -> { count, resetAt }

function rateLimitImpressions(req, res, next) {
  const now = Date.now();
  const DAY = 86_400_000;
  let rec = impressionCounts.get(req.userId);
  if (!rec || now > rec.resetAt) rec = { count: 0, resetAt: now + DAY };
  if (rec.count >= 500) return res.status(429).json({ error: 'rate_limit_exceeded' });
  rec.count++;
  impressionCounts.set(req.userId, rec);
  next();
}
```

500/day = 250 minutes of active builds. Any real developer tops out at ~80. Flag users hitting 500 in the dashboard.

**Input validation (add `zod` to server):**

```js
app.post('/v1/impressions', requireAuth, rateLimitImpressions, (req, res) => {
  const parse = z.object({ lineId: z.string().regex(/^sponsor-[a-z0-9-]+$/) }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'invalid body' });

  const sponsor = db.prepare('SELECT id FROM sponsors WHERE id = ? AND active = 1').get(parse.data.lineId);
  if (!sponsor) return res.status(400).json({ error: 'unknown sponsor' });

  db.prepare('INSERT INTO impressions (user_id, sponsor_id) VALUES (?, ?)').run(req.userId, parse.data.lineId);
  res.json({ ok: true });
});
```

---

## Section 4 — Private VSIX Distribution

**Decision: Pre-signed S3 URL per invite email (7-day expiry). No Marketplace.**

- Build VSIX in CI (`vsce package`) on every tagged release.
- Upload to S3 (or Cloudflare R2 — cheaper, no egress fees).
- Generate a pre-signed URL per email (Python or Node script, 7-day TTL).
- Include the URL in the invite email. It expires so cannot be shared broadly.
- S3 access logs show who downloaded.

**Install instructions in invite email:**
```
1. Download: [pre-signed URL]
2. code --install-extension kickback-status-X.Y.Z.vsix
   (or drag into VS Code Extensions sidebar)
3. Add to your VS Code settings.json:
   "kickbackStatus.backendUrl": "https://api.kickback.dev"
4. Ctrl+Shift+P → "Kickback Status: Activate with Invite Code"
```

**Source protection:** Never hardcode the production backend URL in `package.json`. The default is `localhost:3000`. Users receive the production URL only in the invite email. A decompiled VSIX exposes no useful endpoint.

---

## Section 5 — Backend Hardening

```js
// Global rate limit (express-rate-limit)
app.use('/v1/', rateLimit({ windowMs: 60_000, max: 60 }));

// Admin dashboard protection
function adminAuth(req, res, next) {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}
app.use('/api', adminAuth);
app.get('/admin', adminAuth, (req, res) => res.sendFile(...));
```

**HTTPS:** Deploy on Railway or Render — TLS is automatic. No config needed.

**Env vars (never in source):**
- `JWT_SECRET` — 64-byte random hex
- `ADMIN_KEY` — 32-byte random hex
- `PORT` — set by host

---

## Section 6 — Keeping Source Private

- Private GitHub repository (personal or org).
- GitHub Actions CI: compile → `vsce package` → upload VSIX to S3 → create release.
- No secrets in code. All env vars set in Railway/Render dashboard.
- Branch protection on `main` — no direct pushes.
- The compiled `out/extension.js` never contains production URLs or secrets.

---

## Section 7 — Target Advertiser Categories

| Category | Examples | Why they pay |
|---|---|---|
| Cloud/infra platforms | AWS, DigitalOcean, Railway, Render, Fly.io | Developer mindshare before enterprise sales |
| Error monitoring / APM | Sentry, Datadog, LogRocket | Build-adjacent — perfect timing during compilation |
| API/infra SaaS | Stripe, Twilio, Cloudinary, Algolia, Supabase | DevRel budgets, developer-first GTM |
| Learning platforms | Scrimba, Frontend Masters, Educative.io | Indian market is their top audience |
| Developer job boards | Instahyre, Cutshort, Wellfound | High CPC willingness for qualified devs |
| VC-backed devtools | Vercel, Netlify, PlanetScale, Neon, Turso | Actively buying developer mindshare pre-enterprise |

**Avoid:** Consumer apps, D2C brands, fintech — they don't understand developer CPM.

---

## Section 8 — Pricing Model

**Decision: Fixed CPM, not CPC.**

CPC punishes the publisher for low click rates on a status bar placement (CTR will be 1-3%). CPM decouples revenue from a behavior you can't control.

**Beta pricing:**
- CPM: $4 USD per 1,000 impressions (~₹333)
- Minimum monthly commit: $100 USD (avoids micro-invoicing)
- At 200 active developers, 40 impressions/day/user: ~240,000 impressions/month
- At $4 CPM: ~$960/month from one advertiser

**Developer payout:** Raise default from 8 paise → 25 paise/impression for beta.  
- Your revenue per 1,000 impressions: ~₹333  
- Developer pool per 1,000 impressions: ₹250  
- Your margin: ₹83/1,000 impressions  
- At 240,000 impressions/month with 1 advertiser: ₹20,000 margin, ₹60,000 split across developers

---

## Section 9 — Cold Outreach Email Template

**Subject:** `Reach 200 developers mid-build in VS Code (beta CPM: $4)`

```
Hi [Name],

I run Kickback Status — a VS Code extension that shows a one-liner 
sponsored message in the status bar while a developer waits for their 
build, npm install, or Docker pull to finish.

Unlike newsletter ads (email inbox), this appears inside the developer's 
active coding environment at the exact moment they have 30 seconds of 
attention and are thinking about their stack.

Current beta:
- 200 hand-picked developers in India, all actively coding daily
- Verified impressions via extension telemetry (not pageviews)
- $4 CPM, $100 minimum/month, 30-day cancellation clause

Example placement:
"[YourProduct] — [one benefit in 8 words] → [yoursite.com]"

I can send a 60-second screen recording of how it looks and a sample 
analytics report from our beta.

Reply here or book 15 minutes: [cal.com/yourname]

— [Your name], Kickback Status
```

---

## Section 10 — Outreach Channels

1. **LinkedIn** — search "Developer Relations" + company name. DevRel people own sponsorship budgets and understand the product in 30 seconds.
2. **Twitter/X** — post a screen recording demo, tag DevRel leads. More visible than cold email.
3. **"Advertise with us" pages** — Postman, Sentry, Datadog, LaunchDarkly all have documented programs. Submit the form AND send a direct email.
4. **Slack communities** — Developer Marketing Alliance, Devrel Collective. Genuine intro post (not spam) drives inbound.
5. **Warm intros** — if you know any engineer at a VC-backed devtool startup, ask them to forward internally to marketing/DevRel.

---

## Section 11 — First 3 Companies to Approach

### 1. Sentry (sentry.io)
**Why:** Error monitoring is build-adjacent — the moment after `npm run build` is when you think about what breaks. Their DevRel team actively sponsors developer content (TLDR newsletter, podcasts). $800/month is within their experimental budget.  
**How:** Submit via sentry.io advertise page + DM `@LazarNikolov96` on Twitter with screen recording.

### 2. Scrimba (scrimba.com)
**Why:** Developer education platform. India is their #2 market. "Waiting for install" = exactly when developers think about learning. Founder Per Borgen is reachable on LinkedIn and known to respond to product demos.  
**How:** LinkedIn message to Per Borgen with demo video + one-paragraph pitch.

### 3. Railway (railway.app)
**Why:** Developer deployment platform actively buying mindshare. They sponsor GitHub READMEs, open source, newsletters. "Deploy your next project on Railway" during a Docker build is contextually perfect.  
**How:** DM `@brianmmdev` on Twitter (Railway DevRel) with the screen recording.

---

## Section 12 — Developer Payouts

**v1 (beta, manual):**
- Add `POST /v1/withdraw` — creates a payout request row (status: pending) with the user's UPI ID
- Minimum withdrawal: ₹100
- Founder reviews dashboard weekly, processes via PhonePe/GPay manually
- Update payout row to `completed` with transaction reference
- Extension syncs: developer sees "₹X paid out on [date]"

**v2 (200+ developers):**
- Integrate Razorpay X Payouts API — supports bulk UPI, ₹2-5/transaction fee
- `POST /v1/withdraw` becomes fully automated

**Collect UPI at registration:**
Add `kickbackStatus.setPayoutUPI` command → prompts for UPI ID → calls `PUT /v1/profile/upi` (authenticated) → stored server-side.

---

## Section 13 — Beta Invite Process (End-to-End)

**Week 1-2: Waitlist**
- Tally form: name, email, GitHub username, primary stack, "what do you build most?"
- Post on: r/developersIndia, 100xDevs Discord, personal Twitter/LinkedIn
- Target: 300 signups → invite first 50

**Invite email:**
```
Subject: Your Kickback Status beta invite

Hi [name],

You are in. Your invite code: KICK-ABCD-1234-XY

Steps:
1. Download the extension (link expires in 7 days): [pre-signed S3 URL]
2. VS Code → Extensions → "..." → "Install from VSIX"
3. Add to settings.json:  "kickbackStatus.backendUrl": "https://api.kickback.dev"
4. Ctrl+Shift+P → "Kickback Status: Activate with Invite Code" → paste code
5. Run any npm install or docker build — first ad and first earnings appear

You earn ₹0.25/impression. Minimum payout: ₹100 via UPI.
Set your UPI: Ctrl+Shift+P → "Kickback Status: Set Payout UPI"

Questions? Reply to this email.
```

---

## Section 14 — Metrics (Beta is Working When...)

| Metric | 4-week target |
|---|---|
| Registered / invited | 40/50 (80%) |
| DAU with ≥1 impression | 25+ |
| Impressions/day | 1,000+ |
| Click-through rate | ≥1.5% |
| Advertiser renewal after month 1 | ≥1 of 3 |
| Developer payout requests | ≥10 |
| Extension uninstall rate | <20% of registrations |

**Red flags to watch:**
- Any user with >500 impressions/day (rate limit should block, but monitor)
- CTR drops to 0% (rotate ad text)
- Multiple `403 account_revoked` from same IP (token sharing)

**Dashboard additions needed (`/api/overview`):**
- DAU trend (last 30 days)
- Impressions/day trend
- Per-advertiser spend burn rate
- Users with zero lifetime impressions (stuck/uninstalled)

---

## Implementation Sequence (Solo Founder)

### Week 1 — Security foundation
1. Add `jsonwebtoken`, `zod`, `express-rate-limit` to server
2. Create `server/auth.js` + `server/middleware.js`
3. Add `beta_invites` and `users` tables to `server/db.js`
4. Add `POST /v1/register` endpoint
5. Apply `requireAuth` middleware to all `/v1/` routes
6. Apply `adminAuth` to all `/api/` routes and `/admin`
7. Create `src/authStore.ts` in extension
8. Add `kickbackStatus.activate` command to extension
9. Update `SponsorClient` to send `Authorization: Bearer` header

### Week 2 — Distribution and onboarding
10. Deploy backend to Railway with `JWT_SECRET` + `ADMIN_KEY` env vars
11. Set up S3 (or Cloudflare R2) bucket for VSIX files
12. Build `scripts/gen-invites.js` for code generation
13. Run `vsce package`, upload to S3, generate pre-signed URLs per email
14. Send first 50 invites

### Week 3 — Ad outreach
15. Record 60-second screen recording of extension in action
16. Write and send 3 cold outreach emails (Sentry, Scrimba, Railway)
17. Post demo on Twitter/X, tag DevRel leads

### Week 4 — Payouts and metrics
18. Add `upi_id` to `users` table
19. Add `kickbackStatus.setPayoutUPI` command + `PUT /v1/profile/upi` endpoint
20. Add `POST /v1/withdraw` endpoint (creates pending payout row)
21. Add DAU/trend queries to `/api/overview`
22. Raise payout from 8 paise → 25 paise in seed sponsor rows

---

## Critical Files for Implementation

| File | Change |
|---|---|
| `server/db.js` | Add `beta_invites`, `users` tables |
| `server/auth.js` | New — JWT sign/verify |
| `server/middleware.js` | New — requireAuth, rateLimitImpressions, adminAuth |
| `server/backend.js` | Add `/v1/register`, apply middleware, fix userId usage |
| `src/authStore.ts` | New — SecretStorage JWT management |
| `src/sponsorClient.ts` | Add `Authorization` header, add `register()` method |
| `src/extension.ts` | Add `kickbackStatus.activate` + `kickbackStatus.setPayoutUPI` commands |
| `package.json` | Register new commands |
| `scripts/gen-invites.js` | New — invite code generation CLI |
