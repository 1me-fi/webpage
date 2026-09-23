/**
 * Extract sandboxed HTML fragment from the static Tilamatriisi page (no scripts/links).
 */
export function tilamatriisiSandboxHtml(indexHtml) {
  const bodyMatch = String(indexHtml).match(/<body[^>]*>([\s\S]*)<\/body>/i);
  let body = bodyMatch ? bodyMatch[1] : String(indexHtml);
  body = body
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<a\s+class="back"[^>]*>[\s\S]*?<\/a>/i, "");
  return body.trim();
}
