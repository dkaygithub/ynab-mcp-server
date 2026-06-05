// Egress proxy bootstrap — MUST be imported before anything that makes
// outbound HTTP calls (i.e. before the `ynab` SDK).
//
// The ynab SDK uses fetch-ponyfill -> node-fetch@2, which (unlike Python's
// requests/httplib2 used by the hub stack) does NOT honor HTTP_PROXY/HTTPS_PROXY
// environment variables on its own. global-agent patches Node's global
// http/https agents so node-fetch's requests tunnel through the egress proxy.
//
// We set the namespace to '' so global-agent reads the STANDARD proxy var
// names (HTTP_PROXY / HTTPS_PROXY / NO_PROXY) that the bexar egress convention
// injects via compose — matching hub's `HTTPS_PROXY: http://egress-proxy-*:3128`.
//
// No-op when no proxy vars are set (local/standalone runs go direct).
process.env.GLOBAL_AGENT_ENVIRONMENT_VARIABLE_NAMESPACE =
  process.env.GLOBAL_AGENT_ENVIRONMENT_VARIABLE_NAMESPACE ?? "";

import { bootstrap } from "global-agent";

bootstrap();

if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
  console.error(
    `[ynab] egress proxy active: ${process.env.HTTPS_PROXY || process.env.HTTP_PROXY}` +
      (process.env.NO_PROXY ? ` (no_proxy: ${process.env.NO_PROXY})` : ""),
  );
}
