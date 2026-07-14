# ALLM TypeScript SDK

Official typed client for the ALLM model intelligence API. Works in Node.js, modern browsers and edge runtimes with a standard `fetch` implementation.

```bash
pnpm add @allm/sdk
```

```ts
import { ALLM } from "@allm/sdk";

const allm = new ALLM({ apiKey: process.env.ALLM_API_KEY });
const quote = await allm.pricing.calculate({
  deployment: "dep_openai_gpt_5_1_responses_global",
  inputTokens: 1_000_000,
  outputTokens: 100_000,
});
```
