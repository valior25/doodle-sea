@echo off
cd /d "%~dp0"
start "" http://localhost:8000/tv
node server.js
pause
