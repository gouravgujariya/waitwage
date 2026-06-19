"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EarningsStore = void 0;
const crypto_1 = require("crypto");
const KEY_USER_ID = "kickbackStatus.userId";
const KEY_TOTAL_PAISE = "kickbackStatus.totalEarningsPaise";
const KEY_IMPRESSIONS = "kickbackStatus.impressionCount";
const KEY_SERVER_PAISE = "kickbackStatus.serverBalancePaise";
const KEY_SERVER_FETCHED = "kickbackStatus.serverBalanceFetchedAt"; // unix ms
/**
 * Lightweight local mirror of earnings, so the user gets instant feedback
 * ("Show My Earnings") without a network round trip. The backend remains
 * the source of truth for actual payouts — this is a UX cache, not a ledger.
 */
class EarningsStore {
    constructor(context) {
        this.context = context;
        this.sessionPaise = 0;
        if (!this.context.globalState.get(KEY_USER_ID)) {
            this.context.globalState.update(KEY_USER_ID, (0, crypto_1.randomUUID)());
        }
    }
    getUserId() {
        return this.context.globalState.get(KEY_USER_ID) ?? "unknown";
    }
    getTotalEarningsPaise() {
        return this.context.globalState.get(KEY_TOTAL_PAISE, 0);
    }
    getImpressionCount() {
        return this.context.globalState.get(KEY_IMPRESSIONS, 0);
    }
    recordImpression(payoutPaise) {
        const total = this.getTotalEarningsPaise() + payoutPaise;
        const count = this.getImpressionCount() + 1;
        this.context.globalState.update(KEY_TOTAL_PAISE, total);
        this.context.globalState.update(KEY_IMPRESSIONS, count);
    }
    // ── Session tracking (in-memory; resets on reload) ──────────────────────
    startSession() {
        this.sessionPaise = 0;
    }
    endSession() {
        this.sessionPaise = 0;
    }
    recordSessionImpression(payoutPaise) {
        this.sessionPaise += payoutPaise;
        this.recordImpression(payoutPaise);
    }
    getSessionEarningsPaise() {
        return this.sessionPaise;
    }
    // ── Server-verified balance (persisted in globalState) ───────────────────
    setServerBalance(paise) {
        this.context.globalState.update(KEY_SERVER_PAISE, paise);
        this.context.globalState.update(KEY_SERVER_FETCHED, Date.now());
    }
    getServerBalance() {
        return this.context.globalState.get(KEY_SERVER_PAISE);
    }
    getServerBalanceFetchedAt() {
        return this.context.globalState.get(KEY_SERVER_FETCHED, 0);
    }
}
exports.EarningsStore = EarningsStore;
//# sourceMappingURL=earningsStore.js.map