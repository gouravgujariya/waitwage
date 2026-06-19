"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthStore = void 0;
const SECRET_ACCESS = "kickbackStatus.accessToken";
const SECRET_REFRESH = "kickbackStatus.refreshToken";
const STATE_USER_ID = "kickbackStatus.userId";
const STATE_EXPIRES = "kickbackStatus.accessTokenExpiresAt"; // unix ms
class AuthStore {
    constructor(context) {
        this.context = context;
    }
    // ── Access token ─────────────────────────────────────────────────────────
    async getToken() {
        return this.context.secrets.get(SECRET_ACCESS);
    }
    async setAccessToken(token) {
        await this.context.secrets.store(SECRET_ACCESS, token);
        // Store expiry as 23.5h from now — 30-min safety margin before 1-day JWT expires
        await this.context.globalState.update(STATE_EXPIRES, Date.now() + 23.5 * 3600 * 1000);
    }
    isAccessTokenExpired() {
        const expiresAt = this.context.globalState.get(STATE_EXPIRES, 0);
        return Date.now() > expiresAt;
    }
    // ── Refresh token ─────────────────────────────────────────────────────────
    async getRefreshToken() {
        return this.context.secrets.get(SECRET_REFRESH);
    }
    async setRefreshToken(token) {
        await this.context.secrets.store(SECRET_REFRESH, token);
    }
    // ── Combined set (on first registration) ──────────────────────────────────
    async setTokens(accessToken, refreshToken, userId) {
        await this.context.secrets.store(SECRET_ACCESS, accessToken);
        await this.context.secrets.store(SECRET_REFRESH, refreshToken);
        await this.context.globalState.update(STATE_USER_ID, userId);
        await this.context.globalState.update(STATE_EXPIRES, Date.now() + 23.5 * 3600 * 1000);
    }
    async clearToken() {
        await this.context.secrets.delete(SECRET_ACCESS);
        await this.context.secrets.delete(SECRET_REFRESH);
        await this.context.globalState.update(STATE_USER_ID, undefined);
        await this.context.globalState.update(STATE_EXPIRES, undefined);
    }
    // ── User identity ─────────────────────────────────────────────────────────
    getUserId() {
        return this.context.globalState.get(STATE_USER_ID);
    }
    async isRegistered() {
        const token = await this.getToken();
        return !!token;
    }
}
exports.AuthStore = AuthStore;
//# sourceMappingURL=authStore.js.map