# AGENTS.md

## Cursor Cloud specific instructions

QuickShare is a single **Next.js 16 (App Router) + TypeScript** web app managed with **pnpm**. It is a phone↔PC file-transfer tool: users create a transfer session (6-digit code + QR), join it from another device, and exchange files. There is one web server on **port 3000**; see `package.json` scripts. There is also an optional Chrome extension in `public/` (not needed to exercise the core product).

### Services & how to run

- **Web app + API (required):** `pnpm dev` → http://localhost:3000 (dev). `pnpm build` then `pnpm start` for a prod build. Both use port 3000.
- The dev server depends on two external SaaS stores, configured purely via env vars (no local containers in this repo):
  - **Vercel KV / Upstash (REST)** — session + code→id storage. `KV_REST_API_URL`, `KV_REST_API_TOKEN`. Used by `lib/session-manager.ts`, which speaks the Upstash **REST** command protocol (POSTs a JSON command array, reads `{ result }`), NOT raw Redis TCP. Without it, session create/validate throws `Redis credentials not configured`.
  - **Vercel Blob** — stores uploaded file bytes. `BLOB_READ_WRITE_TOKEN`. Used by `app/api/upload/route.ts` and `app/api/files/route.ts`. File upload/download cannot work without a real token (it calls Vercel's hosted Blob API; there is no local emulator).

### Running locally without paid Vercel services

For the **session create/join flow** (the core flow that does not move file bytes), you do not need real Vercel KV. This repo includes a tiny local Upstash-REST-compatible shim at `scripts/dev-kv.mjs` (in-memory, TTL-aware, dev-only). Run it, then point the dev server at it:

```bash
# terminal 1: start the KV shim (default port 8079, token "local-dev-token")
node scripts/dev-kv.mjs

# terminal 2: start Next.js pointed at the shim
KV_REST_API_URL=http://127.0.0.1:8079 KV_REST_API_TOKEN=local-dev-token pnpm dev
```

If `scripts/dev-kv.mjs` is not present (e.g. this change wasn't merged), it is a ~80-line Node `http` server: authenticate `Authorization: Bearer <token>`, parse the POST body as a JSON array like `["SET","key","val","EX","900"]` or `["GET","key"]`, keep an in-memory `Map` with TTL, and respond `{ "result": ... }`.

**Full file transfer (upload/download)** additionally requires a real `BLOB_READ_WRITE_TOKEN` (and ideally real KV). Set those env vars before `pnpm dev` to test the complete flow.

### Gotchas

- **`pnpm lint` is broken in this repo, independent of the environment.** The script is `eslint .` but `eslint` is not declared in `package.json` and there is no ESLint config file present, so it fails with `eslint: not found`. Don't treat this as a setup failure.
- `next.config.mjs` sets `typescript.ignoreBuildErrors` and `images.unoptimized`, so `pnpm build` skips type errors and image optimization. The `sharp` build script is intentionally skipped by pnpm and is not needed.
- There is no `.env` / `.env.example` in the repo; `.env*.local` is gitignored. Provide env vars inline or via `.env.local`.
