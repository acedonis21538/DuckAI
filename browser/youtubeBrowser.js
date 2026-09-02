'use strict';

const { chromium } = require('playwright');

let browser = null;
let context = null;
let page = null;

async function startBrowser() {
if (browser) {
return { browser, context, page };
}

console.log('🌐 Starting Chromium...');

browser = await chromium.launch({
    headless: false,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
    ]
});

context = await browser.newContext({
    viewport: {
        width: 1280,
        height: 720
    }
});

page = await context.newPage();

console.log('✅ Chromium started.');

return {
    browser,
    context,
    page
};

}

async function openYouTube() {
const session = await startBrowser();

console.log('🔎 Opening YouTube...');

await session.page.goto('https://www.youtube.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
});

console.log('✅ YouTube opened.');

return session.page;

}

async function closeBrowser() {
if (browser) {
console.log('🌐 Closing Chromium...');

    await browser.close();

    browser = null;
    context = null;
    page = null;

    console.log('✅ Chromium closed.');
}

}

module.exports = {
startBrowser,
openYouTube,
closeBrowser
};
