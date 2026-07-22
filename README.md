# ALLM TypeScript SDK

Official typed client for the ALLM model intelligence API. It targets Node.js 20+, modern
browsers and edge runtimes with a standard `fetch` implementation.

```bash
pnpm add @allm/sdk
```

```ts
import { ALLM } from "@allm/sdk";

const allm = new ALLM({ apiKey: process.env.ALLM_API_KEY! });
const quote = await allm.pricing.calculate({
  deployment: "dep_openai_gpt_5_1_responses_global",
  inputTokens: 1_000_000,
  outputTokens: 100_000,
  idempotencyKey: crypto.randomUUID(),
});

console.log(quote.totalUsd, quote.applied);
```

## API surface

The v1 SDK covers every operation declared in `contract/operations.json`:

- `health.get()` and `status.get()`
- `providers.list()` and `providers.retrieve(id)`
- `models.list()` and `models.retrieve("lab/model")`
- `labs.list()` and `labs.retrieve(id)`
- `deployments.list()`, `deployments.retrieve(id)`, `deployments.showcase()` and
  `deployments.compare(input)`
- `lifecycle.list()` and `lifecycle.events()`
- `changes.list()`
- `pricing.calculate(input)`
- `decisions.evaluate(input)`
- `lockfiles.verify(input)`

Provider and model detail responses include their concrete deployments. Lab details include
their models and provider coverage. Pricing, comparison and decision results all retain the
effective `applied` rates and multipliers returned by ALLM.

Lifecycle dates remain two distinct milestones: `deprecation` (discouraged for new use) and
`end_of_life` (no longer served). Unknown dates stay explicitly unknown instead of being
inferred.

```ts
const upcoming = await allm.lifecycle.list({
  resource_type: "deployment",
  end_of_life_before: "2026-12-31",
  include_unknown: false,
  sort: "end_of_life",
});

const candidates = await allm.decisions.evaluate({
  policy: { regions: ["eu"], capabilities: ["tool_calling"] },
  inputTokens: 25_000,
  outputTokens: 2_000,
  idempotencyKey: crypto.randomUUID(),
});
```

`DecisionEvaluationInput` requires exactly one of `policyId` or an inline `policy`, both at
compile time and at runtime.

## Response metadata

After a completed response, `client.lastResponse` exposes its status and the important ALLM
headers: request ID, catalog release, ETag, and every `x-ratelimit-*` header.

```ts
await allm.models.list();
console.log(allm.lastResponse?.requestId);
console.log(allm.lastResponse?.catalogRelease);
console.log(allm.lastResponse?.rateLimit["x-ratelimit-remaining"]);
```

`lastResponse` belongs to the client instance. Concurrent calls can replace it in completion
order; use separate client instances when request-local metadata is required.

## Errors, retries and idempotency

Failures throw `ALLMError` with `status`, `code`, `requestId`, and `details`. The client sends
one stable `x-request-id` for a logical request and reuses it across retry attempts.

GET requests retry transient network failures and HTTP 408, 409, 425, 429, and 5xx responses.
POST requests retry only when an `idempotencyKey` is supplied. The same key is reused for every
attempt. The default is two retries with exponential backoff; `Retry-After` is honored, capped
at 30 seconds by default. Configure this with `maxRetries`, `retryDelayMs`, and
`maxRetryDelayMs`.

Use idempotency keys whenever a POST may be retried:

```ts
await allm.deployments.compare({
  deploymentIds: ["dep_..."],
  inputTokens: 10_000,
  outputTokens: 500,
  idempotencyKey: crypto.randomUUID(),
});
```

Token counts, cached-token relationships, collection sizes, UUIDs, digests, and transport
options are validated before network access.

## Contract and release checks

```bash
pnpm verify                  # lint, types, tests, build, local API contract
pnpm contract:check:upstream # compare against the deployed OpenAPI document
pnpm pack:check              # inspect the npm tarball without publishing
```

The SDK manifest may contain operations that are about to be deployed. Normal contract checks require
every operation present in the checked OpenAPI document to have the same operation ID, method,
and path in the SDK manifest; undeployed manifest operations are reported as pending. This
allows the SDK to land before a coordinated API rollout without allowing the API to outrun it.
The release workflow uses `--exact` against the production OpenAPI document, so publication is
blocked until all 18 operations are deployed.

Releases use `.github/workflows/release.yml` and npm Trusted Publishing. Before the first
release, an owner must make this SDK repository public (required for npm provenance), create or
verify the `@allm` npm scope, bootstrap `@allm/sdk`, and
configure its Trusted Publisher for repository `yannickmathey/allm-sdk-typescript` and workflow
`release.yml`. Create a protected GitHub environment named `npm`, and configure the Trusted
Publisher with that same environment name. After that one-time setup, a tag matching
`v<package version>` runs all checks,
performs an npm dry run, and publishes with provenance. The workflow intentionally contains no
long-lived npm token.
