// Set timezone BEFORE anything else
process.env.TZ = 'Africa/Cairo';

import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import Store from 'electron-store';
import { encryptCredentials, decryptCredentials } from './encryption.js';
import { runBooking, validateCredentials, abortActiveBrowsers } from './booking.js';
import { getMealReport, abortActiveReportBrowsers } from './portalReportService.js';
import { startScheduler, stopScheduler, getSchedulerStatus } from './scheduler.js';
import { createTray, destroyTray } from './tray.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const store = new Store();
let mainWindow = null;

const isDev = process.env.NODE_ENV === 'development';

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
                const encrypted = encryptCredentials(studentId, password);
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
        const loadDev = () => {
            mainWindow.loadURL('http://127.0.0.1:5888').catch((err) => {
                console.error('Failed to connect to Vite dev server, retrying...', err.message);
                setTimeout(loadDev, 500);
            });
        };
        loadDev();

        mainWindow.webContents.once('dom-ready', () => {
            if (process.env.NODE_ENV === 'development' && process.env.OPEN_DEVTOOLS === 'true') {
                mainWindow.webContents.openDevTools();
            }
        });

        mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
            console.error('Page failed to load:', errorCode, errorDescription);
        });

        mainWindow.webContents.on('preload-error', (event, preloadPath, error) => {
            console.error(`[Preload Error] in ${preloadPath}:`, error);
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
    migrateCredentials();
    pruneHistory();
    createWindow();
    createTray(mainWindow);

    // Auto-start scheduler if configured
    const settings = store.get('settings', {});
    if (settings.autoBook && store.get('credentials')) {
        const time = settings.scheduleTime || '08:00';
        startScheduler(time, performScheduledBooking, mainWindow);
    }

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
    stopScheduler();
    destroyTray();
});

// ==============================
// SCHEDULED BOOKING
// ==============================
async function performScheduledBooking() {
    try {
        const encryptedCreds = store.get('credentials');
        if (!encryptedCreds) throw new Error('No credentials saved');

        const { studentId, password } = decryptCredentials(encryptedCreds);
        const settings = store.get('settings', {});
        const headless = !settings.debugMode;

        const result = await runBooking(studentId, password, {
            headless,
            onProgress: (progress) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('booking:progress', progress);
                }
            },
        });

        // Record in history
        addHistoryEntry(result.success, result.message, result);

        return result;
    } catch (error) {
        addHistoryEntry(false, error.message);
        throw error;
    }
}

function addHistoryEntry(success, message, result = {}) {
    const history = store.get('history', []);
    history.unshift({
        success,
        message,
        timestamp: Date.now(),
        date: new Date().toISOString(),
        type: 'auto',
        bookedCount: result.bookedCount || 0,
        alreadyBookedCount: result.alreadyBookedCount || 0,
        failedDates: result.failedDates || [],
    });
    store.set('history', history.slice(0, 500));
}

// ==============================
// IPC HANDLERS
// ==============================

// --- External Links ---
ipcMain.on('open-external', (event, url) => {
    shell.openExternal(url);
});

// --- Credentials ---
ipcMain.handle('save-credentials', async (_event, { studentId, password }) => {
    try {
        // Validate first
        const validationResult = await validateCredentials(studentId, password);
        if (!validationResult.success) {
            return { success: false, error: validationResult.error };
        }

        const encrypted = encryptCredentials(studentId, password);
        store.set('credentials', encrypted);
        store.set('studentId', studentId);

        // Persist scraped student name
        if (validationResult.studentName) {
            store.set('studentName', validationResult.studentName);
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-credentials', async () => {
    try {
        const encrypted = store.get('credentials');
        if (!encrypted) return { success: false, error: 'No credentials saved' };

        const { studentId } = decryptCredentials(encrypted);
        // Never expose password to renderer
        return { success: true, studentId, hasCredentials: true };
    } catch {
        return { success: false, error: 'Failed to decrypt credentials' };
    }
});

ipcMain.handle('logout', async () => {
    try {
        // Stop automation immediately
        stopScheduler();
        abortActiveBrowsers();
        abortActiveReportBrowsers();

        // Optionally, reset autoBook setting to false
        const settings = store.get('settings', {});
        settings.autoBook = false;
        store.set('settings', settings);

        return { success: true };
    } catch (error) {
        console.error('Logout error:', error);
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

        // Stop automation immediately
        stopScheduler();
        abortActiveBrowsers();
        abortActiveReportBrowsers();

        // Reset autoBook setting
        const settings = store.get('settings', {});
        settings.autoBook = false;
        store.set('settings', settings);

        return { success: true };
    } catch (error) {
        console.error('Reset Credentials error:', error);
        return { success: false, error: error.message };
    }
});

// --- Booking ---
ipcMain.handle('book-now', async () => {
    // Declare pendingEntry outside try so it's accessible in catch/finally
    let pendingEntry = null;

    try {
        const encryptedCreds = store.get('credentials');
        if (!encryptedCreds) {
            return { success: false, error: 'No credentials saved' };
        }

        const { studentId, password } = decryptCredentials(encryptedCreds);
        const settings = store.get('settings', {});
        const headless = !settings.debugMode;

        // Create a pending history entry first
        const history = store.get('history', []);
        pendingEntry = {
            id: Date.now(),
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

        const result = await runBooking(studentId, password, {
            headless,
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
        });

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
                icon: join(__dirname, '../assets/icons/appMainicon.ico'),
            }).show();
        }

        return result;
    } catch (error) {
        // Update the pending history entry to failed
        if (pendingEntry) {
            const history = store.get('history', []);
            const idx = history.findIndex(h => h.id === pendingEntry.id);

            const isNetworkFailure = !error.isExplicitRejection;

            if (idx !== -1) {
                history[idx] = {
                    ...history[idx],
                    success: false,
                    status: 'failed',
                    message: error.message,
                };
                store.set('history', history);
            }

            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('history:updated', history);
            }

            const currentSettings = store.get('settings', {});
            if (currentSettings.notifications !== false) {
                new Notification({
                    title: 'MealSync',
                    body: isNetworkFailure ? 'Network instability delayed booking' : 'Meal booking failed',
                    icon: join(__dirname, '../assets/icons/appMainicon.ico'),
                }).show();
            }
        }

        // ALWAYS notify renderer of error so UI resets
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('booking:error', {
                message: error.message,
            });
        }

        return { success: false, error: error.message, status: 'failed' };
    }
});

// --- Meal Report ---
ipcMain.handle('get-meal-report', async () => {
    try {
        const encryptedCreds = store.get('credentials');
        if (!encryptedCreds) {
            return { success: false, error: 'No credentials saved' };
        }
        const { studentId, password } = decryptCredentials(encryptedCreds);
        const report = await getMealReport(studentId, password);
        return { success: true, ...report };
    } catch (error) {
        console.error('[MealReport] IPC error:', error.message);
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
    store.set('settings', settings);

    // Restart or stop scheduler based on settings
    if (settings.autoBook && store.get('credentials')) {
        const time = settings.scheduleTime || '08:00';
        startScheduler(time, performScheduledBooking, mainWindow);
    } else {
        stopScheduler();
    }

    // Launch on startup
    if (settings.startWithWindows !== undefined) {
        app.setLoginItemSettings({ openAtLogin: settings.startWithWindows });
    }

    return { success: true };
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
    return store.get('studentName', null);
});

export { mainWindow };
