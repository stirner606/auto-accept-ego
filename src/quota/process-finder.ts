/**
 * Process Finder for Quota Handler
 * Finds the Antigravity language_server process and extracts connection info
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

export interface ProcessInfo {
    pid: number;
    port: number;
    csrfToken: string;
}

export class ProcessFinder {
    private platform = os.platform();
    private processName: string;

    constructor() {
        if (this.platform === 'win32') {
            this.processName = 'language_server_windows_x64.exe';
        } else if (this.platform === 'darwin') {
            this.processName = process.arch === 'arm64' ? 'language_server_macos_arm' : 'language_server_macos';
        } else {
            this.processName = process.arch === 'arm64' ? 'language_server_linux_arm' : 'language_server_linux_x64';
        }
    }

    async findProcess(): Promise<ProcessInfo | null> {
        try {
            if (this.platform === 'win32') {
                return await this.findWindowsProcess();
            } else {
                return await this.findUnixProcess();
            }
        } catch (e) {
            console.log('[QuotaFinder] Process detection failed:', e);
            return null;
        }
    }

    private async findWindowsProcess(): Promise<ProcessInfo | null> {
        const cmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name='${this.processName}'\\" | Select-Object ProcessId,CommandLine | ConvertTo-Json"`;

        try {
            const { stdout } = await execAsync(cmd);
            if (!stdout.trim()) return null;

            let data = JSON.parse(stdout.trim());

            // Handle array or single object
            if (Array.isArray(data)) {
                // Filter for Antigravity process
                const agProcess = data.find((p: any) =>
                    p.CommandLine && this.isAntigravityProcess(p.CommandLine)
                );
                if (!agProcess) return null;
                data = agProcess;
            } else if (!data.CommandLine || !this.isAntigravityProcess(data.CommandLine)) {
                return null;
            }

            return this.parseCommandLine(data.ProcessId, data.CommandLine);
        } catch {
            return null;
        }
    }

    private async findUnixProcess(): Promise<ProcessInfo | null> {
        const cmd = this.platform === 'darwin'
            ? `pgrep -fl ${this.processName}`
            : `pgrep -af ${this.processName}`;

        try {
            const { stdout } = await execAsync(cmd);
            const lines = stdout.split('\n');

            for (const line of lines) {
                if (line.includes('--extension_server_port') && this.isAntigravityProcess(line)) {
                    const parts = line.trim().split(/\s+/);
                    const pid = parseInt(parts[0], 10);
                    return this.parseCommandLine(pid, line);
                }
            }
        } catch {
            return null;
        }
        return null;
    }

    private isAntigravityProcess(cmdLine: string): boolean {
        const lower = cmdLine.toLowerCase();
        return /--app_data_dir\s+antigravity\b/i.test(cmdLine) ||
            lower.includes('\\antigravity\\') ||
            lower.includes('/antigravity/');
    }

    private parseCommandLine(pid: number, cmdLine: string): ProcessInfo | null {
        const portMatch = cmdLine.match(/--extension_server_port[=\s]+(\d+)/);
        const tokenMatch = cmdLine.match(/--csrf_token[=\s]+([a-f0-9\-]+)/i);

        if (!tokenMatch || !tokenMatch[1]) return null;

        return {
            pid,
            port: portMatch ? parseInt(portMatch[1], 10) : 0,
            csrfToken: tokenMatch[1]
        };
    }

    async getListeningPorts(pid: number): Promise<number[]> {
        try {
            if (this.platform === 'win32') {
                const cmd = `powershell -NoProfile -Command "Get-NetTCPConnection -OwningProcess ${pid} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort | ConvertTo-Json"`;
                const { stdout } = await execAsync(cmd);
                if (!stdout.trim()) return [];

                const data = JSON.parse(stdout.trim());
                if (Array.isArray(data)) return data.filter(p => typeof p === 'number');
                if (typeof data === 'number') return [data];
                return [];
            } else if (this.platform === 'darwin') {
                const cmd = `lsof -nP -a -iTCP -sTCP:LISTEN -p ${pid}`;
                const { stdout } = await execAsync(cmd);
                const ports: number[] = [];
                const regex = /(?:\*|[\d.]+|\[[\da-f:]+\]):(\d+)\s+\(LISTEN\)/gi;
                let match;
                while ((match = regex.exec(stdout)) !== null) {
                    ports.push(parseInt(match[1], 10));
                }
                return ports;
            } else {
                const cmd = `ss -tlnp 2>/dev/null | grep "pid=${pid}" || lsof -nP -a -iTCP -sTCP:LISTEN -p ${pid} 2>/dev/null`;
                const { stdout } = await execAsync(cmd);
                const ports: number[] = [];
                const regex = /(?:\*|[\d.]+|\[[\da-f:]*\]):(\d+)/g;
                let match;
                while ((match = regex.exec(stdout)) !== null) {
                    const port = parseInt(match[1], 10);
                    if (!ports.includes(port)) ports.push(port);
                }
                return ports;
            }
        } catch {
            return [];
        }
    }
}
