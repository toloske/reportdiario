@echo off
title Sincronizador de Rotas (MySQL -> Supabase)
cd /d "%~dp0"
echo ===================================================
echo Iniciando Daemon de Sincronizacao Automatica...
echo ===================================================
node sync_daemon.js
pause
