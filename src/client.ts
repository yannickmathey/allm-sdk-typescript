import { ALLMError } from "./error.js";
import type { CalculatePricingInput, CompareDeploymentsInput, ComparisonResult, Deployment, ListDeploymentParams, ListResponse, Model, PricingQuote, Provider, RateCard } from "./types.js";

export interface ALLMOptions { apiKey?: string; baseUrl?: string; fetch?: typeof globalThis.fetch; timeoutMs?: number; }

type Query = Record<string, string | number | boolean | undefined>;

export class ALLM {
  readonly providers;
  readonly models;
  readonly deployments;
  readonly pricing;
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(options: ALLMOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://api.allm.dev").replace(/\/$/, "");
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.providers = { list: () => this.request<ListResponse<Provider>>("/v1/providers"), retrieve: (id: string) => this.request<Provider>(`/v1/providers/${encodeURIComponent(id)}`) };
    this.models = { list: () => this.request<ListResponse<Model>>("/v1/models"), retrieve: (id: string) => this.request<Model>(`/v1/models/${id.split("/").map(encodeURIComponent).join("/")}`) };
    this.deployments = { list: (params: ListDeploymentParams = {}) => this.request<ListResponse<Deployment>>("/v1/deployments", { query: { ...params } }), retrieve: (id: string) => this.request<Deployment>(`/v1/deployments/${encodeURIComponent(id)}`), compare: (input: CompareDeploymentsInput) => this.request<{ data: ComparisonResult[] }>("/v1/deployments/compare", { method: "POST", body: { deployment_ids: input.deploymentIds, usage: { input_tokens: input.inputTokens, output_tokens: input.outputTokens, cached_input_tokens: input.cachedInputTokens ?? 0 }, requires: input.requires } }) };
    this.pricing = { calculate: async (input: CalculatePricingInput) => {
      const response = await this.request<{ data: { deployment_id: string; currency: "USD"; total_usd: string; line_items: { dimension: string; quantity: number; amount_usd: string }[]; rate_card: RateCard } }>("/v1/pricing/calculate", { method: "POST", body: { deployment_id: input.deployment, usage: { input_tokens: input.inputTokens, output_tokens: input.outputTokens, cached_input_tokens: input.cachedInputTokens ?? 0 } } });
      return { deploymentId: response.data.deployment_id, currency: response.data.currency, totalUsd: response.data.total_usd, lineItems: response.data.line_items.map((item) => ({ dimension: item.dimension, quantity: item.quantity, amountUsd: item.amount_usd })), rateCard: response.data.rate_card } satisfies PricingQuote;
    } };
  }

  private async request<T>(path: string, options: { method?: string; query?: Query; body?: unknown } = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    Object.entries(options.query ?? {}).forEach(([key, value]) => { if (value !== undefined) url.searchParams.set(key, String(value)); });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(url, { method: options.method ?? "GET", headers: { accept: "application/json", ...(options.body === undefined ? {} : { "content-type": "application/json" }), ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) }, body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: controller.signal });
      const payload = await response.json().catch(() => undefined) as unknown;
      if (!response.ok) throw ALLMError.fromResponse(response, payload);
      return payload as T;
    } catch (error) {
      if (error instanceof ALLMError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new ALLMError("Request timed out", 408, "REQUEST_TIMEOUT");
      throw new ALLMError(error instanceof Error ? error.message : "Network error", 0, "NETWORK_ERROR");
    } finally { clearTimeout(timeout); }
  }
}
