import { ALLMError } from "./error.js";
import type {
  ALLMResponseMetadata,
  AppliedPricing,
  CalculatePricingInput,
  ChangesResponse,
  CompareDeploymentsInput,
  ComparisonResult,
  DecisionCandidate,
  DecisionEvaluationInput,
  Deployment,
  DeploymentDetail,
  DeploymentShowcaseResponse,
  Health,
  Lab,
  LabDetail,
  LifecycleRecord,
  LifecycleSourceEvent,
  ListChangeParams,
  ListDeploymentParams,
  ListLifecycleEventParams,
  ListLifecycleParams,
  ListModelParams,
  ListProviderParams,
  ListResponse,
  LockfileVerification,
  LockfileVerificationInput,
  Model,
  ModelDetail,
  PricingQuote,
  Provider,
  ProviderDetail,
  RateCard,
  ServiceStatus,
} from "./types.js";

export interface ALLMOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
}

type Query = Record<string, string | number | boolean | undefined>;

interface RequestOptions {
  method?: "GET" | "POST";
  query?: Query;
  body?: unknown;
  idempotencyKey?: string;
}

interface WirePricingQuote {
  deployment_id?: string;
  currency: "USD";
  total_usd: string;
  line_items: Array<{ dimension: string; quantity: number; amount_usd: string }>;
  rate_card: RateCard;
  applied: WireAppliedPricing;
}

interface WireAppliedPricing {
  batch: boolean;
  region: string;
  input_micro_usd: number;
  cached_input_micro_usd: number;
  output_micro_usd: number;
  region_multiplier: number;
  uplift_multiplier: number;
  batch_multiplier: number;
}

function assertIdentifier(value: string, name: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ALLMError(`${name} is required`, 0, "INVALID_INPUT");
  }
  return value.trim();
}

function assertIdempotencyKey(value: string) {
  if (typeof value !== "string" || /[\r\n]/.test(value)) {
    throw new ALLMError(
      "idempotency key must be a single-line value of at most 200 characters",
      0,
      "INVALID_INPUT",
    );
  }
  const normalized = assertIdentifier(value, "idempotency key");
  if (normalized.length > 200) {
    throw new ALLMError(
      "idempotency key must be a single-line value of at most 200 characters",
      0,
      "INVALID_INPUT",
    );
  }
  return normalized;
}

function assertUuid(value: string, name: string) {
  const normalized = assertIdentifier(value, name);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new ALLMError(`${name} must be a UUID`, 0, "INVALID_INPUT");
  }
  return normalized;
}

function assertCount(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ALLMError(`${name} must be a non-negative safe integer`, 0, "INVALID_INPUT");
  }
}

function validateUsage(input: {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  batch?: boolean;
}) {
  assertCount(input.inputTokens, "inputTokens");
  assertCount(input.outputTokens, "outputTokens");
  const cachedInputTokens = input.cachedInputTokens ?? 0;
  assertCount(cachedInputTokens, "cachedInputTokens");
  if (cachedInputTokens > input.inputTokens) {
    throw new ALLMError(
      "cachedInputTokens cannot exceed inputTokens",
      0,
      "INVALID_INPUT",
    );
  }
  if (input.batch !== undefined && typeof input.batch !== "boolean") {
    throw new ALLMError("batch must be a boolean", 0, "INVALID_INPUT");
  }
}

function validateIds(ids: string[], name: string, maximum: number) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > maximum) {
    throw new ALLMError(`${name} must contain between 1 and ${maximum} ids`, 0, "INVALID_INPUT");
  }
  ids.forEach((id) => assertIdentifier(id, `${name} item`));
}

function validateRuntimeOptions(options: ALLMOptions) {
  if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new ALLMError("timeoutMs must be a positive number", 0, "INVALID_INPUT");
  }
  if (options.maxRetries !== undefined
    && (!Number.isSafeInteger(options.maxRetries) || options.maxRetries < 0 || options.maxRetries > 5)) {
    throw new ALLMError("maxRetries must be an integer between 0 and 5", 0, "INVALID_INPUT");
  }
  for (const [name, value] of [
    ["retryDelayMs", options.retryDelayMs],
    ["maxRetryDelayMs", options.maxRetryDelayMs],
  ] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      throw new ALLMError(`${name} must be a non-negative number`, 0, "INVALID_INPUT");
    }
  }
}

function mapPricingQuote(quote: WirePricingQuote, fallbackDeploymentId?: string): PricingQuote {
  if (!quote || typeof quote !== "object" || !Array.isArray(quote.line_items) || !quote.applied) {
    throw new ALLMError("ALLM returned an invalid pricing response", 0, "INVALID_RESPONSE");
  }
  const deploymentId = quote.deployment_id ?? fallbackDeploymentId;
  if (!deploymentId) {
    throw new ALLMError("Pricing response is missing deployment_id", 0, "INVALID_RESPONSE");
  }
  return {
    deploymentId,
    currency: quote.currency,
    totalUsd: quote.total_usd,
    lineItems: quote.line_items.map((item) => ({
      dimension: item.dimension,
      quantity: item.quantity,
      amountUsd: item.amount_usd,
    })),
    rateCard: quote.rate_card,
    applied: {
      batch: quote.applied.batch,
      region: quote.applied.region,
      inputMicroUsd: quote.applied.input_micro_usd,
      cachedInputMicroUsd: quote.applied.cached_input_micro_usd,
      outputMicroUsd: quote.applied.output_micro_usd,
      regionMultiplier: quote.applied.region_multiplier,
      upliftMultiplier: quote.applied.uplift_multiplier,
      batchMultiplier: quote.applied.batch_multiplier,
    } satisfies AppliedPricing,
  };
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function parseRetryAfter(value: string | null, now = Date.now()) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

export class ALLM {
  readonly health;
  readonly status;
  readonly providers;
  readonly models;
  readonly labs;
  readonly deployments;
  readonly lifecycle;
  readonly changes;
  readonly decisions;
  readonly lockfiles;
  readonly pricing;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private responseMetadata?: ALLMResponseMetadata;

  constructor(options: ALLMOptions) {
    if (!options?.apiKey?.trim()) {
      throw new ALLMError("apiKey is required", 0, "API_KEY_REQUIRED");
    }
    validateRuntimeOptions(options);
    this.apiKey = options.apiKey.trim();
    const baseUrl = (options.baseUrl ?? "https://api.use-allm.com").replace(/\/+$/, "");
    let parsedBaseUrl: URL;
    try {
      parsedBaseUrl = new URL(baseUrl);
    } catch {
      throw new ALLMError("baseUrl must be an absolute HTTP URL", 0, "INVALID_INPUT");
    }
    if (parsedBaseUrl.protocol !== "https:" && parsedBaseUrl.protocol !== "http:") {
      throw new ALLMError("baseUrl must be an absolute HTTP URL", 0, "INVALID_INPUT");
    }
    const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
    if (parsedBaseUrl.protocol === "http:" && !loopbackHosts.has(parsedBaseUrl.hostname)) {
      throw new ALLMError(
        "baseUrl must use HTTPS unless it targets a loopback host",
        0,
        "INVALID_INPUT",
      );
    }
    if (parsedBaseUrl.username || parsedBaseUrl.password) {
      throw new ALLMError("baseUrl cannot contain credentials", 0, "INVALID_INPUT");
    }
    if (parsedBaseUrl.search || parsedBaseUrl.hash) {
      throw new ALLMError("baseUrl cannot contain a query string or fragment", 0, "INVALID_INPUT");
    }
    this.baseUrl = baseUrl;
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 250;
    this.maxRetryDelayMs = Math.max(this.retryDelayMs, options.maxRetryDelayMs ?? 30_000);

    this.health = {
      get: () => this.request<Health>("/v1/health"),
    };
    this.status = {
      get: async () => (await this.request<{ data: ServiceStatus }>("/v1/status")).data,
    };
    this.providers = {
      list: (params: ListProviderParams = {}) =>
        this.request<ListResponse<Provider>>("/v1/providers", { query: { ...params } }),
      retrieve: async (id: string) =>
        (await this.request<{ data: ProviderDetail }>(
          `/v1/providers/${encodeURIComponent(assertIdentifier(id, "provider id"))}`,
        )).data,
    };
    this.models = {
      list: (params: ListModelParams = {}) =>
        this.request<ListResponse<Model>>("/v1/models", { query: { ...params } }),
      retrieve: async (id: string) => {
        const modelId = assertIdentifier(id, "model id");
        const modelIdParts = modelId.split("/");
        if (modelIdParts.length !== 2 || modelIdParts.some((part) => !part)) {
          throw new ALLMError("model id must use the lab/model form", 0, "INVALID_INPUT");
        }
        return (await this.request<{ data: ModelDetail }>(
          `/v1/models/${modelIdParts.map(encodeURIComponent).join("/")}`,
        )).data;
      },
    };
    this.labs = {
      list: () => this.request<ListResponse<Lab>>("/v1/labs"),
      retrieve: async (id: string) =>
        (await this.request<{ data: LabDetail }>(
          `/v1/labs/${encodeURIComponent(assertIdentifier(id, "lab id"))}`,
        )).data,
    };
    this.deployments = {
      list: (params: ListDeploymentParams = {}) =>
        this.request<ListResponse<Deployment>>("/v1/deployments", { query: { ...params } }),
      retrieve: async (id: string) =>
        (await this.request<{ data: DeploymentDetail }>(
          `/v1/deployments/${encodeURIComponent(assertIdentifier(id, "deployment id"))}`,
        )).data,
      showcase: () => this.request<DeploymentShowcaseResponse>("/v1/deployments/showcase"),
      compare: async (input: CompareDeploymentsInput) => {
        validateIds(input.deploymentIds, "deploymentIds", 100);
        validateUsage(input);
        const idempotencyKey = input.idempotencyKey === undefined
          ? undefined
          : assertIdempotencyKey(input.idempotencyKey);
        const response = await this.request<{ data: Array<{ deployment: Deployment; pricing: WirePricingQuote }> }>(
          "/v1/deployments/compare",
          {
            method: "POST",
            idempotencyKey,
            body: {
              deployment_ids: input.deploymentIds.map((id) => id.trim()),
              usage: {
                input_tokens: input.inputTokens,
                output_tokens: input.outputTokens,
                cached_input_tokens: input.cachedInputTokens ?? 0,
                batch: input.batch ?? false,
              },
              requires: input.requires,
              include_deprecated: input.includeDeprecated ?? false,
            },
          },
        );
        const data: ComparisonResult[] = response.data.map(({ deployment, pricing }) => ({
          deployment,
          pricing: mapPricingQuote(pricing, deployment.id),
        }));
        return { data };
      },
    };
    this.lifecycle = {
      list: (params: ListLifecycleParams = {}) =>
        this.request<ListResponse<LifecycleRecord>>("/v1/lifecycle", { query: { ...params } }),
      events: (params: ListLifecycleEventParams = {}) =>
        this.request<ListResponse<LifecycleSourceEvent>>("/v1/lifecycle/events", {
          query: { ...params },
        }),
    };
    this.changes = {
      list: (params: ListChangeParams = {}) =>
        this.request<ChangesResponse>("/v1/changes", { query: { ...params } }),
    };
    this.decisions = {
      evaluate: async (input: DecisionEvaluationInput) => {
        const hasPolicyId = typeof input.policyId === "string" && input.policyId.trim().length > 0;
        const hasPolicy = input.policy !== undefined;
        if (hasPolicyId === hasPolicy) {
          throw new ALLMError(
            "Exactly one of policyId or policy is required",
            0,
            "INVALID_INPUT",
          );
        }
        if (hasPolicyId) assertUuid(input.policyId!, "policyId");
        if (hasPolicy && (input.policy === null || typeof input.policy !== "object" || Array.isArray(input.policy))) {
          throw new ALLMError("policy must be an object", 0, "INVALID_INPUT");
        }
        if (input.deploymentIds !== undefined) validateIds(input.deploymentIds, "deploymentIds", 200);
        validateUsage(input);
        if (input.limit !== undefined
          && (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 50)) {
          throw new ALLMError("limit must be an integer between 1 and 50", 0, "INVALID_INPUT");
        }
        const priceBookId = input.priceBookId === undefined
          ? undefined
          : assertUuid(input.priceBookId, "priceBookId");
        const idempotencyKey = input.idempotencyKey === undefined
          ? undefined
          : assertIdempotencyKey(input.idempotencyKey);
        const response = await this.request<{
          data: Array<{ deployment: Deployment; pricing: WirePricingQuote }>;
        }>("/v1/decisions/evaluate", {
          method: "POST",
          idempotencyKey,
          body: {
            deployment_ids: input.deploymentIds?.map((id) => id.trim()),
            policy_id: hasPolicyId ? input.policyId?.trim() : undefined,
            policy: input.policy,
            price_book_id: priceBookId,
            usage: {
              input_tokens: input.inputTokens,
              output_tokens: input.outputTokens,
              cached_input_tokens: input.cachedInputTokens ?? 0,
              batch: input.batch ?? false,
            },
            limit: input.limit ?? 10,
          },
        });
        const candidates: DecisionCandidate[] = response.data.map(({ deployment, pricing }) => ({
          deployment,
          pricing: mapPricingQuote(pricing, deployment.id),
        }));
        return candidates;
      },
    };
    this.lockfiles = {
      verify: async (input: LockfileVerificationInput) => {
        if (input.content === null || typeof input.content !== "object" || Array.isArray(input.content)) {
          throw new ALLMError("content must be an object", 0, "INVALID_INPUT");
        }
        if (input.expectedSha256 !== undefined && !/^[a-f0-9]{64}$/.test(input.expectedSha256)) {
          throw new ALLMError(
            "expectedSha256 must be a lowercase SHA-256 digest",
            0,
            "INVALID_INPUT",
          );
        }
        const idempotencyKey = input.idempotencyKey === undefined
          ? undefined
          : assertIdempotencyKey(input.idempotencyKey);
        return (await this.request<{ data: LockfileVerification }>("/v1/lockfiles/verify", {
          method: "POST",
          idempotencyKey,
          body: { content: input.content, expected_sha256: input.expectedSha256 },
        })).data;
      },
    };
    this.pricing = {
      calculate: async (input: CalculatePricingInput) => {
        const deploymentId = assertIdentifier(input.deployment, "deployment id");
        validateUsage(input);
        const idempotencyKey = input.idempotencyKey === undefined
          ? undefined
          : assertIdempotencyKey(input.idempotencyKey);
        const response = await this.request<{ data: WirePricingQuote }>("/v1/pricing/calculate", {
          method: "POST",
          idempotencyKey,
          body: {
            deployment_id: deploymentId,
            usage: {
              input_tokens: input.inputTokens,
              output_tokens: input.outputTokens,
              cached_input_tokens: input.cachedInputTokens ?? 0,
              batch: input.batch ?? false,
            },
          },
        });
        return mapPricingQuote(response.data, deploymentId);
      },
    };
  }

  /**
   * Metadata captured from the last HTTP response received by this instance.
   * Concurrent calls race by design; use a separate client when request-local metadata is required.
   */
  get lastResponse(): ALLMResponseMetadata | undefined {
    return this.responseMetadata;
  }

  private captureResponseMetadata(response: Response, fallbackRequestId: string) {
    const rateLimit: Record<string, string> = {};
    response.headers.forEach((value, name) => {
      if (name.toLowerCase().startsWith("x-ratelimit-")) rateLimit[name.toLowerCase()] = value;
    });
    this.responseMetadata = Object.freeze({
      status: response.status,
      requestId: response.headers.get("x-request-id") ?? fallbackRequestId,
      ...(response.headers.get("x-allm-catalog-release")
        ? { catalogRelease: response.headers.get("x-allm-catalog-release")! }
        : {}),
      ...(response.headers.get("etag") ? { etag: response.headers.get("etag")! } : {}),
      rateLimit: Object.freeze(rateLimit),
    });
  }

  private retryDelay(attempt: number, response?: Response) {
    const requested = parseRetryAfter(response?.headers.get("retry-after") ?? null);
    return Math.min(requested ?? this.retryDelayMs * 2 ** attempt, this.maxRetryDelayMs);
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    Object.entries(options.query ?? {}).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value));
    });
    const method = options.method ?? "GET";
    const retryable = method === "GET" || Boolean(options.idempotencyKey);
    const requestId = globalThis.crypto.randomUUID();

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetcher(url, {
          method,
          headers: {
            accept: "application/json",
            authorization: `Bearer ${this.apiKey}`,
            "x-allm-client": "@use-allm/sdk/1.0.0",
            "x-request-id": requestId,
            ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
            ...(options.body === undefined ? {} : { "content-type": "application/json" }),
          },
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          redirect: "error",
          signal: controller.signal,
        });
        this.captureResponseMetadata(response, requestId);
        const rawBody = await response.text();
        let payload: unknown;
        try {
          payload = rawBody ? JSON.parse(rawBody) : undefined;
        } catch {
          if (response.ok) {
            throw new ALLMError("ALLM returned invalid JSON", response.status, "INVALID_RESPONSE");
          }
          payload = rawBody;
        }

        if (!response.ok) {
          if (retryable && attempt < this.maxRetries && isRetryableStatus(response.status)) {
            await this.sleep(this.retryDelay(attempt, response));
            continue;
          }
          throw ALLMError.fromResponse(response, payload);
        }
        if (payload === undefined) {
          throw new ALLMError("ALLM returned an empty response", response.status, "INVALID_RESPONSE");
        }
        return payload as T;
      } catch (error) {
        if (error instanceof ALLMError) throw error;
        if (retryable && attempt < this.maxRetries) {
          await this.sleep(this.retryDelay(attempt));
          continue;
        }
        if (error instanceof Error && error.name === "AbortError") {
          throw new ALLMError("Request timed out", 408, "REQUEST_TIMEOUT");
        }
        throw new ALLMError(
          error instanceof Error ? error.message : "Network error",
          0,
          "NETWORK_ERROR",
        );
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new ALLMError("Request failed after retries", 0, "NETWORK_ERROR");
  }

  private async sleep(milliseconds: number) {
    if (milliseconds <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
