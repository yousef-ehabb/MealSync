import { _electron as electron } from 'playwright-core';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_PATH = path.join(__dirname, '..');

async function runE2ETest() {
    console.log('🚀 Starting E2E Test...');

    const electronApp = await electron.launch({
        args: ['.'],
        cwd: APP_PATH,
        env: {
            ...process.env,
            NODE_ENV: 'development',
        },
    });

    // Helpful for debugging: wait for the app to actually load
    console.log('⏳ Waiting for development server port 5888...');

    try {
        console.log('📦 Electron App launched.');
        const window = await electronApp.firstWindow();
        console.log('🖼️ Main window detected.');

        // Wait for React to hydrate and load the view
        await window.waitForSelector('#root', { timeout: 60000 });
        console.log('⚛️ React app loaded.');

        const isDashboard = await window.locator('[data-testid="nav-dashboard"]').count() > 0;

        if (isDashboard) {
            console.log('✅ App is on Dashboard.');
        } else {
            console.log('⚠️ App is NOT on Dashboard. Checking for Onboarding...');
            // Updated for English UI
            const isOnboarding = await window.locator('text="Welcome back"').count() > 0;
            if (isOnboarding) {
                console.log('📝 App is on Onboarding.');
            } else {
                console.log('❌ Unknown app state.');
            }
        }

        if (isDashboard) {
            console.log('🖱️ Clicking "Book Now" button...');
            const bookButton = window.locator('[data-testid="book-now-button"]');
            await bookButton.click();

            console.log('⏳ Waiting for booking progress...');
            // In Dashboard.jsx, the progress overlay is the .progress-card
            await window.waitForSelector('.progress-card', { timeout: 15000 });

            // Wait for completion (Success or Failure)
            await window.waitForFunction(
                () => {
                    const tracker = document.querySelector('.dash-tracker-card');
                    return tracker && (tracker.classList.contains('tracker-exit') || tracker.classList.contains('bar-success') || tracker.classList.contains('bar-failed'));
                },
                {},
                { timeout: 180000 }
            );

            console.log('🏁 Booking process finished.');

            // Take screenshot of results
            await window.screenshot({ path: path.join(APP_PATH, 'tests', 'e2e-booking-result.png') });

            // Navigate to History
            console.log('📜 Navigating to History page...');
            await window.locator('[data-testid="nav-history"]').click();
            await window.waitForSelector('.history-card', { timeout: 15000 });
            await window.screenshot({ path: path.join(APP_PATH, 'tests', 'e2e-history.png') });
        }

        console.log('📸 Taking screenshot of final state...');
        await window.screenshot({ path: path.join(APP_PATH, 'tests', 'e2e-result.png') });
        console.log(`🖼️ Screenshot saved to ${path.join(APP_PATH, 'tests', 'e2e-result.png')}`);

    } catch (error) {
        console.error('❌ E2E Test Failed:', error.message);
        // Take diagnostic screenshot if possible
        try {
            const window = await electronApp.firstWindow().catch(() => null);
            if (window) await window.screenshot({ path: path.join(APP_PATH, 'tests', 'e2e-error.png') });
        } catch { }
    } finally {
        console.log('🛑 Closing Electron App...');
        await electronApp.close();
    }
}

runE2ETest().catch(console.error);
