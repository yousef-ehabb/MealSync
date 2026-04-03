import { chromium } from 'playwright-core';
import { getChromiumPath } from './chromiumPath.js';
import fs from 'fs';
import log from 'electron-log';
import { PORTAL } from './portalConstants.js';
import { loginToPortal } from './loginHelper.js';

const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes

const activeReportBrowsers = new Set();

export async function abortActiveReportBrowsers() {
    for (const browser of activeReportBrowsers) {
        try {
            await browser.close();
        } catch (e) {
            log.error('[MealReport] Error closing browser during abort:', e);
        }
    }
    activeReportBrowsers.clear();
}

/**
 * Load and validate a saved session file. Returns the parsed state or null if
 * the file is missing, unreadable, or older than SESSION_TTL_MS.
 */
function loadSessionState(sessionPath) {
    if (!sessionPath) return null;
    try {
        const raw = fs.readFileSync(sessionPath, 'utf-8');
        const state = JSON.parse(raw);
        const age = Date.now() - (state.savedAt || 0);
        if (age > SESSION_TTL_MS) {
            log.info(`[MealReport] Session expired: age=${age}ms > TTL=${SESSION_TTL_MS}ms. Will do full login.`);
            return null;
        }
        return state;
    } catch {
        return null;
    }
}

/**
 * Delete the session file so the next run starts with a clean login.
 */
function invalidateSession(sessionPath) {
    if (!sessionPath) return;
    try {
        fs.unlinkSync(sessionPath);
    } catch {
        // File may not exist; ignore
    }
}

/**
 * Scrape the meal report from the university portal.
 * If a valid session.json exists (written by booking.js after a successful
 * booking), the login step is skipped and we jump straight to the report page.
 *
 * @param {string} studentId
 * @param {string} password
 * @param {{ sessionPath?: string }} [options]
 * @returns {Promise<{ period: string, meals: Array, summary: object }>}
 */
export async function getMealReport(studentId, password, options = {}) {
    const { sessionPath = null } = options;

    const sessionState = loadSessionState(sessionPath);
    const usingSession = !!sessionState;

    if (usingSession) {
        log.info('[MealReport] Reusing saved session — skipping login.');
    }

    let browser;
    try {
        browser = await chromium.launch({
            executablePath: getChromiumPath(),
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--disable-extensions',
                '--disable-background-timer-throttling',
                '--disable-renderer-backgrounding',
                '--disable-backgrounding-occluded-windows',
                '--disable-dev-shm-usage',
            ],
        });
        activeReportBrowsers.add(browser);
    } catch (launchError) {
        log.error('[MealReport] Browser launch failed:', launchError.message);
        throw launchError;
    }

    // Create the context: use cached cookies if available, otherwise fresh
    const context = usingSession
        ? await browser.newContext({ storageState: sessionState })
        : await browser.newContext();

    const page = await context.newPage();

    try {
        if (usingSession) {
            // Navigate directly to the home page — session should keep us logged in
            await page.goto(PORTAL.HOME_URL, {
                waitUntil: 'networkidle',
                timeout: 20000,
            });

            // Verify we are actually logged in (not bounced back to login page)
            if (page.url().includes('studentLogin')) {
                log.warn('[MealReport] Session invalid — falling back to full login.');
                invalidateSession(sessionPath);
                await loginToPortal(page, studentId, password);
            }
        } else {
            // Step 1: Full login
            await loginToPortal(page, studentId, password);
        }

        // Wait for page to be fully loaded after redirect
        try {
            await page.waitForLoadState('networkidle', { timeout: 15000 });
        } catch (e) {
            // Non-fatal
        }

        // Step 2: Navigate to meal report
        const mealsMenuLocator = page.locator([
            `//span[contains(text(),'${PORTAL.TEXT.MEALS_NAV}')]`,
            `//span[contains(text(),'${PORTAL.TEXT.MEALS_NAV_SHORT}')]`,
            `//a[contains(text(),'${PORTAL.TEXT.MEALS_NAV_SHORT}')]`,
            `//li[contains(.,'${PORTAL.TEXT.MEALS_NAV_SHORT}')]//a`,
        ].join(' | '));

        try {
            await mealsMenuLocator.first().waitFor({ state: 'visible', timeout: 15000 });
            await mealsMenuLocator.first().click();
        } catch (e) {
            const hamburger = page.locator('.navbar-toggler, button.navbar-toggle, .hamburger, [data-toggle="offcanvas"]').first();
            try {
                await hamburger.click({ timeout: 5000 });
                await mealsMenuLocator.first().waitFor({ state: 'visible', timeout: 10000 });
                await mealsMenuLocator.first().click();
            } catch (e2) {
                throw new Error('Could not find meals menu on dashboard');
            }
        }

        await page.waitForTimeout(2000); // Allow submenu animation

        const reportLink = page.locator([
            `//a[contains(.,'${PORTAL.TEXT.MEAL_REPORT_LINK}')]`,
            `//a[contains(.,'${PORTAL.TEXT.REPORT_KEYWORD}')]`,
            "a[href*='report'], a[href*='Report']",
        ].join(' | '));

        try {
            await reportLink.first().waitFor({ state: 'visible', timeout: 10000 });
            await reportLink.first().click();
        } catch (e) {
            const clicked = await page.evaluate((keyword) => {
                const links = [...document.querySelectorAll('a')];
                const target = links.find(a =>
                    a.textContent.includes(keyword) && a.offsetParent !== null
                );
                if (target) { target.click(); return target.textContent.trim(); }
                return null;
            }, PORTAL.TEXT.REPORT_KEYWORD);
            if (!clicked) throw new Error('Could not find meal report link in submenu');
        }

        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => { });
        await page.waitForSelector('table.table-bordered', { timeout: 30000 });

        // Step 3: Scrape period
        const period = await page.evaluate(() => {
            const textToSearch = document.body.innerText;
            const match = textToSearch.match(/(\d{1,2}\/\d{1,2}\/\d{4})[\s\-إلى]+(\d{1,2}\/\d{1,2}\/\d{4})/);
            if (match) return `${match[1]} – ${match[2]}`;
            const el = document.querySelector('.sub-title') || document.querySelector('h4') || document.querySelector('.panel-title');
            return el ? el.textContent.trim() : 'Current Period';
        });

        // Step 4: Scrape meal table
        const meals = await page.$$eval('table.table-bordered tbody tr', (rows) =>
            rows.map((row) => ({
                date: row.cells[0]?.textContent.trim() ?? '',
                mealType: row.cells[1]?.textContent.trim() ?? '',
                received: row.cells[2]?.querySelector('img')?.src.includes('yes.png') ?? false,
            }))
        );

        const total = meals.length;
        const received = meals.filter((m) => m.received).length;
        const missed = total - received;

        return { period, meals, summary: { total, received, missed } };
    } catch (error) {
        // If we tried to use a session and it caused an error, invalidate it
        if (usingSession) invalidateSession(sessionPath);
        log.error('[MealReport] Error:', error.message);
        throw error;
    } finally {
        if (browser) {
            activeReportBrowsers.delete(browser);
            await browser.close().catch(() => {});
        }
    }
}
