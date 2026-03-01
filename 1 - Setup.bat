@echo off
title Meal Booking - Setup
color 0B
cls

echo ====================================================
echo    University Meal Booking System - Setup
echo ====================================================
echo.
echo This will install the required dependencies.
echo Please wait...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo.
    echo Please install Node.js from: https://nodejs.org
    echo After installation, run this setup again.
    echo.
    pause
    exit /b 1
)

echo Node.js detected
echo.
echo Installing dependencies...
echo.

call npm install
call npx playwright install chromium


if %errorlevel% equ 0 (
    echo.
    echo ====================================================
    echo    Setup completed successfully!
    echo ====================================================
    echo.
    echo Next steps:
    echo   1. Run 'run.bat' to test the application
    echo   2. Follow README.txt to setup automatic scheduling
    echo.
) else (
    echo.
    echo Setup failed! Please check the error above.
    echo.
)

pause