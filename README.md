# Kickback Status — VS Code extension (proof of concept)

Shows a sponsored one-line message in the VS Code status bar while a build,
test run, or other tracked task is in progress. Records impressions and
clicks against a backend so a developer's "earnings" (revenue share) can be
tallied and eventually paid out.

This is a deliberately minimal v1 for a quick revenue experiment — no live
bidding auction, no real payment processing. Manually sell fixed-price
sponsor slots to 2-3 advertisers first and validate before building anything
fancier.

## Project layout

```
kickback-status/
├── src/
│   ├── extension.ts      # status bar logic, task hooks, commands
│   ├── sponsorClient.ts  # talks to backend for sponsor line / impressions / clicks
│   └── earningsStore.ts  # local cache of user's lifetime earnings (VS Code globalState)
├── server/
│   └── mock-backend.js   # tiny Node http server simulating the real backend
├── package.json          # extension manifest
└── tsconfig.json
```

## Running locally

### 1. Start the mock backend

```bash
cd server
node mock-backend.js
```

This serves on `http://localhost:3000` (matches the extension's default
`kickbackStatus.backendUrl` setting). It round-robins between two hardcoded
sponsor lines — swap `SPONSORS` in `mock-backend.js` for whatever you've
actually sold.

### 2. Compile and launch the extension

```bash
npm install
npm run compile
```

Then open this folder in VS Code and press `F5` (or Run → Start Debugging).
This launches an "Extension Development Host" window with the extension
loaded.

### 3. Trigger a sponsored line

In the Extension Development Host window, run any VS Code Task (Terminal →
Run Task, or `Ctrl+Shift+B` / `Cmd+Shift+B` for the default build task) that
takes longer than `kickbackStatus.minTaskSeconds` (default 3s). You'll see a
megaphone icon + sponsor text appear in the bottom-right status bar for the
duration of the task.

If you don't have a `tasks.json` yet, create one with a task that sleeps a
few seconds, e.g.:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "fake-build",
      "type": "shell",
      "command": "sleep 5",
      "problemMatcher": []
    }
  ]
}
```

Click the status bar item to "click" the ad (opens the sponsor URL and
records a click). Run the command **Kickback Status: Show My Earnings** from
the Command Palette to see the running local tally.

### 4. Check what the backend recorded

```bash
curl http://localhost:3000/v1/stats
```

## What's stubbed vs. real here

- **Real:** status bar rendering, VS Code task lifecycle hooks, impression/click
  network calls, local earnings cache, settings (backend URL, on/off toggle,
  minimum task duration before showing an ad).
- **Stubbed / intentionally simple:** sponsor selection (round-robin instead
  of an auction), payout (no actual money moves — `payoutPaise` is just
  recorded), persistence (mock backend is in-memory, resets on restart).

## Extending coverage beyond VS Code Tasks

`vscode.tasks.onDidStartTask` / `onDidEndTask` only fires for things run
through the VS Code Tasks API. A lot of real "waiting" happens in a raw
terminal (`npm install`, `docker build`, etc.) which VS Code doesn't expose
task events for. The extension exports a small API (`beginWait()` /
`endWait()`) so a terminal-shell-integration helper, or a wrapper script
your users add to their shell profile, can call into it directly — that's
the next thing to build once you've validated advertiser/developer demand
with the Tasks-only version.

## Packaging for distribution

```bash
npm install -g @vscode/vsce
vsce package
```

This produces a `.vsix` file you can share directly (for early testers) or
publish to the VS Code Marketplace (`vsce publish`, requires a publisher
account — far better trust signal in India's dev community than asking
people to `curl | install` from an unknown domain).

## Before going further

- Replace the mock backend with something real (even a simple hosted
  Node/Express + Postgres setup, or Supabase, is enough for v1).
- Decide payout mechanics: UPI via Razorpay X or Cashfree payouts is the
  natural choice for India — batch small balances and pay out monthly to
  keep transaction fees from eating the (already tiny) payouts.
- Read VS Code Marketplace policies before publishing — ad-injection
  extensions sit in a gray area; be upfront in your listing description
  that this shows sponsored content, so it isn't flagged as deceptive.
