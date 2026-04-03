// electron/loginHelper.js
// Shared portal login utility used by booking.js and portalReportService.js.
// Fills credentials, submits the form, and waits for redirect or explicit rejection.

import { PORTAL } from './portalConstants.js';

/**
 * Navigate to the login page, fill credentials, submit, and wait for outcome.
 *
 * @param {import('playwright').Page} page
 * @param {string} studentId
 * @param {string} password
 * @param {object} [options]
 * @param {number} [options.typeDelay=30] - Keystroke delay in ms (mimics human typing)
 * @param {number} [options.timeout=25000] - Max wait for redirect/error in ms
 * @throws {Error} with err.isExplicitRejection = true for invalid credentials
 * @throws {Error} for timeout or navigation failures
 */
export async function loginToPortal(page, studentId, password, {
    typeDelay = 30,
    timeout = 25000,
} = {}) {
    await page.goto(PORTAL.LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });

    const idInput = page.locator(PORTAL.SELECTORS.STUDENT_ID_INPUT);
    await idInput.waitFor({ state: 'visible', timeout: 10000 });
    await idInput.clear();
    await idInput.fill(studentId, { delay: typeDelay });

    const passInput = page.locator(PORTAL.SELECTORS.PASSWORD_INPUT);
    await passInput.clear();
    await passInput.fill(password, { delay: typeDelay });

    await page.getByRole('button', { name: PORTAL.TEXT.LOGIN_BUTTON }).click();

    const outcome = await Promise.race([
        page.waitForURL(PORTAL.HOME_URL_PATTERN, { timeout })
            .then(() => 'redirected')
            .catch(() => 'timeout'),
        page.locator(`text=${PORTAL.TEXT.LOGIN_ERROR}`).first()
            .waitFor({ state: 'visible', timeout })
            .then(() => 'invalid_credentials')
            .catch(() => 'timeout'),
    ]);

    if (outcome === 'invalid_credentials') {
        const err = new Error('Login failed — Invalid Student ID or Password');
        err.isExplicitRejection = true;
        throw err;
    }

    if (page.url().includes('studentLogin')) {
        throw new Error('Login timed out — page did not redirect from login screen');
    }
}
