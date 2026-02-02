import * as vscode from "vscode";

export interface ExtensionStats {
  totalAccepted: number;
  totalBlocked: number;
  totalSkipped: number;
}

export interface LogEntry {
  action: "accepted" | "blocked" | "skipped";
  detail: string;
  category: string;
  timestamp: string;
}

export class StorageManager {
  private static readonly STATS_KEY = "ego-stats";
  private static readonly LOGS_KEY = "ego-logs";
  private static readonly MAX_LOGS = 50;

  // ========== GLOBAL STATS ==========
  public static getGlobalStats(
    context: vscode.ExtensionContext
  ): ExtensionStats {
    return (
      context.globalState.get<ExtensionStats>(this.STATS_KEY) || {
        totalAccepted: 0,
        totalBlocked: 0,
        totalSkipped: 0,
      }
    );
  }

  public static updateGlobalStats(
    context: vscode.ExtensionContext,
    stats: ExtensionStats
  ): void {
    context.globalState.update(this.STATS_KEY, stats);
  }

  // ========== WORKSPACE/PROJECT STATS ==========
  public static getWorkspaceStats(
    context: vscode.ExtensionContext
  ): ExtensionStats {
    return (
      context.workspaceState.get<ExtensionStats>(this.STATS_KEY) || {
        totalAccepted: 0,
        totalBlocked: 0,
        totalSkipped: 0,
      }
    );
  }

  public static updateWorkspaceStats(
    context: vscode.ExtensionContext,
    stats: ExtensionStats
  ): void {
    context.workspaceState.update(this.STATS_KEY, stats);
  }

  // ========== COMBINED STATS METHODS ==========
  public static incrementAccepted(
    context: vscode.ExtensionContext,
    amount: number = 1
  ): void {
    // Global
    const globalStats = this.getGlobalStats(context);
    globalStats.totalAccepted += amount;
    this.updateGlobalStats(context, globalStats);

    // Workspace
    const wsStats = this.getWorkspaceStats(context);
    wsStats.totalAccepted += amount;
    this.updateWorkspaceStats(context, wsStats);
  }

  public static incrementBlocked(
    context: vscode.ExtensionContext,
    amount: number = 1
  ): void {
    const globalStats = this.getGlobalStats(context);
    globalStats.totalBlocked += amount;
    this.updateGlobalStats(context, globalStats);

    const wsStats = this.getWorkspaceStats(context);
    wsStats.totalBlocked += amount;
    this.updateWorkspaceStats(context, wsStats);
  }

  public static incrementSkipped(
    context: vscode.ExtensionContext,
    amount: number = 1
  ): void {
    const globalStats = this.getGlobalStats(context);
    globalStats.totalSkipped += amount;
    this.updateGlobalStats(context, globalStats);

    const wsStats = this.getWorkspaceStats(context);
    wsStats.totalSkipped += amount;
    this.updateWorkspaceStats(context, wsStats);
  }

  // ========== RESET STATS ==========
  public static resetStats(context: vscode.ExtensionContext): void {
    const emptyStats: ExtensionStats = {
      totalAccepted: 0,
      totalBlocked: 0,
      totalSkipped: 0,
    };
    // Reset Global
    this.updateGlobalStats(context, emptyStats);
    // Reset Workspace
    this.updateWorkspaceStats(context, emptyStats);
  }

  // ========== LOGS ==========
  public static getLogs(context: vscode.ExtensionContext): LogEntry[] {
    return context.globalState.get<LogEntry[]>(this.LOGS_KEY) || [];
  }

  public static addLog(
    context: vscode.ExtensionContext,
    entry: Omit<LogEntry, "timestamp">
  ): void {
    let logs = this.getLogs(context);
    const now = new Date();
    const timestamp = now.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    logs.unshift({ ...entry, timestamp });
    if (logs.length > this.MAX_LOGS) {
      logs = logs.slice(0, this.MAX_LOGS);
    }
    context.globalState.update(this.LOGS_KEY, logs);
  }

  public static clearLogs(context: vscode.ExtensionContext): void {
    context.globalState.update(this.LOGS_KEY, []);
  }

  // ========== WORKSPACE SETTINGS ==========
  public static getWorkspaceSettings(
    context: vscode.ExtensionContext
  ): Record<string, unknown> {
    return (
      context.workspaceState.get<Record<string, unknown>>("ego-ws-settings") ||
      {}
    );
  }

  public static setWorkspaceSetting(
    context: vscode.ExtensionContext,
    key: string,
    value: unknown
  ): void {
    const settings = this.getWorkspaceSettings(context);
    settings[key] = value;
    context.workspaceState.update("ego-ws-settings", settings);
  }
}
