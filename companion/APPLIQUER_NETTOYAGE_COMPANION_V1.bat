@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo  GameMate Companion - Nettoyage V1
echo ============================================================
echo.
echo Ce correctif va :
echo - retirer le code et la fenetre de l'ancien overlay ;
echo - conserver le vocal de squad et les reglages audio ;
echo - corriger les boutons trompeurs ou sans action ;
echo - ajouter des actions Reessayer aux erreurs principales ;
echo - creer une sauvegarde avant chaque modification.
echo.

if not exist "package.json" goto :wrong_folder
if not exist "src\App.tsx" goto :wrong_folder
if not exist "src-tauri\tauri.conf.json" goto :wrong_folder

node apply-companion-cleanup-v1.mjs
if errorlevel 1 goto :error

echo.
echo Verification TypeScript et Vite...
call npm run build
if errorlevel 1 goto :build_error

echo.
echo ============================================================
echo [OK] Nettoyage termine et build web valide.
echo Tu peux maintenant lancer : npm run tauri build
echo ============================================================
pause
exit /b 0

:wrong_folder
echo.
echo [ERREUR] Decompresse tous les fichiers du ZIP a la racine de companion.
echo Le BAT doit etre a cote de package.json, src et src-tauri.
pause
exit /b 2

:build_error
echo.
echo [ERREUR] Le nettoyage a ete applique mais le build a detecte un probleme.
echo Une sauvegarde se trouve dans .companion-cleanup-v1-backup.
echo Envoie une capture complete du message affiche au-dessus.
pause
exit /b 3

:error
echo.
echo [ERREUR] Le correctif n'a pas pu etre applique.
echo Aucun fichier non sauvegarde ne doit etre modifie.
pause
exit /b 1
