@echo off
chcp 65001 >nul
title Taller 3D - Auditoria de filamento
cd /d "%~dp0"
node auditar.mjs
echo.
pause
