#!/usr/bin/env node
import "./proxyBootstrap.js"; // must be first — routes outbound calls through the egress proxy
import express from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as ynab from "ynab";
import { buildServer } from "./registerTools.js";

const PORT = Number(process.env.PORT ?? 4322);
const HOST = process.env.HOST ?? "0.0.0.0";

// YNAB auth is a single static personal access token from the environment.
const YNAB_API_TOKEN = process.env.YNAB_API_TOKEN || "";
const api = new ynab.API(YNAB_API_TOKEN);

const STRIP_KEYS = new Set(["$schema", "$id", "definitions", "$defs"]);

function stripMeta(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) stripMeta(item);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    for (const k of Object.keys(obj)) {
      if (STRIP_KEYS.has(k)) delete obj[k];
      else stripMeta(obj[k]);
    }
  }
}

// Gemini's OpenAI-compat endpoint rejects tool parameter schemas that carry
// `$schema`/`$id`/`definitions` (the MCP SDK's zod-to-json-schema output
// includes `$schema` by default). Strip those keys on tools/list responses.
function sanitizeToolsListMessage(message: unknown): void {
  if (!message || typeof message !== "object") return;
  const m = message as { result?: { tools?: Array<{ inputSchema?: unknown }> } };
  const tools = m.result?.tools;
  if (!Array.isArray(tools)) return;
  for (const tool of tools) {
    if (tool && tool.inputSchema) stripMeta(tool.inputSchema);
  }
}

async function main() {
  console.error(
    YNAB_API_TOKEN
      ? "[ynab] startup: YNAB_API_TOKEN loaded"
      : "[ynab] startup: WARNING no YNAB_API_TOKEN set — tool calls will fail until one is provided",
  );

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, hasToken: !!YNAB_API_TOKEN });
  });

  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.all("/mcp", async (req, res) => {
    const sid = (req.header("mcp-session-id") ?? "").trim();
    let transport = sid ? transports.get(sid) : undefined;

    if (!transport) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id: string) => {
          transports.set(id, transport!);
        },
      });
      transport.onclose = () => {
        if (transport!.sessionId) transports.delete(transport!.sessionId);
      };
      const origSend = transport.send.bind(transport);
      transport.send = async (message, options) => {
        sanitizeToolsListMessage(message);
        return origSend(message, options);
      };
      // One McpServer per session — McpServer.connect can only be called once.
      const server = buildServer(api);
      await server.connect(transport);
    }

    try {
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("[ynab] /mcp error:", err);
      if (!res.headersSent) res.status(500).json({ error: String(err) });
    }
  });

  app.listen(PORT, HOST, () => {
    console.error(`[ynab] listening on http://${HOST}:${PORT}/mcp`);
  });
}

main().catch((err) => {
  console.error("[ynab] fatal:", err);
  process.exit(1);
});
