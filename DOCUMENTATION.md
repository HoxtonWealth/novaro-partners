# Novaro Partners — Technical Documentation

## Overview

Single-page landing site for Novaro Partners, a trading style of Hoxton Wealth. Built as a static HTML site with a Vercel serverless function for form submission.

- **Repo:** https://github.com/HoxtonWealth/novaro-partners
- **Production:** https://novaropartners.co.uk (custom domain) / https://novaro.vercel.app
- **Vercel Project:** `novaro` under `hoxtonwealthmarketings-projects` team
- **Vercel Project ID:** `prj_rhgjHy3dY35H0XLvw8VfYTLnA7pH`
- **Vercel Team ID:** `team_7HsLVmw6i3cIyCj8HT0KiLPy`

---

## Architecture

```
/
├── index.html          # Full landing page (HTML + inline CSS + inline JS)
├── logo.png            # Novaro Partners logo (PNG from brand assets)
├── api/
│   └── submit.js       # Vercel serverless function — Ortto API proxy
└── .vercel/
    └── project.json    # Vercel project config (auto-generated)
```

### Why static HTML (no framework)?

- Single page, no routing needed
- Zero build step — Vercel serves files directly from root
- Fast deploy, no dependencies, no `node_modules`
- Fonts loaded via Google Fonts CDN (DM Serif Display + DM Sans)

---

## Branching Strategy

| Branch      | Purpose                                    |
|-------------|--------------------------------------------|
| `main`      | Production — auto-deploys to production    |
| `full-site` | Originally used for preview during dev     |

The `full-site` branch was used during initial development to keep a "Coming Soon" page on production while the full site was being built. Once ready, `full-site` was merged into `main`. The Coming Soon page is preserved in git history if ever needed again.

---

## Form Fields

The contact form collects:

| Field                | HTML element            | Notes                                           |
|----------------------|-------------------------|-------------------------------------------------|
| First Name           | `input[text]`           | Split from original single "Full Name" field    |
| Last Name            | `input[text]`           | Decision: two separate fields to match Ortto schema |
| Email Address        | `input[email]`          | Also used as `merge_by` key in Ortto            |
| Country of Residence | `select` (dropdown)     | ~237 countries, flag emoji + name, sends ISO alpha-2 code |
| Phone Country Code   | `select` (dropdown)     | Flag emoji + dial code (e.g. `+44`)             |
| Phone Number         | `input[tel]`            | Digits stripped of non-numeric chars before send |

**UX behaviour:** Selecting a country auto-fills the phone code dropdown to match (only if phone code hasn't been manually selected yet).

---

## Ortto API Integration

### Endpoint

```
POST https://api.eu.ap3api.com/v1/activities/create
```

### Flow

```
Browser form submit
  → POST /api/submit (Vercel serverless function)
    → Injects: API key, SCID, client IP
    → Forwards to Ortto AP3 API
    → Returns response to browser
```

### Why a serverless proxy?

The `X-Api-Key` would be visible in browser DevTools if called client-side. The `/api/submit` function holds the key server-side via environment variable, so it's never exposed to the client.

### Payload Structure

```json
{
  "activities": [{
    "activity_id": "act:cm:website-form-submitted",
    "attributes": {
      "int::v": "<unix timestamp at submit time>",
      "phn:cm:mobile-number-user-input": { "c": "<dial code>", "n": "<digits>" },
      "str:cm:email": "<email>",
      "str:cm:first-name-user-input": "<first name>",
      "str:cm:last-name-user-input": "<last name>",
      "str:cm:country-of-residence-user-input": "<ISO alpha-2 code>",
      "str:cm:source-page-url": "<window.location.href>",
      "str:cm:scid": "<injected server-side from env>",
      "str:cm:utmsource": "<from ?utm_source= if present>",
      "str:cm:utmmedium": "<from ?utm_medium= if present>",
      "str:cm:campaignname-google-url-paramcookie": "<from ?utm_campaign= if present>",
      "str:cm:adgroup-google-url-paramcookie": "<from ?utm_adgroup= or ?adgroup= if present>",
      "str:cm:placement-google-url-paramcookie": "<from ?placement= if present>",
      "str:cm:article-category-blog-category": "<from ?article_category= if present>"
    },
    "fields": { "str::email": "<email>" },
    "location": { "source_ip": "<injected server-side from x-forwarded-for>", "custom": null, "address": null }
  }],
  "merge_by": ["str::email"]
}
```

### Fields Deliberately Excluded

| Field                                  | Reason                    |
|----------------------------------------|---------------------------|
| `str:cm:country-of-residence-staging`  | User requested exclusion  |
| `str:cm:marketingconsentstatus`        | User requested exclusion  |
| `str:cm:topic-page-title`             | User requested exclusion  |
| `txt:cm:your-questions-user-input-on-the-event-forms` | User requested exclusion (no questions textarea in form) |

### UTM Parameter Handling

UTM and tracking parameters are read from the URL query string on page load. **Only included in the payload if present** — empty/missing params are omitted entirely (not sent as empty strings). This was a deliberate decision to avoid fake/empty data in Ortto.

Mapping:
- `?utm_source=` → `str:cm:utmsource`
- `?utm_medium=` → `str:cm:utmmedium`
- `?utm_campaign=` → `str:cm:campaignname-google-url-paramcookie`
- `?utm_adgroup=` or `?adgroup=` → `str:cm:adgroup-google-url-paramcookie`
- `?placement=` → `str:cm:placement-google-url-paramcookie`
- `?article_category=` → `str:cm:article-category-blog-category`

### `int::v` Field

Set to `Math.floor(Date.now() / 1000)` (current Unix timestamp in seconds). This was a best guess based on the example value `1775818849` resembling a timestamp. **Not confirmed with Ortto docs — verify if issues arise.**

---

## Environment Variables (Vercel)

Set in Vercel project settings. Applied to both Production and Preview environments.

| Variable          | Description                              |
|-------------------|------------------------------------------|
| `ORTTO_API_KEY`   | Ortto AP3 API key (`X-Api-Key` header)   |
| `ORTTO_SCID`      | Hardcoded SCID for this landing page     |
| `ALLOWED_ORIGINS` | (Optional) Comma-separated allowed origins. Defaults to `novaropartners.co.uk,novaro.vercel.app` |

**Important:** After adding or changing env vars, you must redeploy for the new values to take effect. Existing deployments retain the values from when they were built.

---

## Security Measures

### 1. API Key Protection
- `ORTTO_API_KEY` is stored as a Vercel env var, only accessible server-side in `/api/submit`
- Never included in client-side HTML or JS

### 2. SCID Protection
- `ORTTO_SCID` is also server-side only, injected by the proxy function

### 3. Origin Check
- `/api/submit` validates the `Origin` header against an allowlist
- Default: `novaropartners.co.uk`, `novaro.vercel.app`
- Configurable via `ALLOWED_ORIGINS` env var
- Returns `403 Forbidden` for non-matching origins

### 4. Rate Limiting
- In-memory sliding window: **5 requests per IP per 60 seconds**
- Returns `429 Too Many Requests` when exceeded
- Tracked per warm serverless instance (resets on cold start)
- Includes memory cleanup to prevent unbounded growth (>10k entries)
- **Limitation:** Vercel can spin up multiple instances, each with its own memory. A distributed rate limiter (e.g. Upstash Redis) would be needed for stronger guarantees.

### 5. Client IP Injection
- Real client IP extracted from `x-forwarded-for` / `x-real-ip` headers
- Injected into `location.source_ip` server-side (not trusting client-sent value)

---

## Responsive Design

Three breakpoints:

| Breakpoint | Key changes                                                |
|------------|------------------------------------------------------------|
| `768px`    | Reduced padding                                            |
| `640px`    | Contact grid stacks to single column, logo scales to 220px |
| `380px`    | Logo scales to 180px                                       |

- `prefers-reduced-motion` respected (disables transitions/animations)
- All form inputs use `font-size: 16px` to prevent iOS auto-zoom
- Touch targets meet 48px minimum height

---

## Deployment

### Automatic (Git Integration)
Push to `main` → Vercel auto-deploys to production.
Push to any other branch → Vercel creates a preview deployment.

### Manual (CLI)
```bash
vercel          # preview deploy
vercel --prod   # production deploy
```

Requires `vercel login` if the token has expired.

---

## Key Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | None (static HTML) | Single page, zero complexity needed |
| API key handling | Vercel serverless proxy | Prevents client-side exposure |
| Name fields | Two separate fields | Matches Ortto schema (`first-name` / `last-name`) |
| Country value format | ISO alpha-2 code | User requested ISO codes in payload |
| Missing UTMs | Omit from payload | User: "don't send fake empty" |
| Phone code dropdown | Flag emoji + dial code | User requested flags; emoji approach is zero-dependency |
| SCID storage | Env var (server-side) | Originally hardcoded in JS, moved to env for security |
| Rate limiting | In-memory per instance | Lightweight, no external dependency; acceptable for current traffic |
| `source-page-url` | `window.location.href` | User confirmed (vs referrer) |
