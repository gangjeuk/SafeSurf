import { scrapPage } from '@src/scrapper/common';
import { checkTargetUrl, scrapYouTube } from '@src/scrapper/youtube';

async function readyPageLoad() {
  // check if dom content has already been loaded
  if (document.readyState !== 'complete') {
    // @note This can take _a while_, but is in place to account for apps that
    // may not have built the dom yet
    await new Promise(resolve => {
      document.onreadystatechange = () => {
        if (document.readyState === 'complete') {
          resolve(null);
        }
      };
    });

    console.log('%cready.', 'color:green;font-size:12px;', document.readyState);
  }

  // Wait for the dom to be ready.
  // FIXME: Code unclear and Cannot handle SPA page
  await new Promise(resolve => {
    // Wait for dom to stop changing for at least 1 second
    let len = document.body?.innerText?.length || 0;
    let timeout: ReturnType<typeof window.setTimeout> | null = null;
    let timeout2: ReturnType<typeof window.setTimeout> | null = null;

    const fn = () => {
      const newLen = document.body?.innerText?.length || 0;
      if (newLen === len) {
        clearTimeout(timeout2);
        resolve(null);
      } else {
        console.log('fttf :: wait :: still waiting for dom to stop changing');
        len = newLen;
        timeout = setTimeout(fn, 3000);
      }
    };

    // kick it off
    timeout = setTimeout(fn, 3000);

    // Resolve regardless if too much time ellapses
    timeout2 = setTimeout(() => {
      clearTimeout(timeout);
      resolve(null);
    }, 10000);
  });
}

async function main() {
  // TODO: Check if we actually need to index the page before continuing. What
  // comes next is likely expensive to run on every page load all the time. May
  // also consider moving it to web worker.

  // TODO: implement inital communication

  // Wait for an idle moment so that we don't cause any dropped frames (hopefully)
  await new Promise(resolve => requestIdleCallback(resolve));

  if (checkTargetUrl()) {
    const youtube = await scrapYouTube();
    if (youtube) {
      chrome.runtime.sendMessage({ type: 'do_index', data: youtube });
    } else {
      const page = await scrapPage();
      chrome.runtime.sendMessage({ type: 'do_index', data: page });
    }
  } else {
    const page = await scrapPage();
    chrome.runtime.sendMessage({ type: 'do_index', data: page });
  }
}

// Plumbing
(async () => {
  // Event listener
  document.addEventListener('content.ytInitialPlayerResponse', function (e) {
    // e.detail contains the transferred data (can be anything, ranging
    // from JavaScript objects to strings).
    // Do something, for example:
    console.log(e.detail);
    window.ytInitialPlayerResponse = e.detail;
    console.log('content.ytInitialPlayerResponse', window);
    main();
  });

  // listen for browser push state updates and hash changes
  window.addEventListener('popstate', async () => {
    console.log('%cpopstate', 'color:orange;font-size:18px;', location.toString());
    await readyPageLoad();
    main();
  });

  await readyPageLoad();
  await main();
})();
