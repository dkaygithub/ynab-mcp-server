#!/usr/bin/env node
import "./proxyBootstrap.js"; // must be first — routes outbound calls through the egress proxy
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as ynab from "ynab";
import { buildServer } from "./registerTools.js";

// Initialize YNAB API
const api = new ynab.API(process.env.YNAB_API_TOKEN || "");
const server = buildServer(api);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("YNAB MCP server running on stdio");
}

main().catch(console.error);
