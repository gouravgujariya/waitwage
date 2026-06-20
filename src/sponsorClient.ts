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
    try {
      const data = await this.request("GET", `/v1/sponsor-line${qs}`);
      if (!data) return undefined;
      return JSON.parse(data) as SponsorLine;
    } catch {
      return undefined;
    }
  }

  async recordImpression(lineId: string, taskType?: string): Promise<void> {
    try {
      await this.request("POST", "/v1/impressions", { lineId, taskType });
    } catch {
      // Best-effort fire-and-forget; backend will reconcile on next sync.
    }
  }

  async recordClick(lineId: string): Promise<void> {
    try {
      await this.request("POST", "/v1/clicks", { lineId });
    } catch {
      // Best-effort fire-and-forget.
    }
  }

  async fetchEarnings(): Promise<{ totalPaise: number; impressionCount: number } | undefined> {
    try {
      const data = await this.request("GET", "/v1/earnings");
      if (!data) return undefined;
      return JSON.parse(data) as { totalPaise: number; impressionCount: number };
    } catch {
      return undefined;
    }
  }

  // ── Auth ─────────────────────────────────────────────────────────────────

  async register(inviteCode: string): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
    // request() now rejects with an Error whose message is the backend error code.
    // Network failures resolve to undefined — treat those as a generic failure.
    const data = await this.request("POST", "/v1/register", { inviteCode }, { skipAuth: true });
    if (!data) throw new Error("Registration failed — could not reach backend");
    return JSON.parse(data) as { accessToken: string; refreshToken: string; userId: string };
  }

  async login(inviteCode: string): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
    // request() rejects with an Error whose message is the backend error code
    // (e.g. "invalid_code", "account_revoked"). Network failures resolve to undefined.
    const data = await this.request("POST", "/v1/login", { inviteCode }, { skipAuth: true });
    if (!data) throw new Error("Login failed — could not reach backend");
    return JSON.parse(data) as { accessToken: string; refreshToken: string; userId: string };
  }

  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string } | undefined> {
    // Does NOT use the Authorization header — the refresh token is the credential.
    try {
      const data = await this.request("POST", "/v1/token/refresh", { refreshToken }, { skipAuth: true });
      if (!data) return undefined;
      return JSON.parse(data) as { accessToken: string; refreshToken: string };
    } catch {
      return undefined;
    }
  }

  async fetchMe(): Promise<{ user: { id: string; email: string; upi_id?: string }; team: TeamInfo | null } | undefined> {
    try {
      const data = await this.request("GET", "/v1/me");
      if (!data) return undefined;
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  }

  // ── UPI & Withdrawals ────────────────────────────────────────────────────

  async setUpiId(upiId: string): Promise<boolean> {
    try {
      const data = await this.request("PUT", "/v1/profile/upi", { upiId });
      return !!data;
    } catch {
      return false;
    }
  }

  async requestWithdrawal(): Promise<{ ok: boolean; amountPaise?: number; message?: string; error?: string } | undefined> {
    try {
      const data = await this.request("POST", "/v1/withdraw");
      if (!data) return undefined;
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  }

  async fetchWithdrawalHistory(): Promise<Array<{ id: number; amount_paise: number; upi_id: string; status: string; created_at: number }> | undefined> {
    try {
      const data = await this.request("GET", "/v1/withdraw/history");
      if (!data) return undefined;
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  }

  // ── Team Pool ────────────────────────────────────────────────────────────

  async createTeam(name: string): Promise<{ ok: boolean; teamId?: string; code?: string; error?: string } | undefined> {
    try {
      const data = await this.request("POST", "/v1/teams", { name });
      if (!data) return undefined;
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  }

  async joinTeam(code: string): Promise<{ ok: boolean; teamId?: string; name?: string; error?: string } | undefined> {
    try {
      const data = await this.request("POST", "/v1/teams/join", { code });
      if (!data) return undefined;
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  }

  async leaveTeam(): Promise<boolean> {
    try {
      const data = await this.request("DELETE", "/v1/teams/leave");
      return !!data;
    } catch {
      return false;
    }
  }

  async fetchTeamInfo(): Promise<TeamInfo | null | undefined> {
    try {
      const data = await this.request("GET", "/v1/teams/me");
      if (!data) return undefined;
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  }

  // ── HTTP core ────────────────────────────────────────────────────────────

  private async request(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: Record<string, unknown>,
    opts?: { skipAuth?: boolean }
  ): Promise<string | undefined> {
    const token = opts?.skipAuth ? undefined : await this.token?.();

    return new Promise((resolve, reject) => {
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
          res.on("end", () => {
            const status = res.statusCode ?? 0;
            if (status === 200 || status === 201) {
              resolve(raw);
            } else {
              // Attempt to extract a machine-readable error code from the body
              // so callers can branch on specific error strings (e.g. "invalid_code").
              try {
                const parsed = JSON.parse(raw) as { error?: string; message?: string };
                const code = parsed.error ?? parsed.message ?? `http_${status}`;
                reject(new Error(code));
              } catch {
                reject(new Error(`http_${status}`));
              }
            }
          });
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
