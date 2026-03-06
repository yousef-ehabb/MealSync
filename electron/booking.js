import { chromium } from 'playwright';

const LOGIN_URL = 'https://al-zahraa.mans.edu.eg/studentLogin';
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 30000;

const activeBrowsers = new Set();

export async function abortActiveBrowsers() {
    for (const browser of activeBrowsers) {
        try {
            await browser.close();
        } catch (e) {
            console.error('[Booking] Error closing browser during abort:', e);
        }
    }
    activeBrowsers.clear();
}

/**
 * Run the full booking flow with progress streaming and retry logic.
 * @param {string} studentId
 * @param {string} password
 * @param {object} options
 * @param {boolean} options.headless - run browser headless (default true)
 * @param {function} options.onProgress - callback({ step, message })
 * @returns {Promise<object>} - { success, message, bookedCount, alreadyBookedCount }
 */
export async function runBooking(studentId, password, options = {}) {
    const { headless = true, onProgress = () => { } } = options;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            if (attempt > 1) {
                onProgress({
                    step: 'retrying',
                    message: `Attempt ${attempt} of ${MAX_ATTEMPTS}...`,
                });
            }

            const result = await executeBooking(studentId, password, headless, onProgress);
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
                    message: `Network unstable, retrying in 30 seconds... (Attempt ${attempt}/${MAX_ATTEMPTS})`,
                });
                await delay(RETRY_DELAY_MS);
            }
        }
    }

    throw lastError || new Error('Meal booking failed - Network timeout or system unreachable after 3 attempts');
}

export async function validateCredentials(studentId, password) {
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    activeBrowsers.add(browser);

    try {
        const page = await browser.newPage();
        // Wait for networkidle to ensure all scripts are loaded
        await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 20000 });

        // Clear and fill with delay to mimic human typing
        const idInput = page.locator('input[name="txtStudentID"]');
        await idInput.clear();
        await idInput.fill(studentId, { delay: 10 });

        const passInput = page.locator('input[name="txtStudentPassword"]');
        await passInput.clear();
        await passInput.fill(password, { delay: 10 });

        await page.getByRole('button', { name: 'دخول' }).click();

        // Wait for either successful login OR error message
        const loginResult = await Promise.race([
            page.waitForURL('**/studentHome**', { timeout: 15000 }).then(() => 'success'),
            page.waitForSelector('#spErr:visible', { timeout: 15000 }).then(() => 'error'),
        ]);

        if (loginResult === 'error') {
            const errorText = await page.locator('#spErr').textContent();
            return { success: false, error: `Login failed: ${errorText.trim()}`, type: 'invalid_credentials' };
        }

        // Scrape student name from the sidebar profile
        let studentName = null;
        try {
            const nameEl = page.locator('.nav-profile-text .font-weight-bold');
            await nameEl.waitFor({ state: 'visible', timeout: 5000 });
            const rawName = await nameEl.textContent();
            studentName = rawName?.replace(/\s+/g, ' ').trim() || null;
        } catch (err) {
            console.error(`[Booking] Failed to scrape name: ${err.message}`);
            // Name scraping is best-effort, don't fail validation
        }
        return { success: true, studentName };
    } catch (error) {
        console.error('[Booking] Validation error:', error.message);

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

async function executeBooking(studentId, password, headless, onProgress) {
    const browser = await chromium.launch({
        headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    activeBrowsers.add(browser);

    const page = await browser.newPage();

    try {
        // Step 1: Login
        onProgress({ step: 'login', message: 'Logging into AU Portal...' });
        await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 20000 });

        // Clear and fill with delay to mimic human typing
        const idInput = page.locator('input[name="txtStudentID"]');
        await idInput.clear();
        await idInput.fill(studentId, { delay: 100 });

        const passInput = page.locator('input[name="txtStudentPassword"]');
        await passInput.clear();
        await passInput.fill(password, { delay: 100 });

        await page.getByRole('button', { name: 'دخول' }).click();

        // Wait for the page to redirect away from login (or show error on same page)
        // Use Promise.race: either URL changes (success) or error message appears (failure)
        const loginOutcome = await Promise.race([
            page.waitForURL('**/studentHome**', { timeout: 25000 })
                .then(() => 'redirected')
                .catch(() => 'timeout'),
            page.locator('text=بيانات غير صحيحة').first()
                .waitFor({ state: 'visible', timeout: 25000 })
                .then(() => 'invalid_credentials')
                .catch(() => 'timeout'),
        ]);

        if (loginOutcome === 'invalid_credentials') {
            const err = new Error('Login failed - Invalid Student ID or Password');
            err.isExplicitRejection = true;
            throw err;
        }

        // If neither redirect nor error — check if we somehow landed on the dashboard
        if (loginOutcome === 'timeout') {
            // Double-check: maybe the page redirected but to a slightly different URL
            const currentUrl = page.url();
            if (currentUrl.includes('studentLogin')) {
                throw new Error('Login wait timed out - page did not redirect from login');
            }
            // If we're on a new URL, proceed
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
            "//span[contains(text(),'الوجبـــــات')]",
            "//span[contains(text(),'الوجبات')]",
            "//a[contains(text(),'الوجبات')]",
            "//li[contains(.,'الوجبات')]//a",
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
            .or(page.locator("//a[contains(.,'حجز الوجبات')]"));

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

        const checkboxLocator = page.locator('input[name="chkMeals"]').or(page.locator('input[type="checkbox"]'));
        const saveButtonLocator = page.getByRole('button', { name: 'حفظ' }).or(page.locator('text=حفظ'));

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
        const totalCheckboxes = await checkboxLocator.count();
        let bookedCount = 0;
        let alreadyBookedCount = 0;
        const newlyBookedDates = [];
        const alreadyBookedDates = [];
        const failedDates = [];

        for (let i = 0; i < totalCheckboxes; i++) {
            try {
                const checkbox = checkboxLocator.nth(i);
                await checkbox.waitFor({ state: 'attached', timeout: 5000 });
                const isChecked = await checkbox.isChecked();
                const value = await checkbox.getAttribute('value');
                const date = value?.split('|')[0] || `Meal ${i + 1}`;

                if (isChecked) {
                    alreadyBookedCount++;
                    alreadyBookedDates.push(date);
                } else {
                    await checkbox.check({ timeout: 5000 });
                    bookedCount++;
                    newlyBookedDates.push(date);
                }
            } catch (err) {
                const value = await checkboxLocator.nth(i).getAttribute('value').catch(() => null);
                const date = value?.split('|')[0] || `Meal ${i + 1}`;
                failedDates.push({ date, reason: err.message });
                console.error(`[Booking] Checkbox ${i} error:`, err.message);
            }
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
                console.error('[Booking] Save action error:', err.message);
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
