const { generateKeyPairSync, createPrivateKey, createPublicKey } = require("crypto");
const jwt = require("jsonwebtoken");

const ISSUER = "kickback-status";

// ── Key loading / generation ──────────────────────────────────────────────────
// Production: set RSA_PRIVATE_KEY env var (PKCS#8 PEM, newlines as \n).
// Generate with:
//   node -e "const {generateKeyPairSync:g}=require('crypto');console.log(g('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}))"
let privateKey, publicKey;

if (process.env.RSA_PRIVATE_KEY) {
  privateKey = createPrivateKey(process.env.RSA_PRIVATE_KEY.replace(/\\n/g, "\n"));
  publicKey  = createPublicKey(privateKey);
} else {
  if (process.env.NODE_ENV === "production") {
    console.error("[auth] FATAL: RSA_PRIVATE_KEY must be set in production. Exiting.");
    process.exit(1);
  }
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  privateKey = pair.privateKey;
  publicKey  = pair.publicKey;
  console.warn("[auth] RSA_PRIVATE_KEY not set — ephemeral keys in use (dev only). Tokens invalidate on server restart.");
}

// ── Token operations ──────────────────────────────────────────────────────────

function signAccessToken(userId) {
  return jwt.sign({ sub: userId }, privateKey, {
    algorithm: "RS256",
    expiresIn: "1d",
    issuer: ISSUER,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, publicKey, {
    algorithms: ["RS256"],
    issuer: ISSUER,
  });
}

// Returns the public key as a JWK object (for GET /v1/jwks)
function getPublicJwk() {
  const jwk = publicKey.export({ format: "jwk" });
  return { ...jwk, use: "sig", alg: "RS256", kid: "kickback-rs256-1" };
}

module.exports = { signAccessToken, verifyAccessToken, getPublicJwk };
