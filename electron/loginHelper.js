// electron/loginHelper.js
// Shared portal login utility used by booking.js and portalReportService.js.
// Fills credentials, submits the form, and waits for redirect or explicit rejection.

import { PORTAL } from './portalConstants.js';
import log from 'electron-log';

/**
 * Navigate to the login page, fill credentials, submit, and wait for outcome.
 *
 * On invalid credentials the portal either:
 *   – shows an error string (matched against PORTAL.LOGIN_ERROR_PATTERNS), or
 *   – stays on / redirects back to the login page.
 * Both cases are detected and throw an error with `isExplicitRejection = true`.
 *
 * On success the portal redirects to studentHome.
 *
 * @param {import('playwright').Page} page
 * @param {string} studentId
 * @param {string} password
 * @param {object} [options]
 * @param {number} [options.typeDelay=30]  - Keystroke delay in ms (mimics human typing)
 * @param {number} [options.timeout=25000] - Max wait for redirect/error in ms
 * @throws {Error} with err.isExplicitRejection = true for invalid credentials
 * @throws {Error} for timeout or navigation failures
 */
export async function loginToPortal(page, studentId, password, {
    typeDelay = 30,
    timeout = 25000,
} = {}) {
    log.info('[Login] Navigating to portal login page...');
    await page.goto(PORTAL.LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });

    const idInput = page.locator(PORTAL.SELECTORS.STUDENT_ID_INPUT);
    await idInput.waitFor({ state: 'visible', timeout: 10000 });
    await idInput.clear();
    await idInput.fill(studentId, { delay: typeDelay });

    const passInput = page.locator(PORTAL.SELECTORS.PASSWORD_INPUT);
    await passInput.clear();
    await passInput.fill(password, { delay: typeDelay });

    log.info('[Login] Credentials entered, clicking login button...');
    await page.getByRole('button', { name: PORTAL.TEXT.LOGIN_BUTTON }).click();

    // ──────────────────────────────────────────────────────────
    // Race: successful redirect  vs.  error text on page
    //
    // IMPORTANT: We must NOT swallow rejections with .catch().
    // Previously, both arms had .catch(() => 'timeout') causing
    // BOTH to resolve when credentials were invalid, which let
    // the function return without throwing.
    //
    // NEW approach:
    //   1) Build a locator that matches ANY known error pattern.
    //   2) Race: redirect vs. error-visible vs. hard timeout.
    //   3) After the race, VERIFY the final URL to confirm we
    //      actually reached the authenticated home page.
    // ──────────────────────────────────────────────────────────

    // Build a single locator that matches any known error pattern
    const errorPatterns = PORTAL.LOGIN_ERROR_PATTERNS || [PORTAL.TEXT.LOGIN_ERROR];
    const errorSelector = errorPatterns
        .map(pattern => `text=${pattern}`)
        .join(' | ');
    // Also check the dedicated error span by ID
    const errorLocator = page.locator(errorSelector)
        .or(page.locator(PORTAL.SELECTORS.ERROR_SPAN));

    // Create an explicit hard timeout that always rejects
    const hardTimeout = new Promise((_resolve, reject) => {
        setTimeout(() => reject(new Error('LOGIN_TIMEOUT')), timeout);
    });

    let outcome;
    try {
        outcome = await Promise.race([
            // Arm 1: Successful redirect to student home
            page.waitForURL(PORTAL.HOME_URL_PATTERN, { timeout })
                .then(() => 'redirected'),

            // Arm 2: Portal shows an error message (invalid credentials)
            errorLocator.first()
                .waitFor({ state: 'visible', timeout })
                .then(() => 'invalid_credentials'),

            // Arm 3: Hard timeout — neither happened
            hardTimeout,
        ]);
    } catch (raceError) {
        // If the hard timeout fires (or any arm rejects unexpectedly),
        // do NOT silently succeed — check the page state explicitly.
        log.warn('[Login] Promise.race rejected, checking page state...', raceError.message);
        outcome = 'timeout';
    }

    log.info(`[Login] Race outcome: "${outcome}", current URL: ${page.url()}`);

    // ── Handle invalid credentials ──
    if (outcome === 'invalid_credentials') {
        // Try to scrape the actual error text for better error messages
        let portalErrorText = '';
        try {
            portalErrorText = await errorLocator.first().textContent({ timeout: 2000 });
            portalErrorText = portalErrorText?.trim() || '';
        } catch { /* best effort */ }

        log.warn('[Login] Portal rejected credentials.', { portalErrorText });
        const err = new Error(
            portalErrorText
                ? `خطأ فى البيانات: ${portalErrorText}`
                : 'خطأ فى البيانات'
        );
        err.isExplicitRejection = true;
        throw err;
    }

    // ── POST-RACE VERIFICATION ──
    // Even if outcome === 'redirected', verify we actually landed on
    // the authenticated home page. This catches edge cases where the
    // portal redirects to an intermediate page, CAPTCHA, or error page
    // that isn't studentHome or studentLogin.
    const finalUrl = page.url();

    // Still on login page → credentials were wrong or page didn't redirect
    if (finalUrl.includes('studentLogin')) {
        // One last check: maybe the error text appeared after the race settled
        const errorVisible = await errorLocator.first()
            .isVisible()
            .catch(() => false);

        if (errorVisible) {
            let portalErrorText = '';
            try {
                portalErrorText = await errorLocator.first().textContent({ timeout: 2000 });
                portalErrorText = portalErrorText?.trim() || '';
            } catch { /* best effort */ }

            const err = new Error(
                portalErrorText
                    ? `خطأ فى البيانات: ${portalErrorText}`
                    : 'خطأ فى البيانات'
            );
            err.isExplicitRejection = true;
            throw err;
        }

        // No error text visible but still on login page → timed out
        throw new Error('Login timed out — page did not redirect from login screen');
    }

    // Landed somewhere that is NOT studentHome → unknown state, fail safe
    if (!finalUrl.includes('studentHome')) {
        log.error(`[Login] Post-login URL is unexpected: ${finalUrl}. Failing safely.`);
        throw new Error(
            `Login resulted in unexpected page: ${finalUrl}. ` +
            'Portal may have changed or credentials may be invalid.'
        );
    }

    // ── SUCCESS ──
    log.info('[Login] Successfully authenticated and arrived at student home.');
}
