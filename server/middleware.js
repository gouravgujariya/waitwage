const { verifyAccessToken } = require("./auth");
const rateLimit = require("express-rate-limit");

// Lazily load db to avoid circular require at module load time
let _db;
function getDb() {
  if (!_db) _db = require("./db");
  return _db;
}

function requireAuth(req, res, next) {
  const header = req.headers["authorization"];
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "missing_token" });
  }
  const token = header.slice(7);
  try {
    const claims = verifyAccessToken(token);
    const user = getDb().prepare("SELECT status FROM users WHERE id = ?").get(claims.sub);
    if (!user) return res.status(401).json({ error: "user_not_found" });
    if (user.status === "revoked") return res.status(403).json({ error: "account_revoked" });
    req.userId = claims.sub;
    next();
  } catch (e) {
    const code = e.name === "TokenExpiredError" ? "token_expired" : "invalid_token";
    return res.status(401).json({ error: code });
  }
}

function adminAuth(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (!process.env.ADMIN_KEY) {
    if (process.env.NODE_ENV !== "production") return next();
    return res.status(503).json({ error: "admin_not_configured" });
  }
  if (key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

// In-process per-user rate limit (swap for Redis at 1k+ users)
const impressionCounts = new Map();
function rateLimitImpressions(req, res, next) {
  const userId = req.userId;
  const now = Date.now();
  const DAY_MS = 86_400_000;
  let rec = impressionCounts.get(userId);
  if (!rec || now > rec.resetAt) rec = { count: 0, resetAt: now + DAY_MS };
  if (rec.count >= 500) return res.status(429).json({ error: "rate_limit_exceeded" });
  rec.count++;
  impressionCounts.set(userId, rec);
  next();
}

// Global IP-level rate limit for all /v1/ routes
const globalRateLimit = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { requireAuth, adminAuth, rateLimitImpressions, globalRateLimit };
