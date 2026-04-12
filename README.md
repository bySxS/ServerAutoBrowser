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

Server starts on `http://localhost:9999`.

## Docker

Build image:

```bash
docker build -t server-auto-browser .
```

Run container:

```bash
docker run -d --name server-auto-browser -p 9999:9999 -v $(pwd)/chrome-user-data:/app/chrome-user-data --restart unless-stopped server-auto-browser
```

The container includes Chromium and starts the app in production mode on port `9999`.
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
curl "http://localhost:9999/proxy?url=https://www.google.com"
```

JSON example:

```bash
curl "http://localhost:9999/proxy?url=https://www.google.com&format=json"
```

Wait for manual captcha solving:

```bash
curl "http://localhost:9999/proxy?format=json&waitForRecaptcha=true&recaptchaTimeoutMs=300000&url=https%3A%2F%2Fexample.com"
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
curl -X POST "http://localhost:9999/api" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "actions": []
  }'
```
