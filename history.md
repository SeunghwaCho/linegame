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

## 검증 요약 (1라운드)

- 단위 테스트: **62/62 통과**
- 타입 체크: `tsc --noEmit` strict, 0 errors
- 빌드: `./build.sh` 성공 → release/dist.js 단일 산출물
- 정적 호스팅: `python -m http.server` 로 200 OK 확인
- 한계: 실제 드래그/터치 인터랙션은 CLI에서 검증 불가 — 브라우저 수동 확인 필요

---

## 2라운드 (nemonemo 비교 + CLAUDE.md 규칙 강화)

CLAUDE.md 신규 규칙:
- 풀 수 없는 레벨 생성 금지 (§8)
- 적녹색약 배려: 적색 + 녹색군 동시 등장 금지 (§8)
- 모든 게임 UI는 Canvas 안에서 (§3)
- 폴더블 매 프레임 레이아웃 (§8)

### 12. package.json / `run` 스크립트 / docs/
- `package.json` (devDependency: typescript만, 런타임 0개)
- `run` (dev/watch/test/build/gen)
- `docs/state_diagram.puml`, `class_diagram.puml`, `sequence_diagram.puml` + PlantUML PNG 렌더

### 13. 색약 제약 + Solver
- `src/level/colorConstraint.ts` — RED_GROUP/GREEN_GROUP, isCompatibleColorSet, pickCompatibleColors
  - capacity 기반 모드 선택(노렌/노그린)
- `src/level/solver.ts` — 격자 BFS + 색 순서 무작위 백트래킹 (NP-complete 휴리스틱)
- `tools/generate-levels.ts` 재작성:
  - 1~5 수동 (색 ID 재배치로 색약 준수)
  - 6~100 4단계 난이도 (easy/normal/hard/expert), interlock 비율 점진 증가
  - 후보 생성 → solver 검증 → 통과만 채택 (MAX_RETRIES 200, 초과 시 throw)
- `tests/levelsValid.test.ts` — 모든 100 레벨에 대해 색약 + solvability 동적 테스트 (200 케이스)

### 14. 폴더블 매 프레임 레이아웃 (#30)
- `Renderer.resize()` 변화 없으면 no-op
- App.fitLayout() 매 프레임 호출 + dpr/cssW/cssH 캐시
- `window.orientationchange`(100ms 지연) + `visualViewport.resize` 추가 리스닝

### 15. Scene 상태머신 + Canvas UI (#27, #29)
- `src/scene/scene.ts` — Scene 인터페이스
- `src/scene/app.ts` — App (RAF + 입력 통합 + scene 관리, dpr-only ctx 변환)
- `src/scene/registry.ts` — 순환 import 방지용 scene 팩토리 레지스트리
- `src/scene/menuScene.ts` — 10×N 레벨 그리드 + 진행도/별 합계 표시
- `src/scene/gameScene.ts` — 보드 + 툴바(◀💡⏸🔊↺) + 모달 + 일시정지 오버레이
- `src/scene/resultScene.ts` — 별 표시 + 메뉴/다시/다음 + 자동 다음 레벨 카운트다운
- `src/ui/button.ts`, `src/ui/modal.ts`, `src/ui/types.ts` — Canvas 위젯 + Modal
- `index.html` 슬림화: header/HTML 버튼 모두 제거, `<canvas>` + `<style>` 만

### 16. 타이머 + 일시정지 + 별 + 자동 다음 + 통계 + 롱프레스
- `src/game/stars.ts` — 시간/거부 횟수/색 수 기반 별 1~3 계산
- `Persistence.recordStars()` / `getBestStars()` — IndexedDB KV 확장
- GameScene: elapsedSec 타이머, paused 토글, rejectCount 추적, 클리어 시 별 계산/저장
- ResultScene: ★★★ 표시 + AUTO_NEXT_DELAY(5s) 카운트다운, 카드 외부 탭으로 취소
- MenuScene: 셀에 미니어처 별, 툴바에 `★ M / 300` 합계
- `Board.findFinalizedPathAt(p, tol)` + `removeFinalizedPath(colorId)`
- GameScene: 롱프레스(450ms) 감지로 path 제거 (8px 이동 허용오차)

## 최종 검증 요약

- **단위 테스트: 284/284 통과**
  - geometry 25, pathBuilder 12, board+longPress 15, levelLoader 6, hint 3, persistence 5, colorConstraint 6, solver 7, stars 5, **levelsValid 200**
- **tsc strict: 0 errors**
- **빌드: `npm run build` 성공** → release/dist.js (76KB), 21 모듈 IIFE 번들
- **정적 호스팅 검증 OK** — release/만 서빙 시 200 OK
- 런타임 외부 의존성: **0개** (devDependency: typescript만)


## 2026-05-05 (속편) — 8판부터 원형 영역 puzzle (난이도 강화)

### 17. circle 제약 도입 — 8판부터 disk 안에 갇힌 path
- 요구: 8판부터 한 dot은 화면을 꽉 채우는 원 위, 나머지 한 dot은 원 안. 선이 원 밖으로 나가면 안 됨.
- `Level.circle?: { cx, cy, r }` 추가 (선택 필드, 1~7판은 미설정)
- `loader.ts`: circle 검증 — 색별로 정확히 1개 boundary + 1개 inside dot 강제, 원 밖 dot 거부
- `path.ts`: `PathBuilder` 에 `circle` 옵션 + `out-of-bounds` reject. 끝점이 disk 밖이면 차단 (disk 볼록성으로 chord 자동 보장)
- `board.ts` / `gameScene.ts`: Board → PathBuilder 로 circle 옵션 전달
- `renderer.ts`: circle 있으면 원 외부 음영(#f1f3f5) + 흰색 disk + 회색 테두리

### 18. 원형 puzzle 생성기
- `constructive.ts`: `cellAllowed`, `startCellAllowed` predicate 추가 (격자에 마스크)
- `tools/generate-levels.ts`:
  - 8~100판: `generateCircleLevel` — disk 마스크로 셀 제한, 시작 셀은 boundary ring 에서만 선택
  - 워크 종료 후 시작 dot 을 cell 중심에서 원 boundary 로 스냅 (radial 방향)
  - 스냅 후 검증: 새 첫 segment 가 (a) 다른 색 dot 침범 X (b) 다른 색 path 와 교차 X (c) 자기 path 와 교차 X
  - 1~5: 수동, 6~7: 일반 사각, 8~100: 원형 (CIRCLE_R=180, BOARD/2-20)
- `solver.ts`: `Level.circle` 인지 — disk 마스크 셀만 BFS 통과 허용 (dot 셀은 강제 허용)

### 19. 테스트
- `pathBuilder.test.ts`: circle out-of-bounds reject, boundary 시작 dot 진행 가능 (2)
- `levelLoader.test.ts`: circle 정상 + 밖 dot 에러 + 모두 boundary 에러 (3)
- `levelsValid.test.ts`: 100 레벨 색약/solvable/non-trivial 통과
- 전체: **396/396 테스트 통과**
- 풀 빌드 OK: tsc strict 0 errors, dist.js 79KB
