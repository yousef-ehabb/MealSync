import cron from 'node-cron';
import dns from 'dns';
import { Notification, app } from 'electron';
import { join } from 'path';
import log from 'electron-log';

const dnsPromises = dns.promises;

const PORTAL_HOSTNAME = 'al-zahraa.mans.edu.eg';
const NETWORK_RETRY_MS = 60_000; // 60 seconds between portal reachability checks

let scheduledTask = null;
let nextRunTime = null;
let isWaitingForNetwork = false;
let networkRetryTimer = null;

// These are injected by main.js via startScheduler / setSchedulerDeps
let _store = null;
let _isBookingInProgress = () => false;

/**
 * Provide external dependencies from main.js so the scheduler can read
 * the store and check the concurrency lock without circular imports.
 */
export function setSchedulerDeps({ store, getIsBookingInProgress }) {
    _store = store;
    _isBookingInProgress = getIsBookingInProgress;
}

// ==============================
// NETWORK POLLING
// ==============================

/**
 * Recursively poll the portal hostname via DNS until reachable, then fire the
 * callback. Respects the concurrency lock and prevents duplicate polling loops.
 *
 * @param {Function} executionCallback — async function to run once the portal is reachable
 */
export function waitForPortal(executionCallback) {
    // Guard: if a booking is already running, do nothing
    if (_isBookingInProgress()) {
        log.info('[Network] Booking already in progress — skipping poll.');
        return;
    }

    // Guard: only one polling loop at a time
    if (isWaitingForNetwork) {
        log.info('[Network] Already polling — skipping duplicate.');
        return;
    }

    isWaitingForNetwork = true;

    async function attempt() {
        // Re-check concurrency lock every attempt
        if (_isBookingInProgress()) {
            log.info('[Network] Booking started elsewhere — aborting poll.');
            isWaitingForNetwork = false;
            return;
        }

        try {
            await dnsPromises.resolve(PORTAL_HOSTNAME);
            log.info('[Network] Portal reachable. Executing booking callback.');
            isWaitingForNetwork = false;
            executionCallback();
        } catch {
            log.info(`[Network] Offline or portal unreachable. Retrying in ${NETWORK_RETRY_MS / 1000}s`);
            networkRetryTimer = setTimeout(attempt, NETWORK_RETRY_MS);
        }
    }

    attempt();
}

// ==============================
// MISSED EXECUTION CATCH-UP
// ==============================

/**
 * Returns today's date in 'YYYY-MM-DD' format in the Africa/Cairo timezone.
 */
function getCairoDateString() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
}

/**
 * Returns hours and minutes of "now" in Cairo time.
 */
function getCairoTime() {
    const parts = new Date().toLocaleTimeString('en-GB', {
        timeZone: 'Africa/Cairo',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
    });
    const [h, m] = parts.split(':').map(Number);
    return { hour: h, minute: m };
}

/**
 * Checks whether a booking was missed today and triggers a catch-up booking
 * through `waitForPortal` if needed.
 *
 * @param {Function} bookingFn — the automated booking function to call
 */
export function checkAndRunMissedBooking(bookingFn) {
    if (!_store) {
        log.warn('[CatchUp] Store not initialized yet — skipping.');
        return;
    }

    const settings = _store.get('settings', {});
    if (!settings.autoBook) {
        log.info('[CatchUp] autoBook is off — skipping.');
        return;
    }

    if (!_store.get('credentials')) {
        log.info('[CatchUp] No credentials — skipping.');
        return;
    }

    const scheduleTime = settings.scheduleTime || '08:00';
    const [schedH, schedM] = scheduleTime.split(':').map(Number);
    const { hour: nowH, minute: nowM } = getCairoTime();
    const todayStr = getCairoDateString();
    const lastAutoBookDate = _store.get('lastAutoBookDate', null);

    // If already booked today, nothing to do
    if (lastAutoBookDate === todayStr) {
        log.info('[CatchUp] Already booked today — skipping.');
        return;
    }

    // Only catch up if the current Cairo time is AFTER the scheduled time
    const nowMinutes = nowH * 60 + nowM;
    const schedMinutes = schedH * 60 + schedM;
    if (nowMinutes < schedMinutes) {
        log.info('[CatchUp] Scheduled time has not passed yet today — skipping.');
        return;
    }

    log.info(`[CatchUp] Missed booking detected (last: ${lastAutoBookDate || 'never'}, today: ${todayStr}). Triggering catch-up.`);
    waitForPortal(bookingFn);
}

// ==============================
// SCHEDULER
// ==============================

/**
 * Start the booking scheduler.
 * @param {string} time - "HH:MM" format
 * @param {function} bookingFn - async function to execute booking
 * @param {BrowserWindow} mainWindow
 */
export function startScheduler(time, bookingFn, mainWindow) {
    stopScheduler();

    const [hour, minute] = time.split(':');
    const cronExpression = `${minute} ${hour} * * *`;

    scheduledTask = cron.schedule(
        cronExpression,
        () => {
            // Route through waitForPortal so if the PC is briefly offline
            // at the exact cron moment, it retries until the portal responds.
            waitForPortal(async () => {
                try {
                    const result = await bookingFn();

                    new Notification({
                        title: 'MealSync',
                        body: result.success
                            ? 'Meal booked successfully'
                            : 'Meal booking failed',
                        icon: getIconPath(),
                    }).show();

                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('booking:done', {
                            success: result.success,
                            message: result.message,
                            date: new Date().toISOString(),
                            timestamp: Date.now(),
                        });
                    }
                } catch (error) {
                    new Notification({
                        title: 'MealSync',
                        body: 'Meal booking failed',
                        icon: getIconPath(),
                    }).show();

                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('booking:error', {
                            message: error.message,
                            attempt: 3,
                            maxAttempts: 3,
                        });
                    }
                }
            });
        },
        { timezone: 'Africa/Cairo' }
    );

    calculateNextRun(time);
}

export function stopScheduler() {
    if (scheduledTask) {
        scheduledTask.stop();
        scheduledTask = null;
    }
    // Also cancel any pending network-retry timer
    if (networkRetryTimer) {
        clearTimeout(networkRetryTimer);
        networkRetryTimer = null;
    }
    isWaitingForNetwork = false;
    nextRunTime = null;
}

export function getSchedulerStatus() {
    return {
        isRunning: !!scheduledTask,
        isWaitingForNetwork,
        nextRunTime,
    };
}

function calculateNextRun(time) {
    const [hour, minute] = time.split(':');
    const now = new Date();
    const scheduled = new Date();
    scheduled.setHours(parseInt(hour), parseInt(minute), 0, 0);

    if (scheduled <= now) {
        scheduled.setDate(scheduled.getDate() + 1);
    }

    nextRunTime = scheduled.toISOString();
}

function getIconPath() {
    return join(app.getAppPath(), 'assets/appMainIcon.ico');
}
