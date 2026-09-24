const DEFAULT_MCP_BASE = "https://europe-west1-oneme-dev.cloudfunctions.net/uiPlaygroundMcpHttp";

/** Root-only trash/restore tool names (no per-version trash tools). */
export const DEFAULT_PUBLISHER_TOOLS = Object.freeze({
  list: "list_prototypes",
  trash: "trash_prototype",
  restore: "restore_prototype",
});

function readToolOverrides(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Publisher session from in-memory / page-injected access token only.
 *
 * DEV harness (not production login): set
 * `window.__UIPLAYGROUND_PUBLISHER_ACCESS_TOKEN__` before loading playground.mjs.
 * First-party browser OAuth is not wired on this static site yet — see README.
 */
export function publisherSessionFromWindow(win = window, doc = document) {
  const params = new URLSearchParams(win.location.search);
  const token = win.__UIPLAYGROUND_PUBLISHER_ACCESS_TOKEN__;
  const mcpBase = params.get("mcpBase")
    || win.__UIPLAYGROUND_MCP_BASE__
    || doc.querySelector('meta[name="ui-playground-mcp-base"]')?.content
    || DEFAULT_MCP_BASE;
  const overrides = readToolOverrides(
    win.__UIPLAYGROUND_PUBLISHER_TOOLS__
      || doc.querySelector('meta[name="ui-playground-publisher-tools"]')?.content,
  );

  return {
    token: typeof token === "string" && token.trim() ? token.trim() : "",
    mcpBase: mcpBase.replace(/\/+$/, ""),
    tools: { ...DEFAULT_PUBLISHER_TOOLS, ...overrides },
    /** True only when the DEV harness injected a token (not OAuth). */
    fromDevHarness: typeof token === "string" && token.trim() !== "",
  };
}

export function parseMcpToolResult(payload) {
  if (payload?.error) throw new Error(String(payload.error.message || "MCP-pyyntö epäonnistui."));
  const content = payload?.result?.content;
  const text = Array.isArray(content) && typeof content[0]?.text === "string" ? content[0].text : "";
  if (!text) throw new Error("MCP-vastauksesta puuttuu sisältö.");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("MCP-vastaus ei ollut kelvollista JSONia.");
  }
}

export function publisherOperationId(prefix = "ui-playground") {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}

export async function callPublisherTool(session, name, args) {
  if (!session?.token) throw new Error("Publisher-kirjautuminen puuttuu.");
  const response = await fetch(session.mcpBase, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${session.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "MCP-Protocol-Version": "2026-07-28",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: publisherOperationId("ui-playground-request"),
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload?.error?.message || payload?.error || `HTTP ${response.status}`));
  return parseMcpToolResult(payload);
}
