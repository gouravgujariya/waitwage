// One-time migration: create refresh tokens for users who have none.
// Run: node scripts/backfill-refresh-tokens.js
const { randomUUID } = require("crypto");
const path = require("path");

const Database = require(path.join(__dirname, "../server/node_modules/better-sqlite3"));
const db = new Database(path.join(__dirname, "../server/kickback.db"));

const orphaned = db.prepare(`
  SELECT u.id, u.email FROM users u
  WHERE NOT EXISTS (
    SELECT 1 FROM refresh_tokens rt WHERE rt.user_id = u.id AND rt.revoked_at IS NULL
  )
`).all();

if (orphaned.length === 0) {
  console.log("No orphaned users found. All users have active refresh tokens.");
  process.exit(0);
}

const insert = db.prepare("INSERT INTO refresh_tokens (id, user_id) VALUES (?, ?)");
const migrate = db.transaction(() => {
  for (const { id, email } of orphaned) {
    const token = randomUUID();
    insert.run(token, id);
    console.log(`Backfilled user: ${email} (${id}) → token: ${token}`);
    console.log("  → Send this token to the user so they can call POST /v1/token/refresh");
  }
});

migrate();
console.log(`\nDone. ${orphaned.length} user(s) backfilled.`);
