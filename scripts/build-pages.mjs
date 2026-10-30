// Assembles the static GitHub Pages site into ./dist:
//   /            launcher
//   /version-a/  Version A (plain static files)
//   /version-b/  Version B (Next.js static export, built from a disposable copy)
// Neither portfolio's source folder is modified.
//
//   BASE_PATH=/portfolio-platform SITE_URL=https://<user>.github.io node scripts/build-pages.mjs
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { returnControlScript } from "../launcher/lib/servers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const staging = path.join(root, ".deploy", "version-b");
const base = (process.env.BASE_PATH ?? "").replace(/\/+$/, "");
if (base && !base.startsWith("/")) throw new Error(`BASE_PATH must start with "/" (got "${base}")`);

const log = (msg) => console.log(`[pages] ${msg}`);
const rm = (p) => fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
const read = (p) => fs.readFileSync(p, "utf8");
const write = (p, s) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s);
};

/** Apply edits to a file; fail loudly if an edit does not match exactly as often as expected. */
function patch(file, edits) {
  let text = read(file);
  for (const [pattern, replacement, expected] of edits) {
    const escape = (s) => s.split("").map((c) => (".*+?^${}()|[]\\".includes(c) ? "\\" + c : c)).join("");
    const re = pattern instanceof RegExp ? new RegExp(pattern.source, pattern.flags.replace("g", "") + "g") : new RegExp(escape(pattern), "g");
    const count = (text.match(re) || []).length;
    if (count !== expected) throw new Error(`${path.relative(root, file)}: expected ${expected} match(es) for ${pattern}, found ${count}`);
    text = text.replace(re, replacement);
  }
  write(file, text);
}


// The return control is a static file in the published copies; it finds the launcher from its own URL.
function returnScript() {
  return returnControlScript("__LAUNCHER_URL__")
    .replace("(() => {", '(() => {\n  const LAUNCHER_URL = new URL("./", document.currentScript.src).href;')
    .replace("__LAUNCHER_URL__", "${LAUNCHER_URL}");
}
const baseB = `${base}/version-b`; // Version B lives one level down, so its own base path includes it
const RETURN_TAG = `<script src="${base}/platform-return.js"></script>`;

function injectReturnControl(dir) {
  let n = 0;
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith(".html")) {
        const html = read(p);
        const next = html.replace(/<head(\s[^>]*)?>/i, (m) => m + RETURN_TAG);
        if (next === html) continue;
        write(p, next);
        n++;
      }
    }
  };
  walk(dir);
  return n;
}

/**
 * Next's client asks for route segment data as "about/__next.about.__PAGE__.txt", but the static export writes
 * "about/__next.about/__PAGE__.txt". Add the flattened name next to each nested file so client navigation and
 * prefetching work on a plain static host.
 */
function flattenSegmentFiles(dir) {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("__next.")) {
      const walk = (d, rel) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          if (e.isDirectory()) walk(path.join(d, e.name), [...rel, e.name]);
          else {
            fs.copyFileSync(path.join(d, e.name), path.join(dir, [entry.name, ...rel, e.name].join(".")));
            n++;
          }
        }
      };
      walk(p, []);
    } else n += flattenSegmentFiles(p);
  }
  return n;
}

rm(dist);
rm(path.join(root, ".deploy"));
fs.mkdirSync(dist, { recursive: true });

// ---- launcher -------------------------------------------------------------
log("launcher");
fs.cpSync(path.join(root, "launcher", "site"), dist, { recursive: true });
patch(path.join(dist, "index.html"), [
  ["{{A_URL}}", "version-a/", 2],
  ["{{B_URL}}", "version-b/", 1],
]);
write(path.join(dist, "platform-return.js"), returnScript());
write(path.join(dist, ".nojekyll"), "");

// ---- Version A ------------------------------------------------------------
log("version-a");
fs.cpSync(path.join(root, "version-a"), path.join(dist, "version-a"), { recursive: true });
log(`  return control added to ${injectReturnControl(path.join(dist, "version-a"))} page(s)`);
patch(path.join(dist, "version-a", "index.html"), [[/<head>/, '<head><link rel="icon" href="data:,">', 1]]);

// ---- Version B ------------------------------------------------------------
log("version-b: staging copy");
const skip = new Set(["node_modules", ".next", ".git", "out", "AGENTS.md", "tsconfig.tsbuildinfo"]);
fs.cpSync(path.join(root, "version-b"), staging, { recursive: true, filter: (src) => !skip.has(path.basename(src)) });

const basePathExpr = '(process.env.NEXT_PUBLIC_BASE_PATH ?? "")';
write(
  path.join(staging, "next.config.ts"),
  `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  trailingSlash: true,
  images: { unoptimized: true },
  productionBrowserSourceMaps: false,
};

export default nextConfig;
`,
);

// public files referenced with plain "/..." URLs need the repository prefix
patch(path.join(staging, "components/about/about-content.tsx"), [[/(href|src)="(\/(?:on-stage|founders)\.jpg)"/g, `$1={${basePathExpr} + "$2"}`, 4]]);
patch(path.join(staging, "components/about/character-sheet.tsx"), [[/icon: "(\/tech\/[a-z0-9]+\.svg)"/g, `icon: ${basePathExpr} + "$1"`, 9]]);
patch(path.join(staging, "components/contact/contact-card.tsx"), [[/imageSrc: "(\/linkedin\.svg)"/g, `imageSrc: ${basePathExpr} + "$1"`, 1]]);
patch(path.join(staging, "components/about/certificate-folder.tsx"), [["href={`/certificates/${certificate.file}`}", "href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? \"\"}/certificates/${certificate.file}`}", 1]]);
patch(path.join(staging, "lib/metadata.ts"), [
  [/icon: "\/icon\.svg"/g, `icon: ${basePathExpr} + "/icon.svg"`, 1],
  [/manifest: "\/site\.webmanifest"/g, `manifest: ${basePathExpr} + "/site.webmanifest"`, 1],
]);
const manifest = path.join(staging, "public", "site.webmanifest");
write(manifest, read(manifest).replace('"start_url":"/"', `"start_url":"${baseB}/"`).replace('"src":"/icon.svg"', `"src":"${baseB}/icon.svg"`));
for (const f of ["robots.ts", "sitemap.ts"]) {
  patch(path.join(staging, "app", f), [[/^(import[^\n]*\n)(?!import)/m, '$1\nexport const dynamic = "force-static";\n', 1]]);
}

// The portrait was served through /_next/image (not available on static hosting): use a static, resized copy.
patch(path.join(staging, "components/hero/hero.tsx"), [[/const PORTRAIT_SRC = "[^"]*";/g, `const PORTRAIT_SRC = ${basePathExpr} + "/faisal-1080.webp";`, 1]]);

log("version-b: installing dependencies");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const sh = (cmd, args, cwd, env = {}) => {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed`);
};
sh(npm, ["ci", "--no-audit", "--no-fund"], staging);

log("version-b: resizing the portrait (replaces the /_next/image URL)");
const sharp = createRequire(path.join(staging, "package.json"))("sharp");
await sharp(path.join(staging, "public", "faisal.png")).resize({ width: 1080, withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(staging, "public", "faisal-1080.webp"));

log("version-b: next build (static export)");
// canonical URLs / Open Graph use this; without it Next falls back to http://localhost:3000
const siteUrl = process.env.SITE_URL ? `${process.env.SITE_URL.replace(/\/+$/, "")}${base}/version-b` : "";
if (!siteUrl) log("  warning: SITE_URL is not set, canonical URLs will point to localhost");
sh(npm, ["run", "build"], staging, { NEXT_PUBLIC_BASE_PATH: baseB, NEXT_PUBLIC_SITE_URL: siteUrl, NEXT_TELEMETRY_DISABLED: "1" });

fs.cpSync(path.join(staging, "out"), path.join(dist, "version-b"), { recursive: true });
log(`  return control added to ${injectReturnControl(path.join(dist, "version-b"))} page(s)`);
log(`  ${flattenSegmentFiles(path.join(dist, "version-b"))} route-segment file(s) duplicated under their flattened names`);

log(`done -> ${path.relative(process.cwd(), dist) || "."} (base path "${base || "/"}")`);
