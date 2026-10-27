@echo off
chcp 65001 >nul
rem 打开已打包的界面（不需要 Node）
start "" "%~dp0dist\index.html"
