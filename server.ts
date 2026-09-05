import express, { type Request, type Response } from 'express';
import type { Cookie } from 'puppeteer';
import { openBrowserPuppeteer } from './browser-puppeteer.ts';

function serializeCookie(cookie: Cookie): string {
  // Synapse expects one stored cookie per line. Attributes from Set-Cookie are
  // not valid in the outgoing Cookie header and can corrupt its cookie parser.
  return `${cookie.name}=${cookie.value}`;
}

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
        const cookieText = result.cookies.map(serializeCookie).join('\r\n');

        return res.json({
          url,
          finalUrl: result.finalUrl,
          title: result.title,
          html: result.content,
          cookies: result.cookies,
          cookieText,
          userAgent: result.userAgent,
        });
      }

      return res.status(200).type('text/html; charset=utf-8').send(result.content);
    } catch (e) {
      return res.status(500).json({ error: 'Error during load page', details: e });
    }
  });

  app.get('/download', async (req: Request, res: Response) => {
    const url = normalizeUrl(req.query.url);
    if (!url) {
      return res.status(400).json({ error: 'Valid query param "url" is required' });
    }

    const parsedUrl = new URL(url);
    if (!/^i\d+\.fastpic\.(org|ru)$/i.test(parsedUrl.hostname)) {
      return res.status(400).json({ error: 'Only FastPic image URLs are allowed' });
    }

    const browserHeaders = {
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'accept-language': 'ru-RU,ru;q=0.9,en;q=0.8',
      'sec-fetch-dest': 'image',
      'sec-fetch-mode': 'no-cors',
      'sec-fetch-site': 'same-site',
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    };

    try {
      let imageUrl = url;
      let referer = 'https://fastpic.' +
        (parsedUrl.hostname.endsWith('.org') ? 'org' : 'ru') + '/';
      const directMatch = url.match(
        /^https?:\/\/i(\d+)\.fastpic\.(org|ru)\/big\/(\d+)\/(\d+)\/[^/]+\/([^?]+)/i,
      );

      if (directMatch) {
        referer =
          'https://fastpic.' + directMatch[2] + '/view/' + directMatch[1] + '/' +
          directMatch[3] + '/' + directMatch[4] + '/' + directMatch[5] + '.html';
      }

      if (!parsedUrl.searchParams.has('md5') || !parsedUrl.searchParams.has('expires')) {
        const viewResponse = await fetch(referer, { headers: browserHeaders });
        if (!viewResponse.ok) {
          return res.status(viewResponse.status).json({ error: 'FastPic view request failed' });
        }

        const html = await viewResponse.text();
        const signedMatch = html.match(
          /<template><img src="(https?:\/\/i\d+\.fastpic\.(?:org|ru)\/big\/[^"?]+)\?md5=([^&"]+).*?expires=(\d+)/i,
        );
        if (!signedMatch) {
          return res.status(502).json({ error: 'FastPic signed image URL not found' });
        }
        imageUrl = signedMatch[1] + '?md5=' + signedMatch[2] +
          '&expires=' + signedMatch[3];
      }

      const imageResponse = await fetch(imageUrl, {
        headers: { ...browserHeaders, referer },
      });
      if (!imageResponse.ok) {
        return res.status(imageResponse.status).json({ error: 'FastPic image request failed' });
      }

      const image = Buffer.from(await imageResponse.arrayBuffer());
      res.setHeader('Content-Type', imageResponse.headers.get('content-type') || 'application/octet-stream');
      res.setHeader('Content-Length', String(image.length));
      return res.status(200).send(image);
    } catch (e) {
      return res.status(500).json({ error: 'Error during FastPic download', details: String(e) });
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
    console.log('url', url);
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
      const cookieText = result?.cookies.map(serializeCookie).join('\r\n');

      return res?.json({
        html: result?.content,
        cookies: result?.cookies,
        cookieText,
        userAgent: result.userAgent,
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
