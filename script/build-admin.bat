@echo off
echo =========================================
echo   DBSchemaExcel2DDL Builder (Admin Mode)
echo =========================================
echo.
echo This script will build the Electron app.
echo Running with administrator privileges to resolve code signing cache issues.
echo.

cd /d "%~dp0.."

echo Building Electron application...
call npm run build:electron

if %errorlevel% equ 0 (
    echo.
    echo =========================================
    echo   BUILD SUCCESSFUL!
    echo =========================================
    echo.
    echo Application location:
    echo %~dp0..\dist-electron\win-unpacked\DBSchemaExcel2DDL.exe
    echo.
    echo You can now run the app using:
    echo npm run start:app
    echo.
) else (
    echo.
    echo =========================================
    echo   BUILD FAILED
    echo =========================================
    echo.
)

pause
