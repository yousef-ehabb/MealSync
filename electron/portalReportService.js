import { chromium } from 'playwright';

const LOGIN_URL = 'https://al-zahraa.mans.edu.eg/studentLogin';

const activeReportBrowsers = new Set();

export async function abortActiveReportBrowsers() {
    for (const browser of activeReportBrowsers) {
        try {
            await browser.close();
        } catch (e) {
            console.error('[MealReport] Error closing browser during abort:', e);
        }
    }
    activeReportBrowsers.clear();
}

/**
 * Scrape the meal report from the university portal.
 * Reuses the same login flow as bookingService.
 * @param {string} studentId
 * @param {string} password
 * @returns {Promise<{ period: string, meals: Array, summary: { total: number, received: number, missed: number } }>}
 */
export async function getMealReport(studentId, password) {
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    activeReportBrowsers.add(browser);

    const page = await browser.newPage();

    try {
        // Step 1: Login (same flow as booking.js)
        await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 20000 });

        const idInput = page.locator('input[name="txtStudentID"]');
        await idInput.clear();
        await idInput.fill(studentId, { delay: 10 });

        const passInput = page.locator('input[name="txtStudentPassword"]');
        await passInput.clear();
        await passInput.fill(password, { delay: 10 });

        await page.getByRole('button', { name: 'دخول' }).click();

        // Wait for the page to redirect away from login (or show error on same page)
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
            const err = new Error('Invalid Student ID or password');
            err.isExplicitRejection = true;
            throw err;
        }

        // Wait for page to be fully loaded after redirect
        try {
            await page.waitForLoadState('networkidle', { timeout: 15000 });
        } catch (e) {
            // Non-fatal
        }

        // Step 2: Navigate to meal report
        // The portal uses a sidebar/hamburger menu. Content loads via AJAX
        // on the same /studentHome URL — there is NO separate route.

        const mealsMenuLocator = page.locator([
            "//span[contains(text(),'الوجبـــــات')]",
            "//span[contains(text(),'الوجبات')]",
            "//a[contains(text(),'الوجبات')]",
            "//li[contains(.,'الوجبات')]//a",
        ].join(' | '));

        try {
            await mealsMenuLocator.first().waitFor({ state: 'visible', timeout: 15000 });
            await mealsMenuLocator.first().click();
        } catch (e) {
            // If meals menu not visible, try opening the hamburger menu first
            const hamburger = page.locator('.navbar-toggler, button.navbar-toggle, .hamburger, [data-toggle="offcanvas"]').first();
            try {
                await hamburger.click({ timeout: 5000 });
                await mealsMenuLocator.first().waitFor({ state: 'visible', timeout: 10000 });
                await mealsMenuLocator.first().click();
            } catch (e2) {
                throw new Error('Could not find meals menu on dashboard');
            }
        }

        // Wait for submenu to expand after clicking the meals menu item
        await page.waitForTimeout(2000); // Allow submenu animation

        // Use multiple strategies to find the meal report link
        const reportLink = page.locator([
            "//a[contains(.,'تقرير الوجبات')]",
            "//a[contains(.,'تقرير')]",
            "a[href*='report'], a[href*='Report']",
        ].join(' | '));

        try {
            await reportLink.first().waitFor({ state: 'visible', timeout: 10000 });
            await reportLink.first().click();
        } catch (e) {
            // Final fallback: use JavaScript to find and click the link
            const clicked = await page.evaluate(() => {
                const links = [...document.querySelectorAll('a')];
                const target = links.find(a =>
                    a.textContent.includes('تقرير') && a.offsetParent !== null
                );
                if (target) {
                    target.click();
                    return target.textContent.trim();
                }
                return null;
            });
            if (!clicked) {
                throw new Error('Could not find meal report link in submenu');
            }
        }

        // Content loads via AJAX on the same page — wait for network + table
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => { });

        await page.waitForSelector('table.table-bordered', { timeout: 30000 });

        // Step 3: Scrape the period subtitle (Robust Regex Search)
        const period = await page.evaluate(() => {
            // Check headers or sub-titles for explicit matches
            const textToSearch = document.body.innerText;
            // Lookup typical date ranges: "1/3/2026 - 8/3/2026" or "1/3/2026 إلى 8/3/2026"
            const match = textToSearch.match(/(\d{1,2}\/\d{1,2}\/\d{4})[\s\-إلى]+(\d{1,2}\/\d{1,2}\/\d{4})/);
            if (match) {
                return `${match[1]} – ${match[2]}`;
            }
            // Fallback strategy if regex fails but a structure exists
            const subtitleEl = document.querySelector('.sub-title') || document.querySelector('h4') || document.querySelector('.panel-title');
            if (subtitleEl) return subtitleEl.textContent.trim();

            return 'Current Period';
        });

        // Step 4: Scrape the meal table
        const meals = await page.$$eval('table.table-bordered tbody tr', (rows) =>
            rows.map((row) => ({
                date: row.cells[0]?.textContent.trim() ?? '',
                mealType: row.cells[1]?.textContent.trim() ?? '',
                received: row.cells[2]?.querySelector('img')?.src.includes('yes.png') ?? false,
            }))
        );

        // Step 5: Compute summary
        const total = meals.length;
        const received = meals.filter((m) => m.received).length;
        const missed = total - received;

        return { period, meals, summary: { total, received, missed } };
    } catch (error) {
        console.error('[MealReport] Error:', error.message);
        throw error;
    } finally {
        activeReportBrowsers.delete(browser);
        await browser.close();
    }
}
