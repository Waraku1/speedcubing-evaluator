# Algorithm Evaluator for Speedcubing (AES)

AES is an anonymous-first 3x3x3 cube analysis workbench. It accepts manual cube entry or a reviewed local camera draft, verifies a solution on the server, reports Domain Demand, and presents human-style CFOP phase details.

The optional GitHub account control is an authentication boundary for future saved analyses. Saved Analysis persistence is not implemented in this increment, and all evaluator and scanner workflows remain available without signing in.

## Local development

Install dependencies and start the development server:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The optional scanner is available at `/detect` and requires an explicit Start action before camera or model resources are requested.

## Verification

```bash
pnpm test:unit
pnpm test:integration
pnpm type-check
pnpm lint
pnpm build
CI=1 pnpm test:e2e
CI=1 pnpm test:a11y
```

OAuth configuration is external to the source tree. The GitHub provider requires `GITHUB_ID`, `GITHUB_SECRET`, `NEXTAUTH_SECRET`, and an explicitly approved origin in `NEXTAUTH_URL`; no credential has a source-code fallback.
