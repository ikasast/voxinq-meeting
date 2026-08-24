@echo off
rem Windows entry point for the voxinq CLI. Scoop shims this as "voxinq".
node "%~dp0src\index.mjs" %*
