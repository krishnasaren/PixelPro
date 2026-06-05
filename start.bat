@echo off
title PixelForge Image Editor
color 0A
echo.
echo  ==========================================
echo   PixelForge Professional Image Editor
echo  ==========================================
echo.
echo  Starting server at http://localhost:5000
echo  Opening browser...
echo  Press Ctrl+C to stop the server.
echo.
timeout /t 2 /nobreak >nul
start "" "http://localhost:5000"
python app.py
pause
