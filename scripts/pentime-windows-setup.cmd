@echo off
setlocal

echo [PenTime] Windows setup helper
echo [PenTime] Working directory: %CD%

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Please install Node.js 24.x first.
  exit /b 1
)

node --version

echo [PenTime] Preparing pnpm 10.27.0 via corepack...
corepack prepare pnpm@10.27.0 --activate
if errorlevel 1 (
  echo [WARN] corepack prepare failed. If pnpm is already available, this may be harmless.
)

where uv >nul 2>nul
if not errorlevel 1 (
  echo [PenTime] uv detected. Trying to locate Python 3.12...
  for /f "delims=" %%i in ('uv python find 3.12 2^>nul') do set PYTHON=%%i
  if defined PYTHON (
    set npm_config_python=%PYTHON%
    echo [PenTime] Using Python: %PYTHON%
  )
)

echo [PenTime] Installing dependencies...
call pnpm.cmd install
if errorlevel 1 exit /b 1

echo [PenTime] Rebuilding Electron...
call pnpm.cmd rebuild electron
if errorlevel 1 exit /b 1

echo [PenTime] Rebuilding Windows native modules if needed...
call pnpm.cmd rebuild @paymoapp/electron-shutdown-handler
if errorlevel 1 echo [WARN] electron-shutdown-handler rebuild failed. See README_PENTIME_MIGRATION.md for node-gyp troubleshooting.

call pnpm.cmd rebuild registry-js
if errorlevel 1 echo [WARN] registry-js rebuild failed. See README_PENTIME_MIGRATION.md for node-gyp troubleshooting.

echo [PenTime] Running typecheck...
call pnpm.cmd typecheck
if errorlevel 1 exit /b 1

echo [PenTime] Setup completed. Start the app with:
echo     pnpm.cmd dev

endlocal
