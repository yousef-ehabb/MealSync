# Changelog

All notable changes to MealSync are documented here.

## [1.1.0] - 2026-04-03

### Added
- Live internet connectivity indicator (replaces static "Connected" badge)
- Amber offline banner in Dashboard when network is down
- Dry-run mode for booking simulation
- Webhook notification support for booking results
- Session reuse between booking and meal report (avoids double login)
- React ErrorBoundary for graceful crash recovery
- Shared Sidebar and TimePicker components
- File-based logging via electron-log
- Smart startup network wait before catch-up booking
- Robust connectivity checker (3-failure threshold, 3 endpoints, 8s interval)
- GitHub Actions CI workflow

### Fixed
- Concurrency bug: manual + scheduled booking could overlap simultaneously
- IPC listener accumulation during Vite HMR in dev mode
- History entry ID inconsistency (now uses randomUUID())
- Session file not deleted on logout (security fix)
- Dashboard activity list using array index as React key
- Playwright import corrected to playwright-core
- Chromium bundled in installer (no manual install needed)
- Port 5888 conflict on dev restart
- URL validation on open-external IPC handler
- Icon path inconsistencies causing missing icons in notifications

### Changed
- page.goto() switched to domcontentloaded for faster loads
- Typing delay reduced from 100ms to 30ms
- Checkbox reads batched into single DOM round-trip
- Session TTL reduced from 30 to 15 minutes
- Connectivity check interval increased to 8s

## [1.0.0] - 2026-01-01

### Added
- Initial release
- Automatic meal booking via Playwright automation
- Daily scheduling with node-cron
- AES-256-GCM machine-bound credential encryption
- System tray integration
- Booking history (up to 500 entries, 90-day retention)
- Meal report scraping
- Windows NSIS installer
