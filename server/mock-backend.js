/**
 * Minimal mock backend for Kickback Status, for local testing only.
 *
 * Run: node server/mock-backend.js
 * Then point the extension's `kickbackStatus.backendUrl` setting at
 * http://localhost:3000 (this is the default).
 *
 * In a real version, this is where you'd plug in:
 *  - actual sponsor inventory (manually configured rows for v1, no need for
 *    a live auction yet)
 *  - a real database instead of in-memory objects
 *  - payout calculation feeding into UPI payouts (e.g. via Razorpay X / Cashfree)
 */
const http = require("http");
const { URL } = require("url");

// --- Hardcoded sponsor inventory for the experiment phase ---
// Replace with rows you sell manually to 2-3 advertisers.
const SPONSORS = [
  {
    id: "sponsor-1",
    text: "Postman — test your APIs in seconds",
    advertiser: "Postman",
    url: "https://www.postman.com",
    payoutPaise: 8, // ~8 paise per impression shown to the developer
  },
  {
    id: "sponsor-2",
    text: "Hasura — instant GraphQL APIs on your DB",
    advertiser: "Hasura",
    url: "https://hasura.io",
    payoutPaise: 8,
  },
];

const impressions = []; // { userId, lineId, ts }
const clicks = []; // { userId, lineId, ts }

function pickSponsor() {
  // v1: simple round robin. Swap for weighted-by-bid logic later.
  return SPONSORS[impressions.length % SPONSORS.length];
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/v1/sponsor-line") {
    const userId = url.searchParams.get("userId") || "unknown";
    const sponsor = pickSponsor();
    console.log(`[sponsor-line] served ${sponsor.id} to ${userId}`);
    return sendJson(res, 200, sponsor);
  }

  if (req.method === "POST" && url.pathname === "/v1/impressions") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { userId, lineId } = JSON.parse(body);
        impressions.push({ userId, lineId, ts: Date.now() });
        console.log(
          `[impression] user=${userId} line=${lineId} total=${impressions.length}`
        );
        sendJson(res, 200, { ok: true });
      } catch {
        sendJson(res, 400, { ok: false });
      }
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/clicks") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { userId, lineId } = JSON.parse(body);
        clicks.push({ userId, lineId, ts: Date.now() });
        console.log(`[click] user=${userId} line=${lineId} total=${clicks.length}`);
        sendJson(res, 200, { ok: true });
      } catch {
        sendJson(res, 400, { ok: false });
      }
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/v1/stats") {
    return sendJson(res, 200, {
      impressions: impressions.length,
      clicks: clicks.length,
    });
  }

  if (req.method === "GET" && url.pathname === "/v1/earnings") {
    const userId = url.searchParams.get("userId") || "";
    const userImpressions = impressions.filter((i) => i.userId === userId);
    const totalPaise = userImpressions.reduce((sum, i) => {
      const sponsor = SPONSORS.find((s) => s.id === i.lineId);
      return sum + (sponsor ? sponsor.payoutPaise : 0);
    }, 0);
    return sendJson(res, 200, {
      totalPaise,
      impressionCount: userImpressions.length,
    });
  }

  sendJson(res, 404, { error: "not found" });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Kickback Status mock backend listening on http://localhost:${PORT}`);
});
