@echo off
chcp 65001 >nul
echo ========================================
echo   Subiendo cambios a Git
echo ========================================
cd /d "%~dp0"

if exist ".git\index.lock" (
    echo Eliminando .git\index.lock ...
    del /f ".git\index.lock"
)

echo.
echo Agregando archivos...
git add server.js EJEMPLOS-REQUEST-API.md EC2-QUE-NECESITAS.md
git add scripts/
if errorlevel 1 (
    echo Error en git add.
    pause
    exit /b 1
)

echo.
echo Estado:
git status

echo.
echo Haciendo commit...
git commit -m "Feat: script_path en save-json, script Control-M automation, docs EC2 y ejemplos"
if errorlevel 1 (
    echo No hay cambios que commitear o error en commit.
    pause
    exit /b 0
)

echo.
echo Subiendo a origin master...
git push origin master
if errorlevel 1 (
    echo Error en git push. Revisa conexion y credenciales.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Listo. Ya puedes hacer git pull en EC2
echo ========================================
pause
