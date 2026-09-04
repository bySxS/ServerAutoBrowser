import puppeteer, {
  type Browser,
  type Cookie,
  type ElementHandle,
  type Page,
} from 'puppeteer';

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
  userAgent: string;
}

export interface OpenBrowserOptions {
  waitForRecaptcha?: boolean;
  recaptchaTimeoutMs?: number;
}

const FULL_HD_VIEWPORT = { width: 1920, height: 1080 };

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
    '--lang=ru-RU',
    '--window-size=1920,1080',
  ];

  if (process.platform !== 'win32') {
    launchArgs.push('--disable-setuid-sandbox', '--no-sandbox');
  }

  return {
    headless,
    defaultViewport: headless ? FULL_HD_VIEWPORT : null,
    executablePath: executablePath || undefined,
    userDataDir,
    args: launchArgs,
  };
}

async function waitForRecaptchaSolve(
  page: Page,
  recaptchaTimeoutMs: number,
) {
  const recaptchaFrameSelector = [
    'iframe[src*="recaptcha"]',
    'iframe[src*="google.com/recaptcha"]',
    'iframe[src*="recaptcha.net"]',
    'iframe[src*="challenges.cloudflare.com"]',
  ].join(', ');

  const hasRecaptchaFrame = await page.$(recaptchaFrameSelector);
  if (!hasRecaptchaFrame) {
    return false;
  }

  console.log(`Captcha challenge detected, waiting up to ${recaptchaTimeoutMs}ms`);

  await page.waitForFunction(
    () => {
      const responseFields = Array.from(
        document.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>(
          'textarea[name="g-recaptcha-response"], input[name="g-recaptcha-response"], input[name="cf-turnstile-response"]',
        ),
      );

      const challengeFrame = document.querySelector(
        'iframe[src*="recaptcha"], iframe[src*="challenges.cloudflare.com"]',
      );

      return (
        responseFields.some(field => field.value.trim().length > 0) ||
        !challengeFrame
      );
    },
    { timeout: recaptchaTimeoutMs, polling: 1000 },
  );

  console.log('Captcha challenge appears to be solved');
  return true;
}

async function hasRecaptchaFrame(page: Page) {
  const recaptchaFrameSelector = [
    'iframe[src*="recaptcha"]',
    'iframe[src*="google.com/recaptcha"]',
    'iframe[src*="recaptcha.net"]',
    'iframe[src*="challenges.cloudflare.com"]',
    'input[name="cf-turnstile-response"]',
  ].join(', ');

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

async function applyStealthSettings(page: Page, headless: boolean) {
  await page.setExtraHTTPHeaders({
    'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
  });

  if (headless) {
    await page.setViewport(FULL_HD_VIEWPORT);
  }

  const browserContext = page.browserContext();
  await browserContext.overridePermissions('https://www.google.com', []);

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });

  });
}

async function prepareBrowserPage(browser: Browser): Promise<Page> {
  const existingPages = await browser.pages();
  const page = existingPages[0] ?? (await browser.newPage());

  await Promise.allSettled(
    existingPages
      .filter(existingPage => existingPage !== page)
      .map(existingPage => existingPage.close()),
  );

  return page;
}

async function createConfiguredPage(
  browser: Browser,
  cookies?: Cookie[],
  headless = true,
): Promise<Page> {
  const page = await prepareBrowserPage(browser);
  await applyStealthSettings(page, headless);

  if (cookies && Array.isArray(cookies)) {
    await browser.setCookie(...cookies);
  }

  return page;
}

async function navigatePage(
  page: Page,
  url: string,
) {
  console.log('goto', url);
  await page.goto(url, {
    waitUntil: ['domcontentloaded', 'networkidle0', 'networkidle2', 'load'],
    timeout: 1000000,
    referer: url,
  });
}

function normalizeActionSelector(selector: string) {
  const normalized = selector.trim();

  if (/^name=("[^"]+"|'[^']+')$/.test(normalized)) {
    return `[${normalized}]`;
  }

  return normalized;
}

async function waitForVisibleElement(
  page: Page,
  selector: string,
  timeout = 120000,
): Promise<ElementHandle<Element>> {
  const handle = await page.waitForFunction(
    currentSelector => {
      const elements = Array.from(document.querySelectorAll(currentSelector));

      return (
        elements.find(element => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();

          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            Number(style.opacity) !== 0 &&
            rect.width > 0 &&
            rect.height > 0
          );
        }) || false
      );
    },
    { polling: 100, timeout },
    selector,
  );
  const element = handle.asElement();

  if (!element) {
    await handle.dispose();
    throw new Error(`No visible element found for selector: ${selector}`);
  }

  return element as ElementHandle<Element>;
}

async function executeActions(page: Page, actions?: Action[]) {
  if (actions && Array.isArray(actions)) {
    console.log('actions:');

    const firstFillAction = actions.find(action => action.type === 'fill');
    if (firstFillAction) {
      const loginSelector = normalizeActionSelector(firstFillAction.selector);

      try {
        const loginElement = await waitForVisibleElement(page, loginSelector, 3000);
        await loginElement.dispose();
      } catch {
        console.log(
          `Login form ${loginSelector} is not visible; session is already authenticated, skipping actions`,
        );
        return;
      }
    }

    for (const action of actions) {
      const selector = normalizeActionSelector(action.selector);
      console.log(`Waiting for visible element ${selector}`);
      const element = await waitForVisibleElement(page, selector);
      let navigationPromise: ReturnType<Page['waitForNavigation']> | undefined;

      try {
        if (action.type === 'fill') {
          const { value } = action;
          console.log(`Filling field ${selector}`);
          await element.evaluate(currentElement => {
            const input = currentElement as
              | HTMLInputElement
              | HTMLTextAreaElement;
            input.focus();
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
          });
          await element.type(value);
        }

        if (action.type === 'click') {
          console.log(`Clicking element ${selector}`);
          navigationPromise = page.waitForNavigation({
            waitUntil: ['domcontentloaded', 'networkidle2'],
            timeout: 30000,
          });
          await element.click();
        }

        if (action.type === 'select') {
          const { value } = action;
          console.log(`Selecting value ${value} from ${selector}`);
          await element.evaluate((currentElement, selectedValue) => {
            const select = currentElement as HTMLSelectElement;
            select.value = selectedValue;
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
          }, value);
        }
      } finally {
        await element.dispose();
      }

      if (navigationPromise) {
        await Promise.allSettled([
          navigationPromise,
          page.waitForNetworkIdle({ idleTime: 750, timeout: 30000 }),
        ]);
        console.log(`Navigation after click finished at ${page.url()}`);
      } else if (action.type === 'select') {
        await page
          .waitForNetworkIdle({ idleTime: 750, timeout: 10000 })
          .catch(() => undefined);
      }
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
  const headless = !waitForRecaptcha;
  const browser = await puppeteer.launch(getBrowserLaunchOptions(headless));
  const page = await createConfiguredPage(browser, cookies, headless);

  try {
    await navigatePage(page, url);

    if (waitForRecaptcha) {
      const captchaDetected = await hasCaptcha(page);

      if (captchaDetected) {
        const waitedForGoogleSorry = await waitForGoogleSorryPageSolve(
          page,
          recaptchaTimeoutMs,
        );

        if (!waitedForGoogleSorry) {
          await waitForRecaptchaSolve(page, recaptchaTimeoutMs);
        }
      }
    }

    await executeActions(page, actions);

    const content = await page.content();
    const finalUrl = page.url();
    const title = await page.title();
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const resultCookies = await page.cookies(finalUrl);
    return { content, cookies: resultCookies, finalUrl, title, userAgent };
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
