@echo off
rem Comando gdm-extractor da instalacao: o Node e o programa embutidos.
rem So esta pasta (bin) entra no PATH; as ferramentas ficam em tools (Instalador-Implement.md, secao 3).
"%~dp0..\runtime\node.exe" "%~dp0..\app\gdm-yoinks.mjs" %*
exit /b %ERRORLEVEL%
