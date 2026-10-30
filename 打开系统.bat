@echo off
chcp 65001 >nul
rem 打开已打包的界面（不需要 Node）
rem 优先 Edge，其次 Chrome，最后交给系统默认浏览器：
rem Chrome 有时进程在跑却没有窗口（双击"没反应"、页面白屏），换 Edge 一定能开。
set "PAGE=%~dp0dist\index.html"
set "X86=%ProgramFiles(x86)%"
set "X64=%ProgramFiles%"
if not exist "%PAGE%" (
  echo 还没有构建产物。
  echo 先在项目目录运行：npm install ^&^& npm run build
  pause
  exit /b 1
)
if exist "%X86%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%X86%\Microsoft\Edge\Application\msedge.exe" --new-window "%PAGE%"
  exit /b 0
)
if exist "%X64%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%X64%\Microsoft\Edge\Application\msedge.exe" --new-window "%PAGE%"
  exit /b 0
)
if exist "%X64%\Google\Chrome\Application\chrome.exe" (
  start "" "%X64%\Google\Chrome\Application\chrome.exe" --new-window "%PAGE%"
  exit /b 0
)
if exist "%X86%\Google\Chrome\Application\chrome.exe" (
  start "" "%X86%\Google\Chrome\Application\chrome.exe" --new-window "%PAGE%"
  exit /b 0
)
start "" "%PAGE%"
