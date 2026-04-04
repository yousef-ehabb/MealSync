/**
 * electron/main.js
 * 
 * FIX: Suppress desktop notifications when a booking is manually cancelled by the user.
 * Added a robust isCancelled guard in the 'book-now' IPC handler catch block.
 */

// Set timezone BEFORE anything else
process.env.TZ = 'Africa/Cairo';

import { app, BrowserWindow, ipcMain, Notification, shell, powerMonitor, dialog } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import Store from 'electron-store';
import { encryptCredentials, decryptCredentialsWithMigration } from './encryption.js';
import { runBooking, validateCredentials, abortActiveBrowsers, requestCancellation } from './booking.js';
import { getMealReport, abortActiveReportBrowsers } from './portalReportService.js';
import { startScheduler, stopScheduler, getSchedulerStatus, setSchedulerDeps, checkAndRunMissedBooking } from './scheduler.js';
import { createTray, destroyTray } from './tray.js';
import { getChromiumPath } from './chromiumPath.js';
import { checkOnce, startConnectivityChecks, waitForNetwork, resetFailureCount } from './connectivityChecker.js';
import log from 'electron-log';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Session file shared between booking runs and the meal report service */
const getSessionPath = () => join(app.getPath('userData'), 'session.json');

const store = new Store();
let mainWindow = null;
let stopConnectivityChecks = null;
let lastConnectivityStatus = 'offline';
let previousConnectivityStatus = 'online';

// ── Concurrency lock: prevents overlapping booking runs ──
let isBookingInProgress = false;

// Inject store & lock accessor into the scheduler so it can read settings
// and respect the concurrency guard without circular imports.
setSchedulerDeps({
    store,
    getIsBookingInProgress: () => isBookingInProgress,
});

const isDev = process.env.NODE_ENV === 'development';

const BOOKING_TIMEOUT_MS = 3 * 60 * 1000;

// ==============================
// STARTUP: Migration & Cleanup
// ==============================
function migrateCredentials() {
    const legacyPath = join(app.getAppPath(), 'credentials.json');
    try {
        if (fs.existsSync(legacyPath)) {
            const raw = fs.readFileSync(legacyPath, 'utf-8');
            const { studentId, password } = JSON.parse(raw);
            if (studentId && password) {
                const encrypted = encryptCredentials(studentId, password, store);
                store.set('credentials', encrypted);
                store.set('studentId', studentId);
                fs.unlinkSync(legacyPath);
            }
        }
    } catch {
        // Migration is best-effort
    }
}

function pruneHistory() {
    const history = store.get('history', []);
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const pruned = history.filter((entry) => entry.timestamp > cutoff);
    if (pruned.length !== history.length) {
        store.set('history', pruned);
    }
}

function resolveStaleEntries() {
    const history = store.get('history', []);
    const TEN_MINUTES = 10 * 60 * 1000;
    const now = Date.now();
    let changed = false;

    const resolved = history.map(entry => {
        if (entry.status === 'pending') {
            const entryTime = new Date(entry.date).getTime();
            if (now - entryTime > TEN_MINUTES) {
                changed = true;
                return {
                    ...entry,
                    status: 'failed',
                    success: false,
                    message: 'Booking interrupted — app was closed or crashed during booking.',
                };
            }
        }
        return entry;
    });

    if (changed) {
        store.set('history', resolved);
        log.info('[Startup] Resolved stale pending history entries.');
    }
}

// ==============================
// WINDOW
// ==============================
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 920,
        minWidth: 1280,
        minHeight: 920,
        webPreferences: {
            preload: join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        icon: join(__dirname, 'assets/appMainIcon.ico'),
        autoHideMenuBar: true,
        show: false,
        backgroundColor: '#ffffff'
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    if (isDev) {
        // Retry logic for Vite dev server
        const tryLoadDev = async (port = 5888, maxPort = 5892) => {
            try {
                await mainWindow.loadURL(`http://127.0.0.1:${port}`);
            } catch (err) {
                if (port < maxPort) {
                    setTimeout(() => tryLoadDev(port + 1, maxPort), 300);
                } else {
                    log.error('Could not connect to Vite dev server on any port');
                }
            }
        };
        tryLoadDev();

        mainWindow.webContents.once('dom-ready', () => {
            if (process.env.NODE_ENV === 'development' && process.env.OPEN_DEVTOOLS === 'true') {
                mainWindow.webContents.openDevTools();
            }
        });

        mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
            log.error('Page failed to load:', errorCode, errorDescription);
        });

        mainWindow.webContents.on('preload-error', (event, preloadPath, error) => {
            log.error(`[Preload Error] in ${preloadPath}:`, error);
        });
    } else {
        mainWindow.loadFile(join(__dirname, '../dist-vite/index.html'));
    }

    // Minimize to tray on close
    mainWindow.on('close', (event) => {
        if (!app.isQuiting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
}

// ==============================
// APP LIFECYCLE
// ==============================
app.whenReady().then(() => {
    app.setAppUserModelId('com.mealsync.app');

    log.info('[Startup] MealSync starting up — ' +
        `version ${app.getVersion()}, ` +
        `packaged: ${app.isPackaged}`);
    
    const chromiumExe = getChromiumPath();
    if (!fs.existsSync(chromiumExe)) {
        dialog.showErrorBox(
            'MealSync — Missing Component',
            'A required browser component (Chromium) was not found.\n\n' +
            'Please reinstall MealSync from the official installer.\n\n' +
            'Expected path: ' + chromiumExe
        );
        app.quit();
        process.exit(1);
    }

    migrateCredentials();
    pruneHistory();
    resolveStaleEntries();
    createWindow();
    createTray(mainWindow);

    // Initial connectivity check
    checkOnce().then((status) => {
        lastConnectivityStatus = status;
    });

    // Start periodic checks
    stopConnectivityChecks = startConnectivityChecks((status) => {
        previousConnectivityStatus = lastConnectivityStatus;
        lastConnectivityStatus = status;
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('connectivity:changed', status);
        }
        // Trigger catch-up when connectivity is restored
        if (previousConnectivityStatus === 'offline' && lastConnectivityStatus === 'online') {
            log.info('[Connectivity] Connection restored — scheduling catch-up check in 10s.');
            setTimeout(() => {
                checkAndRunCatchUp('connectivity-restored');
            }, 10000);
        }
    });

    // Auto-start scheduler if configured
    const settings = store.get('settings', {});
    if (settings.autoBook && store.get('credentials')) {
        const time = settings.scheduleTime || '08:00';
        startScheduler(time, performScheduledBooking, mainWindow);
    }

    // Delay 15 seconds to allow window to load and connectivity checker to initialize
    setTimeout(() => {
        checkAndRunCatchUp('app-start');
    }, 15000);

    // Smart startup: wait for network before checking missed bookings
    // Use a short initial delay (2s) to let the OS finish bringing
    // up network adapters, then actively poll for connectivity
    setTimeout(async () => {
        const isReady = await waitForNetwork(30000, 3000);
        if (isReady) {
            log.info('[Startup] Network ready — checking for missed bookings');
        } else {
            log.warn('[Startup] Proceeding with missed booking check ' +
                'despite network uncertainty');
        }
        checkAndRunMissedBooking(performScheduledBooking);
    }, 2000);

    // When the machine wakes from sleep, re-check after a short delay
    // (5 s lets the OS bring network adapters back up first).
    powerMonitor.on('resume', () => {
        resetFailureCount();
        log.info('[PowerMonitor] System resumed — ' +
            'waiting for network before catch-up check');
        setTimeout(async () => {
            await waitForNetwork(20000, 3000);
            checkAndRunMissedBooking(performScheduledBooking);
        }, 5000);
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        } else {
            mainWindow.show();
        }
    });
});

app.on('window-all-closed', () => {
    // Do nothing — tray keeps app alive
});

app.on('before-quit', () => {
    app.isQuiting = true;
    if (stopConnectivityChecks) stopConnectivityChecks();
    stopScheduler();
    destroyTray();
});

// ==============================
// SCHEDULED BOOKING
// ==============================
async function performScheduledBooking() {
    // Offline pre-flight — fail fast instead of hanging Playwright
    if (lastConnectivityStatus === 'offline') {
        log.info('[Scheduler] Skipping scheduled booking — no internet connection.');
        addHistoryEntry(false, 'Scheduled booking skipped — no internet connection.');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('history:updated', store.get('history', []));
        }
        return;
    }

    // Concurrency guard: skip silently if another booking is already running
    if (isBookingInProgress) {
        log.info('[Scheduler] Skipped: booking already in progress.');
        return;
    }

    isBookingInProgress = true;
    try {
        const encryptedCreds = store.get('credentials');
        if (!encryptedCreds) throw new Error('No credentials saved');

        const { studentId, password } = decryptCredentialsWithMigration(encryptedCreds, store);
        const settings = store.get('settings', {});
        // Scheduled runs are always headless — debugMode only applies to manual Book Now.
        const headless = true;
        if (settings.debugMode) {
            log.warn('[Scheduler] debugMode is ON but scheduled runs are always headless to prevent unattended browser pop-ups.');
        }

        const result = await Promise.race([
            runBooking(studentId, password, {
                headless,
                sessionPath: getSessionPath(),
                onProgress: (progress) => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('booking:progress', progress);
                    }
                },
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('BOOKING_TIMEOUT')), BOOKING_TIMEOUT_MS)),
        ]);

        // Record in history
        addHistoryEntry(result.success, result.message, result);

        // Stamp today's Cairo date to prevent duplicate catch-up runs
        if (result.success) {
            const todayCairo = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
            store.set('lastAutoBookDate', todayCairo);
            // Invalidate meal report cache so next fetch reflects new bookings
            mealReportCache = null;
            mealReportCachedAt = 0;
        }

        return result;
    } catch (error) {
        if (error.message === 'BOOKING_TIMEOUT') {
            addHistoryEntry(false, 'Scheduled booking timed out after 3 minutes. The portal may be slow or unreachable.');
            return;
        }
        if (error.message === 'CREDENTIALS_UNRECOVERABLE') {
            store.delete('credentials');
            store.delete('studentId');
            store.delete('studentName');
            log.error('[Scheduler] Security upgrade required — credentials cleared.');
            addHistoryEntry(false, 'Security upgrade required — please log in again');
            return;
        }
        addHistoryEntry(false, error.message);
        throw error;
    } finally {
        isBookingInProgress = false;
    }
}

function addHistoryEntry(success, message, result = {}) {
    const history = store.get('history', []);
    history.unshift({
        id: randomUUID(),           // Task 4: stable unique key for React
        success,
        message,
        timestamp: Date.now(),
        date: new Date().toISOString(),
        type: 'auto',
        bookedCount: result.bookedCount || 0,
        alreadyBookedCount: result.alreadyBookedCount || 0,
        failedDates: result.failedDates || [],
        newlyBookedDates: result.newlyBookedDates || [],
        alreadyBookedDates: result.alreadyBookedDates || [],
    });
    store.set('history', history.slice(0, 500));
}

function updatePendingHistoryEntry(updates = {}) {
    const history = store.get('history', []);
    const pendingIdx = history.findIndex((entry) => entry.status === 'pending');

    if (pendingIdx !== -1) {
        history[pendingIdx] = {
            ...history[pendingIdx],
            ...updates,
        };
        store.set('history', history);
    }

    return history;
}

/**
 * Checks if today's scheduled booking was missed and runs it if so.
 * Triggers on: app start, connectivity restored.
 * 
 * Will NOT run if:
 * - autoBook is disabled
 * - No credentials saved
 * - A booking is already in progress
 * - A successful/pending booking already exists for today (Cairo time)
 * - Current time has not yet passed today's scheduled time
 */
async function checkAndRunCatchUp(reason) {
    try {
        const settings = store.get('settings', {});
        if (!settings.autoBook) return;

        const encryptedCreds = store.get('credentials');
        if (!encryptedCreds) return;

        if (isBookingInProgress) {
            log.info(`[CatchUp] Skipped (${reason}): booking already in progress.`);
            return;
        }

        // Get current Cairo time
        const nowCairo = new Date(
            new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' })
        );
        const todayCairo = nowCairo.toLocaleDateString('en-CA'); // YYYY-MM-DD

        // Check if we've passed today's scheduled time
        const [schedHour, schedMin] = (settings.scheduleTime || '08:00').split(':').map(Number);
        const scheduledMinutesFromMidnight = schedHour * 60 + schedMin;
        const currentMinutesFromMidnight = nowCairo.getHours() * 60 + nowCairo.getMinutes();

        if (currentMinutesFromMidnight < scheduledMinutesFromMidnight) {
            log.info(`[CatchUp] Skipped (${reason}): scheduled time hasn't passed yet today.`);
            return;
        }

        // Check if a successful or pending booking already exists for today
        const history = store.get('history', []);
        const todayEntry = history.find(entry => {
            const entryDate = new Date(entry.date)
                .toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
            return entryDate === todayCairo && 
                   (entry.success === true || entry.status === 'pending');
        });

        if (todayEntry) {
            log.info(`[CatchUp] Skipped (${reason}): booking already exists for today.`);
            return;
        }

        // All checks passed — run the catch-up booking
        log.info(`[CatchUp] Running missed booking (${reason}).`);
        
        // Notify renderer that a catch-up is starting
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('catchup:starting', { reason });
        }

        await performScheduledBooking();

    } catch (error) {
        log.error(`[CatchUp] Error during catch-up (${reason}):`, error.message);
    }
}

// ==============================
// IPC HANDLERS
// ==============================

// --- External Links ---
// P0-4: Validate URL scheme before opening externally
ipcMain.on('open-external', (event, url) => {
    try {
        const parsed = new URL(url);
        if (['https:', 'http:', 'mailto:'].includes(parsed.protocol)) {
            shell.openExternal(url);
        }
    } catch (_) {
        // Malformed URL — silently ignore
    }
});

// --- Connectivity ---
ipcMain.handle('get-connectivity-status', () => {
    try {
        return lastConnectivityStatus;
    } catch (error) {
        log.error('[Connectivity] get-connectivity-status error:', error.message);
        return 'unknown';
    }
});

// --- Credentials ---
ipcMain.handle('save-credentials', async (_event, { studentId, password }) => {
    log.info('[Login] save-credentials IPC received, starting validation...');
    try {
        // Validate credentials against the real portal BEFORE saving anything
        const validationResult = await validateCredentials(studentId, password);
        log.info('[Login] validateCredentials result:', {
            success: validationResult.success,
            type: validationResult.type || 'none',
            hasName: !!validationResult.studentName,
            error: validationResult.error || 'none',
        });

        if (validationResult.success !== true) {
            log.warn('[Login] Credential validation failed — NOT saving credentials.');
            return {
                success: false,
                error: validationResult.error,
                type: validationResult.type || 'unknown',
            };
        }

        // Only save if validation passed
        const encrypted = encryptCredentials(studentId, password, store);
        store.set('credentials', encrypted);
        store.set('studentId', studentId);

        // Persist scraped student name
        if (validationResult.studentName) {
            store.set('studentName', validationResult.studentName);
        }

        log.info('[Login] Credentials saved successfully, navigating to dashboard.');
        return { success: true, studentName: validationResult.studentName };
    } catch (error) {
        log.error('[Login] save-credentials error:', error.message);
        return {
            success: false,
            error: error.message,
            type: error.isExplicitRejection ? 'invalid_credentials' : 'error',
        };
    }
});

ipcMain.handle('get-credentials', async () => {
    try {
        const encrypted = store.get('credentials');
        if (!encrypted) return { success: false, error: 'No credentials saved' };

        const { studentId } = decryptCredentialsWithMigration(encrypted, store);
        // Never expose password to renderer
        return { success: true, studentId, hasCredentials: true };
    } catch (error) {
        if (error.message === 'CREDENTIALS_UNRECOVERABLE') {
            store.delete('credentials');
            store.delete('studentId');
            store.delete('studentName');
            return { success: false, error: 'Security upgrade required — please log in again' };
        }
        return { success: false, error: 'Failed to decrypt credentials' };
    }
});

ipcMain.handle('logout', async () => {
    try {
        // Stop automation immediately
        stopScheduler();
        abortActiveBrowsers();
        abortActiveReportBrowsers();

        // P0-1: Delete cached session file to prevent stale cookie reuse
        try { fs.unlinkSync(getSessionPath()); } catch (_) {}

        // Optionally, reset autoBook setting to false
        const settings = store.get('settings', {});
        settings.autoBook = false;
        store.set('settings', settings);

        return { success: true };
    } catch (error) {
        log.error('Logout error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('reset-credentials', async () => {
    try {
        // Clear all account-related data
        store.delete('credentials');
        store.delete('studentId');
        store.delete('studentName');
        store.delete('history');
        store.delete('lastAutoBookDate');

        // Stop automation immediately
        stopScheduler();
        abortActiveBrowsers();
        abortActiveReportBrowsers();

        // P0-1: Delete cached session file to prevent stale cookie reuse
        try { fs.unlinkSync(getSessionPath()); } catch (_) {}

        // Reset autoBook setting
        const settings = store.get('settings', {});
        settings.autoBook = false;
        store.set('settings', settings);

        return { success: true };
    } catch (error) {
        log.error('Reset Credentials error:', error);
        return { success: false, error: error.message };
    }
});

// --- Booking ---
ipcMain.handle('book-now', async () => {
    // Concurrency guard: reject immediately if a booking is already running
    if (isBookingInProgress) {
        return { success: false, error: 'A booking is already in progress. Please wait.' };
    }
    if (lastConnectivityStatus === 'offline') {
        return {
            success: false,
            error: 'No internet connection. Please check your network and try again.'
        };
    }

    // Declare pendingEntry outside try so it's accessible in catch/finally
    let pendingEntry = null;
    isBookingInProgress = true;

    try {
        const encryptedCreds = store.get('credentials');
        if (!encryptedCreds) {
            return { success: false, error: 'No credentials saved' };
        }

        const { studentId, password } = decryptCredentialsWithMigration(encryptedCreds, store);
        const settings = store.get('settings', {});
        const headless = !settings.debugMode;

        // Create a pending history entry first
        const history = store.get('history', []);
        pendingEntry = {
            id: randomUUID(),
            success: false,
            status: 'pending',
            message: 'Booking in progress...',
            timestamp: Date.now(),
            date: new Date().toISOString(),
            type: 'manual',
        };
        history.unshift(pendingEntry);
        store.set('history', history.slice(0, 500));

        // Notify renderer of pending addition
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('history:updated', store.get('history', []));
        }

        const bookingTimeout = new Promise((_, reject) =>
            setTimeout(() => {
                reject(new Error('BOOKING_TIMEOUT'));
            }, BOOKING_TIMEOUT_MS)
        );

        const bookingResult = await Promise.race([
            runBooking(studentId, password, {
                headless,
                sessionPath: getSessionPath(),
                onProgress: (progress) => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('booking:progress', progress);

                        if (progress.step === 'retrying') {
                            const currentHistory = store.get('history', []);
                            const idx = currentHistory.findIndex(h => h.id === pendingEntry.id);
                            if (idx !== -1) {
                                currentHistory[idx].message = progress.message;
                                store.set('history', currentHistory);
                                mainWindow.webContents.send('history:updated', currentHistory);
                            }
                        }
                    }
                },
            }),
            bookingTimeout,
        ]);

        const result = bookingResult;

        // Update the pending entry to success
        const currentHistory = store.get('history', []);
        const idx = currentHistory.findIndex(h => h.id === pendingEntry.id);
        if (idx !== -1) {
            currentHistory[idx] = {
                ...currentHistory[idx],
                success: true,
                status: 'success',
                message: result.message,
                bookedCount: result.bookedCount,
                alreadyBookedCount: result.alreadyBookedCount,
                failedDates: result.failedDates || [],
            };
            store.set('history', currentHistory);
        }

        // Invalidate meal report cache so next fetch reflects the new booking
        mealReportCache = null;
        mealReportCachedAt = 0;

        // Notify renderer of done
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('booking:done', {
                success: true,
                message: result.message,
                date: new Date().toISOString(),
                timestamp: Date.now(),
                bookedCount: result.bookedCount,
                alreadyBookedCount: result.alreadyBookedCount,
                newlyBookedDates: result.newlyBookedDates || [],
                alreadyBookedDates: result.alreadyBookedDates || [],
                failedDates: result.failedDates || [],
            });
            mainWindow.webContents.send('history:updated', currentHistory);
        }

        // System notification
        const currentSettings = store.get('settings', {});
        if (currentSettings.notifications !== false) {
                new Notification({
                    title: 'MealSync',
                    body: 'Meal booked successfully',
                    icon: join(__dirname, '../assets/appMainIcon.ico'),
                }).show();
        }

        return result;
    } catch (error) {
        // Invalidate meal report cache on booking attempt (success or fail)
        mealReportCache = null;
        mealReportCachedAt = 0;

        const isTimeout = error.message === 'BOOKING_TIMEOUT';
        const isCancelled = error.isCancelled || error.message?.toLowerCase().includes('cancel');
        const userMessage = isTimeout
            ? 'Booking timed out after 3 minutes. The portal may be slow or unreachable.'
            : isCancelled
                ? 'Booking cancelled by user.'
                : error.message;

        // Handle unrecoverable credentials (security migration failure)
        if (error.message === 'CREDENTIALS_UNRECOVERABLE') {
            store.delete('credentials');
            store.delete('studentId');
            store.delete('studentName');
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('booking:error', {
                    message: 'Security upgrade required — please log in again',
                });
            }
            return { success: false, error: 'Security upgrade required — please log in again', status: 'failed' };
        }
        // Update the pending history entry to failed
        if (pendingEntry) {
            const history = store.get('history', []);
            const idx = history.findIndex(h => h.id === pendingEntry.id);

            const isNetworkFailure = !error.isExplicitRejection;

            if (idx !== -1) {
                history[idx] = {
                    ...history[idx],
                    success: false,
                    status: isCancelled ? 'cancelled' : 'failed',
                    message: userMessage,
                    date: new Date().toISOString(),
                };
                store.set('history', history);
            }

            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('history:updated', history);
            }

            const currentSettings = store.get('settings', {});
            // Never notify the user for their own cancellations
            if (!isCancelled && currentSettings.notifications !== false) {
                new Notification({
                    title: 'MealSync',
                    body: isNetworkFailure
                        ? 'Booking timed out or network instability'
                        : 'Meal booking failed',
                    icon: join(__dirname, '../assets/appMainIcon.ico'),
                }).show();
            }
        }

        // ALWAYS notify renderer of error so UI resets (including cancellations)
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('booking:error', {
                message: userMessage,
                isCancelled,
            });
        }

        return { success: false, error: userMessage, status: isCancelled ? 'cancelled' : 'failed' };
    } finally {
        isBookingInProgress = false;
    }
});

// --- Cancel Booking ---
ipcMain.handle('cancel-booking', async () => {
    if (!isBookingInProgress) {
        return { success: false, error: 'No booking is currently in progress.' };
    }
    try {
        log.info('[Cancel] User requested cancellation');
        requestCancellation();
        await abortActiveBrowsers();
        await abortActiveReportBrowsers();
        isBookingInProgress = false;
        mealReportCache = null;
        mealReportCachedAt = 0;
        return { success: true };
    } catch (error) {
        log.error('[Cancel] Error during cancellation:', error.message);
        return { success: false, error: error.message };
    }
});

// --- Meal Report ---
// Meal report in-memory cache — avoids redundant browser launches for rapid refreshes
let mealReportCache = null;
let mealReportCachedAt = 0;
const MEAL_REPORT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

ipcMain.handle('get-meal-report', async () => {
    try {
        const now = Date.now();
        if (mealReportCache && (now - mealReportCachedAt) < MEAL_REPORT_CACHE_TTL) {
            log.info('[MealReport] Returning cached report (age:',
                Math.round((now - mealReportCachedAt) / 1000), 's)');
            return { success: true, ...mealReportCache };
        }

        const encryptedCreds = store.get('credentials');
        if (!encryptedCreds) {
            return { success: false, error: 'No credentials saved' };
        }
        const { studentId, password } = decryptCredentialsWithMigration(encryptedCreds, store);
        const report = await getMealReport(studentId, password, { sessionPath: getSessionPath() });

        mealReportCache = report;
        mealReportCachedAt = Date.now();
        return { success: true, ...report };
    } catch (error) {
        mealReportCache = null; // invalidate cache on error
        if (error.message === 'CREDENTIALS_UNRECOVERABLE') {
            store.delete('credentials');
            store.delete('studentId');
            store.delete('studentName');
            return { success: false, error: 'Security upgrade required — please log in again' };
        }
        log.error('[MealReport] IPC error:', error.message);
        return { success: false, error: error.message };
    }
});

// --- Status ---
ipcMain.handle('get-status', async () => {
    const credentials = store.get('credentials');
    const history = store.get('history', []);
    const lastBooking = history.length > 0 ? history[0] : null;
    const scheduler = getSchedulerStatus();

    return {
        hasCredentials: !!credentials,
        studentId: store.get('studentId'),
        lastBooking,
        scheduler,
    };
});

// --- Settings ---
ipcMain.handle('save-settings', async (_event, settings) => {
    try {
        store.set('settings', settings);

        if (settings.autoBook && store.get('credentials')) {
            startScheduler(settings.scheduleTime || '08:00', performScheduledBooking, mainWindow);
        } else {
            stopScheduler();
        }

        if (settings.startWithWindows !== undefined) {
            try {
                app.setLoginItemSettings({ openAtLogin: settings.startWithWindows });
            } catch (loginItemErr) {
                log.warn('[Settings] setLoginItemSettings failed (non-fatal):', loginItemErr.message);
            }
        }

        return { success: true };
    } catch (error) {
        log.error('[Settings] save-settings error:', error.message);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-settings', async () => {
    return store.get('settings', {
        scheduleTime: '08:00',
        autoBook: true,
        debugMode: false,
        notifications: true,
        startWithWindows: false,
    });
});

// --- History ---
ipcMain.handle('get-history', async () => {
    return store.get('history', []);
});

ipcMain.handle('clear-history', async () => {
    store.set('history', []);
    return { success: true };
});

// --- Student Name ---
ipcMain.handle('get-student-name', async () => {
    try {
        return store.get('studentName', null);
    } catch (error) {
        log.error('[StudentName] get-student-name error:', error.message);
        return null;
    }
});

export { mainWindow };
