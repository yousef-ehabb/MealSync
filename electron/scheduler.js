import cron from 'node-cron';
import { Notification } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let scheduledTask = null;
let nextRunTime = null;

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
        async () => {
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
    nextRunTime = null;
}

export function getSchedulerStatus() {
    return {
        isRunning: !!scheduledTask,
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
    return join(__dirname, '../assets/icons/appMainicon.ico');
}
