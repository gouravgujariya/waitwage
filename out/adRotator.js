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
exports.AdRotator = void 0;
const vscode = __importStar(require("vscode"));
class AdRotator {
    constructor(bar, sessionBar, client, store, config, taskType) {
        this.bar = bar;
        this.sessionBar = sessionBar;
        this.client = client;
        this.store = store;
        this.config = config;
        this.taskType = taskType;
        this.stopped = false;
    }
    start() {
        this.store.startSession();
        const minMs = this.config.get("minTaskSeconds", 3) * 1000;
        this.pendingShowTimer = setTimeout(() => this.firstShow(), minMs);
    }
    stop() {
        this.stopped = true;
        clearTimeout(this.pendingShowTimer);
        clearInterval(this.rotationInterval);
        const paise = this.store.getSessionEarningsPaise();
        this.store.endSession();
        this.flash(paise);
    }
    cancelFlash() {
        clearTimeout(this.flashTimer);
        this.bar.hide();
        this.bar.backgroundColor = undefined;
    }
    getCurrentLine() {
        return this.currentLine;
    }
    async firstShow() {
        if (this.stopped)
            return;
        await this.rotate();
        const rotMs = this.config.get("adRotationSeconds", 30) * 1000;
        this.rotationInterval = setInterval(() => this.rotate(), rotMs);
    }
    async rotate() {
        if (this.stopped)
            return;
        try {
            const line = await this.client.fetchCurrentLine(this.taskType);
            if (!line || this.stopped)
                return;
            this.currentLine = line;
            this.bar.text = `$(megaphone) ${line.text}`;
            this.bar.tooltip = `Sponsored — click to learn more. ${line.advertiser ?? ""}`;
            this.bar.show();
            this.store.recordSessionImpression(line.payoutPaise ?? 0);
            this.client.recordImpression(line.id, this.taskType); // fire-and-forget
            const rupees = (this.store.getSessionEarningsPaise() / 100).toFixed(2);
            this.sessionBar.text = `$(coin) ₹${rupees} this session`;
            this.sessionBar.show();
        }
        catch {
            // fail silently — never block the user's task on ad errors
        }
    }
    flash(paise) {
        if (paise === 0) {
            this.bar.hide();
            return;
        }
        const rupees = (paise / 100).toFixed(2);
        this.bar.text = `$(check) Earned ₹${rupees} this build`;
        this.bar.tooltip = "";
        this.bar.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
        this.bar.show();
        const flashMs = this.config.get("earningsFlashSeconds", 4) * 1000;
        this.flashTimer = setTimeout(() => {
            this.bar.hide();
            this.bar.backgroundColor = undefined;
        }, flashMs);
    }
}
exports.AdRotator = AdRotator;
//# sourceMappingURL=adRotator.js.map