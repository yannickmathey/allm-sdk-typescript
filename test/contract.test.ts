import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

function writeOpenApi(paths: Record<string, unknown>) {
  const directory = mkdtempSync(join(tmpdir(), "allm-sdk-contract-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "openapi.json");
  writeFileSync(path, JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Test", version: "1.0.0" },
    paths,
  }));
  return path;
}

function checkContract(openApiPath: string, exact = false) {
  return spawnSync(
    process.execPath,
    ["scripts/check-contract.mjs", ...(exact ? ["--exact"] : []), openApiPath],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("contract checker", () => {
  it("accepts an API subset during a coordinated rollout", () => {
    const result = checkContract(writeOpenApi({
      "/v1/health": { get: { operationId: "getHealth" } },
    }));

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("not deployed");
  });

  it("requires all SDK operations in exact release mode", () => {
    const result = checkContract(writeOpenApi({
      "/v1/health": { get: { operationId: "getHealth" } },
    }), true);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing from OpenAPI");
  });

  it("always rejects API operations unknown to the SDK", () => {
    const result = checkContract(writeOpenApi({
      "/v1/future": { get: { operationId: "getFuture" } },
    }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("not declared by SDK");
  });

  it("rejects a different OpenAPI base version", () => {
    const path = writeOpenApi({
      "/v1/health": { get: { operationId: "getHealth" } },
    });
    const document = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    document.info = { title: "Test", version: "2.0.0-beta.1" };
    writeFileSync(path, JSON.stringify(document));

    const result = checkContract(path);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("incompatible with contract 1.0.0");
  });
});
