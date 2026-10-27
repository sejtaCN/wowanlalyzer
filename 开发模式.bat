@echo off
chcp 65001 >nul
rem 起本地开发服务器：http://127.0.0.1:5273
cd /d "%~dp0"
call npm run dev
pause
