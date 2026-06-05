@echo off
title PixelForge Setup
color 0B
echo.
echo  ==========================================
echo   PixelForge Setup for Windows
echo  ==========================================
echo.
python --version 2>nul
if %errorlevel% neq 0 (
    echo  ERROR: Python not found!
    echo  Download from https://python.org and check
    echo  "Add Python to PATH" during install.
    pause & exit /b 1
)
echo  Python found. Installing packages...
echo.
pip install flask flask-cors Pillow numpy --upgrade
echo.
echo  ==========================================
echo   Setup complete! Run start.bat to launch.
echo  ==========================================
pause
