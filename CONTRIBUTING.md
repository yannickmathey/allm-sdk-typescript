# Contributing

Thank you for helping improve the official ALLM TypeScript SDK.

## Development

Use Node.js 20 or newer and the pnpm version declared in `package.json`.

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm pack:check
```

Changes to public methods or types must update tests, documentation, and
`contract/operations.json` when the API surface changes. Lifecycle contributions must preserve
the distinction between `deprecation` and `end_of_life`; missing dates remain explicitly
unknown.

## Pull requests

- Keep each change focused and explain its user-facing impact.
- Add tests for fixes and new behavior.
- Do not commit API keys, provider credentials, customer data, generated package archives, or
  local environment files.
- Run the complete verification suite before requesting review.

Unless explicitly marked otherwise, contributions intentionally submitted for inclusion are
licensed under Apache-2.0 as described in `LICENSE`.
