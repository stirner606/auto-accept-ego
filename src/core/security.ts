import * as vscode from "vscode";

export interface SecurityResult {
  safe: boolean;
  level?: 1 | 2 | 3;
  reason?: string;
  score?: number;
  originalCommand?: string;
  decodedCommand?: string;
}

export class SecurityEngine {
  // ==================== LEVEL 1: STATIC BLACKLIST ====================
  private static readonly BLACKLIST_PATTERNS: Array<{
    pattern: RegExp;
    description: string;
    score: number;
  }> = [
    // Destructive file operations (Score: 100)
    {
      pattern: /rm\s+(-[a-z]*)?r[a-z]*\s+(-[a-z]*\s+)*(\/|~|\*|\.\.)/i,
      description: "Recursive deletion",
      score: 100,
    },
    {
      pattern: /rm\s+-rf\s+[\/~*\.]/i,
      description: "Forced recursive deletion",
      score: 100,
    },
    {
      pattern: /rmdir\s+\/s\s+\/q/i,
      description: "Windows recursive folder delete",
      score: 100,
    },
    {
      pattern: /del\s+\/[fq]\s+\/s/i,
      description: "Windows forced delete",
      score: 100,
    },
    {
      pattern: /del\s+\/s\s+\/[fq]/i,
      description: "Windows forced delete",
      score: 100,
    },
    {
      pattern: /format\s+[a-z]:/i,
      description: "Format disk drive",
      score: 100,
    },

    // System destruction (Score: 100)
    {
      pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;?\s*:/i,
      description: "Fork bomb",
      score: 100,
    },
    { pattern: /mkfs\./i, description: "Filesystem creation", score: 100 },
    { pattern: /dd\s+if=/i, description: "Raw disk write", score: 95 },
    {
      pattern: />\s*\/dev\/sd[a-z]/i,
      description: "Direct disk overwrite",
      score: 100,
    },

    // System commands (Score: 80-90)
    { pattern: /shutdown\s/i, description: "System shutdown", score: 80 },
    { pattern: /reboot/i, description: "System reboot", score: 80 },
    { pattern: /init\s+[06]/i, description: "Halt/reboot system", score: 85 },

    // Permission abuse (Score: 70-90)
    {
      pattern: /chmod\s+777\s+\//i,
      description: "Full permissions on root",
      score: 90,
    },
    {
      pattern: /chmod\s+-R\s+777/i,
      description: "Recursive full permissions",
      score: 85,
    },
    {
      pattern: /chown\s+-R\s+.*\s+\//i,
      description: "Recursive ownership on root",
      score: 90,
    },

    // Critical file access (Score: 70-85)
    {
      pattern: /\/etc\/passwd/i,
      description: "Password file access",
      score: 70,
    },
    { pattern: /\/etc\/shadow/i, description: "Shadow file access", score: 85 },
    {
      pattern: /C:\\Windows\\System32/i,
      description: "Windows system folder",
      score: 75,
    },

    // Database destruction (Score: 90)
    { pattern: /DROP\s+DATABASE/i, description: "Drop database", score: 90 },
    { pattern: /DROP\s+TABLE/i, description: "Drop table", score: 85 },
    { pattern: /TRUNCATE\s+TABLE/i, description: "Truncate table", score: 80 },

    // Network attacks (Score: 60-80)
    {
      pattern: /curl\s+.*\|\s*(bash|sh|zsh)/i,
      description: "Remote script execution",
      score: 80,
    },
    {
      pattern: /wget\s+.*\|\s*(bash|sh|zsh)/i,
      description: "Remote script execution",
      score: 80,
    },
    {
      pattern: /curl\s+.*-o.*&&.*chmod/i,
      description: "Download and execute",
      score: 75,
    },
  ];

  // Dangerous file extensions
  private static readonly DANGEROUS_EXTENSIONS = [
    ".exe",
    ".dll",
    ".sys",
    ".bat",
    ".ps1",
    ".cmd",
    ".vbs",
    ".wsf",
    ".msi",
    ".scr",
  ];

  // ==================== LEVEL 2: ANTI-OBFUSCATION ====================
  private static expandVariables(command: string): string {
    let result = command;

    // Unix variables
    result = result.replace(/\$HOME/gi, "/home/user");
    result = result.replace(/\$USER/gi, "user");
    result = result.replace(/\$PWD/gi, "/current/dir");
    result = result.replace(/~\//g, "/home/user/");

    // Windows variables
    result = result.replace(/%USERPROFILE%/gi, "C:\\Users\\user");
    result = result.replace(/%SYSTEMROOT%/gi, "C:\\Windows");
    result = result.replace(/%WINDIR%/gi, "C:\\Windows");
    result = result.replace(/%TEMP%/gi, "C:\\temp");
    result = result.replace(/%APPDATA%/gi, "C:\\Users\\user\\AppData");

    return result;
  }

  private static deobfuscate(command: string): string {
    let result = command;

    // Remove escape characters used for bypass
    result = result.replace(/\\/g, "");
    result = result.replace(/['"]/g, "");
    result = result.replace(/[\u200B-\u200D\uFEFF]/g, ""); // Zero-width chars

    // Decode Base64 patterns
    const base64Match = result.match(
      /echo\s+["']?([A-Za-z0-9+/=]{10,})["']?\s*\|\s*base64\s+-d/
    );
    if (base64Match) {
      try {
        const decoded = Buffer.from(base64Match[1], "base64").toString("utf-8");
        result = decoded;
      } catch {}
    }

    // Decode hex patterns
    const hexMatches = result.match(/\\x([0-9a-fA-F]{2})/g);
    if (hexMatches) {
      for (const hex of hexMatches) {
        const char = String.fromCharCode(parseInt(hex.slice(2), 16));
        result = result.replace(hex, char);
      }
    }

    // Expand variables
    result = this.expandVariables(result);

    return result.toLowerCase().trim();
  }

  private static detectSuspiciousPatterns(command: string): {
    suspicious: boolean;
    reason: string;
    score: number;
  } {
    // Eval execution
    if (/eval\s*\(/i.test(command)) {
      return { suspicious: true, reason: "Eval execution detected", score: 70 };
    }

    // Python/Ruby with network
    if (/python.*-c.*socket|ruby.*-e.*socket/i.test(command)) {
      return {
        suspicious: true,
        reason: "Script with network socket",
        score: 75,
      };
    }

    // Alias/function definitions that might hide commands
    if (/alias\s+\w+\s*=\s*['"].*rm|function\s+\w+.*rm/i.test(command)) {
      return {
        suspicious: true,
        reason: "Suspicious alias/function definition",
        score: 65,
      };
    }

    return { suspicious: false, reason: "", score: 0 };
  }

  private static analyzeChainedCommands(command: string): {
    dangerous: boolean;
    reason: string;
    maxScore: number;
  } {
    const parts = command.split(/&&|;|\|\||(?<!\|)\|(?!\|)/);
    let maxScore = 0;
    let reason = "";

    for (const part of parts) {
      const trimmed = part.trim();
      for (const rule of this.BLACKLIST_PATTERNS) {
        if (rule.pattern.test(trimmed)) {
          if (rule.score > maxScore) {
            maxScore = rule.score;
            reason = `Chained: ${rule.description}`;
          }
        }
      }
    }

    return { dangerous: maxScore > 0, reason, maxScore };
  }

  private static checkFileExtensions(command: string): {
    dangerous: boolean;
    reason: string;
  } {
    for (const ext of this.DANGEROUS_EXTENSIONS) {
      // Check if command is trying to create/modify system files
      if (new RegExp(`(>|touch|echo.*>|cp|mv).*\\${ext}`, "i").test(command)) {
        return { dangerous: true, reason: `Creating/modifying ${ext} file` };
      }
    }
    return { dangerous: false, reason: "" };
  }

  // ==================== LEVEL 3: PATH GUARD ====================
  private static isPathOutsideWorkspace(command: string): {
    outside: boolean;
    reason: string;
  } {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return { outside: false, reason: "" };
    }

    const criticalPaths = [
      "/",
      "/etc",
      "/usr",
      "/bin",
      "/sbin",
      "/boot",
      "/var",
      "/root",
      "C:\\",
      "C:\\Windows",
      "C:\\Program Files",
      "C:\\Users",
    ];

    const pathPatterns = [
      /(?:^|\s)(\/[^\s]+)/g,
      /(?:^|\s)([A-Za-z]:\\[^\s]+)/g,
      /(?:^|\s)(~\/[^\s]+)/g,
    ];

    for (const pattern of pathPatterns) {
      let match;
      while ((match = pattern.exec(command)) !== null) {
        const foundPath = match[1];

        for (const critical of criticalPaths) {
          if (foundPath.toLowerCase().startsWith(critical.toLowerCase())) {
            const isInWorkspace = workspaceFolders.some((folder) =>
              foundPath
                .toLowerCase()
                .startsWith(folder.uri.fsPath.toLowerCase())
            );

            if (!isInWorkspace) {
              return { outside: true, reason: `Critical path: ${foundPath}` };
            }
          }
        }
      }
    }

    return { outside: false, reason: "" };
  }

  // ==================== MAIN CHECK FUNCTION ====================
  public static checkCommand(command: string): SecurityResult {
    const config = vscode.workspace.getConfiguration("auto-accept-ego");
    const customBlacklist = config.get<string[]>("customBlacklist", []);
    const whitelist = config.get<string[]>("whitelist", []);
    const safeMode = config.get<boolean>("safeMode", false);
    const dangerThreshold = config.get<number>("dangerThreshold", 70);

    // Safe Mode: Only whitelist allowed
    if (safeMode) {
      const isWhitelisted = whitelist.some((w) =>
        command.toLowerCase().includes(w.toLowerCase())
      );
      if (!isWhitelisted) {
        return {
          safe: false,
          level: 3,
          reason: "Safe Mode: Command not in whitelist",
          score: 100,
        };
      }
      return { safe: true };
    }

    // Check whitelist
    for (const trusted of whitelist) {
      if (command.toLowerCase().includes(trusted.toLowerCase())) {
        return { safe: true };
      }
    }

    // Deobfuscate
    const cleanCommand = this.deobfuscate(command);
    let totalScore = 0;
    let highestReason = "";

    // ===== LEVEL 1: Static Blacklist =====
    for (const rule of this.BLACKLIST_PATTERNS) {
      if (rule.pattern.test(cleanCommand)) {
        if (rule.score > totalScore) {
          totalScore = rule.score;
          highestReason = rule.description;
        }
      }
    }

    // Check custom blacklist
    for (const custom of customBlacklist) {
      if (cleanCommand.includes(custom.toLowerCase())) {
        totalScore = Math.max(totalScore, 80);
        highestReason = `Custom: ${custom}`;
      }
    }

    // Check file extensions
    const extCheck = this.checkFileExtensions(cleanCommand);
    if (extCheck.dangerous) {
      totalScore = Math.max(totalScore, 75);
      highestReason = extCheck.reason;
    }

    // ===== LEVEL 2: Smart Detection =====
    const suspiciousCheck = this.detectSuspiciousPatterns(cleanCommand);
    if (suspiciousCheck.suspicious) {
      totalScore = Math.max(totalScore, suspiciousCheck.score);
      highestReason = suspiciousCheck.reason;
    }

    const chainCheck = this.analyzeChainedCommands(cleanCommand);
    if (chainCheck.dangerous) {
      totalScore = Math.max(totalScore, chainCheck.maxScore);
      highestReason = chainCheck.reason;
    }

    // ===== LEVEL 3: Path Guard =====
    const pathCheck = this.isPathOutsideWorkspace(command);
    if (pathCheck.outside) {
      totalScore = Math.max(totalScore, 60);
      highestReason = pathCheck.reason;
    }

    // Apply threshold
    if (totalScore >= dangerThreshold) {
      return {
        safe: false,
        level: totalScore >= 80 ? 1 : totalScore >= 50 ? 2 : 3,
        reason: highestReason,
        score: totalScore,
        originalCommand: command,
        decodedCommand:
          cleanCommand !== command.toLowerCase() ? cleanCommand : undefined,
      };
    }

    return { safe: true, score: totalScore };
  }
}
