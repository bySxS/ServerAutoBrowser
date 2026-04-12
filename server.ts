import express, { Request, Response } from 'express';
import { openBrowserPuppeteer } from './browser-puppeteer';

function normalizeUrl(input: unknown): string | null {
  if (typeof input !== 'string' || !input.trim()) {
    return null;
  }

  try {
    const normalizedUrl = new URL(input.trim());
    if (!['http:', 'https:'].includes(normalizedUrl.protocol)) {
      return null;
    }

    return normalizedUrl.toString();
  } catch {
    return null;
  }
}

function normalizeBoolean(input: unknown): boolean {
  if (typeof input === 'boolean') {
    return input;
  }

  if (typeof input !== 'string') {
    return false;
  }

  return ['1', 'true', 'yes', 'on'].includes(input.trim().toLowerCase());
}

function normalizePositiveNumber(input: unknown, fallback: number): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

async function createServer() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get('/', (req: Request, res: Response) => {
    return res.status(200).json({
      message: 'Use POST /api or GET /proxy?url=https://example.com',
      success: true,
    });
  });

  app.get('/proxy', async (req: Request, res: Response) => {
    const url = normalizeUrl(req.query.url);
    const responseFormat = req.query.format === 'json' ? 'json' : 'html';
    const waitForRecaptcha = normalizeBoolean(req.query.waitForRecaptcha);
    const recaptchaTimeoutMs = normalizePositiveNumber(
      req.query.recaptchaTimeoutMs,
      300000,
    );

    if (!url) {
      return res.status(400).json({
        error: 'Valid query param "url" is required and must start with http:// or https://',
      });
    }

    try {
      const result = await openBrowserPuppeteer(url, undefined, undefined, {
        waitForRecaptcha,
        recaptchaTimeoutMs,
      });

      if (responseFormat === 'json') {
        const cookieText = result.cookies
          .map(
            cookie =>
              `${cookie.name}=${cookie.value}; expires=${cookie.expires}; path=${cookie.path}; domain=${cookie.domain}; ${cookie.httpOnly ? 'httpOnly' : ''}`,
          )
          .join('\r\n');

        return res.json({
          url,
          finalUrl: result.finalUrl,
          title: result.title,
          html: result.content,
          cookies: result.cookies,
          cookieText,
        });
      }

      return res.status(200).type('text/html; charset=utf-8').send(result.content);
    } catch (e) {
      return res.status(500).json({ error: 'Error during load page', details: e });
    }
  });

  app.post('/api', async (req: Request, res: Response) => {
    const { cookies, actions } = req.body;
    const url = normalizeUrl(req.body?.url);
    const waitForRecaptcha = normalizeBoolean(req.body?.waitForRecaptcha);
    const recaptchaTimeoutMs = normalizePositiveNumber(
      req.body?.recaptchaTimeoutMs,
      300000,
    );
    console.log('url', url, req.body);
    if (!url) {
      return res
        ?.status(400)
        ?.json({ error: 'Valid body param "url" is required and must start with http:// or https://' });
    }

    try {
      const result = await openBrowserPuppeteer(url, cookies, actions, {
        waitForRecaptcha,
        recaptchaTimeoutMs,
      });
      const cookieText = result?.cookies
        .map(
          cookie =>
            `${cookie.name}=${cookie.value}; expires=${cookie.expires}; path=${cookie.path}; domain=${cookie.domain}; ${cookie.httpOnly ? 'httpOnly' : ''}`,
        )
        .join('\r\n');

      return res?.json({
        html: result?.content,
        cookies: result?.cookies,
        cookieText,
        finalUrl: result.finalUrl,
        title: result.title,
      });
    } catch (e) {
      return res.status(500).json({ error: 'Error during load page', details: e });
    }
  });

  app.listen(9999, '0.0.0.0', () => {
    console.log('🚀 Server Auto Browser started http://localhost:9999');
  });
}

createServer().then();
