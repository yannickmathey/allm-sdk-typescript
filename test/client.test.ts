import { describe, expect, it, vi } from "vitest";
import { ALLM } from "../src/index.js";

describe("ALLM", () => {
  it("sends authenticated pricing requests", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: { deployment_id: "dep_openai_gpt_5_1_responses_global", currency: "USD", total_usd: "2.250000", line_items: [], rate_card: { currency: "USD", unit: "million_tokens", input_micro_usd: 1250000, output_micro_usd: 10000000, source_url: "https://example.test", observed_at: "2026-07-14T00:00:00Z" } } }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = new ALLM({ apiKey: "test_key", baseUrl: "https://example.test", fetch: fetcher });
    const quote = await client.pricing.calculate({ deployment: "dep_openai_gpt_5_1_responses_global", inputTokens: 1_000_000, outputTokens: 100_000 });
    expect(quote.totalUsd).toBe("2.250000");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: "Bearer test_key" });
    expect(fetcher.mock.calls[0]?.[1]?.body).toContain('"deployment_id":"dep_openai_gpt_5_1_responses_global"');
  });
});
