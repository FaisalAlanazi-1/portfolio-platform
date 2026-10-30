// One-command startup: node launcher/start.mjs  (or: npm start from the portfolio folder)
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLauncherServer, createStaticServer, createViewProxy } from "./lib/servers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dirs = {
  site: path.join(root, "launcher", "site"),
  a: path.join(root, "version-a"),
  b: path.join(root, "version-b"),
};

const HOST = "127.0.0.1";
const PORTS = {
  launcher: 4000, // launcher page
  aView: 4001, // Version A opened from the launcher (proxy that adds the return link)
  bView: 4002, // Version B opened from the launcher (same)
  a: 4101, // Version A on its own (static files, no launcher UI)
  b: 4102, // Version B on its own (Next.js dev server, no launcher UI)
};

const children = [];
// Next.js writes AGENTS.md into the project on every dev start; remove it again if we caused it.
const agentsFile = path.join(dirs.b, "AGENTS.md");
const agentsFileExisted = fs.existsSync(agentsFile);
const removeGeneratedFiles = () => {
  if (!agentsFileExisted) fs.rmSync(agentsFile, { force: true });
};
const servers = [];
let stopping = false;

function fail(message) {
  console.error(`\n[launcher] ${message}\n`);
  process.exit(1); // the exit handler stops our child processes
}

function portIsFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, HOST);
  });
}

function listen(server, port) {
  servers.push(server);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, HOST, resolve);
  });
}

/** Stop only the processes this script started, including Next.js's own workers. */
function killTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach(killTree);
  servers.forEach((s) => s.close());
  setTimeout(() => process.exit(code), 150).unref();
}

function run(command, args, cwd, label) {
  const child = spawn(command, args, { cwd, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  const forward = (stream) =>
    stream.on("data", (chunk) =>
      String(chunk)
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach((line) => console.log(`[${label}] ${line}`)),
    );
  forward(child.stdout);
  forward(child.stderr);
  return child;
}

function waitForHttp(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host: HOST, port, path: "/", timeout: 60000 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve();
        retry();
      });
      req.on("error", retry);
      req.on("timeout", () => req.destroy());
    };
    const retry = () => (Date.now() > deadline ? reject(new Error("timeout")) : setTimeout(attempt, 500));
    attempt();
  });
}

async function main() {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor < 20) fail(`Node.js 20 or newer is required (found ${process.versions.node}).`);

  for (const [name, dir] of Object.entries(dirs)) {
    if (!fs.existsSync(dir)) fail(`Missing folder: ${dir} (${name}).`);
  }
  if (!fs.existsSync(path.join(dirs.b, "package.json"))) fail("version-b does not contain a Next.js project (package.json is missing).");

  const busy = [];
  for (const [name, port] of Object.entries(PORTS)) {
    if (!(await portIsFree(port))) busy.push(`${port} (${name})`);
  }
  if (busy.length) {
    fail(
      `These ports are already in use: ${busy.join(", ")}.\n` +
        "Close whatever is using them (for example an earlier run of this launcher) and try again. No other process was touched.",
    );
  }

  if (!fs.existsSync(path.join(dirs.b, "node_modules"))) {
    console.log("[launcher] Installing Version B dependencies (first run only)...");
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const install = spawnSync(npm, ["ci", "--no-audit", "--no-fund"], { cwd: dirs.b, stdio: "inherit", shell: process.platform === "win32" });
    if (install.status !== 0) fail("Installing Version B dependencies failed.");
  }

  const nextBin = path.join(dirs.b, "node_modules", "next", "dist", "bin", "next");
  if (!fs.existsSync(nextBin)) fail("Next.js is not installed in version-b. Run: npm ci  (inside version-b).");

  const next = run(process.execPath, [nextBin, "dev", "-p", String(PORTS.b), "-H", HOST], dirs.b, "version-b");
  next.on("exit", (code) => {
    if (!stopping) fail(`Version B's dev server stopped unexpectedly (exit code ${code}).`);
  });

  try {
    await listen(createStaticServer(dirs.a), PORTS.a);
    await listen(createViewProxy(PORTS.a, PORTS.launcher), PORTS.aView);
    await listen(createViewProxy(PORTS.b, PORTS.launcher), PORTS.bView);
    await listen(createLauncherServer(dirs.site, { a: PORTS.aView, b: PORTS.bView }), PORTS.launcher);
  } catch (err) {
    fail(`Could not start a server: ${err.message}`);
  }

  console.log(`\n[launcher] Open: http://localhost:${PORTS.launcher}`);
  console.log(`[launcher] Version A directly: http://localhost:${PORTS.a}`);
  console.log(`[launcher] Version B directly: http://localhost:${PORTS.b}  (compiling, first load takes a moment)`);
  console.log("[launcher] Press Ctrl+C to stop.\n");

  waitForHttp(PORTS.b, 180000).then(
    () => console.log("[launcher] Version B is ready."),
    () => console.error("[launcher] Version B did not respond within 3 minutes; check the [version-b] log above."),
  );
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("exit", () => {
  children.forEach(killTree);
  removeGeneratedFiles();
});

main();
