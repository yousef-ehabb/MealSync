const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Credentials
    saveCredentials: (creds) => ipcRenderer.invoke('save-credentials', creds),
    getCredentials: () => ipcRenderer.invoke('get-credentials'),

    // Booking
    bookNow: () => ipcRenderer.invoke('book-now'),
    cancelBooking: () => ipcRenderer.invoke('cancel-booking'),

    // Meal Report
    getMealReport: () => ipcRenderer.invoke('get-meal-report'),

    // Status
    getStatus: () => ipcRenderer.invoke('get-status'),
    getConnectivityStatus: () => ipcRenderer.invoke('get-connectivity-status'),

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

    // History updates (main → renderer)
    onHistoryUpdated: (callback) => {
        ipcRenderer.on('history:updated', (_event, data) => callback(data));
    },

    // Connectivity status (main → renderer)
    onConnectivityChanged: (callback) => {
        ipcRenderer.on('connectivity:changed', (_event, status) => callback(status));
    },

    // Tray triggers
    onTriggerBookNow: (callback) => {
        ipcRenderer.on('trigger-book-now', () => callback());
    },

    // Cleanup listeners
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    },

    // Catch-up notifications
    onCatchUpStarting: (callback) => {
        ipcRenderer.on('catchup:starting', (_event, data) => callback(data));
    },
});
