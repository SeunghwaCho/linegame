# 🧩 선잇기 퍼즐 (linegame)

같은 색의 점들을 드래그로 이어 선이 서로 교차하지 않게 모두 연결하면 클리어되는 2D 웹 퍼즐입니다.

- **엔진/언어:** TypeScript + HTML5 Canvas (외부 라이브러리 0개)
- **호환:** PC 브라우저, 모바일 터치, 폴더블 펼침/닫힘 화면
- **레벨:** 1 ~ 100 (수동 5 + 자동 95)
- **저장:** IndexedDB (DB 손상 시 자동 in-memory fallback)

## 빠른 시작 (개발)

```bash
# 1. tsc 컴파일 (build/ 출력)
tsc -p tsconfig.build.json

# 2. 정적 호스팅
python -m http.server 8001
# → http://localhost:8001/ 접속
```

## 단일 산출물(dist.js) 빌드

릴리즈는 자체 번들러로 `release/dist.js` 단일 파일을 만듭니다.

```bash
# Linux / macOS
./build.sh

# Windows
build.bat
```

산출물 (`release/`):
- `dist.js` — 모든 모듈을 IIFE로 번들한 단일 JS
- `index.html` — `<script src="./dist.js" defer>` 로 변경됨
- `data/levels.json` — 레벨 데이터

## 테스트

```bash
node --experimental-strip-types --test tests/*.test.ts
```

총 62개 단위 테스트 (intersection, spatialHash, pathBuilder, board, levelLoader, hint, persistence).

## 디렉토리 구조

```
src/
  geometry/   — 교차 판정, 공간 해시 (브라우저 의존 X, 순수 함수)
  game/       — Board, PathBuilder, Hint
  level/      — JSON 스키마 / 로더
  scene/      — Canvas Renderer, InputHandler, GameScene, Effects, Colors
  audio/      — Sound (Web Audio 신디시스, 외부 파일 X)
  storage/    — IndexedDB Persistence (fallback 포함)
  main.ts     — 부트스트랩
data/
  levels.json — 100 레벨
tests/        — node:test 기반 단위 테스트
tools/
  generate-levels.ts — 레벨 자동 생성기
  bundle.ts          — 자체 번들러
  release.ts         — release/ 구성
```

## 핵심 알고리즘

### 교차 판정

`src/geometry/intersection.ts` — 외적(CCW) 기반 세그먼트-세그먼트 교차 + 공선 케이스 1D AABB 보강 + 점-선분 거리 + 투영점.

### 공간 해시 (broad-phase)

`src/geometry/spatialHash.ts` — 그리드 cell 단위 인덱스. 세그먼트가 지나는 모든 cell에 등록(Amanatides & Woo). `cellsOf` 역인덱스로 O(k) 제거. 빈 버킷은 자동 정리.

### PathBuilder (드래그 처리)

`src/game/path.ts` — 한 프레임 입력에 대해 다음 파이프라인:

1. **되감기** — 직전이 아닌 과거 세그먼트 근처면 그 지점까지 pop (체이닝 — zero-length 잔재 방지)
2. **MIN_STEP** — 너무 작은 이동은 무시
3. **터널링 방지** — 다른 색 dot 반경을 통과하면 reject (선분-원 거리)
4. **타 path 교차** — broad-phase → narrow-phase
5. **자기 교차** — 직전 세그먼트 제외하고 본인 세그먼트와 검사
6. **finalize** — 같은 색 목적 dot에 닿으면 path 완성

### 클리어 판정

`src/game/board.ts#isCleared()` — 모든 colorId가 `finalizedPaths` 에 등록되었는지 (드래그 단계에서 교차는 이미 보장).

## 룰

- 같은 색 점 쌍을 드래그로 연결.
- 선들은 절대 교차 금지 (자기 자신 포함).
- 다른 색 점 위를 통과 금지.
- 같은 색의 다른 dot에서 다시 시작하면 기존 path는 자동 제거.
- 진행 중 path 위에서 다른 dot 시작 시 진행 중인 것은 cancel.

## 컨트롤

- **드래그**: 같은 색 점 두 개를 잇기
- **💡 힌트**: 미연결 색 중 가장 가까운 쌍을 펄스로 표시 (3초)
- **🔊/🔇**: 사운드 토글 (저장됨)
- **다시 시작**: 컨펌 후 보드 리셋

## 라이선스 / 출처

- 코드: 자체 작성, 외부 의존 없음.
- 사운드: Web Audio API 신디시스 (외부 파일 미사용).
- 색상 팔레트: Okabe-Ito 변형 (색맹 친화).
