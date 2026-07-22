import { readFile } from "node:fs/promises";
import process from "node:process";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
if (!tag) throw new Error("A release tag is required (for example v1.0.0)");
if (tag !== `v${packageJson.version}`) {
  throw new Error(`Release tag ${tag} does not match package version ${packageJson.version}`);
}
console.log(`${tag} matches package version ${packageJson.version}`);
