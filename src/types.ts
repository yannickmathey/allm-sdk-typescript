export type VerificationStatus =
  | "official_declared"
  | "cross_checked"
  | "probed_pass"
  | "probed_fail"
  | "community"
  | "unknown"
  | "not_probed_budget";
export type CapabilityStatus = "supported" | "unsupported" | "conditional" | "unknown" | "not_applicable";

export type LifecycleStatus = "preview" | "available" | "legacy" | "deprecated" | "retired" | "unknown";
export type LifecycleMilestoneState =
  | "scheduled"
  | "effective"
  | "not_announced"
  | "unknown"
  | "conflicting"
  | "not_applicable";
export type LifecycleDatePrecision = "datetime" | "day" | "month" | "quarter" | "year" | "unknown";
export type LifecycleDateType = "confirmed" | "not_before" | "not_after" | "estimated" | "unknown";
export type LifecycleCoverageStatus = "monitored" | "partial" | "unmonitored" | "stale" | "source_error";
export type LifecycleVerificationStatus = VerificationStatus;

export interface LifecycleEvidence {
  source_url: string;
  source_type:
    | "official_api"
    | "official_docs"
    | "official_lifecycle"
    | "official_changelog"
    | "official_model_catalog"
    | "provider_api"
    | "cloud_catalog"
    | "community_registry"
    | "manual";
  observed_at: string;
  verification_status: LifecycleVerificationStatus;
  raw_label?: string;
  raw_date?: string;
}

export interface LifecycleMilestone {
  state: LifecycleMilestoneState;
  date: string | null;
  precision: LifecycleDatePrecision;
  date_type: LifecycleDateType;
  evidence: LifecycleEvidence[];
}

export interface LifecycleCoverage {
  status: LifecycleCoverageStatus;
  last_checked_at: string | null;
  source_count: number;
  source_ids: string[];
}

export interface Lifecycle {
  status: LifecycleStatus;
  announced_at: string | null;
  deprecation: LifecycleMilestone;
  end_of_life: LifecycleMilestone;
  replacement_ids: string[];
  coverage: LifecycleCoverage;
  last_changed_at: string | null;
}

export interface LifecycleSummary {
  deployment_count: number;
  legacy_count: number;
  deprecated_count: number;
  retired_count: number;
  known_deprecation_date_count: number;
  known_end_of_life_date_count: number;
  unknown_end_of_life_count: number;
  next_end_of_life_date: string | null;
}

export type LifecycleResourceType = "provider" | "model" | "deployment";

export interface LifecycleRecord {
  resource_type: LifecycleResourceType;
  resource_id: string;
  provider_id?: string;
  model_id?: string;
  lifecycle: Lifecycle;
  summary?: LifecycleSummary;
}

export type LifecycleSourceEventType =
  | "lifecycle.source_changed"
  | "lifecycle.source_recovered"
  | "lifecycle.source_failed";

export interface LifecycleSourceEvent {
  id: string;
  event_type: LifecycleSourceEventType;
  provider_id: string;
  source_id: string;
  source_url: string;
  detected_at: string;
  previous_sha256: string | null;
  current_sha256: string | null;
}

export interface Provider {
  id: string;
  name: string;
  kind: "direct" | "cloud" | "gateway" | "inference_cloud";
  website: string;
  tier: "P0" | "P1" | "P2";
  deployment_count?: number;
  lifecycle: Lifecycle;
  lifecycle_summary?: LifecycleSummary;
}

export interface ProviderDetail extends Provider {
  deployments: DeploymentDetail[];
}

export interface RateCard {
  currency: "USD";
  unit: "million_tokens";
  input_micro_usd: number;
  cached_input_micro_usd?: number;
  output_micro_usd: number;
  source_url: string;
  observed_at: string;
}

export interface Capability {
  status: CapabilityStatus;
  verification_status: VerificationStatus;
  conditions?: string[];
}

export interface Deployment {
  id: string;
  model_id: string;
  provider_id: string;
  provider_model_id: string;
  region: string;
  api_surface: string;
  mode?: string;
  /** @deprecated Use lifecycle.status. Kept as a compatibility alias through v1. */
  status: "available" | "preview" | "deprecated" | "retired";
  lifecycle: Lifecycle;
  observed_at?: string;
  context_tokens: number | null;
  max_output_tokens: number | null;
  rate_card: RateCard | null;
  pricing_dimensions?: Record<string, number>;
  capabilities: Record<string, Capability>;
  evidence_urls: string[];
}

/** Additional relationship labels returned by provider, model and lab detail endpoints. */
export interface DeploymentDetail extends Deployment {
  model_name?: string;
  provider_name?: string;
  lab_id?: string;
  lab?: string;
}

export type DeploymentShowcaseKind = "lifecycle" | "pricing" | "capability";

export interface DeploymentShowcaseScenario {
  kind: DeploymentShowcaseKind;
  deployment_ids: string[];
  capability?: string;
}

export interface DeploymentShowcaseDeployment extends Deployment {
  model_name: string;
  provider_name: string;
}

export interface DeploymentShowcaseResponse {
  data: DeploymentShowcaseDeployment[];
  meta: { scenarios: DeploymentShowcaseScenario[] };
}

export interface Model {
  id: string;
  name: string;
  family: string;
  lab_id: string;
  lab: string;
  modalities: string[];
  name_style: "official_convention" | "normalized_identifier";
  name_source_url?: string;
  lifecycle: Lifecycle;
  lifecycle_summary?: LifecycleSummary;
}

export interface ModelDetail extends Model {
  deployments: DeploymentDetail[];
}

export interface Lab {
  id: string;
  name: string;
  website: string;
  naming_source_url?: string;
  model_count: number;
  deployment_count: number;
  provider_count: number;
}

export interface LabDetail extends Lab {
  models: Model[];
  providers: LabProviderCoverage[];
}

export interface LabProviderCoverage {
  id: string;
  name: string;
  deployment_count: number;
  kind?: Provider["kind"];
  website?: string;
  tier?: Provider["tier"];
  lifecycle?: Lifecycle;
  lifecycle_summary?: LifecycleSummary;
}

export interface Health {
  status: "ok";
  service: "allm-api";
  catalog_release_id: string;
}

export type ServiceComponentStatus = "operational" | "degraded";

export interface ServiceStatus {
  database: ServiceComponentStatus;
  ingestion: ServiceComponentStatus;
  webhooks: ServiceComponentStatus;
  customer_jobs: ServiceComponentStatus;
  checked_at: string;
}

export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface ListResponse<T> {
  data: T[];
  meta?: PaginationMeta;
}

export interface CalculatePricingInput {
  deployment: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  batch?: boolean;
  /** Enables safe retries for this POST and server-side duplicate protection. */
  idempotencyKey?: string;
}

export interface PricingLineItem {
  dimension: string;
  quantity: number;
  amountUsd: string;
}

export interface PricingQuote {
  deploymentId: string;
  currency: "USD";
  totalUsd: string;
  lineItems: PricingLineItem[];
  rateCard: RateCard;
  applied: AppliedPricing;
}

export interface AppliedPricing {
  batch: boolean;
  region: string;
  inputMicroUsd: number;
  cachedInputMicroUsd: number;
  outputMicroUsd: number;
  regionMultiplier: number;
  upliftMultiplier: number;
  batchMultiplier: number;
}

export interface CompareDeploymentsInput {
  deploymentIds: string[];
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  batch?: boolean;
  requires?: Record<string, "supported" | "conditional">;
  /** Include legacy, deprecated and retired deployments. Defaults to false. */
  includeDeprecated?: boolean;
  /** Enables safe retries for this POST and server-side duplicate protection. */
  idempotencyKey?: string;
}

export interface ComparisonResult {
  deployment: Deployment;
  pricing: PricingQuote;
}

export interface ListProviderParams {
  lifecycle_status?: LifecycleStatus;
  end_of_life_before?: string;
  has_end_of_life_date?: boolean;
}

export interface ListModelParams extends ListProviderParams {
  q?: string;
  lab?: string;
  provider?: string;
  mode?: string;
  capability?: string;
  limit?: number;
  offset?: number;
}

export interface ListDeploymentParams extends ListProviderParams {
  q?: string;
  model?: string;
  provider?: string;
  capability?: string;
  region?: string;
  mode?: string;
  has_pricing?: boolean;
  limit?: number;
  offset?: number;
}

export interface ListLifecycleParams {
  resource_type?: LifecycleResourceType;
  resource_id?: string;
  provider?: string;
  model?: string;
  status?: LifecycleStatus;
  deprecation_state?: LifecycleMilestoneState;
  end_of_life_state?: LifecycleMilestoneState;
  coverage_status?: LifecycleCoverageStatus;
  include_unknown?: boolean;
  deprecation_before?: string;
  deprecation_after?: string;
  end_of_life_before?: string;
  end_of_life_after?: string;
  sort?: "deprecation" | "end_of_life" | "last_changed";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface ListLifecycleEventParams {
  provider?: string;
  source_id?: string;
  event_type?: LifecycleSourceEventType;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

export interface ListChangeParams {
  resource_type?: LifecycleResourceType;
  resource_id?: string;
  event_type?: string;
  since?: string;
  limit?: number;
  offset?: number;
}

export interface ChangesMeta extends PaginationMeta {
  retention_days: number;
}

export interface ChangesResponse {
  data: CatalogChange[];
  meta: ChangesMeta;
}

export interface CatalogChange {
  id: string;
  catalog_release_id?: string | null;
  event_type: string;
  resource_type?: string;
  resource_id?: string;
  provider_id?: string;
  source_id?: string;
  source_url?: string;
  previous_sha256?: string | null;
  current_sha256?: string | null;
  before_value?: unknown;
  after_value?: unknown;
  detected_at: string;
  published_at?: string | null;
}

export interface DecisionPolicy {
  providers?: string[];
  regions?: string[];
  capabilities?: string[];
  lifecycle_statuses?: LifecycleStatus[];
  max_total_usd?: number;
  min_context_tokens?: number;
  [key: string]: unknown;
}

interface DecisionEvaluationBaseInput {
  deploymentIds?: string[];
  priceBookId?: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  batch?: boolean;
  limit?: number;
  idempotencyKey?: string;
}

export type DecisionEvaluationInput = DecisionEvaluationBaseInput & (
  | { policyId: string; policy?: never }
  | { policy: DecisionPolicy; policyId?: never }
);

export interface DecisionCandidate {
  deployment: Deployment;
  pricing: PricingQuote;
}

export interface LockfileVerificationInput {
  content: Record<string, unknown>;
  expectedSha256?: string;
  idempotencyKey?: string;
}

export interface LockfileVerification {
  valid: boolean;
  actual_sha256: string;
  expected_sha256: string | null;
  locked_catalog_release_id: string | null;
  current_catalog_release_id: string;
  release_changed: boolean;
  missing_deployment_ids: string[];
}

/** Metadata from the most recently completed HTTP response on this client instance. */
export interface ALLMResponseMetadata {
  status: number;
  requestId?: string;
  catalogRelease?: string;
  etag?: string;
  /** Every response header whose lowercase name starts with `x-ratelimit-`. */
  rateLimit: Readonly<Record<string, string>>;
}
