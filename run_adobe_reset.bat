@echo off
title Adobe Sign Cache Reset Tool
echo Starting Adobe Sign Cache Reset Tool...
echo.

:: Check for Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo.
    echo Please install Python 3.7+ from https://python.org
    pause
    exit /b 1
)

:: Run the application
pythonw adobe_cache_reset.py

if errorlevel 1 (
    echo.
    echo Error starting application. Running with console for debugging...
    echo.
    python adobe_cache_reset.py
    pause
)
