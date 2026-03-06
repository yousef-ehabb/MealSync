# Contributing to MealSync

Thank you for your interest in contributing to MealSync! This guide will help you get started.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Git](https://git-scm.com/)
- Windows 10/11 (for testing the Electron app)

### Setup

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/MealSync.git
   cd MealSync
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Install Playwright browsers**:
   ```bash
   npx playwright install chromium
   ```
5. **Run in development mode**:
   ```bash
   npm run dev
   ```

This starts both Vite (frontend) and Electron (main process) concurrently.

## Making Changes

1. Create a new branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes
3. Test your changes by running the app in dev mode
4. Commit with a descriptive message:
   ```bash
   git commit -m "feat: add your feature description"
   ```

## Submitting a Pull Request

1. Push your branch to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```
2. Open a Pull Request against the `main` branch
3. Describe what your PR does and why
4. Wait for review

## Project Structure

| Directory | Purpose |
|-----------|---------|
| `electron/` | Main process — booking automation, scheduling, encryption, tray |
| `src/` | Renderer process — React UI (Dashboard, History, Settings, Onboarding) |
| `assets/` | App icons and images |
| `tests/` | Unit and E2E tests |

## Code Style

- Use clear, self-documenting variable and function names
- Keep functions focused and small
- Use `console.error` only in catch blocks for legitimate errors
- No `console.log` in production code

## Building for Production

```bash
npm run build:win
```

The installer will be generated in `dist-setup/`.

## Questions?

Open an [issue](https://github.com/yousef-ehabb/MealSync/issues) if you have questions or run into problems.

---

Thank you for helping make MealSync better! 🙏
