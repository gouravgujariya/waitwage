"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SponsorClient = void 0;
const https = __importStar(require("https"));
const http = __importStar(require("http"));
/**
 * Talks to the backend. All /v1/ calls include a Bearer JWT.
 * Pricing/auction/targeting logic lives server-side.
 */
class SponsorClient {
    constructor(backendUrl, userId, tokenGetter) {
        this.backendUrl = backendUrl;
        this.userId = userId;
        this.token = tokenGetter;
    }
    setTokenGetter(fn) {
        this.token = fn;
    }
    async fetchCurrentLine(taskType) {
        const qs = taskType ? `?taskType=${encodeURIComponent(taskType)}` : "";
        const data = await this.request("GET", `/v1/sponsor-line${qs}`);
        if (!data)
            return undefined;
        return JSON.parse(data);
    }
    async recordImpression(lineId, taskType) {
        await this.request("POST", "/v1/impressions", { lineId, taskType });
    }
    async recordClick(lineId) {
        await this.request("POST", "/v1/clicks", { lineId });
    }
    async fetchEarnings() {
        const data = await this.request("GET", "/v1/earnings");
        if (!data)
            return undefined;
        return JSON.parse(data);
    }
    // ── Auth ─────────────────────────────────────────────────────────────────
    async register(inviteCode) {
        const data = await this.request("POST", "/v1/register", { inviteCode }, { skipAuth: true });
        if (!data)
            throw new Error("Registration failed — could not reach backend");
        const result = JSON.parse(data);
        if (result.error)
            throw new Error(result.error);
        return result;
    }
    async refreshAccessToken(refreshToken) {
        // Does NOT use the Authorization header — the refresh token is the credential.
        const data = await this.request("POST", "/v1/token/refresh", { refreshToken }, { skipAuth: true });
        if (!data)
            return undefined;
        return JSON.parse(data);
    }
    async fetchMe() {
        const data = await this.request("GET", "/v1/me");
        if (!data)
            return undefined;
        return JSON.parse(data);
    }
    // ── UPI & Withdrawals ────────────────────────────────────────────────────
    async setUpiId(upiId) {
        const data = await this.request("PUT", "/v1/profile/upi", { upiId });
        return !!data;
    }
    async requestWithdrawal() {
        const data = await this.request("POST", "/v1/withdraw");
        if (!data)
            return undefined;
        return JSON.parse(data);
    }
    async fetchWithdrawalHistory() {
        const data = await this.request("GET", "/v1/withdraw/history");
        if (!data)
            return undefined;
        return JSON.parse(data);
    }
    // ── Team Pool ────────────────────────────────────────────────────────────
    async createTeam(name) {
        const data = await this.request("POST", "/v1/teams", { name });
        if (!data)
            return undefined;
        return JSON.parse(data);
    }
    async joinTeam(code) {
        const data = await this.request("POST", "/v1/teams/join", { code });
        if (!data)
            return undefined;
        return JSON.parse(data);
    }
    async leaveTeam() {
        const data = await this.request("DELETE", "/v1/teams/leave");
        return !!data;
    }
    async fetchTeamInfo() {
        const data = await this.request("GET", "/v1/teams/me");
        if (!data)
            return undefined;
        return JSON.parse(data);
    }
    // ── HTTP core ────────────────────────────────────────────────────────────
    async request(method, path, body, opts) {
        const token = opts?.skipAuth ? undefined : await this.token?.();
        return new Promise((resolve) => {
            try {
                const url = new URL(path, this.backendUrl);
                const lib = url.protocol === "https:" ? https : http;
                const payload = body ? JSON.stringify(body) : undefined;
                const headers = {};
                if (token)
                    headers["Authorization"] = `Bearer ${token}`;
                if (payload) {
                    headers["Content-Type"] = "application/json";
                    headers["Content-Length"] = Buffer.byteLength(payload);
                }
                const req = lib.request(url, { method, headers, timeout: 3000 }, (res) => {
                    let raw = "";
                    res.on("data", (chunk) => (raw += chunk));
                    res.on("end", () => resolve(res.statusCode === 200 || res.statusCode === 201 ? raw : undefined));
                });
                req.on("error", () => resolve(undefined));
                req.on("timeout", () => { req.destroy(); resolve(undefined); });
                if (payload)
                    req.write(payload);
                req.end();
            }
            catch {
                resolve(undefined);
            }
        });
    }
}
exports.SponsorClient = SponsorClient;
//# sourceMappingURL=sponsorClient.js.map