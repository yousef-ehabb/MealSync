# AU Meals Desktop

A modern, clean, and professional desktop application to automate meal booking for the AU portal.

## Features

- **Modern SaaS Dashboard**: Sleek and professional UI with a dark/light mode friendly Indigo/Slate theme.
- **Auto-Booking**: Schedule your meal bookings automatically at your preferred time.
- **Secure Credentials**: All credentials are encrypted using AES-256-GCM, tied to your local machine ID.
- **Live Progress**: Watch the booking process in real-time with a live activity log.
- **History Logs**: Keep track of all your past booking attempts and results.
- **English & LTR**: Fully localized to English with a professional left-to-right layout.

## Tech Stack

- **Frontend**: React + Vite + Lucide React
- **Backend**: Electron (Main Process)
- **Automation**: Playwright (Chromium)
- **Styling**: Vanilla CSS (Custom SaaS Design System)
- **Config**: Electron-Store for persistent settings

## Getting Started

1.  **Installation**:
    ```bash
    npm install
    ```
2.  **Development**:
    ```bash
    npm run dev
    ```
3.  **Build**:
    ```bash
    npm run build
    ```

## Development

The project structure is organized into:
- `electron/`: Main process logic (IPC, Scheduler, Tray, Booking logic).
- `src/`: React frontend (Pages, Components, Styles).
- `dist-vite/`: Built frontend assets for production.

## Credits

Developed by **Yousef Ehab Khalaf**.
