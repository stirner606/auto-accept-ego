import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { StorageManager } from "../core/storage";
import { I18n } from "../core/i18n";

export class DashboardProvider {
  public static readonly viewType = "auto-accept-ego.dashboard";
  private static panel: vscode.WebviewPanel | undefined;

  public static createOrShow(context: vscode.ExtensionContext) {
    const column =
      vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

    if (DashboardProvider.panel) {
      DashboardProvider.panel.reveal(column);
      this.updateContent(context);
      return;
    }

    DashboardProvider.panel = vscode.window.createWebviewPanel(
      DashboardProvider.viewType,
      "Auto Accept Ego",
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, "src", "assets")),
        ],
      }
    );

    DashboardProvider.panel.webview.html = this.getHtml(context);

    // Handle messages from webview
    DashboardProvider.panel.webview.onDidReceiveMessage(
      async (message) => {
        const config = vscode.workspace.getConfiguration("auto-accept-ego");

        switch (message.type) {
          case "setting":
            const key = message.key;
            const value = message.value;

            // Map dashboard IDs to config keys
            const keyMap: Record<string, string> = {
              "cat-files": "categories.files",
              "cat-terminal": "categories.terminal",
              "cat-dialogs": "categories.dialogs",
              "cat-git": "categories.git",
              "cat-package": "categories.package",
              "safe-mode": "safeMode",
              threshold: "dangerThreshold",
              language: "language",
              "threat-action": "onThreatAction",
              dangerThreshold: "dangerThreshold",
              onThreatAction: "onThreatAction",
              customBlacklist: "customBlacklist",
              whitelist: "whitelist",
            };

            const configKey = keyMap[key] || key;
            await config.update(
              configKey,
              value,
              vscode.ConfigurationTarget.Global
            );

            if (key === "customBlacklist" || key === "whitelist") {
              vscode.window.showInformationMessage(
                `${
                  key === "customBlacklist" ? "Blacklist" : "Whitelist"
                } updated!`
              );
            }
            break;

          case "clearLogs":
            StorageManager.clearLogs(context);
            this.updateContent(context);
            vscode.window.showInformationMessage("Logs cleared!");
            break;

          case "refreshQuota":
            vscode.commands.executeCommand("auto-accept-ego.refreshQuota");
            break;

          case "resetStats":
            StorageManager.resetStats(context);
            this.updateContent(context);
            vscode.window.showInformationMessage(
              I18n.t("dashboard.stats.resetSuccess")
            );
            break;
        }
      },
      undefined,
      context.subscriptions
    );

    DashboardProvider.panel.onDidDispose(
      () => {
        DashboardProvider.panel = undefined;
      },
      null,
      context.subscriptions
    );

    this.updateContent(context);
    // Trigger initial quota fetch when dashboard opens
    vscode.commands.executeCommand("auto-accept-ego.refreshQuota");
  }

  private static getHtml(context: vscode.ExtensionContext): string {
    const htmlPath = path.join(
      context.extensionPath,
      "src",
      "assets",
      "webview.html"
    );
    return fs.readFileSync(htmlPath, "utf8");
  }

  public static updateQuota(data: any): void {
    if (!DashboardProvider.panel) return;
    DashboardProvider.panel.webview.postMessage({
      type: "quotaUpdate",
      ...data,
    });
  }

  public static updateContent(
    context: vscode.ExtensionContext,
    agentCount: number = 0
  ): void {
    if (!DashboardProvider.panel) return;

    const config = vscode.workspace.getConfiguration("auto-accept-ego");
    const wsStats = StorageManager.getWorkspaceStats(context);
    const logs = StorageManager.getLogs(context);

    const workspaceName =
      vscode.workspace.workspaceFolders?.[0]?.name || "No Workspace";

    DashboardProvider.panel.webview.postMessage({
      type: "update",
      stats: wsStats,
      logs: logs,
      projectName: workspaceName,
      agentCount: agentCount,
      // New sync data
      config: {
        enabled: config.get<boolean>("enabled"),
        language: config.get<string>("language"),
        onThreatAction: config.get<string>("onThreatAction"),
        safeMode: config.get<boolean>("safeMode"),
        dangerThreshold: config.get<number>("dangerThreshold"),
        categories: {
          files: config.get<boolean>("categories.files"),
          terminal: config.get<boolean>("categories.terminal"),
          dialogs: config.get<boolean>("categories.dialogs"),
          git: config.get<boolean>("categories.git"),
          package: config.get<boolean>("categories.package"),
        },
        customBlacklist: config.get<string[]>("customBlacklist"),
        whitelist: config.get<string[]>("whitelist"),
      },
      translations: I18n.getTranslations(),
    });
  }
}
