import { describe, expectTypeOf, it } from "vitest";
import type {
  AppliedPricing,
  ChangesResponse,
  DecisionEvaluationInput,
  DeploymentShowcaseResponse,
  ModelDetail,
  ProviderDetail,
  ServiceStatus,
} from "../src/index.js";

function acceptsDecisionInput(input: DecisionEvaluationInput) {
  return input;
}

describe("public types", () => {
  it("requires exactly one decision policy selector", () => {
    acceptsDecisionInput({ policy: {}, inputTokens: 0, outputTokens: 0 });
    acceptsDecisionInput({
      policyId: "00000000-0000-4000-8000-000000000001",
      inputTokens: 0,
      outputTokens: 0,
    });
    // @ts-expect-error policyId or policy is required
    acceptsDecisionInput({ inputTokens: 0, outputTokens: 0 });
    // @ts-expect-error policyId and policy are mutually exclusive
    acceptsDecisionInput({
      policyId: "00000000-0000-4000-8000-000000000001",
      policy: {},
      inputTokens: 0,
      outputTokens: 0,
    });
  });

  it("exposes complete v1 detail, showcase, pricing and status shapes", () => {
    expectTypeOf<ProviderDetail["deployments"]>().toMatchTypeOf<readonly unknown[]>();
    expectTypeOf<ModelDetail["deployments"]>().toMatchTypeOf<readonly unknown[]>();
    expectTypeOf<DeploymentShowcaseResponse["meta"]["scenarios"][number]["kind"]>()
      .toEqualTypeOf<"lifecycle" | "pricing" | "capability">();
    expectTypeOf<AppliedPricing>().toHaveProperty("inputMicroUsd");
    expectTypeOf<ServiceStatus>().toHaveProperty("webhooks");
    expectTypeOf<ChangesResponse["meta"]["retention_days"]>().toEqualTypeOf<number>();
  });
});
