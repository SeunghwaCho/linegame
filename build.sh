#!/usr/bin/env bash
# 선잇기 퍼즐 빌드 스크립트 (Linux/macOS).
# 1. tsc 컴파일 (build/) → 2. 자체 번들러로 dist.js → 3. release/ 구성.
set -euo pipefail
cd "$(dirname "$0")"

echo "[1/4] 타입 체크"
tsc --noEmit

echo "[2/4] tsc 빌드 → build/"
rm -rf build
tsc -p tsconfig.build.json

echo "[3/4] 번들 → release/dist.js"
rm -rf release
node --experimental-strip-types tools/bundle.ts

echo "[4/4] 릴리즈 폴더 구성"
node --experimental-strip-types tools/release.ts

echo "완료. release/ 안의 파일을 정적 호스팅하면 됩니다."
ls -la release
