/**
 * CDP Handler for Auto Accept Ego
 * Connects to Antigravity via Chrome DevTools Protocol
 */
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const WebSocket = require('ws');

const BASE_PORT = 9000;
const PORT_RANGE = 3;

interface CDPConnection {
    ws: any;
    injected: boolean;
}

export class CDPHandler {
    private connections: Map<string, CDPConnection> = new Map();
    private msgId = 1;
    private logger: (msg: string) => void;

    constructor(logger: (msg: string) => void = console.log) {
        this.logger = logger;
    }

    private log(msg: string): void {
        this.logger(`[CDP] ${msg}`);
    }

    async isCDPAvailable(): Promise<boolean> {
        for (let port = BASE_PORT - PORT_RANGE; port <= BASE_PORT + PORT_RANGE; port++) {
            try {
                const pages = await this.getPages(port);
                if (pages.length > 0) return true;
            } catch { }
        }
        return false;
    }

    async start(config: { pollInterval: number; bannedCommands: string[]; whitelist?: string[]; safeMode?: boolean }): Promise<void> {
        this.log(`Scanning ports ${BASE_PORT - PORT_RANGE} to ${BASE_PORT + PORT_RANGE}...`);

        for (let port = BASE_PORT - PORT_RANGE; port <= BASE_PORT + PORT_RANGE; port++) {
            try {
                const pages = await this.getPages(port);
                for (const page of pages) {
                    const id = `${port}:${page.id}`;
                    if (!this.connections.has(id)) {
                        await this.connect(id, page.webSocketDebuggerUrl);
                    }
                    await this.inject(id, config);
                }
            } catch { }
        }
    }

    async stop(): Promise<void> {
        for (const [id, conn] of this.connections) {
            try {
                await this.evaluate(id, 'if(window.__egoStop) window.__egoStop()');
                conn.ws.close();
            } catch { }
        }
        this.connections.clear();
    }

    private getPages(port: number): Promise<Array<{ id: string; webSocketDebuggerUrl: string }>> {
        return new Promise((resolve) => {
            const req = http.get(
                { hostname: '127.0.0.1', port, path: '/json/list', timeout: 500 },
                (res) => {
                    let body = '';
                    res.on('data', (chunk) => (body += chunk));
                    res.on('end', () => {
                        try {
                            const pages = JSON.parse(body);
                            resolve(pages.filter((p: any) => p.webSocketDebuggerUrl && (p.type === 'page' || p.type === 'webview')));
                        } catch {
                            resolve([]);
                        }
                    });
                }
            );
            req.on('error', () => resolve([]));
            req.on('timeout', () => { req.destroy(); resolve([]); });
        });
    }

    private connect(id: string, url: string): Promise<boolean> {
        return new Promise((resolve) => {
            const ws = new WebSocket(url);
            ws.on('open', () => {
                this.connections.set(id, { ws, injected: false });
                this.log(`Connected to page ${id}`);
                resolve(true);
            });
            ws.on('error', () => resolve(false));
            ws.on('close', () => {
                this.connections.delete(id);
                this.log(`Disconnected from page ${id}`);
            });
        });
    }

    private async inject(id: string, config: any): Promise<void> {
        const conn = this.connections.get(id);
        if (!conn) return;

        try {
            if (!conn.injected) {
                const scriptPath = path.join(__dirname, 'inject-script.js');
                const script = fs.readFileSync(scriptPath, 'utf8');
                await this.evaluate(id, script);
                conn.injected = true;
                this.log(`Script injected into ${id}`);
            }
            await this.evaluate(id, `if(window.__egoStart) window.__egoStart(${JSON.stringify(config)})`);
        } catch (e: any) {
            this.log(`Injection failed for ${id}: ${e.message}`);
        }
    }

    private evaluate(id: string, expression: string): Promise<any> {
        const conn = this.connections.get(id);
        if (!conn || conn.ws.readyState !== 1) return Promise.resolve(); // 1 = OPEN

        return new Promise((resolve, reject) => {
            const currentId = this.msgId++;
            const timeout = setTimeout(() => reject(new Error('CDP Timeout')), 2000);

            const onMessage = (data: any) => {
                try {
                    const msg = JSON.parse(data.toString());
                    if (msg.id === currentId) {
                        conn.ws.removeListener('message', onMessage);
                        clearTimeout(timeout);
                        resolve(msg.result);
                    }
                } catch { }
            };

            conn.ws.on('message', onMessage);
            conn.ws.send(JSON.stringify({
                id: currentId,
                method: 'Runtime.evaluate',
                params: { expression, userGesture: true, awaitPromise: true }
            }));
        });
    }

    getConnectionCount(): number {
        return this.connections.size;
    }

    async getStats(): Promise<{ clicks: number; blocked: number }> {
        let stats = { clicks: 0, blocked: 0 };
        for (const [id] of this.connections) {
            try {
                const res = await this.evaluate(id, 'JSON.stringify(window.__egoGetStats ? window.__egoGetStats() : {})');
                if (res?.result?.value) {
                    const s = JSON.parse(res.result.value);
                    stats.clicks += s.clicks || 0;
                    stats.blocked += s.blocked || 0;
                }
            } catch { }
        }
        return stats;
    }
}
