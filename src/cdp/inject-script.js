/**
 * Auto Accept Ego - Browser Injection Script
 * This script is injected into Antigravity/Cursor via CDP
 * It finds and clicks "Accept", "Run", "Apply" buttons
 */
(function () {
  "use strict";

  if (typeof window === "undefined") return;

  // State
  window.__egoState = window.__egoState || {
    isRunning: false,
    clicks: 0,
    blocked: 0,
    bannedCommands: [],
    whitelist: [],
    safeMode: false,
    pollInterval: 300,
  };

  const log = (msg) => console.log(`[AutoAcceptEgo] ${msg}`);

  // Get all documents (including iframes)
  const getDocuments = (root = document) => {
    let docs = [root];
    try {
      const iframes = root.querySelectorAll("iframe, frame");
      for (const iframe of iframes) {
        try {
          const doc = iframe.contentDocument || iframe.contentWindow?.document;
          if (doc) docs.push(...getDocuments(doc));
        } catch {}
      }
    } catch {}
    return docs;
  };

  const queryAll = (selector) => {
    const results = [];
    getDocuments().forEach((doc) => {
      try {
        results.push(...Array.from(doc.querySelectorAll(selector)));
      } catch {}
    });
    return results;
  };

  // Button patterns
  const ACCEPT_PATTERNS = [
    "accept",
    "run",
    "apply",
    "execute",
    "confirm",
    "allow once",
    "allow",
    "retry",
  ];
  const REJECT_PATTERNS = [
    "skip",
    "reject",
    "cancel",
    "close",
    "refine",
    "deny",
  ];

  // Check if element is a valid accept button
  function isAcceptButton(el) {
    const text = (el.textContent || "").trim().toLowerCase();
    if (text.length === 0 || text.length > 50) return false;

    // Check reject patterns first
    if (REJECT_PATTERNS.some((r) => text.includes(r))) return false;

    // Check accept patterns
    if (!ACCEPT_PATTERNS.some((p) => text.includes(p))) return false;

    // Check visibility
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    return (
      style.display !== "none" &&
      rect.width > 0 &&
      style.pointerEvents !== "none" &&
      !el.disabled
    );
  }

  // Find command text near button for banned command check
  function findNearbyCommandText(el) {
    let commandText = "";
    let container = el.parentElement;
    let depth = 0;

    while (container && depth < 10) {
      let sibling = container.previousElementSibling;
      let count = 0;

      while (sibling && count < 5) {
        if (sibling.tagName === "PRE" || sibling.tagName === "CODE") {
          commandText += " " + sibling.textContent.trim();
        }
        sibling.querySelectorAll("pre, code").forEach((el) => {
          commandText += " " + el.textContent.trim();
        });
        sibling = sibling.previousElementSibling;
        count++;
      }

      if (commandText.length > 10) break;
      container = container.parentElement;
      depth++;
    }

    return commandText.toLowerCase();
  }

  // Check if command matches banned patterns
  function isCommandBanned(text) {
    const banned = window.__egoState.bannedCommands || [];
    if (!text || banned.length === 0) return false;

    const lower = text.toLowerCase();
    for (const pattern of banned) {
      if (!pattern) continue;
      if (lower.includes(pattern.toLowerCase())) {
        log(`BLOCKED: "${pattern}"`);
        window.__egoState.blocked++;
        return true;
      }
    }
    return false;
  }

  // Check if command is in whitelist
  function isWhitelisted(text) {
    const whitelist = window.__egoState.whitelist || [];
    if (!text || whitelist.length === 0) return false;

    const lower = text.toLowerCase();
    for (const pattern of whitelist) {
      if (!pattern) continue;
      if (lower.includes(pattern.toLowerCase())) {
        log(`WHITELISTED: "${pattern}"`);
        return true;
      }
    }
    return false;
  }

  // Main click function
  function performClick() {
    const selectors = [
      "button",
      '[role="button"]',
      ".bg-ide-button-background",
    ];
    const found = [];

    selectors.forEach((s) => queryAll(s).forEach((el) => found.push(el)));
    const unique = [...new Set(found)];

    let clicked = 0;
    for (const el of unique) {
      if (isAcceptButton(el)) {
        const text = (el.textContent || "").trim();
        const cmdText = findNearbyCommandText(el);

        // SAFE MODE: Only allow whitelisted commands
        if (window.__egoState.safeMode) {
          if (!isWhitelisted(cmdText)) {
            log(`SAFE MODE: Blocked non-whitelisted action`);
            window.__egoState.blocked++;
            continue;
          }
        }

        // Check for banned commands if it's a run/execute button
        if (
          text.toLowerCase().includes("run") ||
          text.toLowerCase().includes("execute")
        ) {
          if (isCommandBanned(cmdText)) continue;
        }

        log(`Clicking: "${text}"`);
        el.dispatchEvent(
          new MouseEvent("click", {
            view: window,
            bubbles: true,
            cancelable: true,
          })
        );
        window.__egoState.clicks++;
        clicked++;
      }
    }

    return clicked;
  }

  // Poll loop
  let pollTimer = null;

  window.__egoStart = function (config) {
    if (window.__egoState.isRunning) {
      // Update config without restarting
      window.__egoState.bannedCommands = config?.bannedCommands || [];
      window.__egoState.whitelist = config?.whitelist || [];
      window.__egoState.safeMode = config?.safeMode || false;
      return;
    }

    window.__egoState.isRunning = true;
    window.__egoState.bannedCommands = config?.bannedCommands || [];
    window.__egoState.whitelist = config?.whitelist || [];
    window.__egoState.safeMode = config?.safeMode || false;
    window.__egoState.pollInterval = config?.pollInterval || 300;

    log(`Started (SafeMode: ${window.__egoState.safeMode})`);

    pollTimer = setInterval(() => {
      if (!window.__egoState.isRunning) {
        clearInterval(pollTimer);
        return;
      }
      performClick();
    }, window.__egoState.pollInterval);
  };

  window.__egoStop = function () {
    window.__egoState.isRunning = false;
    if (pollTimer) clearInterval(pollTimer);
    log("Stopped");
  };

  window.__egoGetStats = function () {
    const stats = {
      clicks: window.__egoState.clicks || 0,
      blocked: window.__egoState.blocked || 0,
    };
    // Reset counters after reading to prevent double-counting
    window.__egoState.clicks = 0;
    window.__egoState.blocked = 0;
    return stats;
  };

  log("Script loaded");
})();
