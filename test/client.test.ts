import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { ALLM, ALLMError } from "../src/index.js";

const rateCard = {
  currency: "USD" as const,
  unit: "million_tokens" as const,
  input_micro_usd: 1_250_000,
  output_micro_usd: 10_000_000,
  source_url: "https://example.test/pricing",
  observed_at: "2026-07-22T00:00:00Z",
};

const applied = {
  batch: false,
  region: "global",
  input_micro_usd: 1_250_000,
  cached_input_micro_usd: 1_250_000,
  output_micro_usd: 10_000_000,
  region_multiplier: 1,
  uplift_multiplier: 1,
  batch_multiplier: 1,
};

const mappedApplied = {
  batch: false,
  region: "global",
  inputMicroUsd: 1_250_000,
  cachedInputMicroUsd: 1_250_000,
  outputMicroUsd: 10_000_000,
  regionMultiplier: 1,
  upliftMultiplier: 1,
  batchMultiplier: 1,
};

function pricingData(deploymentId = "dep_example") {
  return {
    deployment_id: deploymentId,
    currency: "USD",
    total_usd: "2.250000",
    line_items: [{ dimension: "input_tokens", quantity: 1, amount_usd: "1.250000" }],
    rate_card: rateCard,
    applied,
  };
}

function createClient(fetcher: typeof fetch, options: Record<string, unknown> = {}) {
  return new ALLM({
    apiKey: "test_key",
    baseUrl: "https://example.test",
    fetch: fetcher,
    retryDelayMs: 0,
    ...options,
  });
}

function ok(payload: unknown, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("ALLM operation coverage", () => {
  it("implements every operation in contract/operations.json", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path === "/v1/health") {
        return ok({ status: "ok", service: "allm-api", catalog_release_id: "cat_test" });
      }
      if (path === "/v1/status") {
        return ok({ data: { database: "operational", checked_at: "2026-07-22T00:00:00Z" } });
      }
      if (path === "/v1/pricing/calculate") return ok({ data: pricingData() });
      if (path === "/v1/deployments/showcase") {
        return ok({ data: [], meta: { scenarios: [] } });
      }
      if (path === "/v1/deployments/compare" || path === "/v1/decisions/evaluate") {
        return ok({ data: [] });
      }
      if (path === "/v1/lockfiles/verify") {
        return ok({
          data: {
            valid: true,
            actual_sha256: "a".repeat(64),
            expected_sha256: null,
            locked_catalog_release_id: "cat_test",
            current_catalog_release_id: "cat_test",
            release_changed: false,
            missing_deployment_ids: [],
          },
        });
      }
      return ok({ data: path.split("/").length <= 3 ? [] : {} });
    });
    const client = createClient(fetcher);

    await client.health.get();
    await client.status.get();
    await client.providers.list();
    await client.providers.retrieve("openai");
    await client.models.list();
    await client.models.retrieve("openai/gpt-5.1");
    await client.labs.list();
    await client.labs.retrieve("openai");
    await client.deployments.list();
    await client.deployments.showcase();
    await client.deployments.retrieve("dep_example");
    await client.lifecycle.list();
    await client.lifecycle.events();
    await client.pricing.calculate({ deployment: "dep_example", inputTokens: 1, outputTokens: 1 });
    await client.deployments.compare({ deploymentIds: ["dep_example"], inputTokens: 1, outputTokens: 1 });
    await client.changes.list();
    await client.decisions.evaluate({ policy: {}, inputTokens: 1, outputTokens: 1 });
    await client.lockfiles.verify({ content: {} });

    const contract = JSON.parse(
      readFileSync(new URL("../contract/operations.json", import.meta.url), "utf8"),
    ) as { operations: Array<{ operationId: string; method: string; path: string }> };
    const replacements: Record<string, string> = {
      providerId: "openai",
      lab: "openai",
      model: "gpt-5.1",
      labId: "openai",
      deploymentId: "dep_example",
    };
    const expected = contract.operations.map(({ method, path }) => ({
      method,
      path: path.replace(/\{([^}]+)\}/g, (_, key: string) => replacements[key] ?? key),
    }));
    const actual = fetcher.mock.calls.map(([input, init]) => ({
      method: String(init?.method ?? "GET"),
      path: new URL(String(input)).pathname,
    }));

    expect(contract.operations).toHaveLength(18);
    expect(actual).toEqual(expected);
  });
});

describe("ALLM response mapping", () => {
  it("maps complete pricing including applied rates", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(ok({ data: pricingData("dep_priced") }));
    const quote = await createClient(fetcher).pricing.calculate({
      deployment: "dep_priced",
      inputTokens: 1_000_000,
      outputTokens: 100_000,
    });

    expect(quote).toMatchObject({
      deploymentId: "dep_priced",
      totalUsd: "2.250000",
      applied: { region: "global", inputMicroUsd: 1_250_000 },
    });
    expect(quote.lineItems[0]).toEqual({
      dimension: "input_tokens",
      quantity: 1,
      amountUsd: "1.250000",
    });
  });

  it("preserves applied pricing in comparisons and decisions", async () => {
    const deployment = { id: "dep_example" };
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(ok({ data: [{ deployment, pricing: pricingData() }] }))
      .mockResolvedValueOnce(ok({ data: [{ deployment, pricing: pricingData() }] }));
    const client = createClient(fetcher);

    const comparison = await client.deployments.compare({
      deploymentIds: ["dep_example"],
      inputTokens: 1,
      outputTokens: 1,
    });
    const decision = await client.decisions.evaluate({ policy: {}, inputTokens: 1, outputTokens: 1 });

    expect(comparison.data[0]?.pricing.applied).toEqual(mappedApplied);
    expect(decision[0]?.pricing.applied).toEqual(mappedApplied);
  });

  it("lists lifecycle records with typed filters", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      ok({ data: [], meta: { total: 0, limit: 25, offset: 0, has_more: false } }),
    );
    const client = createClient(fetcher);

    await client.lifecycle.list({
      resource_type: "deployment",
      status: "deprecated",
      end_of_life_before: "2026-12-31",
      include_unknown: false,
      limit: 25,
    });

    const url = fetcher.mock.calls[0]?.[0] as URL;
    expect(url.searchParams.get("resource_type")).toBe("deployment");
    expect(url.searchParams.get("status")).toBe("deprecated");
    expect(url.searchParams.get("include_unknown")).toBe("false");
  });

  it("captures request, catalog, ETag and every rate-limit response header", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(ok(
      { status: "ok", service: "allm-api", catalog_release_id: "cat_test" },
      {
        "x-request-id": "req_server",
        "x-allm-catalog-release": "cat_test",
        "x-ratelimit-limit": "100",
        "x-ratelimit-remaining": "99",
        "x-ratelimit-reset": "1234567890",
        etag: '"catalog"',
      },
    ));
    const client = createClient(fetcher);

    await client.health.get();

    expect(client.lastResponse).toEqual({
      status: 200,
      requestId: "req_server",
      catalogRelease: "cat_test",
      etag: '"catalog"',
      rateLimit: {
        "x-ratelimit-limit": "100",
        "x-ratelimit-remaining": "99",
        "x-ratelimit-reset": "1234567890",
      },
    });
  });

  it("returns required change retention metadata", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(ok({
      data: [],
      meta: { total: 0, limit: 100, offset: 0, has_more: false, retention_days: 90 },
    }));

    const response = await createClient(fetcher).changes.list();

    expect(response.meta).toEqual({
      total: 0,
      limit: 100,
      offset: 0,
      has_more: false,
      retention_days: 90,
    });
  });
});

describe("ALLM transport", () => {
  it("requires an API key", () => {
    expect(() => new ALLM(undefined as never)).toThrow("apiKey is required");
  });

  it("retries GET requests and reuses a stable x-request-id", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "Unavailable" }), { status: 503 }))
      .mockResolvedValueOnce(ok({ status: "ok", service: "allm-api", catalog_release_id: "cat_test" }));
    const client = createClient(fetcher, { maxRetries: 1 });

    await client.health.get();

    expect(fetcher).toHaveBeenCalledTimes(2);
    const requestIds = fetcher.mock.calls.map(([, init]) =>
      (init?.headers as Record<string, string>)["x-request-id"]);
    expect(requestIds[0]).toBeTruthy();
    expect(requestIds[1]).toBe(requestIds[0]);
  });

  it("does not retry a POST without an idempotency key", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ title: "Unavailable" }), { status: 503 }),
    );
    const client = createClient(fetcher, { maxRetries: 2 });

    await expect(client.pricing.calculate({
      deployment: "dep_example",
      inputTokens: 1,
      outputTokens: 1,
    })).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("retries a POST with one stable idempotency key and request id", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "Unavailable" }), { status: 503 }))
      .mockResolvedValueOnce(ok({ data: pricingData() }));
    const client = createClient(fetcher, { maxRetries: 1 });

    await client.pricing.calculate({
      deployment: "dep_example",
      inputTokens: 1,
      outputTokens: 1,
      idempotencyKey: "price-1",
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    const headers = fetcher.mock.calls.map(([, init]) => init?.headers as Record<string, string>);
    expect(headers.map((value) => value["idempotency-key"])).toEqual(["price-1", "price-1"]);
    expect(headers[1]?.["x-request-id"]).toBe(headers[0]?.["x-request-id"]);
  });

  it("forwards idempotency keys on every metered POST surface", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(ok({ data: pricingData() }))
      .mockResolvedValueOnce(ok({ data: [] }))
      .mockResolvedValueOnce(ok({ data: [] }))
      .mockResolvedValueOnce(ok({ data: {
        valid: true,
        actual_sha256: "a".repeat(64),
        expected_sha256: null,
        locked_catalog_release_id: null,
        current_catalog_release_id: "cat_test",
        release_changed: true,
        missing_deployment_ids: [],
      } }));
    const client = createClient(fetcher);

    await client.pricing.calculate({
      deployment: "dep_example",
      inputTokens: 1,
      outputTokens: 0,
      idempotencyKey: "pricing-key",
    });
    await client.deployments.compare({
      deploymentIds: ["dep_example"],
      inputTokens: 1,
      outputTokens: 0,
      idempotencyKey: "compare-key",
    });
    await client.decisions.evaluate({
      policy: {},
      inputTokens: 1,
      outputTokens: 0,
      idempotencyKey: "decision-key",
    });
    await client.lockfiles.verify({ content: {}, idempotencyKey: "lockfile-key" });

    expect(fetcher.mock.calls.map(([, init]) =>
      (init?.headers as Record<string, string>)["idempotency-key"])).toEqual([
      "pricing-key",
      "compare-key",
      "decision-key",
      "lockfile-key",
    ]);
  });

  it("surfaces structured API errors with the server request id", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ detail: "No deployment", code: "DEPLOYMENT_NOT_FOUND" }),
      { status: 404, headers: { "x-request-id": "req_error" } },
    ));

    await expect(createClient(fetcher).deployments.retrieve("missing")).rejects.toEqual(
      expect.objectContaining<Partial<ALLMError>>({
        status: 404,
        code: "DEPLOYMENT_NOT_FOUND",
        requestId: "req_error",
      }),
    );
  });

  it("rejects invalid successful JSON responses", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("not-json", { status: 200 }));
    await expect(createClient(fetcher).health.get()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
});

describe("ALLM runtime validation", () => {
  const neverFetch = vi.fn<typeof fetch>();

  it("requires HTTPS except for local development", () => {
    expect(
      () => new ALLM({ apiKey: "test_key", baseUrl: "http://api.example.test", fetch: neverFetch }),
    ).toThrow("baseUrl must use HTTPS");
    expect(
      () => new ALLM({ apiKey: "test_key", baseUrl: "https://user:pass@example.test", fetch: neverFetch }),
    ).toThrow("baseUrl cannot contain credentials");
    expect(
      () => new ALLM({ apiKey: "test_key", baseUrl: "http://127.0.0.1:3000", fetch: neverFetch }),
    ).not.toThrow();
  });

  it("forbids automatic HTTP redirects", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      ok({ status: "ok", service: "allm-api", catalog_release_id: "cat_test" }),
    );
    await createClient(fetcher).health.get();

    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe("error");
  });

  it.each([
    { inputTokens: Number.NaN, outputTokens: 0 },
    { inputTokens: 1.5, outputTokens: 0 },
    { inputTokens: 1, outputTokens: -1 },
    { inputTokens: 1, outputTokens: 0, cachedInputTokens: 2 },
  ])("rejects invalid token usage %#", async (usage) => {
    const client = createClient(neverFetch);
    await expect(client.pricing.calculate({ deployment: "dep", ...usage })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });

  it("rejects empty and oversized deployment lists", async () => {
    const client = createClient(neverFetch);
    await expect(client.deployments.compare({
      deploymentIds: [],
      inputTokens: 0,
      outputTokens: 0,
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(client.deployments.compare({
      deploymentIds: Array.from({ length: 101 }, (_, index) => `dep_${index}`),
      inputTokens: 0,
      outputTokens: 0,
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("rejects non-boolean batch values", async () => {
    await expect(createClient(neverFetch).pricing.calculate({
      deployment: "dep",
      inputTokens: 0,
      outputTokens: 0,
      batch: "true" as never,
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(neverFetch).not.toHaveBeenCalled();
  });

  it("enforces exactly one policy at runtime", async () => {
    const client = createClient(neverFetch);
    await expect(client.decisions.evaluate({
      policy: {},
      policyId: "00000000-0000-4000-8000-000000000001",
      inputTokens: 0,
      outputTokens: 0,
    } as never)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("validates retry options and lockfile digests", async () => {
    expect(() => createClient(neverFetch, { maxRetries: 1.5 })).toThrow("maxRetries");
    await expect(createClient(neverFetch).lockfiles.verify({
      content: {},
      expectedSha256: "invalid",
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it.each(["x".repeat(201), "unsafe\r\nheader"]) (
    "rejects unsafe idempotency keys",
    async (idempotencyKey) => {
      await expect(createClient(neverFetch).pricing.calculate({
        deployment: "dep",
        inputTokens: 0,
        outputTokens: 0,
        idempotencyKey,
      })).rejects.toMatchObject({ code: "INVALID_INPUT" });
      expect(neverFetch).not.toHaveBeenCalled();
    },
  );
});
