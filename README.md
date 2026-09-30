# Algorithm Evaluator for Speedcubing (AES)

AES is an anonymous-first 3x3x3 cube analysis workbench. It accepts manual cube entry or a reviewed local camera draft, verifies a solution on the server, reports Domain Demand, and presents human-style CFOP phase details.

GitHub-authenticated users can save, list, open, and delete private analysis snapshots. Saved records contain only server-produced evaluation and optional CFOP output. All evaluator and scanner workflows remain available without signing in.

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

## Saved Analysis storage

Saved Analysis V1 uses PostgreSQL through `@neondatabase/serverless` and requires `DATABASE_URL` only when a saved-analysis API is called. A missing or unavailable database fails those APIs closed without affecting anonymous evaluation, CFOP, or scanning. The application does not connect to or migrate a database during module import, build, or startup.

Apply [`migrations/0001_saved_analysis_v1.sql`](migrations/0001_saved_analysis_v1.sql) explicitly to the intended database before accepting the saved workflow. Apply it only once per new database branch. The migration creates only `saved_analyses` and its owner-scoped pagination and lookup indexes.
