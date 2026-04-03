// NEW: electron/connectivityChecker.js
import log from 'electron-log';

// Constants
const CHECK_ENDPOINTS = [
    'https://www.google.com/favicon.ico',
    'https://www.cloudflare.com/favicon.ico',
    'https://dns.google',
];
const CHECK_INTERVAL_MS = 8000;
const OFFLINE_THRESHOLD = 3;
const REQUEST_TIMEOUT_MS = 4000;

// State
let currentStatus = 'unknown';
let consecutiveFailures = 0;
let intervalId = null;

// Core check
async function checkSingleEndpoint(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal
        });
        return res.ok || res.status < 500;
    } catch (err) {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

async function checkEndpoints() {
    try {
        const promises = CHECK_ENDPOINTS.map(url => checkSingleEndpoint(url).then(success => {
            if (success) return true;
            throw new Error('Endpoint failed');
        }));
        await Promise.any(promises);
        return 'online';
    } catch {
        return 'offline';
    }
}

async function runCheck(onStatusChange) {
    const status = await checkEndpoints();

    if (status === 'online') {
        consecutiveFailures = 0;
        if (currentStatus !== 'online') {
            currentStatus = 'online';
            if (onStatusChange) onStatusChange('online');
            log.info('[Connectivity] Status changed to online');
        }
    } else {
        consecutiveFailures++;
        if (consecutiveFailures < OFFLINE_THRESHOLD) {
            log.info(`[Connectivity] Failure ${consecutiveFailures}/${OFFLINE_THRESHOLD}`);
        }
        if (consecutiveFailures >= OFFLINE_THRESHOLD && currentStatus !== 'offline') {
            currentStatus = 'offline';
            if (onStatusChange) onStatusChange('offline');
            log.info('[Connectivity] Status changed to offline');
        }
    }
}

// Public API
export async function checkOnce() {
    return await checkEndpoints();
}

export function resetFailureCount() {
    consecutiveFailures = 0;
}

export function startConnectivityChecks(onStatusChange) {
    if (intervalId) return;

    // Run first check immediately
    runCheck(onStatusChange);

    intervalId = setInterval(() => {
        runCheck(onStatusChange);
    }, CHECK_INTERVAL_MS);

    return function stop() {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
    };
}

/**
 * Waits until the network is online, up to maxWaitMs.
 * Checks every intervalMs. Resolves true if online, 
 * false if timed out.
 */
export async function waitForNetwork(maxWaitMs = 30000, intervalMs = 3000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
        const status = await checkOnce();
        if (status === 'online') return true;
        log.info(
            `[Startup] Network not ready yet, ` +
            `retrying in ${intervalMs / 1000}s...`
        );
        await new Promise(r => setTimeout(r, intervalMs));
    }
    log.warn('[Startup] Network did not become ready within ' +
        `${maxWaitMs / 1000}s — proceeding anyway`);
    return false;
}
