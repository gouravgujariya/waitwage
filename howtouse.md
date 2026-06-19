# How to Use Kickback Status (Local Dev)

## Step-by-step

### 1. Start the mock backend (Terminal 1)

```bash
cd /home/gourav/Downloads/poc/kickback-status/server
node mock-backend.js
```

You'll see: `Kickback Status mock backend listening on http://localhost:3000`

---

### 2. Open the project in VS Code

```bash
code /home/gourav/Downloads/poc/kickback-status
```

---

### 3. Launch the Extension Development Host

Press **F5** inside VS Code (or go to Run → Start Debugging → "Run Extension").

A **second VS Code window** opens — that's the Extension Development Host (EDH). The extension is live inside that second window.

---

### 4. Trigger an ad — run the demo task

Inside the **EDH window**:

- Press `Ctrl+Shift+P` → type `Run Task` → select **"Kickback Status: Demo (wait 10s)"**

**What you'll see:**
- After **3 seconds** → bottom-right status bar shows: `📢 Postman — test your APIs in seconds`
- Task ends at 10s → bar flashes: `✓ Earned ₹0.08 this build` (amber, 4 seconds) then hides
- A second item appears: `🪙 ₹0.08 this session`

---

### 5. Test ad rotation on a longer task

Inside the EDH terminal, run:

```bash
python3 scripts/wait.py 70
```

The ad text **rotates at 30s** from Postman → Hasura, and two `[impression]` lines appear in the mock backend terminal.

---

### 6. Test terminal detection (VS Code 1.93+)

In the **EDH window's integrated terminal**, type:

```bash
npm install
```

After 3 seconds the ad appears. When `npm install` finishes → flash shows.
Try `ls` — no ad (not in the tracked prefixes).

---

### 7. Check your earnings

- `Ctrl+Shift+P` → **"Kickback Status: Show My Earnings"**
- `Ctrl+Shift+P` → **"Kickback Status: Sync Earnings from Server"** (fetches server-verified total from the mock)

---

## Quick cheat-sheet

| What | Where |
|---|---|
| Mock backend logs | Terminal 1 (`node mock-backend.js`) |
| Extension debug console | VS Code → View → Output → "Extension Host" |
| Status bar ads | Bottom-right of the **EDH window** |
| Re-compile after code change | `Ctrl+Shift+B` in the main window, then reload EDH with `Ctrl+R` |

---

## Tracked terminal prefixes (trigger ads automatically)

```
npm, yarn, pnpm, pip, pip3, docker, gradle, mvn, cargo,
go build, git clone, git pull, make, cmake, npx,
bundle install, composer install
```
