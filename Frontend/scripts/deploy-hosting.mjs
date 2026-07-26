#!/usr/bin/env node
/**
 * Deploy the static Next export to Firebase Hosting.
 *
 *   pnpm run deploy          → prod site (stationary-503105.web.app / xinstationary.com)
 *   pnpm run deploy test     → testing site (thestationery-testing.web.app)
 *
 * Uses `.env.production.local` (prod) or `.env.testing.local` (test) for
 * NEXT_PUBLIC_* at build time. Vars already in the process env win over any
 * .env.production.local Next would otherwise load.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const isTest = process.argv.slice(2).includes("test");
const envFile = isTest ? ".env.testing.local" : ".env.production.local";
const hostingTarget = isTest ? "testing" : "prod";
const envPath = resolve(process.cwd(), envFile);

function loadEnvFile(path) {
  const out = {};
  if (!existsSync(path)) {
    console.error(`Missing ${envFile}. Create it before deploying.`);
    process.exit(1);
  }
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const fileEnv = loadEnvFile(envPath);
const env = { ...process.env, ...fileEnv, NODE_ENV: "production" };

console.log(`\n→ Building with ${envFile} → hosting target "${hostingTarget}"\n`);

const build = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});
if (build.status !== 0) process.exit(build.status ?? 1);

const deploy = spawnSync(
  "npx",
  ["-y", "firebase-tools", "deploy", "--only", `hosting:${hostingTarget}`],
  { stdio: "inherit", env: process.env, shell: process.platform === "win32" },
);
process.exit(deploy.status ?? 1);
