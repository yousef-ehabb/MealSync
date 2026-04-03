// Changes: P1-6 (domcontentloaded + delay 30), P1-7 (electron-log),
// Fix A (batch checkbox reads), Fix B (dry-run), Fix C (webhook)
import { chromium } from 'playwright-core';
import { getChromiumPath } from './chromiumPath.js';
import fs from 'fs';
import { join } from 'path';
import log from 'electron-log';
import { PORTAL } from './portalConstants.js';
import { loginToPortal } from './loginHelper.js';

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 30000;

const activeBrowsers = new Set();
let cancellationVersion = 0;

export async function abortActiveBrowsers() {
    cancellationVersion += 1;
    const browsers = [...activeBrowsers];
    activeBrowsers.clear();

    for (const browser of browsers) {
        try {
            await browser.close();
        } catch (e) {
            log.error('[Booking] Error closing browser during abort:', e);
        }
    }
}

/**
 * Run the full booking flow with progress streaming and retry logic.
 * @param {string} studentId
 * @param {string} password
 * @param {object} options
 * @param {boolean} options.headless - run browser headless (default true)
 * @param {function} options.onProgress - callback({ step, message })
 * @param {boolean} options.dryRun - report what would be booked without saving (Fix B)
 * @param {string} options.webhookUrl - optional URL to POST results to (Fix C)
 * @returns {Promise<object>} - { success, message, bookedCount, alreadyBookedCount }
 */
export async function runBooking(studentId, password, options = {}) {
    const { headless = true, onProgress = () => { }, sessionPath = null, dryRun = false, webhookUrl = null } = options;
    let lastError = null;
    const startingCancellationVersion = cancellationVersion;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            if (startingCancellationVersion !== cancellationVersion) {
                const cancelError = new Error('BOOKING_CANCELLED');
                cancelError.isExplicitRejection = true;
                throw cancelError;
            }

            if (attempt > 1) {
                onProgress({
                    step: 'retrying',
                    attempt,
                    maxAttempts: MAX_ATTEMPTS,
                    message: `Attempt ${attempt} of ${MAX_ATTEMPTS}...`,
                });
            }

            const result = await executeBooking(
                studentId,
                password,
                headless,
                onProgress,
                sessionPath,
                dryRun,
                startingCancellationVersion
            );

            // Fix C: Send webhook notification on success
            if (webhookUrl) {
                await sendWebhook(webhookUrl, 'booking_complete', result);
            }

            return result;
        } catch (error) {
            lastError = error;

            // If the server explicitly rejected the request (e.g., bad credentials), do NOT retry
            if (error.isExplicitRejection) {
                throw error;
            }

            if (attempt < MAX_ATTEMPTS) {
                onProgress({
                    step: 'retrying',
                    attempt,
                    maxAttempts: MAX_ATTEMPTS,
                    message: `Network unstable, retrying in 30 seconds... (Attempt ${attempt}/${MAX_ATTEMPTS})`,
                });
                await delay(RETRY_DELAY_MS);
            }
        }
    }

    // Fix C: Send webhook notification on final failure
    if (webhookUrl && lastError) {
        await sendWebhook(webhookUrl, 'booking_failed', { message: lastError.message });
    }

    throw lastError || new Error('Meal booking failed - Network timeout or system unreachable after 3 attempts');
}

export async function validateCredentials(studentId, password) {
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
    } catch (error) {
        if (
            error.message.includes("Executable doesn't exist") ||
            error.message.includes('Failed to launch') ||
            error.message.includes('chromium')
        ) {
            const friendlyError = new Error(
                'Browser component not found. Please reinstall MealSync.'
            );
            friendlyError.isExplicitRejection = true;
            throw friendlyError;
        }
        throw error;
    }

    activeBrowsers.add(browser);

    try {
        const page = await browser.newPage();

        await loginToPortal(page, studentId, password);

        // Scrape student name from the sidebar profile
        let studentName = null;
        try {
            const nameEl = page.locator(PORTAL.SELECTORS.NAV_PROFILE_NAME);
            await nameEl.waitFor({ state: 'visible', timeout: 5000 });
            const rawName = await nameEl.textContent();
            studentName = rawName?.replace(/\s+/g, ' ').trim() || null;
        } catch (err) {
            log.error(`[Booking] Failed to scrape name: ${err.message}`);
            // Name scraping is best-effort, don't fail validation
        }
        return { success: true, studentName };
    } catch (error) {
        log.error('[Booking] Validation error:', error.message);

        // On timeout, re-check if the error message appeared (credentials might be wrong
        // but the portal was slow to render the error)
        if (error.message.includes('Timeout') || error.message.includes('timeout')) {
            return { success: false, error: 'System taking too long to respond', type: 'timeout' };
        }

        return { success: false, error: 'Network error or system unreachable', type: 'network' };
    } finally {
        activeBrowsers.delete(browser);
        await browser.close();
    }
}

async function executeBooking(studentId, password, headless, onProgress, sessionPath = null, dryRun = false, expectedCancellationVersion = cancellationVersion) {
    let browser;
    try {
        browser = await chromium.launch({
            executablePath: getChromiumPath(),
            headless,
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
    } catch (error) {
        if (
            error.message.includes("Executable doesn't exist") ||
            error.message.includes('Failed to launch') ||
            error.message.includes('chromium')
        ) {
            const friendlyError = new Error(
                'Browser component not found. Please reinstall MealSync.'
            );
            friendlyError.isExplicitRejection = true;
            throw friendlyError;
        }
        throw error;
    }

    activeBrowsers.add(browser);

    if (!activeBrowsers.has(browser) || expectedCancellationVersion !== cancellationVersion) {
        await browser.close().catch(() => { });
        const err = new Error('BOOKING_CANCELLED');
        err.isExplicitRejection = true;
        throw err;
    }

    const page = await browser.newPage();

    try {
        // Step 1: Login
        onProgress({ step: 'login', message: 'Logging into AU Portal...' });
        await loginToPortal(page, studentId, password, { typeDelay: 100 });

        // ── Session save: persist cookies so portalReportService can reuse them ──
        if (sessionPath) {
            try {
                const state = await page.context().storageState();
                fs.writeFileSync(sessionPath, JSON.stringify({ ...state, savedAt: Date.now() }), 'utf-8');
            } catch (e) {
                log.warn('[Booking] Could not save session state:', e.message);
            }
        }

        // Wait for page to be fully loaded after redirect
        try {
            await page.waitForLoadState('networkidle', { timeout: 15000 });
        } catch (e) {
            // Non-fatal, fallback to DOM state resolution
        }

        // Step 2: Navigate to meals page
        onProgress({ step: 'navigating', message: 'Opening Meals page...' });

        // Look for the meals menu item — try multiple selectors
        const mealsMenuLocator = page.locator([
            `//span[contains(text(),'${PORTAL.TEXT.MEALS_NAV}')]`,
            `//span[contains(text(),'${PORTAL.TEXT.MEALS_NAV_SHORT}')]`,
            `//a[contains(text(),'${PORTAL.TEXT.MEALS_NAV_SHORT}')]`,
            `//li[contains(.,'${PORTAL.TEXT.MEALS_NAV_SHORT}')]//a`,
        ].join(' | '));

        try {
            await mealsMenuLocator.first().waitFor({ state: 'visible', timeout: 15000 });
        } catch (e) {
            throw new Error('Could not find meals menu item on dashboard');
        }

        await mealsMenuLocator.first().click();

        // Wait for the submenu/booking link to appear
        const getMealsLink = page.locator('a#getMeals span')
            .or(page.locator('a#getMeals'))
            .or(page.locator('a[href*="mealsBooking"]'))
            .or(page.locator(`//a[contains(.,'${PORTAL.TEXT.BOOK_MEALS_LINK}')]`));

        try {
            await getMealsLink.first().waitFor({ state: 'visible', timeout: 10000 });
            await getMealsLink.first().click();
        } catch (e) {
            // Try direct navigation as fallback
            await page.locator('a[href*="meal"]').first().click().catch(() => { });
        }

        // Wait for the booking page content to load
        try {
            await page.waitForLoadState('networkidle', { timeout: 15000 });
        } catch (e) {
            // Non-fatal
        }

        const checkboxLocator = page.locator(PORTAL.SELECTORS.MEAL_CHECKBOX).or(page.locator('input[type="checkbox"]'));
        const saveButtonLocator = page.getByRole('button', { name: PORTAL.TEXT.SAVE_BUTTON }).or(page.locator(`text=${PORTAL.TEXT.SAVE_BUTTON}`));

        try {
            await Promise.race([
                checkboxLocator.first().waitFor({ state: 'attached', timeout: 15000 }),
                saveButtonLocator.first().waitFor({ state: 'visible', timeout: 15000 })
            ]);
        } catch (e) {
            throw new Error(`Meals page failed to load content dynamically or timed out.`);
        }

        // Step 3: Book meals
        onProgress({ step: 'booking', message: 'Booking available meals...' });

        // Fix A: Batch checkbox reads — single round-trip to read all states
        const checkboxData = await page.$$eval(
            `${PORTAL.SELECTORS.MEAL_CHECKBOX}, input[type="checkbox"]`,
            els => els.map(el => ({ checked: el.checked, value: el.value || '' }))
        );

        const totalCheckboxes = checkboxData.length;
        let bookedCount = 0;
        let alreadyBookedCount = 0;
        const newlyBookedDates = [];
        const alreadyBookedDates = [];
        const failedDates = [];

        for (let i = 0; i < totalCheckboxes; i++) {
            const { checked, value } = checkboxData[i];
            const date = value?.split('|')[0] || `Meal ${i + 1}`;

            if (checked) {
                alreadyBookedCount++;
                alreadyBookedDates.push(date);
            } else {
                // Fix B: In dry-run mode, don't actually check the box
                if (dryRun) {
                    bookedCount++;
                    newlyBookedDates.push(date);
                } else {
                    try {
                        await checkboxLocator.nth(i).check({ timeout: 5000 });
                        bookedCount++;
                        newlyBookedDates.push(date);
                    } catch (err) {
                        failedDates.push({ date, reason: err.message });
                        log.error(`[Booking] Checkbox ${i} error:`, err.message);
                    }
                }
            }
        }

        // Fix B: In dry-run mode, return early without saving
        if (dryRun) {
            return {
                success: true,
                dryRun: true,
                message: `Dry run complete — would book ${bookedCount} meal(s)`,
                bookedCount,
                alreadyBookedCount,
                wouldBookDates: newlyBookedDates,
                alreadyBookedDates,
                totalAvailable: totalCheckboxes,
            };
        }

        // Step 4: Save
        if (bookedCount > 0) {
            onProgress({ step: 'saving', message: 'Saving your bookings...' });
            try {
                await saveButtonLocator.click({ timeout: 5000 });
                const okButton = page.getByRole('button', { name: 'Ok' });
                await okButton.waitFor({ state: 'visible', timeout: 15000 });
                await okButton.click({ timeout: 5000 });
                await okButton.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => { });
            } catch (err) {
                log.error('[Booking] Save action error:', err.message);
                throw new Error('Meals saved but confirmation prompt failed or timed out.');
            }
        }

        return {
            success: true,
            message:
                bookedCount > 0
                    ? `Successfully booked ${bookedCount} new meal(s)`
                    : 'All available meals are already booked',
            bookedCount,
            alreadyBookedCount,
            newlyBookedDates,
            alreadyBookedDates,
            failedDates,
            totalAvailable: totalCheckboxes,
        };
    } catch (error) {
        throw error;
    } finally {
        activeBrowsers.delete(browser);
        await browser.close();
    }
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fix C: Webhook notification helper — never includes credentials, never affects booking result
async function sendWebhook(webhookUrl, event, result) {
    try {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event,
                timestamp: new Date().toISOString(),
                result: {
                    success: result.success,
                    message: result.message,
                    bookedCount: result.bookedCount,
                    alreadyBookedCount: result.alreadyBookedCount,
                    dryRun: result.dryRun || false,
                },
            }),
        });
    } catch (err) {
        log.warn('[Booking] Webhook delivery failed (non-fatal):', err.message);
    }
}
