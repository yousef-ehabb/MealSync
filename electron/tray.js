import { Tray, Menu, nativeImage, app } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let tray = null;

export function createTray(mainWindow) {
    const iconPath = join(__dirname, 'assets/AppTrayIcon.ico');
    let icon;

    try {
        icon = nativeImage.createFromPath(iconPath);
        icon = icon.resize({ width: 16, height: 16 });
    } catch {
        icon = nativeImage.createEmpty();
    }

    tray = new Tray(icon);
    tray.setToolTip('MealSync');

    updateTrayMenu(mainWindow);

    tray.on('click', () => {
        if (mainWindow.isVisible()) {
            mainWindow.hide();
        } else {
            mainWindow.show();
            mainWindow.focus();
        }
    });

    return tray;
}

export function updateTrayMenu(mainWindow) {
    if (!tray) return;

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Open App',
            click: () => {
                mainWindow.show();
                mainWindow.focus();
            },
        },
        { type: 'separator' },
        {
            label: 'Book Now',
            click: () => {
                mainWindow.webContents.send('trigger-book-now');
            },
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                app.isQuiting = true;
                app.quit();
            },
        },
    ]);

    tray.setContextMenu(contextMenu);
}

export function destroyTray() {
    if (tray) {
        tray.destroy();
        tray = null;
    }
}
