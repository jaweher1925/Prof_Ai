@echo off
echo ================================================
echo  ProfAI Studio — First-time Setup
echo ================================================
echo.

echo [1/4] Cleaning old node_modules...
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json del package-lock.json
echo Done.

echo.
echo [2/4] Installing frontend dependencies...
call npm install
if %errorlevel% neq 0 (echo ERROR: npm install failed && pause && exit /b 1)
echo Done.

echo.
echo [3/4] Installing backend dependencies...
cd api
call npm install
if %errorlevel% neq 0 (echo ERROR: api npm install failed && pause && exit /b 1)
cd ..
echo Done.

echo.
echo [4/4] Setup complete!
echo.
echo ---- Next steps --------------------------------
echo  1. Copy .env.example to .env.local and fill in your API keys
echo  2. Run:  npm run dev         (frontend only, http://localhost:5173)
echo      OR:  npm run dev:swa     (frontend + backend via SWA CLI)
echo ------------------------------------------------
echo.
pause
