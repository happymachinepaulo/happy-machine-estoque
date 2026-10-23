@echo off
cd /d "%~dp0"
where python >nul 2>nul && (python scripts\preview.py & goto :fim)
where py >nul 2>nul && (py -3 scripts\preview.py & goto :fim)
echo Instale o Python 3 em python.org (marque "Add Python to PATH") e abra de novo.
pause
:fim
