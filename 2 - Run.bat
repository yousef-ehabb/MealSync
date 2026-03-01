@echo off
title AU Dorm Meals Booking System
color 0A
cls

REM Change to the directory where this batch file is located
cd /d "%~dp0"

echo ====================================================
echo    AU Dorm Meals Booking System
echo ====================================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist "node_modules\" (
    echo [ERROR] Dependencies not installed!
    echo Please run 'setup.bat' first to install dependencies.
    echo.
    pause
    exit /b 1
)

REM Check if booking.js exists
if not exist "booking.js" (
    echo [ERROR] booking.js file not found!
    echo Please make sure all files are in the correct directory.
    echo.
    pause
    exit /b 1
)

echo Starting application...
echo.

REM Run the booking application
node booking.js

REM The Node.js application handles its own exit timing
REM So we just exit cleanly here
exit