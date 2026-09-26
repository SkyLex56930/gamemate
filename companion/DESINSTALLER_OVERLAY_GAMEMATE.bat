@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title Desinstallation de l'overlay GameMate
if not exist "src-tauri" if not exist "package.json" goto :wrong_folder

echo ============================================================
echo       DESINSTALLATION DE L'OVERLAY GAMEMATE
echo ============================================================
echo.
echo Ce script va :
echo   - fermer les processus des anciens overlays ;
echo   - envoyer leurs dossiers, installateurs et archives a la Corbeille ;
echo   - conserver le Companion et tous ses dossiers principaux.
echo.
echo Dossiers proteges : src, src-tauri, components, pages, public,
echo lib, node_modules, dist et tous les fichiers principaux du Companion.
echo.
choice /C ON /N /M "Continuer ? [O/N] "
if errorlevel 2 goto :cancel

echo.
echo [1/2] Fermeture des anciens processus...
taskkill /IM GameMateOverlayV16.exe /F >nul 2>&1
taskkill /IM GameMateOverlayV15.exe /F >nul 2>&1
taskkill /IM GameMateOverlayV14.exe /F >nul 2>&1
taskkill /IM GameMateOverlayHost.exe /F >nul 2>&1
taskkill /IM GameMateNativeOverlay.exe /F >nul 2>&1

echo [2/2] Envoi des fichiers de l'overlay a la Corbeille...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "Add-Type -AssemblyName Microsoft.VisualBasic;" ^
  "$root=(Get-Location).Path;" ^
  "$ui=[Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs;" ^
  "$bin=[Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin;" ^
  "$dirs=@('external-overlay-v16','external-overlay-v15','native-overlay','.native-overlay-v14-backup','native-overlay-v14-backup','.v12-backup','.v12-1-backup','.v12-2-backup','.v12-3-backup','.v12-4-backup','.v12-5-backup','.v12-6-backup','.v12-7-backup','v13-companion','v13-gamebar','_overlay-archives-obsoletes');" ^
  "$files=@('INSTALL_EXTERNAL_OVERLAY_V16.bat','INSTALL_EXTERNAL_OVERLAY_V15.bat','INSTALL_NATIVE_OVERLAY_V14.bat','INSTALL_OVERLAY_V12.bat','OUVRIR_GAMEBAR_V13.bat','RANGER_ANCIENNES_VERSIONS_OVERLAY.bat','apply-gamebar-v13.js','apply-gamebar-v13.mjs','apply-native-overlay-v14.js','apply-native-overlay-v14.mjs','apply-overlay-v12.js','apply-overlay-v12.mjs');" ^
  "$patterns=@('GameMate_Companion_External_Overlay*.zip','GameMate_Companion_Native_Overlay*.zip','GameMate_Companion_Overlay_V*.zip','GameMate_Companion_GameBar_Overlay*.zip');" ^
  "foreach($name in $dirs){$path=Join-Path $root $name;if(Test-Path -LiteralPath $path -PathType Container){[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($path,$ui,$bin);Write-Host ('[CORBEILLE] '+$name)}};" ^
  "foreach($name in $files){$path=Join-Path $root $name;if(Test-Path -LiteralPath $path -PathType Leaf){[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($path,$ui,$bin);Write-Host ('[CORBEILLE] '+$name)}};" ^
  "foreach($pattern in $patterns){Get-ChildItem -Path $root -File -Filter $pattern -ErrorAction SilentlyContinue | ForEach-Object {[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($_.FullName,$ui,$bin);Write-Host ('[CORBEILLE] '+$_.Name)}}"

if errorlevel 1 goto :error

echo.
echo ============================================================
echo [OK] Les fichiers autonomes de l'overlay ont ete desinstalles.
echo [OK] Ils restent recuperables depuis la Corbeille.
echo [OK] Le Companion principal n'a pas ete modifie.
echo ============================================================
echo.
echo Tu peux maintenant supprimer manuellement ce fichier :
echo DESINSTALLER_OVERLAY_GAMEMATE.bat
pause
exit /b 0

:cancel
echo.
echo [ANNULE] Aucun fichier n'a ete modifie.
pause
exit /b 0

:wrong_folder
echo ============================================================
echo [ERREUR] Ce fichier n'est pas place dans le dossier companion.
echo Place DESINSTALLER_OVERLAY_GAMEMATE.bat a cote de package.json,
echo src, src-tauri et INSTALL_EXTERNAL_OVERLAY_V16.bat, puis relance-le.
echo Aucun fichier n'a ete modifie.
echo ============================================================
pause
exit /b 2

:error
echo.
echo [ERREUR] La desinstallation n'a pas pu se terminer completement.
echo Aucun dossier principal du Companion n'a ete cible.
echo Envoie une capture de cette fenetre pour identifier le fichier bloque.
pause
exit /b 1
