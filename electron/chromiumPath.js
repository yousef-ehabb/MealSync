import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { chromium } from 'playwright-core';

export function getChromiumPath() {
  // In production: Chromium is bundled inside resources/chromium/
  if (app.isPackaged) {
    const bundledPath = path.join(
      process.resourcesPath,
      'chromium',
      getChromiumExecutable()
    );
    if (fs.existsSync(bundledPath)) {
      return bundledPath;
    }
    // Fallback: try playwright-core's own resolution
    return chromium.executablePath();
  }

  // In development: use playwright-core's default cache
  return chromium.executablePath();
}

function getChromiumExecutable() {
  return path.join(
    'chrome-win64',
    'chrome.exe'
  );
}
