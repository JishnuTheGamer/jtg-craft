@echo off
title Jtg-craft Mobile - APK Builder
echo ========================================
echo   Jtg-craft Mobile - Building APK...
echo ========================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-apk.ps1"
echo.
pause
