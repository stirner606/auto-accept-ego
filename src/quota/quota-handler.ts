/**
 * Quota Handler for Auto Accept Ego
 * Fetches AI model quota information from Antigravity API
 */
import * as https from "https";
import { ProcessFinder, ProcessInfo } from "./process-finder";

export interface ModelQuota {
  label: string;
  modelId: string;
  remainingPercentage: number;
  isExhausted: boolean;
  resetTime: Date;
  timeUntilReset: number;
  timeUntilResetFormatted: string;
}

export interface QuotaSnapshot {
  timestamp: Date;
  models: ModelQuota[];
  error?: string;
}

export class QuotaHandler {
  private processFinder: ProcessFinder;
  private processInfo: ProcessInfo | null = null;
  private port: number = 0;
  private csrfToken: string = "";
  private pollingTimer: NodeJS.Timeout | null = null;
  private updateCallback?: (snapshot: QuotaSnapshot) => void;
  private isInitialized = false;
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY_MS = 10000; // 10 seconds

  constructor() {
    this.processFinder = new ProcessFinder();
  }

  async init(): Promise<boolean> {
    console.log("[QuotaHandler] Initializing...");

    this.processInfo = await this.processFinder.findProcess();
    if (!this.processInfo) {
      console.log("[QuotaHandler] Antigravity process not found");
      return false;
    }

    console.log("[QuotaHandler] Process found, PID:", this.processInfo.pid);
    this.csrfToken = this.processInfo.csrfToken;

    // Find working port
    const ports = await this.processFinder.getListeningPorts(
      this.processInfo.pid,
    );
    console.log("[QuotaHandler] Listening ports:", ports);

    for (const port of ports) {
      const isWorking = await this.testPort(port);
      if (isWorking) {
        this.port = port;
        console.log("[QuotaHandler] Working port found:", port);
        break;
      }
    }

    if (this.port === 0) {
      console.log("[QuotaHandler] No working port found");
      return false;
    }

    this.isInitialized = true;
    return true;
  }

  private testPort(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const options: https.RequestOptions = {
        hostname: "127.0.0.1",
        port,
        path: "/exa.language_server_pb.LanguageServerService/GetUnleashData",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Codeium-Csrf-Token": this.csrfToken,
          "Connect-Protocol-Version": "1",
        },
        rejectUnauthorized: false,
        timeout: 3000,
      };

      const req = https.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          resolve(res.statusCode === 200);
        });
      });

      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
      req.write(JSON.stringify({ wrapper_data: {} }));
      req.end();
    });
  }

  onUpdate(callback: (snapshot: QuotaSnapshot) => void): void {
    this.updateCallback = callback;
  }

  startPolling(intervalMs: number = 120000): void {
    this.stopPolling();
    // Initial delay of 10 seconds before first fetch
    console.log("[QuotaHandler] Starting with 10s initial delay...");
    setTimeout(() => {
      this.fetchWithRetry();
      this.pollingTimer = setInterval(() => this.fetchWithRetry(), intervalMs);
      console.log("[QuotaHandler] Polling started, interval:", intervalMs);
    }, QuotaHandler.RETRY_DELAY_MS);
  }

  stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  async fetchWithRetry(attempt: number = 1): Promise<QuotaSnapshot> {
    console.log(
      `[QuotaHandler] Fetch attempt ${attempt}/${QuotaHandler.MAX_RETRIES}`,
    );
    const snapshot = await this.fetchQuota();

    if (snapshot.error && attempt < QuotaHandler.MAX_RETRIES) {
      console.log(
        `[QuotaHandler] Attempt ${attempt} failed, retrying in ${QuotaHandler.RETRY_DELAY_MS / 1000}s...`,
      );
      return new Promise((resolve) => {
        setTimeout(async () => {
          resolve(await this.fetchWithRetry(attempt + 1));
        }, QuotaHandler.RETRY_DELAY_MS);
      });
    }

    return snapshot;
  }

  async fetchQuota(): Promise<QuotaSnapshot> {
    if (!this.isInitialized || this.port === 0) {
      const success = await this.init();
      if (!success) {
        const snapshot: QuotaSnapshot = {
          timestamp: new Date(),
          models: [],
          error: "process_not_found",
        };
        if (this.updateCallback) this.updateCallback(snapshot);
        return snapshot;
      }
    }

    try {
      const data = await this.request<any>(
        "/exa.language_server_pb.LanguageServerService/GetUserStatus",
        {
          metadata: {
            ideName: "antigravity",
            extensionName: "antigravity",
            locale: "en",
          },
        },
      );

      const snapshot = this.parseResponse(data);
      if (this.updateCallback) this.updateCallback(snapshot);
      return snapshot;
    } catch (e: any) {
      console.log("[QuotaHandler] Fetch error:", e.message);
      const snapshot: QuotaSnapshot = {
        timestamp: new Date(),
        models: [],
        error: "fetch_failed",
      };
      if (this.updateCallback) this.updateCallback(snapshot);
      return snapshot;
    }
  }

  private request<T>(path: string, body: object): Promise<T> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const options: https.RequestOptions = {
        hostname: "127.0.0.1",
        port: this.port,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          "Connect-Protocol-Version": "1",
          "X-Codeium-Csrf-Token": this.csrfToken,
        },
        rejectUnauthorized: false,
        timeout: 5000,
      };

      const req = https.request(options, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body) as T);
          } catch {
            reject(new Error("Invalid JSON response"));
          }
        });
      });

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });
      req.write(data);
      req.end();
    });
  }

  private parseResponse(data: any): QuotaSnapshot {
    const models: ModelQuota[] = [];

    try {
      const userStatus = data.userStatus;
      const rawModels =
        userStatus?.cascadeModelConfigData?.clientModelConfigs || [];

      for (const m of rawModels) {
        if (!m.quotaInfo) continue;

        const resetTime = new Date(m.quotaInfo.resetTime);
        const now = new Date();
        const diff = resetTime.getTime() - now.getTime();
        const remainingFraction = m.quotaInfo.remainingFraction ?? 1;

        models.push({
          label: m.label || "Unknown",
          modelId: m.modelOrAlias?.model || "unknown",
          remainingPercentage: remainingFraction * 100,
          isExhausted: remainingFraction === 0,
          resetTime,
          timeUntilReset: diff,
          timeUntilResetFormatted: this.formatTime(diff),
        });
      }
    } catch (e) {
      console.log("[QuotaHandler] Parse error:", e);
    }

    return {
      timestamp: new Date(),
      models,
    };
  }

  private formatTime(ms: number): string {
    if (ms <= 0) return "Ready";
    const mins = Math.ceil(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    if (hours < 24) return `${hours}h ${remainingMins}m`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }

  isReady(): boolean {
    return this.isInitialized && this.port > 0;
  }
}
