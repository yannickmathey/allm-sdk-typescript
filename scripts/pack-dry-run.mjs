import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const executable = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(
  executable,
  ["pack", "--dry-run", "--cache", join(tmpdir(), "allm-sdk-npm-cache")],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
