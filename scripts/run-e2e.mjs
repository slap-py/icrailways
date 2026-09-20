import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = await createServer({ root, server: { host: "127.0.0.1", port: 4173, strictPort: true }, logLevel: "warn" });
await server.listen();

const cli = path.join(root, "node_modules", "@playwright", "test", "cli.js");
const child = spawn(process.execPath, [cli, "test"], { cwd: root, stdio: "inherit", env: process.env });
const code = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", value => resolve(value ?? 1));
});
await server.close();
process.exitCode = code;
