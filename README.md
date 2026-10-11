# ServerAutoBrowser

Node.js service on Express and Puppeteer for opening pages on the server and returning the rendered result over HTTP.

## Requirements

- Node.js 20+

## Install

```bash
npm install
```

## Start

```bash
npm run start
```

Server starts on `http://localhost:696`.

## Docker

Build image:

```bash
docker build -t server-auto-browser .
```

Run container:

```bash
docker run -d --name server-auto-browser -p 696:696 -v $(pwd)/chrome-user-data:/app/chrome-user-data --restart unless-stopped server-auto-browser
```

The container includes Chromium and starts the app in production mode on port `696`.
Browser profile data is stored in `/app/chrome-user-data`, so mounting that path keeps cookies and session state between restarts.

## Endpoints

### `GET /proxy`

Opens the passed URL in Puppeteer and returns the rendered page HTML.

Query params:

- `url` - target page URL, required
- `format=json` - optional, returns JSON with `html`, `cookies`, `cookieText`, `finalUrl`, `title`
- `waitForRecaptcha=true` - optional, keeps the browser open and waits until `g-recaptcha-response` is filled
- `recaptchaTimeoutMs=300000` - optional timeout for captcha wait in milliseconds

Example:

```bash
curl "http://localhost:696/proxy?url=https://www.google.com"
```

JSON example:

```bash
curl "http://localhost:696/proxy?url=https://www.google.com&format=json"
```

Wait for manual captcha solving:

```bash
curl "http://localhost:696/proxy?format=json&waitForRecaptcha=true&recaptchaTimeoutMs=300000&url=https%3A%2F%2Fexample.com"
```

### `POST /api`

Opens the passed URL in Puppeteer, optionally sets cookies and performs browser actions.

Body fields:

- `url` - target page URL, required
- `cookies` - Puppeteer cookies array, optional
- `actions` - actions array, optional
- `waitForRecaptcha` - optional boolean, waits for manual captcha solving
- `recaptchaTimeoutMs` - optional timeout in milliseconds

Supported actions:

- `fill`
- `click`
- `select`

Example:

```bash
curl -X POST "http://localhost:696/api" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "actions": []
  }'
```

# SEO text generation

Copy `.env.example` to `.env`, set `GEMINI_API_KEY` and `GROQ_API_KEY`, then restart
the server. Gemini is used first and Groq is used automatically if Gemini fails.

`POST http://localhost:696/api/seo` accepts JSON:

```json
{
  "title": "ELDEN RING Shadow of the Erdtree",
  "year": "2022",
  "genre": "Action / RPG",
  "version": "1.17",
  "description": "Original description",
  "keywords": ["скачать торрент"]
}
```

If `SEO_API_TOKEN` is configured, send `Authorization: Bearer <token>`. Without a
token, this endpoint only accepts requests from localhost.

### English material translation

`POST http://localhost:696/api/material/english` uses the same authorization and
Gemini-to-Groq fallback as `/api/seo`:

```json
{
  "title": "Original title",
  "shortDescription": "Original brief",
  "description": "Full original material with BBCode or HTML",
  "seo": false
}
```

The response is `{success:true,provider,result:{title,shortDescription,description,seoDescription}}`.
With `seo:false`, the complete material is translated and `seoDescription` is empty.
With `seo:true`, a single provider request returns the translation and a separate
English SEO description with the phrase `download torrent`; the application replaces
the Description block, preserving technical sections. Markup and links are validated.
HTML tags are replaced with protected placeholders before generation and restored
verbatim afterwards, avoiding false failures caused by a model reformatting tags.
Translation requests use an explicit 32,768-token output budget. GPT-OSS on Groq
also uses low reasoning effort and strict JSON-schema output; truncated responses
are rejected instead of being published.
The full input description is limited to 50,000 characters; it is never silently truncated.

The application has two independent translation settings:
- Form1 translates loaded materials and can combine translation with English SEO.
- Form4 translates only the outgoing title, brief and full text before publication,
  leaving Form2 and the database unchanged. It does not read Form1 translation or SEO flags.
  Failed translation cancels publication. Retries reuse the translated result.

Run `node --test tests/material-provider.test.mjs` for provider regression tests.
Run `npm run build:cffsts` to update the application server bundle.
