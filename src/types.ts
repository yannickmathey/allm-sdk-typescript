export type VerificationStatus = "official_declared" | "cross_checked" | "probed_pass" | "probed_fail" | "community" | "unknown" | "not_probed_budget";
export type CapabilityStatus = "supported" | "unsupported" | "conditional" | "unknown" | "not_applicable";

export interface Provider { id: string; name: string; kind: "direct" | "cloud" | "gateway" | "inference_cloud"; website: string; tier: string; deployment_count?: number; }
export interface RateCard { currency: "USD"; unit: "million_tokens"; input_micro_usd: number; cached_input_micro_usd?: number; output_micro_usd: number; source_url: string; observed_at: string; }
export interface Capability { status: CapabilityStatus; verification_status: VerificationStatus; conditions?: string[]; }
export interface Deployment { id: string; model_id: string; provider_id: string; provider_model_id: string; region: string; api_surface: string; status: string; context_tokens: number | null; max_output_tokens: number | null; rate_card: RateCard | null; capabilities: Record<string, Capability>; evidence_urls: string[]; }
export interface Model { id: string; name: string; family: string; lab: string; modalities: string[]; }
export interface ListResponse<T> { data: T[]; meta?: { count: number; catalogRelease: string }; }
export interface CalculatePricingInput { deployment: string; inputTokens: number; outputTokens: number; cachedInputTokens?: number; }
export interface PricingLineItem { dimension: string; quantity: number; amountUsd: string; }
export interface PricingQuote { deploymentId: string; currency: "USD"; totalUsd: string; lineItems: PricingLineItem[]; rateCard: RateCard; }
export interface CompareDeploymentsInput { deploymentIds: string[]; inputTokens: number; outputTokens: number; cachedInputTokens?: number; requires?: Record<string, "supported" | "conditional">; }
export interface ComparisonResult { deployment: Deployment; pricing: { currency: "USD"; total_usd: string }; }

export interface ListDeploymentParams { model?: string; provider?: string; capability?: string; region?: string; }
