/** Serialize fixture JSON for safe inline <script> injection (no </script> breakouts). */
export function serializeFixtureForSrcdoc(fixture) {
  return JSON.stringify(fixture ?? null)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Build srcdoc HTML for scripts-only sandbox iframe (CSP blocks connect/fetch). */
export function sandboxBundle(bundle, fixture = null) {
  const css = typeof bundle?.css === "string" ? bundle.css : "";
  const html = typeof bundle?.html === "string" ? bundle.html : "";
  const js = typeof bundle?.js === "string" ? bundle.js.replace(/<\/script/gi, "<\\/script") : "";
  const fixtureScript = fixture == null
    ? ""
    : `<script>window.__UIPLAYGROUND_FIXTURE__=${serializeFixtureForSrcdoc(fixture)};<\/script>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'"><style>${css}</style>${fixtureScript}</head><body>${html}<script>${js}<\/script></body></html>`;
}
