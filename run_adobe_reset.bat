@echo off
title Adobe Sign Cache Reset Tool
:: Run from the script's own folder so it works from any location / shortcut.
cd /d "%~dp0"

echo Starting Adobe Sign Cache Reset Tool...
echo.

:: Prefer the Python launcher (py/pyw), fall back to python/pythonw on PATH.
set "PY="
set "PYW="
where py >nul 2>&1 && (set "PY=py" & set "PYW=pyw")
if not defined PY (
    where python >nul 2>&1 && (set "PY=python" & set "PYW=pythonw")
)

if not defined PY (
    echo ERROR: Python is not installed or not in PATH
    echo.
    echo Please install Python 3.8+ from https://python.org
    echo and tick "Add Python to PATH" during setup.
    pause
    exit /b 1
)

:: Run the application without a console window.
%PYW% adobe_cache_reset.py

if errorlevel 1 (
    echo.
    echo Error starting application. Running with console for debugging...
    echo.
    %PY% adobe_cache_reset.py
    pause
)
