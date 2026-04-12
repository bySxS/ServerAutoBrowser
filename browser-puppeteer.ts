import puppeteer, { Browser, Cookie, Page } from 'puppeteer';

export interface Action {
  type: 'fill' | 'click' | 'select';
  selector: string;
  value: string;
}

export interface BrowserOpenResult {
  content: string;
  cookies: Cookie[];
  finalUrl: string;
  title: string;
}

export interface OpenBrowserOptions {
  waitForRecaptcha?: boolean;
  recaptchaTimeoutMs?: number;
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';
const DEFAULT_VIEWPORT = { width: 1366, height: 768 };
const DEFAULT_LOCALE = 'en-US,en;q=0.9';

async function waitForPageToSettle(page: Page) {
  await Promise.allSettled([
    page.waitForNetworkIdle({ idleTime: 750, timeout: 10000 }),
    page.waitForNavigation({
      waitUntil: ['domcontentloaded', 'networkidle0', 'networkidle2', 'load'],
      timeout: 10000,
    }),
  ]);
}

function getBrowserLaunchOptions(
  headless: boolean,
): Parameters<typeof puppeteer.launch>[0] {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  const userDataDir =
    process.env.PUPPETEER_USER_DATA_DIR || './chrome-user-data';
  const launchArgs = [
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--disable-setuid-sandbox',
    '--no-sandbox',
  ];

  return {
    headless,
    defaultViewport: DEFAULT_VIEWPORT,
    executablePath: executablePath || undefined,
    userDataDir,
    args: launchArgs,
  };
}

function isAllowedThirdPartyHost(pageHost: string, requestHost: string): boolean {
  const allowedHosts = [
    'cloudflare.com',
    'google.com',
    'googleusercontent.com',
    'gstatic.com',
    'recaptcha.net',
  ];

  if (!pageHost) {
    return true;
  }

  if (
    requestHost === pageHost ||
    requestHost.endsWith(`.${pageHost}`) ||
    pageHost.endsWith(`.${requestHost}`)
  ) {
    return true;
  }

  return allowedHosts.some(
    allowedHost =>
      requestHost === allowedHost || requestHost.endsWith(`.${allowedHost}`),
  );
}

async function waitForRecaptchaSolve(
  page: Page,
  recaptchaTimeoutMs: number,
) {
  const recaptchaFrameSelector =
    'iframe[src*="recaptcha"], iframe[src*="google.com/recaptcha"], iframe[src*="recaptcha.net"]';

  const hasRecaptchaFrame = await page.$(recaptchaFrameSelector);
  if (!hasRecaptchaFrame) {
    return false;
  }

  console.log(`reCAPTCHA detected, waiting up to ${recaptchaTimeoutMs}ms`);

  await page.waitForFunction(
    () => {
      const responseFields = Array.from(
        document.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>(
          'textarea[name="g-recaptcha-response"], input[name="g-recaptcha-response"]',
        ),
      );

      return responseFields.some(field => field.value.trim().length > 0);
    },
    { timeout: recaptchaTimeoutMs, polling: 1000 },
  );

  console.log('reCAPTCHA appears to be solved');
  return true;
}

async function hasRecaptchaFrame(page: Page) {
  const recaptchaFrameSelector =
    'iframe[src*="recaptcha"], iframe[src*="google.com/recaptcha"], iframe[src*="recaptcha.net"]';

  return Boolean(await page.$(recaptchaFrameSelector));
}

function isGoogleSorryPage(pageUrl: string): boolean {
  try {
    const parsedUrl = new URL(pageUrl);
    return (
      parsedUrl.hostname === 'www.google.com' &&
      parsedUrl.pathname.startsWith('/sorry/index')
    );
  } catch {
    return false;
  }
}

async function waitForGoogleSorryPageSolve(
  page: Page,
  recaptchaTimeoutMs: number,
) {
  if (!isGoogleSorryPage(page.url())) {
    return false;
  }

  console.log(`Google sorry page detected, waiting up to ${recaptchaTimeoutMs}ms`);

  await page.waitForFunction(
    () => !window.location.pathname.startsWith('/sorry/index'),
    { timeout: recaptchaTimeoutMs, polling: 1000 },
  );

  console.log('Google sorry page appears to be passed');
  return true;
}

async function hasCaptcha(page: Page) {
  if (isGoogleSorryPage(page.url())) {
    return true;
  }

  return hasRecaptchaFrame(page);
}

async function applyStealthSettings(page: Page) {
  await page.setUserAgent(DEFAULT_USER_AGENT);
  await page.setExtraHTTPHeaders({
    'accept-language': DEFAULT_LOCALE,
  });
  await page.setViewport(DEFAULT_VIEWPORT);

  const browserContext = page.browserContext();
  await browserContext.overridePermissions('https://www.google.com', []);

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });

    Object.defineProperty(navigator, 'language', {
      get: () => 'en-US',
    });

    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });

    Object.defineProperty(navigator, 'platform', {
      get: () => 'Win32',
    });

    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });

    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 8,
    });

    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => 8,
    });

    Object.defineProperty(screen, 'colorDepth', {
      get: () => 24,
    });

    Object.defineProperty(window, 'chrome', {
      get: () => ({
        app: {},
        runtime: {},
      }),
    });

    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = parameters =>
      parameters.name === 'notifications'
        ? Promise.resolve({
            name: 'notifications',
            onchange: null,
            state: Notification.permission,
            addEventListener: () => undefined,
            dispatchEvent: () => false,
            removeEventListener: () => undefined,
          } as PermissionStatus)
        : originalQuery.call(window.navigator.permissions, parameters);
  });
}

async function prepareBrowserPage(browser: Browser): Promise<Page> {
  const existingPages = await browser.pages();

  await Promise.allSettled(
    existingPages.map(existingPage => existingPage.close()),
  );

  return browser.newPage();
}

async function attachPageRequestHandling(page: Page) {
  await page.setRequestInterception(true);

  page.on('request', request => {
    const requestUrl = request.url();

    try {
      const currentPageUrl = page.url();
      const pageHost = currentPageUrl ? new URL(currentPageUrl).hostname : '';
      const requestHost = new URL(requestUrl).hostname;
      console.log('pageHost', pageHost, 'requestHost', requestHost);
    } catch (error) {
      console.log(`Request inspection error: ${error}`);
    }

    request.continue();
  });
}

async function createConfiguredPage(
  browser: Browser,
  cookies?: Cookie[],
): Promise<Page> {
  const page = await prepareBrowserPage(browser);
  await applyStealthSettings(page);
  await attachPageRequestHandling(page);

  if (cookies && Array.isArray(cookies)) {
    await browser.setCookie(...cookies);
  }

  return page;
}

async function navigatePage(
  page: Page,
  url: string,
  actions?: Action[],
) {
  console.log('goto', url);
  await page.goto(url, {
    waitUntil: ['domcontentloaded', 'networkidle0', 'networkidle2', 'load'],
    timeout: 1000000,
    referer: url,
  });

  await waitForPageToSettle(page);

  if (actions && Array.isArray(actions)) {
    console.log('actions:');
    for (const action of actions) {
      if (action.type === 'fill') {
        const { selector, value } = action;
        console.log(`Filling field ${selector} with value ${value}`);
        await page.type(selector, value);
      }

      if (action.type === 'click') {
        const { selector } = action;
        console.log(`Clicking element ${selector}`);
        await page.click(selector);
      }

      if (action.type === 'select') {
        const { selector, value } = action;
        console.log(`Selecting value ${value} from ${selector}`);
        await page.select(selector, value);
      }

      await waitForPageToSettle(page);
    }
  }
}

export const openBrowserPuppeteer = async (
  url: string,
  cookies?: Cookie[],
  actions?: Action[],
  options?: OpenBrowserOptions,
): Promise<BrowserOpenResult> => {
  const waitForRecaptcha = options?.waitForRecaptcha === true;
  const recaptchaTimeoutMs = options?.recaptchaTimeoutMs ?? 300000;
  let browser = await puppeteer.launch(getBrowserLaunchOptions(true));
  let page = await createConfiguredPage(browser, cookies);

  try {
    await navigatePage(page, url, actions);

    if (waitForRecaptcha) {
      const captchaDetected = await hasCaptcha(page);

      if (captchaDetected) {
        const captchaUrl = page.url();

        if (!page.isClosed()) {
          await page.close();
        }

        await browser.close();

        browser = await puppeteer.launch(getBrowserLaunchOptions(false));
        page = await createConfiguredPage(browser, cookies);
        await navigatePage(page, captchaUrl);

        const waitedForGoogleSorry = await waitForGoogleSorryPageSolve(
          page,
          recaptchaTimeoutMs,
        );

        if (!waitedForGoogleSorry) {
          await waitForRecaptchaSolve(page, recaptchaTimeoutMs);
        }

        await waitForPageToSettle(page);
      }
    }

    const content = await page.content();
    const finalUrl = page.url();
    const title = await page.title();
    const resultCookies = await browser.cookies();
    return { content, cookies: resultCookies, finalUrl, title };
  } catch (error) {
    console.log(`Error during get puppeteer: ${error}`);
    throw new Error(`Error during get puppeteer: ${error}`);
  } finally {
    if (!page.isClosed()) {
      await page.close();
    }

    if (browser.connected) {
      await browser.close();
    }
  }
};
