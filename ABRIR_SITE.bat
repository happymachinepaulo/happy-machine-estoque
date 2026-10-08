@echo off
setlocal
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel%==0 (
  python local\servidor.py
  goto :fim
)
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 local\servidor.py
  goto :fim
)
echo.
echo Python 3 nao foi encontrado.
echo Para este site usar SQLite local, e necessario um pequeno servidor local.
echo Instale Python 3 pelo site python.org e marque "Add Python to PATH".
echo Depois abra ABRIR_SITE.bat novamente.
echo.
pause
:fim
endlocal
