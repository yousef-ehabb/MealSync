const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Credentials
    saveCredentials: (creds) => ipcRenderer.invoke('save-credentials', creds),
    getCredentials: () => ipcRenderer.invoke('get-credentials'),

    // Booking
    bookNow: () => ipcRenderer.invoke('book-now'),

    // Meal Report
    getMealReport: () => ipcRenderer.invoke('get-meal-report'),

    // Status
    getStatus: () => ipcRenderer.invoke('get-status'),

    // Settings
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    getSettings: () => ipcRenderer.invoke('get-settings'),

    // History
    getHistory: () => ipcRenderer.invoke('get-history'),
    clearHistory: () => ipcRenderer.invoke('clear-history'),

    // External Links
    openExternal: (url) => ipcRenderer.send('open-external', url),

    // Logout & Reset
    logout: () => ipcRenderer.invoke('logout'),
    resetCredentials: () => ipcRenderer.invoke('reset-credentials'),

    // Student Name
    getStudentName: () => ipcRenderer.invoke('get-student-name'),

    // Progress streaming (main → renderer)
    onBookingProgress: (callback) => {
        ipcRenderer.on('booking:progress', (_event, data) => callback(data));
    },
    onBookingDone: (callback) => {
        ipcRenderer.on('booking:done', (_event, data) => callback(data));
    },
    onBookingError: (callback) => {
        ipcRenderer.on('booking:error', (_event, data) => callback(data));
    },

    // Tray triggers
    onTriggerBookNow: (callback) => {
        ipcRenderer.on('trigger-book-now', () => callback());
    },

    // Cleanup listeners
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    },
});
