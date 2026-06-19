import * as https from "https";
import * as http from "http";

export interface SponsorLine {
  id: string;
  text: string;
  advertiser?: string;
  url?: string;
  /** What this impression pays the developer, in paise (1/100 rupee). */
  payoutPaise?: number;
}

export interface TeamInfo {
  team: { id: string; name: string; code: string; ownerId: string };
  leaderboard: Array<{ user_id: string; total_paise: number; impression_count: number }>;
  teamTotalPaise: number;
  memberCount: number;
}

/**
 * Talks to the backend. All /v1/ calls include a Bearer JWT.
 * Pricing/auction/targeting logic lives server-side.
 */
export class SponsorClient {
  private token: (() => Promise<string | undefined>) | undefined;

  constructor(
    private backendUrl: string,
    private userId: string,
    tokenGetter?: () => Promise<string | undefined>
  ) {
    this.token = tokenGetter;
  }

  setTokenGetter(fn: () => Promise<string | undefined>): void {
    this.token = fn;
  }

  async fetchCurrentLine(taskType?: string): Promise<SponsorLine | undefined> {
    const qs = taskType ? `?taskType=${encodeURIComponent(taskType)}` : "";
    const data = await this.request("GET", `/v1/sponsor-line${qs}`);
    if (!data) return undefined;
    return JSON.parse(data) as SponsorLine;
  }

  async recordImpression(lineId: string, taskType?: string): Promise<void> {
    await this.request("POST", "/v1/impressions", { lineId, taskType });
  }

  async recordClick(lineId: string): Promise<void> {
    await this.request("POST", "/v1/clicks", { lineId });
  }

  async fetchEarnings(): Promise<{ totalPaise: number; impressionCount: number } | undefined> {
    const data = await this.request("GET", "/v1/earnings");
    if (!data) return undefined;
    return JSON.parse(data) as { totalPaise: number; impressionCount: number };
  }

  // ── Auth ─────────────────────────────────────────────────────────────────

  async register(inviteCode: string): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
    const data = await this.request("POST", "/v1/register", { inviteCode }, { skipAuth: true });
    if (!data) throw new Error("Registration failed — could not reach backend");
    const result = JSON.parse(data) as { accessToken?: string; refreshToken?: string; userId?: string; error?: string };
    if (result.error) throw new Error(result.error);
    return result as { accessToken: string; refreshToken: string; userId: string };
  }

  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string } | undefined> {
    // Does NOT use the Authorization header — the refresh token is the credential.
    const data = await this.request("POST", "/v1/token/refresh", { refreshToken }, { skipAuth: true });
    if (!data) return undefined;
    return JSON.parse(data) as { accessToken: string; refreshToken: string };
  }

  async fetchMe(): Promise<{ user: { id: string; email: string; upi_id?: string }; team: TeamInfo | null } | undefined> {
    const data = await this.request("GET", "/v1/me");
    if (!data) return undefined;
    return JSON.parse(data);
  }

  // ── UPI & Withdrawals ────────────────────────────────────────────────────

  async setUpiId(upiId: string): Promise<boolean> {
    const data = await this.request("PUT", "/v1/profile/upi", { upiId });
    return !!data;
  }

  async requestWithdrawal(): Promise<{ ok: boolean; amountPaise?: number; message?: string; error?: string } | undefined> {
    const data = await this.request("POST", "/v1/withdraw");
    if (!data) return undefined;
    return JSON.parse(data);
  }

  async fetchWithdrawalHistory(): Promise<Array<{ id: number; amount_paise: number; upi_id: string; status: string; created_at: number }> | undefined> {
    const data = await this.request("GET", "/v1/withdraw/history");
    if (!data) return undefined;
    return JSON.parse(data);
  }

  // ── Team Pool ────────────────────────────────────────────────────────────

  async createTeam(name: string): Promise<{ ok: boolean; teamId?: string; code?: string; error?: string } | undefined> {
    const data = await this.request("POST", "/v1/teams", { name });
    if (!data) return undefined;
    return JSON.parse(data);
  }

  async joinTeam(code: string): Promise<{ ok: boolean; teamId?: string; name?: string; error?: string } | undefined> {
    const data = await this.request("POST", "/v1/teams/join", { code });
    if (!data) return undefined;
    return JSON.parse(data);
  }

  async leaveTeam(): Promise<boolean> {
    const data = await this.request("DELETE", "/v1/teams/leave");
    return !!data;
  }

  async fetchTeamInfo(): Promise<TeamInfo | null | undefined> {
    const data = await this.request("GET", "/v1/teams/me");
    if (!data) return undefined;
    return JSON.parse(data);
  }

  // ── HTTP core ────────────────────────────────────────────────────────────

  private async request(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: Record<string, unknown>,
    opts?: { skipAuth?: boolean }
  ): Promise<string | undefined> {
    const token = opts?.skipAuth ? undefined : await this.token?.();

    return new Promise((resolve) => {
      try {
        const url = new URL(path, this.backendUrl);
        const lib = url.protocol === "https:" ? https : http;
        const payload = body ? JSON.stringify(body) : undefined;

        const headers: Record<string, string | number> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
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

        if (payload) req.write(payload);
        req.end();
      } catch {
        resolve(undefined);
      }
    });
  }
}
