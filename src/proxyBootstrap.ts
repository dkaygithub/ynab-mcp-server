// Egress proxy bootstrap — MUST be imported before anything that makes
// outbound HTTP calls (i.e. before the `ynab` SDK).
//
// Unlike Python's requests/httplib2 (used by the hub stack), Node HTTP clients
// do NOT honor HTTP_PROXY/HTTPS_PROXY on their own. The ynab SDK's runtime uses
// `globalThis.fetch` — i.e. Node's built-in undici fetch — falling back to
// fetch-ponyfill -> node-fetch@2 only on runtimes without a global fetch. So we
// route BOTH:
//   1. undici (the actual path on Node >=18): set a global EnvHttpProxyAgent
//      dispatcher. global-agent does NOT intercept undici, which is why proxy
//      env alone silently bypassed the proxy.
//   2. node-fetch fallback: global-agent patches Node's http/https global
//      agents.
//
// Standard proxy var names (HTTP_PROXY / HTTPS_PROXY / NO_PROXY) are used to
// match the bexar egress convention injected via compose. No-op when no proxy
// vars are set (local/standalone runs go direct).
import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici";

// global-agent reads STANDARD var names when the namespace is ''.
process.env.GLOBAL_AGENT_ENVIRONMENT_VARIABLE_NAMESPACE =
  process.env.GLOBAL_AGENT_ENVIRONMENT_VARIABLE_NAMESPACE ?? "";

import { bootstrap } from "global-agent";

bootstrap();

if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
  // EnvHttpProxyAgent reads HTTP_PROXY/HTTPS_PROXY/NO_PROXY from the environment.
  setGlobalDispatcher(new EnvHttpProxyAgent());
  console.error(
    `[ynab] egress proxy active (undici + global-agent): ${process.env.HTTPS_PROXY || process.env.HTTP_PROXY}` +
      (process.env.NO_PROXY ? ` (no_proxy: ${process.env.NO_PROXY})` : ""),
  );
}
