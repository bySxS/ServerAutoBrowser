import puppeteer, { Cookie, Page } from 'puppeteer';

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

async function waitForPageToSettle(page: Page) {
  await Promise.allSettled([
    page.waitForNetworkIdle({ idleTime: 750, timeout: 10000 }),
    page.waitForNavigation({
      waitUntil: ['domcontentloaded', 'networkidle0', 'networkidle2', 'load'],
      timeout: 10000,
    }),
  ]);
}

export const openBrowserPuppeteer = async (
  url: string,
  cookies?: Cookie[],
  actions?: Action[],
): Promise<BrowserOpenResult> => {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1920, height: 1080 },
  });
  const page = await browser.newPage();

  await page.setRequestInterception(true);

  page.on('request', request => {
    const resourceType = request.resourceType();
    const requestUrl = request.url();

    const blockedTypes = ['image', 'stylesheet', 'font', 'media'];
    if (blockedTypes.includes(resourceType)) {
      request.abort();
      return;
    }

    try {
      const currentPageUrl = page.url();
      const pageHost = currentPageUrl ? new URL(currentPageUrl).hostname : '';
      const requestHost = new URL(requestUrl).hostname;
      console.log('pageHost', pageHost, 'requestHost', requestHost);

      if (
        pageHost &&
        !requestHost.includes(pageHost) &&
        !requestHost.includes('cloudflare')
      ) {
        console.log(`Blocked: ${requestUrl}`);
        request.abort();
        return;
      }
    } catch (error) {
      console.log(`Request inspection error: ${error}`);
    }

    request.continue();
  });

  if (cookies && Array.isArray(cookies)) {
    await browser.setCookie(...cookies);
  }

  try {
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

    const content = await page.content();
    const finalUrl = page.url();
    const title = await page.title();
    const cookies = await browser.cookies();
    await browser.close();
    return { content, cookies, finalUrl, title };
  } catch (error) {
    await browser.close();
    console.log(`Error during get puppeteer: ${error}`);
    throw new Error(`Error during get puppeteer: ${error}`);
  }
};
