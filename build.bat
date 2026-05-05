@echo off
rem 선잇기 퍼즐 빌드 스크립트 (Windows).
rem 한글 깨짐 방지: UTF-8 코드 페이지 설정.
chcp 65001 > nul
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo [1/4] 타입 체크
call tsc --noEmit
if errorlevel 1 goto :err

echo [2/4] tsc 빌드 → build\
if exist build rmdir /s /q build
call tsc -p tsconfig.build.json
if errorlevel 1 goto :err

echo [3/4] 번들 → release\dist.js
if exist release rmdir /s /q release
node --experimental-strip-types tools\bundle.ts
if errorlevel 1 goto :err

echo [4/4] 릴리즈 폴더 구성
node --experimental-strip-types tools\release.ts
if errorlevel 1 goto :err

echo 완료. release\ 안의 파일을 정적 호스팅하면 됩니다.
dir release
exit /b 0

:err
echo 빌드 실패.
exit /b 1
