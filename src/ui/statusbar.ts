import * as vscode from 'vscode';
import { I18n } from '../core/i18n';
import { StorageManager } from '../core/storage';

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;
    private context: vscode.ExtensionContext;
    private baseText: string = '';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.command = 'auto-accept-ego.openDashboard';
        this.statusBarItem.show();
        this.update();
    }

    public update(): void {
        const config = vscode.workspace.getConfiguration('auto-accept-ego');
        const isEnabled = config.get<boolean>('enabled', true);

        // Use I18n for status text
        const statusText = isEnabled ?
            I18n.t("extension.status.on") :
            I18n.t("extension.status.off");

        const icon = isEnabled ? "$(shield)" : "$(circle-slash)";
        this.baseText = `${icon} ${statusText}`;

        // Visual feedback for disabled state
        if (!isEnabled) {
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            this.statusBarItem.backgroundColor = undefined;
        }

        this.updateBadge();
    }

    public updateBadge(): void {
        const config = vscode.workspace.getConfiguration('auto-accept-ego');
        const isEnabled = config.get<boolean>('enabled', true);

        // Always start with base text
        this.statusBarItem.text = this.baseText;

        if (!isEnabled) return;

        const blocked = StorageManager.getLogs(this.context).filter(l => l.action === 'blocked').length;
        if (blocked > 0) {
            this.statusBarItem.text = `${this.baseText} ($(alert) ${blocked})`;
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        }
    }

    public async toggle(): Promise<void> {
        const config = vscode.workspace.getConfiguration('auto-accept-ego');
        const currentState = config.get<boolean>('enabled', true);
        await config.update('enabled', !currentState, vscode.ConfigurationTarget.Global);
        // update() will be called via onDidChangeConfiguration in extension.ts
    }
}
