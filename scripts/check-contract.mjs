import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const contractPath = resolve("contract/operations.json");
const packagePath = resolve("package.json");
const arguments_ = process.argv.slice(2);
const exact = arguments_.includes("--exact");
const source = arguments_.find((argument) => argument !== "--exact") ?? process.env.ALLM_OPENAPI_SOURCE
  ?? "../allm-api/src/openapi/openapi.json";
const allowedMethods = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);

async function readJson(location) {
  if (/^https?:\/\//.test(location)) {
    const response = await fetch(location, {
      headers: { accept: "application/json", "user-agent": "allm-sdk-contract-check/1.0.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`${location} returned HTTP ${response.status}`);
    return response.json();
  }
  return JSON.parse(await readFile(resolve(location), "utf8"));
}

function operationKey(operation) {
  return `${operation.operationId}\t${operation.method.toUpperCase()}\t${operation.path}`;
}

function semverBase(value, label) {
  const match = typeof value === "string"
    ? /^(\d+\.\d+\.\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(value)
    : null;
  if (!match) throw new Error(`${label} must be a semantic version`);
  return match[1];
}

function collectOpenApiOperations(document) {
  if (!document || typeof document !== "object" || !document.paths) {
    throw new Error("OpenAPI document has no paths object");
  }
  const operations = [];
  for (const [path, pathItem] of Object.entries(document.paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!allowedMethods.has(method.toLowerCase())) continue;
      if (!operation || typeof operation !== "object" || typeof operation.operationId !== "string") {
        throw new Error(`${method.toUpperCase()} ${path} is missing operationId`);
      }
      operations.push({ operationId: operation.operationId, method: method.toUpperCase(), path });
    }
  }
  return operations;
}

function assertNoDuplicates(operations, label) {
  const ids = new Set();
  const routes = new Set();
  for (const operation of operations) {
    const route = `${operation.method.toUpperCase()} ${operation.path}`;
    if (ids.has(operation.operationId)) throw new Error(`${label} duplicates ${operation.operationId}`);
    if (routes.has(route)) throw new Error(`${label} duplicates ${route}`);
    ids.add(operation.operationId);
    routes.add(route);
  }
}

const contract = await readJson(contractPath);
if (contract?.version !== "1.0.0" || !Array.isArray(contract.operations)) {
  throw new Error("contract/operations.json must contain version 1.0.0 and an operations array");
}
const packageJson = await readJson(packagePath);
const contractBaseVersion = semverBase(contract.version, "Contract version");
const packageBaseVersion = semverBase(packageJson.version, "Package version");
if (packageBaseVersion !== contractBaseVersion) {
  throw new Error(
    `Package version ${packageJson.version} is incompatible with contract ${contract.version}`,
  );
}
const openApi = await readJson(source);
const openApiBaseVersion = semverBase(openApi?.info?.version, "OpenAPI info.version");
if (openApiBaseVersion !== contractBaseVersion) {
  throw new Error(
    `OpenAPI version ${openApi.info.version} is incompatible with contract ${contract.version}`,
  );
}
const actual = collectOpenApiOperations(openApi);
assertNoDuplicates(contract.operations, "Contract");
assertNoDuplicates(actual, "OpenAPI");

const expectedKeys = new Set(contract.operations.map(operationKey));
const actualKeys = new Set(actual.map(operationKey));
const missing = [...expectedKeys].filter((key) => !actualKeys.has(key));
const unexpected = [...actualKeys].filter((key) => !expectedKeys.has(key));
if (unexpected.length || (exact && missing.length)) {
  const details = [
    ...unexpected.map((key) => `not declared by SDK: ${key.replaceAll("\t", " ")}`),
    ...(exact ? missing.map((key) => `missing from OpenAPI: ${key.replaceAll("\t", " ")}`) : []),
  ];
  throw new Error(`SDK/OpenAPI operation drift detected:\n${details.join("\n")}`);
}

if (missing.length && !exact) {
  console.warn(
    `${missing.length} SDK operation(s) are not deployed by this OpenAPI yet:\n${missing
      .map((key) => `pending: ${key.replaceAll("\t", " ")}`)
      .join("\n")}`,
  );
}
console.log(
  `Contract ${contract.version}: all ${actual.length} OpenAPI operations are covered by the ${contract.operations.length}-operation SDK manifest${exact ? " exactly" : ""} (${source})`,
);
