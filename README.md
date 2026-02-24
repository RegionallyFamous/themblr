# Themblr

Themblr is an AI-assisted generator that produces new Tumblr `theme.html` variants from the starter template at `../defaultera/theme.html` (Default Era).

## Features

- Next.js fullstack app (App Router)
- Server-side OpenAI generation only
- Structured form + freeform prompt
- Download-only single `theme.html` output
- Live in-app fake Tumblr preview (sample data render)
- Hard contract validator with report
- Auto-repair + one corrective retry path
- In-browser preset save/load + JSON export/import
- Public-ready with basic IP rate limits

## Routes

- `GET /` UI
- `POST /api/generate`
- `POST /api/validate`
- `GET /api/template-metadata`
- `GET /api/health`

## Environment Variables

Required:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`

Optional:

- `STARTER_THEME_PATH`
- `RATE_LIMIT_WINDOW_MS` (default `60000`)
- `RATE_LIMIT_MAX` (default `20`)
- `GENERATION_TIMEOUT_MS` (default `20000`)
- `MAX_PROMPT_CHARS` (default `3500`)
- `MAX_REQUEST_BYTES` (default `120000`)

## Local Development

```bash
pnpm install
pnpm dev
```

The app runs at `http://localhost:3000`.

## Build and Test

```bash
pnpm lint
pnpm test
pnpm build
```

## Railway Deployment

1. Deploy this folder as a Railway service.
2. Set env vars listed above.
3. Ensure starter template is available in deployment image.
   - Recommended: include the starter in this repo at `starter/theme.html` and set `STARTER_THEME_PATH=starter/theme.html`.
   - Local fallback for this workspace: `../defaultera/theme.html`.
   - Or set `STARTER_THEME_PATH` explicitly.
4. Set health check path to `/api/health`.

## Generation Strategy

Themblr does not let AI replace the full file directly. It:

1. Loads starter template.
2. Extracts editable zones (`cssCore`, `headerSection`, `sidebarSection`, `contextSection`).
3. Requests structured JSON edits from OpenAI.
4. Re-composes theme from starter + editable changes.
5. Validates required Tumblr contracts.
6. If invalid, auto-repairs and retries once in reduced scope.

## Contract Validation

Hard checks include:

- required meta option names
- root data attrs
- stable hooks/classes
- required CSS vars
- required JS signatures
- required Tumblr blocks
- block balance
- no external runtime dependencies
- `{CustomCSS}` inside style block

Warnings include:

- file size
- inline script size
- missing localized keys vs starter baseline

## Notes

- App is open-public by default. Rate limits are included, but no auth is implemented in v1.
- Model choice is fixed via env var (`OPENAI_MODEL`), not user-selectable in UI.
