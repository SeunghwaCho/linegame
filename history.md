# 작업 이력

작업 단위는 **설계 → 테스트 작성 → 구현 → 검증** 순으로 진행됨.
모든 단위 테스트는 Node 빌트인 `node:test` 사용, 외부 의존 없음.

## 2026-05-05

### 1. 교차 판정 알고리즘 설계 + 구현 (geometry)
- `src/geometry/intersection.ts`
  - CCW 외적 + EPSILON 부호화
  - 세그먼트-세그먼트 교차 (X자, T자, 공선+AABB)
  - 점-선분 거리, 선분 위 투영점
- 리뷰 보완 4건 반영
  - 공선 분리 케이스 false (1D AABB 추가)
  - SpatialHash GC: cellsOf 역인덱스 + 빈 버킷 정리
  - 자기 교차 시 reject 대신 되감기 (체이닝으로 zero-length 잔재 제거)
  - 빠른 드래그 터널링: 선분-원 거리로 다른 색 dot 통과 차단
- 16/16 테스트 통과

### 2. 공간 해시 (broad-phase)
- `src/geometry/spatialHash.ts` — Amanatides & Woo grid traversal
- insert/remove/removePath/clear/query, 단조 증가 SegmentId
- 9/9 테스트 통과

### 3. PathBuilder
- `src/game/path.ts` — 드래그 한 프레임 파이프라인
- 되감기 체이닝, foreign-dot 충돌, finalize, cancel
- 12/12 테스트 통과

### 4. 레벨 데이터 모델 + 샘플 5
- `src/level/types.ts`, `src/level/loader.ts`, `data/levels.json`
- 같은 색 정확히 2개 / dot id 중복 / 필수 필드 검증
- 6/6 테스트 통과

### 5. Board (전체 게임 상태)
- `src/game/board.ts`
- startPath/updatePath/endPath/reset, 색별 finalizedPaths
- 같은 색 재시작 시 기존 path 자동 제거 (Flow Free 식 UX)
- isCleared(): 모든 색 연결 여부
- 11/11 테스트 통과

### 6. Canvas Renderer + InputHandler + GameScene
- `src/scene/renderer.ts` — DPR 스케일, letterbox, 보드 좌표계 변환
- `src/scene/input.ts` — Pointer events 통합 (마우스/터치)
- `src/scene/game.ts` — Board + Renderer + Input + Sound + Effects 묶음
- `src/scene/colors.ts` — 색맹 친화 팔레트 (Okabe-Ito 변형)
- `index.html` — header(레벨 선택/힌트/뮤트/리셋) + canvas

### 7. 사운드 + 클리어 이펙트 + 힌트
- `src/audio/sound.ts` — Web Audio OscillatorNode 신디시스 (파일 0개)
- `src/scene/effects.ts` — 가벼운 파티클 시스템 (클리어 시 burst)
- `src/game/hint.ts` — 미연결 색 중 거리 가까운 쌍 제안
- 3/3 hint 테스트 통과

### 8. IndexedDB 저장 / 이어하기
- `src/storage/persistence.ts`
  - 완료 레벨, 마지막 레벨 id, 뮤트 옵션 KV 저장
  - IndexedDB 미지원 / 손상 시 in-memory fallback (메서드 시그니처 동일)
- 5/5 테스트 통과 (Node 환경에서 자동 fallback 검증)

### 9. 레벨 100개
- `tools/generate-levels.ts`
- 1~5: 수동 디자인 유지
- 6~100: lane 기반 자동 생성 (lane 분리 → 항상 solvable). PRNG seed = id 기반 (재현 가능)
- 색 수 2 → 8 점진 증가, 가로/세로 lane 교차 회전

### 10. 자체 번들러 + build.sh / build.bat
- `tools/bundle.ts`
  - main.js부터 import 그래프 위상정렬
  - import/re-export 라인 제거, `export ` prefix 제거
  - sourceMappingURL 주석 정리
  - IIFE로 감싸 글로벌 오염 방지
- `tools/release.ts`
  - dist.js 존재 확인 → index.html 의 module script를 단일 script로 변환 → data/ 복사
- `build.sh` / `build.bat`
  - `chcp 65001` 으로 Windows 한글 깨짐 방지
- 산출물: `release/dist.js` (47KB), `release/index.html`, `release/data/levels.json`
- 정적 호스팅 검증: `cd release && python -m http.server 8002` → 200 OK on /, /dist.js, /data/levels.json

### 11. 문서화
- `readme.md` — 한글, 빠른 시작 / 빌드 / 테스트 / 알고리즘 설명
- `history.md` — 본 문서

## 검증 요약

- 단위 테스트: **62/62 통과**
  - intersection 16, spatialHash 9, pathBuilder 12, levelLoader 6 (100레벨 검증 포함), board 11, hint 3, persistence 5
- 타입 체크: `tsc --noEmit` strict, 0 errors
- 빌드: `./build.sh` 성공 → release/dist.js 단일 산출물
- 정적 호스팅: `python -m http.server` 로 200 OK 확인
- 한계: 실제 드래그/터치 인터랙션은 CLI에서 검증 불가 — 브라우저 수동 확인 필요
