@echo off
setlocal

cd /d "%~dp0"

if not exist "node_modules" (
  echo [error] node_modules is missing. Run npm install first.
  pause
  exit /b 1
)

npm run start
