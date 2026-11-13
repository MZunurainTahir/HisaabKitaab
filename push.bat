@echo off
title Push HisaabKitab to GitHub
cd /d "%~dp0"
echo ========================================================
echo Pushing HisaabKitab to https://github.com/MZunurainTahir/HisaabKitaab
echo ========================================================
echo.
git push -u origin main --force
echo.
echo ========================================================
if %ERRORLEVEL% equ 0 (
    echo SUCCESS! Your code has been pushed to GitHub!
) else (
    echo If it failed, please check the error message above.
)
echo ========================================================
pause

