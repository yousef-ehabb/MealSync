import { chromium } from 'playwright-core';
import path from 'path';
import fs from 'fs-extra';

const chromPath = chromium.executablePath();
const chromiumFolder = path.dirname(path.dirname(chromPath));
await fs.copy(chromiumFolder, './chromium-bundle');
console.log('Copied Chromium to chromium-bundle/');
