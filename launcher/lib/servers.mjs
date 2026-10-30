import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { Transform } from "node:stream";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
};

/** Resolve a request path inside root, refusing anything that escapes it. */
function resolveInside(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  } catch {
    return null;
  }
  const target = path.normalize(path.join(root, decoded));
  const rel = path.relative(root, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return target;
}

function sendFile(res, file, method) {
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return sendText(res, 404, "Not found");
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": "no-cache",
    });
    if (method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function sendText(res, status, body) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}

/** Static handler for a folder; `fallback(req, res)` runs first and may claim the request. */
export function staticHandler(root, fallback) {
  return (req, res) => {
    if (fallback && fallback(req, res)) return;
    if (req.method !== "GET" && req.method !== "HEAD") return sendText(res, 405, "Method not allowed");
    let target = resolveInside(root, req.url);
    if (!target) return sendText(res, 403, "Forbidden");
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, "index.html");
    sendFile(res, target, req.method);
  };
}
/**
 * The launcher's own server: serves launcher/site. The version links in index.html use
 * {{A_URL}} / {{B_URL}} placeholders, filled in with the host the visitor used.
 */
export function createLauncherServer(siteRoot, viewPorts) {
  const indexFile = path.join(siteRoot, "index.html");
  return http.createServer(
    staticHandler(siteRoot, (req, res) => {
      if (!/^\/(?:index\.html)?(?:\?.*)?$/.test(req.url) || (req.method !== "GET" && req.method !== "HEAD")) return false;
      const hostname = (req.headers.host || "localhost").replace(/:\d+$/, "");
      const html = fs
        .readFileSync(indexFile, "utf8")
        .replaceAll("{{A_URL}}", `http://${hostname}:${viewPorts.a}/`)
        .replaceAll("{{B_URL}}", `http://${hostname}:${viewPorts.b}/`);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(req.method === "HEAD" ? undefined : html);
      return true;
    }),
  );
}

export function createStaticServer(root) {
  return http.createServer(staticHandler(root));
}

const STARTING_PAGE = `<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="refresh" content="2">
<title>Starting…</title><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#07080c;color:#e9e7e2">
<p>Getting this version ready… it will appear in a moment.</p></body></html>`;

const RETURN_ENDPOINT = "/__launcher/return.js";
const RETURN_TAG = `<script src="${RETURN_ENDPOINT}"></script>`;

/** Script that adds the floating "Back to launcher" link. Served only by the view proxies. */
export function returnControlScript(launcherUrl) {
  return `(() => {
  if (window.__launcherReturn || window !== window.top) return;
  window.__launcherReturn = true;
  const css = \`
    :host{all:initial}
    a{position:fixed;z-index:2147483647;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));
      display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px 0 12px;border-radius:999px;
      font:600 14px/1 system-ui,-apple-system,"Segoe UI",sans-serif;color:#f1efe9;text-decoration:none;
      background:rgba(10,11,16,.82);border:1px solid rgba(255,255,255,.22);box-shadow:0 8px 24px rgba(0,0,0,.35);
      -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);transition:border-color .2s,background .2s}
    a:hover{border-color:#e8b66a;background:rgba(10,11,16,.95)}
    a:focus-visible{outline:3px solid #e8b66a;outline-offset:3px}
    svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    @media (max-width:480px){a{font-size:13px;padding:0 14px 0 10px}}
    @media (prefers-reduced-motion:reduce){a{transition:none}}
  \`;
  const mount = () => {
    if (document.getElementById("__launcher-return")) return;
    const host = document.createElement("div");
    host.id = "__launcher-return";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = \`<style>\${css}</style><a href="${launcherUrl}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6"/></svg>Back to launcher</a>\`;
    document.documentElement.appendChild(host);
  };
  const start = () => {
    mount();
    new MutationObserver(mount).observe(document.documentElement, { childList: true });
  };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", start) : start();
})();`;
}

/** Inserts `snippet` right after the opening <head> tag, without buffering the rest of the stream. */
class HeadInjector extends Transform {
  constructor(snippet) {
    super();
    this.snippet = Buffer.from(snippet);
    this.pending = Buffer.alloc(0);
    this.done = false;
  }
  _transform(chunk, _enc, cb) {
    if (this.done) return cb(null, chunk);
    this.pending = Buffer.concat([this.pending, chunk]);
    const match = /<head(?:\s[^>]*)?>/i.exec(this.pending.toString("latin1"));
    if (match) {
      const end = match.index + match[0].length;
      this.done = true;
      const out = Buffer.concat([this.pending.subarray(0, end), this.snippet, this.pending.subarray(end)]);
      this.pending = null;
      return cb(null, out);
    }
    if (this.pending.length > 65536) {
      this.done = true; // no <head> early on; give up rather than hold the page back
      const out = this.pending;
      this.pending = null;
      return cb(null, out);
    }
    cb();
  }
  _flush(cb) {
    cb(null, this.done ? undefined : this.pending);
  }
}

/**
 * Reverse proxy for opening a portfolio as a normal top-level website. It forwards
 * everything (including WebSocket upgrades for dev servers) and only adds the launcher's
 * return link to HTML pages. The upstream server and its headers are left as they are.
 */
export function createViewProxy(targetPort, launcherPort, targetHost = "127.0.0.1") {
  const upstreamHost = `localhost:${targetPort}`;
  const upstreamOrigin = `http://${upstreamHost}`;
  const ownLocation = new RegExp(`^https?://(localhost|127\\.0\\.0\\.1):${targetPort}`);

  const rewriteRequestHeaders = (headers) => {
    const out = { ...headers, host: upstreamHost };
    if (out.origin) out.origin = upstreamOrigin;
    if (out.referer) out.referer = out.referer.replace(/^https?:\/\/[^/]+/, upstreamOrigin);
    return out;
  };

  const server = http.createServer((req, res) => {
    if (req.url === RETURN_ENDPOINT) {
      const hostname = (req.headers.host || "localhost").replace(/:\d+$/, "");
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(returnControlScript(`http://${hostname}:${launcherPort}/`));
    }
    const headers = rewriteRequestHeaders(req.headers);
    headers["accept-encoding"] = "identity"; // keeps HTML readable so it can be extended safely
    const upstream = http.request({ host: targetHost, port: targetPort, method: req.method, path: req.url, headers }, (up) => {
      const out = { ...up.headers };
      if (out.location) out.location = out.location.replace(ownLocation, "");
      const isHtml = /text\/html/i.test(out["content-type"] || "") && !out["content-encoding"] && req.method !== "HEAD";
      if (!isHtml) {
        res.writeHead(up.statusCode, out);
        return up.pipe(res);
      }
      delete out["content-length"];
      delete out.etag;
      res.writeHead(up.statusCode, out);
      up.pipe(new HeadInjector(RETURN_TAG)).pipe(res);
    });
    upstream.on("error", () => {
      if (res.headersSent) return res.destroy();
      res.writeHead(503, { "Content-Type": "text/html; charset=utf-8", "Retry-After": "2" });
      res.end(STARTING_PAGE);
    });
    req.pipe(upstream);
  });

  server.on("upgrade", (req, socket, head) => {
    const upstream = net.connect(targetPort, targetHost, () => {
      const headers = rewriteRequestHeaders(req.headers);
      let raw = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
      for (const [k, v] of Object.entries(headers)) raw += `${k}: ${v}\r\n`;
      upstream.write(`${raw}\r\n`);
      if (head?.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    const close = () => {
      socket.destroy();
      upstream.destroy();
    };
    upstream.on("error", close);
    socket.on("error", close);
  });

  return server;
}
