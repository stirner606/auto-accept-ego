import * as vscode from "vscode";
import { I18n } from "./core/i18n";
import { StatusBarManager } from "./ui/statusbar";
import { DashboardProvider } from "./ui/dashboard";
import { StorageManager } from "./core/storage";
import { CDPHandler } from "./cdp/cdp-handler";
import { Relauncher } from "./cdp/relauncher";
import { QuotaHandler } from "./quota/quota-handler";

let statusBarManager: StatusBarManager;
let cdpHandler: CDPHandler;
let relauncher: Relauncher;
let quotaHandler: QuotaHandler;
let pollTimer: NodeJS.Timeout | null = null;

export async function activate(context: vscode.ExtensionContext) {
  // Initialize systems
  I18n.init();
  statusBarManager = new StatusBarManager(context);
  cdpHandler = new CDPHandler((msg) => console.log(msg));
  relauncher = new Relauncher((msg) => console.log(msg));
  quotaHandler = new QuotaHandler();

  // Setup Quota Updates
  quotaHandler.onUpdate((snapshot) => {
    DashboardProvider.updateQuota({
      models: snapshot.models,
      error: snapshot.error,
      translations: I18n.getTranslations(),
    });
  });

  // ==================== COMMANDS ====================
  context.subscriptions.push(
    vscode.commands.registerCommand("auto-accept-ego.toggle", async () => {
      const config = vscode.workspace.getConfiguration("auto-accept-ego");
      const currentState = config.get<boolean>("enabled", true);
      const targetState = !currentState;

      if (targetState) {
        // Enabling - check if CDP is available
        const cdpAvailable = await cdpHandler.isCDPAvailable();
        if (!cdpAvailable) {
          // Need to restart with CDP flag
          await relauncher.ensureCDPAndRelaunch();
          return;
        }
      }

      // Update configuration (this will trigger onDidChangeConfiguration)
      await config.update(
        "enabled",
        targetState,
        vscode.ConfigurationTarget.Global,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("auto-accept-ego.openDashboard", () => {
      DashboardProvider.createOrShow(context);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "auto-accept-ego.refreshQuota",
      async () => {
        vscode.window.setStatusBarMessage("Refreshing AI Quotas...", 2000);
        const snapshot = await quotaHandler.fetchQuota();
        // Send result back to dashboard
        DashboardProvider.updateQuota({
          models: snapshot.models,
          error: snapshot.error,
          translations: I18n.getTranslations(),
        });
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("auto-accept-ego.updateBadge", async () => {
      // Collect stats from browser
      const stats = await cdpHandler.getStats();
      if (stats.clicks > 0) {
        StorageManager.incrementAccepted(context, stats.clicks);
      }
      if (stats.blocked > 0) {
        StorageManager.incrementBlocked(context, stats.blocked);
      }
      statusBarManager.updateBadge();
      DashboardProvider.updateContent(context, cdpHandler.getConnectionCount());
    }),
  );

  // ==================== AUTO-START IF ENABLED ====================
  const config = vscode.workspace.getConfiguration("auto-accept-ego");
  if (config.get<boolean>("enabled", true)) {
    const cdpAvailable = await cdpHandler.isCDPAvailable();
    if (cdpAvailable) {
      await startPolling(context);
      console.log("Auto Accept Ego: CDP connected and running");
    } else {
      console.log("Auto Accept Ego: CDP not available, prompting user...");
      await relauncher.ensureCDPAndRelaunch();
    }
  }

  // Watch for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("auto-accept-ego")) {
        I18n.init(); // Refresh language
        statusBarManager.update();
        DashboardProvider.updateContent(
          context,
          cdpHandler.getConnectionCount(),
        );

        // Handle enable/disable live
        if (e.affectsConfiguration("auto-accept-ego.enabled")) {
          const newConfig =
            vscode.workspace.getConfiguration("auto-accept-ego");
          const isEnabled = newConfig.get<boolean>("enabled", true);
          if (isEnabled) {
            await startPolling(context);
          } else {
            await stopPolling();
          }
        }
      }
    }),
  );

  // Initial status bar update
  statusBarManager.update();

  console.log("Auto Accept Ego: Activation complete");
}

async function startPolling(context: vscode.ExtensionContext): Promise<void> {
  if (pollTimer) clearInterval(pollTimer);

  const config = vscode.workspace.getConfiguration("auto-accept-ego");
  const bannedCommands = [
    ...config.get<string[]>("customBlacklist", []),
    // Built-in dangerous patterns
    "rm -rf /",
    "rm -rf ~",
    "rm -rf *",
    "format c:",
    "del /f /s /q",
    "rmdir /s /q",
    ":(){:|:&};:",
    "dd if=",
    "mkfs.",
    "> /dev/sda",
    "chmod -R 777 /",
  ];

  // Start CDP
  await cdpHandler.start({
    pollInterval: 300,
    bannedCommands,
    whitelist: config.get<string[]>("whitelist", []),
    safeMode: config.get<boolean>("safeMode", false),
  });

  // Start Quota Polling (60s interval)
  quotaHandler.startPolling(60000);

  // Initial delayed check (10s) to catch process startup
  setTimeout(() => {
    quotaHandler.fetchQuota();
  }, 10000);

  // Poll for stats every 5 seconds
  pollTimer = setInterval(async () => {
    const config = vscode.workspace.getConfiguration("auto-accept-ego");
    if (!config.get<boolean>("enabled", true)) {
      await stopPolling();
      return;
    }

    // Update stats
    vscode.commands.executeCommand("auto-accept-ego.updateBadge");

    // Re-sync with browser
    await cdpHandler.start({
      pollInterval: 300,
      bannedCommands: [
        ...config.get<string[]>("customBlacklist", []),
        "rm -rf /",
        "rm -rf ~",
        "rm -rf *",
        "format c:",
        "del /f /s /q",
        "rmdir /s /q",
        ":(){:|:&};:",
        "dd if=",
        "mkfs.",
        "> /dev/sda",
        "chmod -R 777 /",
      ],
      whitelist: config.get<string[]>("whitelist", []),
      safeMode: config.get<boolean>("safeMode", false),
    });
  }, 5000);

  console.log("Auto Accept Ego: Polling started");
}

async function stopPolling(): Promise<void> {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  await cdpHandler.stop();
  quotaHandler.stopPolling();
  console.log("Auto Accept Ego: Polling stopped");
}

export function deactivate() {
  stopPolling();
  console.log("Auto Accept Ego deactivated");
}
