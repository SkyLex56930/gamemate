@echo off
setlocal
cd /d "%~dp0"
echo Installation du pont GameMate Game Bar V13...
node apply-gamebar-v13.mjs
if errorlevel 1 (
  echo.
  echo Installation interrompue. Lis le message d'erreur ci-dessus.
  pause
  exit /b 1
)
echo.
echo Le pont est installe. Tu peux maintenant compiler le Companion.
pause
