/**
 * Relauncher for Auto Accept Ego
 * Restarts Antigravity with --remote-debugging-port=9000
 */
import * as vscode from "vscode";
import { execSync, spawn } from "child_process";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";

const CDP_PORT = 9000;
const CDP_FLAG = `--remote-debugging-port=${CDP_PORT}`;

export class Relauncher {
  private platform = os.platform();
  private logger: (msg: string) => void;

  constructor(logger: (msg: string) => void = console.log) {
    this.logger = logger;
  }

  private log(msg: string): void {
    this.logger(`[Relauncher] ${msg}`);
  }

  getIdeName(): string {
    const appName = vscode.env.appName || "";
    if (appName.toLowerCase().includes("cursor")) return "Cursor";
    if (appName.toLowerCase().includes("antigravity")) return "Antigravity";
    return "Code";
  }

  async ensureCDPAndRelaunch(): Promise<{
    success: boolean;
    relaunched: boolean;
  }> {
    this.log("Checking for CDP flag...");
    const hasFlag = this.checkCDPFlag();

    if (hasFlag) {
      this.log("CDP flag already present.");
      return { success: true, relaunched: false };
    }

    this.log("CDP flag missing. Attempting to modify shortcut...");
    const modified = await this.modifyShortcut();

    if (modified) {
      this.log("Shortcut modified. Prompting for restart...");
      // Seamless mode: Don't block with modal.
      // Option 1: Just show a transient message
      vscode.window.showInformationMessage(
        "Auto Accept Ego: Setup complete. Please restart IDE to enable premium features."
      );
      // Option 2: Could auto-restart, but might lose data. Sticking to notification.
      return { success: true, relaunched: false };
    } else {
      this.log("Could not modify shortcut automatically.");
      // Silent failure or status bar warning could be better, but warning message is safer for now.
      vscode.window.showWarningMessage(
        `Auto Accept Ego: Setup failed. Please restart manually with: ${CDP_FLAG}`
      );
    }

    return { success: false, relaunched: false };
  }

  private checkCDPFlag(): boolean {
    const args = process.argv.join(" ");
    return args.includes("--remote-debugging-port=9000");
  }

  private async modifyShortcut(): Promise<boolean> {
    try {
      if (this.platform === "win32") return await this.modifyWindowsShortcut();
      if (this.platform === "darwin") return await this.modifyMacOSShortcut();
      if (this.platform === "linux") return await this.modifyLinuxShortcut();
    } catch (e: any) {
      this.log(`Modification error: ${e.message}`);
    }
    return false;
  }

  private async modifyWindowsShortcut(): Promise<boolean> {
    const ideName = this.getIdeName();
    const script = `
$ErrorActionPreference = "SilentlyContinue"
$WshShell = New-Object -ComObject WScript.Shell
$DesktopPath = [System.IO.Path]::Combine($env:USERPROFILE, "Desktop")
$StartMenuPath = [System.IO.Path]::Combine($env:APPDATA, "Microsoft", "Windows", "Start Menu", "Programs")

$Shortcuts = Get-ChildItem "$DesktopPath\\*.lnk", "$StartMenuPath\\*.lnk" -Recurse | Where-Object { $_.Name -like "*${ideName}*" }

$modified = $false
foreach ($file in $Shortcuts) {
    try {
        $shortcut = $WshShell.CreateShortcut($file.FullName)
        if ($shortcut.Arguments -notlike "*--remote-debugging-port=9000*") {
            $shortcut.Arguments = "--remote-debugging-port=9000 " + $shortcut.Arguments
            $shortcut.Save()
            $modified = $true
        }
    } catch {}
}
if ($modified) { Write-Output "MODIFIED" } else { Write-Output "NO_CHANGE" }
`;
    const result = this.runPowerShell(script);
    return result.includes("MODIFIED");
  }

  private async modifyMacOSShortcut(): Promise<boolean> {
    const ideName = this.getIdeName();
    const binDir = path.join(os.homedir(), ".local", "bin");
    const wrapperPath = path.join(binDir, `${ideName.toLowerCase()}-cdp`);

    if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

    const appPath =
      ideName === "Code"
        ? "/Applications/Visual Studio Code.app"
        : `/Applications/${ideName}.app`;
    const content = `#!/bin/bash\nopen -a "${appPath}" --args --remote-debugging-port=9000 "$@"`;

    fs.writeFileSync(wrapperPath, content, { mode: 0o755 });
    this.log(`Created macOS wrapper at ${wrapperPath}`);
    return true;
  }

  private async modifyLinuxShortcut(): Promise<boolean> {
    const ideName = this.getIdeName().toLowerCase();
    const desktopPaths = [
      path.join(
        os.homedir(),
        ".local",
        "share",
        "applications",
        `${ideName}.desktop`
      ),
      `/usr/share/applications/${ideName}.desktop`,
    ];

    for (const p of desktopPaths) {
      if (fs.existsSync(p)) {
        let content = fs.readFileSync(p, "utf8");
        if (!content.includes("--remote-debugging-port=9000")) {
          content = content.replace(
            /^Exec=(.*)$/m,
            "Exec=$1 --remote-debugging-port=9000"
          );
          const userPath = path.join(
            os.homedir(),
            ".local",
            "share",
            "applications",
            path.basename(p)
          );
          fs.mkdirSync(path.dirname(userPath), { recursive: true });
          fs.writeFileSync(userPath, content);
          return true;
        }
      }
    }
    return false;
  }

  private async relaunch(): Promise<void> {
    const folders = (vscode.workspace.workspaceFolders || [])
      .map((f) => `"${f.uri.fsPath}"`)
      .join(" ");

    if (this.platform === "win32") {
      const ideName = this.getIdeName();
      const cmd = `timeout /t 2 /nobreak >nul & start "" "${ideName}" ${folders}`;
      spawn("cmd.exe", ["/c", cmd], {
        detached: true,
        stdio: "ignore",
      }).unref();
    } else if (this.platform === "darwin") {
      const ideName = this.getIdeName();
      const wrapperPath = path.join(
        os.homedir(),
        ".local",
        "bin",
        `${ideName.toLowerCase()}-cdp`
      );
      const cmd = `sleep 2 && "${wrapperPath}" ${folders}`;
      spawn("sh", ["-c", cmd], { detached: true, stdio: "ignore" }).unref();
    } else {
      const cmd = `sleep 2 && ${this.getIdeName().toLowerCase()} --remote-debugging-port=9000 ${folders}`;
      spawn("sh", ["-c", cmd], { detached: true, stdio: "ignore" }).unref();
    }

    setTimeout(
      () => vscode.commands.executeCommand("workbench.action.quit"),
      500
    );
  }

  private runPowerShell(script: string): string {
    try {
      const tempFile = path.join(os.tmpdir(), `ego_relaunch_${Date.now()}.ps1`);
      fs.writeFileSync(tempFile, script, "utf8");
      const result = execSync(
        `powershell -ExecutionPolicy Bypass -File "${tempFile}"`,
        { encoding: "utf8" }
      );
      fs.unlinkSync(tempFile);
      return result;
    } catch {
      return "";
    }
  }
}
