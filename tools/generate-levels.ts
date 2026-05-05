/**
 * 1~100 레벨 데이터 생성기 v4 — 8판부터 원형 영역 puzzle.
 *
 * CLAUDE.md §8 준수:
 *   1) 풀 수 없는 레벨 금지 — 구성적 생성으로 자동 보장 (경로가 곧 해)
 *   2) 적녹색약 — pickCompatibleColors 사용
 *   3) 레벨 3 이상은 직선 단순 연결로 풀리는 케이스 금지
 *
 * - 1~5: 수동 레벨 (디자인된 비자명 케이스)
 * - 6~7: 일반 사각 보드, 구성적 생성기 + non-trivial 필터
 * - 8~100: 원형 영역(disk) puzzle. 한 dot은 원 위(boundary), 한 dot은 원 안.
 *          path는 disk 안에 갇힘. 색 수는 기존 곡선과 동일.
 *
 * 실행: node --experimental-strip-types tools/generate-levels.ts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isSolvable } from "../src/level/solver.ts";
import { isTriviallySolvable } from "../src/level/trivialCheck.ts";
import {
  pickCompatibleColors,
  isCompatibleColorSet,
  maxCompatibleColors,
} from "../src/level/colorConstraint.ts";
import {
  constructiveGenerateNonTrivial,
  constructiveGenerateWithColors,
  type ConstructiveResult,
} from "../src/level/constructive.ts";
import { segmentsIntersect, pointSegDistance } from "../src/geometry/intersection.ts";
import type { Level, LevelCircle } from "../src/level/types.ts";

const PALETTE_SIZE = 8;
const BOARD = 400;
const MAX_RETRIES_PER_LEVEL = 80;

// 수동 레벨 — 색약 분류표 준수 (적색군 0 + 녹색군 2,5 동시 사용 X)
const SAMPLES: Level[] = [
  {
    id: 1,
    name: "튜토리얼",
    width: BOARD,
    height: BOARD,
    dots: [
      { id: 1, colorId: 0, x: 80, y: 200 },
      { id: 2, colorId: 0, x: 320, y: 200 },
    ],
  },
  {
    id: 2,
    name: "두 색 교차",
    width: BOARD,
    height: BOARD,
    dots: [
      { id: 1, colorId: 0, x: 80, y: 80 },
      { id: 2, colorId: 0, x: 320, y: 320 },
      { id: 3, colorId: 1, x: 320, y: 80 },
      { id: 4, colorId: 1, x: 80, y: 320 },
    ],
  },
  {
    id: 3,
    name: "세 색 십자",
    width: BOARD,
    height: BOARD,
    dots: [
      { id: 1, colorId: 0, x: 80, y: 200 },
      { id: 2, colorId: 0, x: 320, y: 200 },
      { id: 3, colorId: 1, x: 200, y: 80 },
      { id: 4, colorId: 1, x: 200, y: 320 },
      { id: 5, colorId: 3, x: 120, y: 120 },
      { id: 6, colorId: 3, x: 280, y: 280 },
    ],
  },
  {
    id: 4,
    name: "포위",
    width: BOARD,
    height: BOARD,
    dots: [
      { id: 1, colorId: 0, x: 200, y: 200 },
      { id: 2, colorId: 0, x: 80, y: 80 },
      { id: 3, colorId: 1, x: 80, y: 200 },
      { id: 4, colorId: 1, x: 320, y: 200 },
      { id: 5, colorId: 3, x: 200, y: 80 },
      { id: 6, colorId: 3, x: 200, y: 320 },
      { id: 7, colorId: 4, x: 320, y: 320 },
      { id: 8, colorId: 4, x: 80, y: 320 },
    ],
  },
  {
    // 4색이 보드 중앙을 통과하도록 배치 — 직선이면 모두 (200,200) 부근 교차.
    // 손으로 풀려면 각 색이 우회 곡선을 그려야 함.
    id: 5,
    name: "사방으로",
    width: BOARD,
    height: BOARD,
    dots: [
      { id: 1, colorId: 0, x: 60, y: 60 },
      { id: 2, colorId: 0, x: 340, y: 340 },
      { id: 3, colorId: 1, x: 340, y: 60 },
      { id: 4, colorId: 1, x: 60, y: 340 },
      { id: 5, colorId: 3, x: 200, y: 50 },
      { id: 6, colorId: 3, x: 200, y: 350 },
      { id: 7, colorId: 4, x: 50, y: 200 },
      { id: 8, colorId: 4, x: 350, y: 200 },
    ],
  },
];

interface DifficultyConfig {
  numColors: number;
  cellSize: number;
  minLen: number;
  maxLen: number;
}

function difficultyOf(id: number): DifficultyConfig {
  // 6~25 easy: 2~3색, 워크 8~14
  if (id <= 25)
    return {
      numColors: 2 + ((id - 6) % 2), // 2 또는 3
      cellSize: 32,
      minLen: 6,
      maxLen: 12,
    };
  // 26~50 normal: 3~4색
  if (id <= 50)
    return {
      numColors: 3 + ((id - 26) % 2),
      cellSize: 28,
      minLen: 8,
      maxLen: 16,
    };
  // 51~75 hard: 4~5색
  if (id <= 75)
    return {
      numColors: 4 + ((id - 51) % 2),
      cellSize: 25,
      minLen: 10,
      maxLen: 20,
    };
  // 76~100 expert: 5~7색 (max compatible = 7)
  return {
    numColors: Math.min(7, 5 + ((id - 76) % 3)),
    cellSize: 22,
    minLen: 12,
    maxLen: 24,
  };
}

function pickRng(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nameFor(id: number, n: number): string {
  const themes = ["통로", "교차로", "오솔길", "골목", "회로", "미로", "회랑", "광장"];
  return `${themes[id % themes.length]} ${id} (${n}색)`;
}

function nameForCircle(id: number, n: number): string {
  const themes = ["원형 광장", "원형 회랑", "원형 미로", "회전목마", "동심원", "구슬"];
  return `${themes[id % themes.length]} ${id} (${n}색)`;
}

const DOT_RADIUS = 18;
// 원의 반경: 화면을 꽉 채우되 dot이 보드 밖으로 나가지 않게 약간 안쪽.
const CIRCLE_R = 200 - 20; // BOARD/2 - 20 = 180

interface SnappedResult {
  dots: ConstructiveResult["dots"];
  paths: ConstructiveResult["paths"];
  circle: LevelCircle;
}

/**
 * constructive 결과의 색별 시작 dot을 원 boundary로 스냅한 뒤 검증.
 * 검증: 새 시작 segment가 (a) 다른 색 dot을 침범하지 않고 (b) 다른 색 path 와 교차하지 않음.
 */
function snapAndValidate(
  r: ConstructiveResult,
  cellSize: number,
  circle: LevelCircle,
): SnappedResult | null {
  // 색별 walk segment 목록 — 셀 좌표를 px 중앙으로
  const px = (c: number): number => Math.round((c + 0.5) * cellSize);
  interface ColorPath {
    colorId: number;
    segments: Array<[{ x: number; y: number }, { x: number; y: number }]>;
    snapPt: { x: number; y: number };
  }
  const colorPaths: ColorPath[] = [];
  for (let i = 0; i < r.paths.length; i++) {
    const walk = r.paths[i]!;
    const colorId = r.dots[i * 2]!.colorId;
    // 시작 cell 중심
    const c0 = walk[0]!;
    const cx0 = px(c0[0]);
    const cy0 = px(c0[1]);
    // 원 중심에서 cell 중심으로의 방향 단위벡터
    const dx = cx0 - circle.cx;
    const dy = cy0 - circle.cy;
    const dlen = Math.hypot(dx, dy);
    if (dlen < 1) return null; // cell 이 원 중심에 있음 — 방향 정의 불가
    const ux = dx / dlen;
    const uy = dy / dlen;
    const snapPt = {
      x: circle.cx + ux * circle.r,
      y: circle.cy + uy * circle.r,
    };
    // 세그먼트 시퀀스: snapPt → C1 → C2 → ... → Cn-1
    const segs: Array<[{ x: number; y: number }, { x: number; y: number }]> = [];
    let prev = snapPt;
    for (let j = 1; j < walk.length; j++) {
      const cj = walk[j]!;
      const cur = { x: px(cj[0]), y: px(cj[1]) };
      segs.push([prev, cur]);
      prev = cur;
    }
    if (segs.length === 0) return null; // 워크가 1셀짜리
    colorPaths.push({ colorId, segments: segs, snapPt });
  }

  // 색별 시작/끝 dot 결정
  const dots: ConstructiveResult["dots"] = [];
  let nextDotId = 1;
  for (let i = 0; i < r.paths.length; i++) {
    const walk = r.paths[i]!;
    const colorId = r.dots[i * 2]!.colorId;
    const last = walk[walk.length - 1]!;
    dots.push({
      id: nextDotId++,
      colorId,
      x: colorPaths[i]!.snapPt.x,
      y: colorPaths[i]!.snapPt.y,
    });
    dots.push({
      id: nextDotId++,
      colorId,
      x: px(last[0]),
      y: px(last[1]),
    });
  }

  // 검증 1: 다른 색 dot 이 어떤 segment 의 (radius+1) 안을 통과하면 안 됨
  for (const cp of colorPaths) {
    for (const d of dots) {
      if (d.colorId === cp.colorId) continue;
      for (const [a, b] of cp.segments) {
        if (pointSegDistance(a, b, { x: d.x, y: d.y }) < DOT_RADIUS + 1) {
          return null;
        }
      }
    }
  }

  // 검증 2: 서로 다른 색 segment 간 교차 금지 (snap segment 포함)
  for (let i = 0; i < colorPaths.length; i++) {
    for (let j = i + 1; j < colorPaths.length; j++) {
      const A = colorPaths[i]!.segments;
      const B = colorPaths[j]!.segments;
      for (const sa of A) {
        for (const sb of B) {
          if (segmentsIntersect({ a: sa[0], b: sa[1] }, { a: sb[0], b: sb[1] })) {
            return null;
          }
        }
      }
    }
  }

  // 검증 3: 동일 색 내 자기교차 (snap segment 가 본인 경로와 만나는지)
  for (const cp of colorPaths) {
    const segs = cp.segments;
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 2; j < segs.length; j++) {
        // 인접 segment 는 endpoint 공유로 항상 교차 — 제외
        const sa = segs[i]!;
        const sb = segs[j]!;
        if (segmentsIntersect({ a: sa[0], b: sa[1] }, { a: sb[0], b: sb[1] })) {
          return null;
        }
      }
    }
  }

  return { dots, paths: r.paths, circle };
}

const CIRCLE_MAX_RETRIES = 400;

function generateCircleLevel(id: number): Level {
  const cfg = difficultyOf(id);
  const numColors = Math.min(cfg.numColors, maxCompatibleColors(PALETTE_SIZE));
  const circle: LevelCircle = { cx: BOARD / 2, cy: BOARD / 2, r: CIRCLE_R };
  const cellSize = cfg.cellSize;
  const cx = circle.cx;
  const cy = circle.cy;
  // 셀 중심이 disk 안쪽 — 셀이 disk 경계에 너무 가깝지 않게 cellSize*0.5 안쪽 마진.
  const innerLimit = circle.r - cellSize * 0.5;
  // boundary ring: 시작 셀 후보. disk 경계에서 약 cellSize*2 폭의 띠.
  const ringInner = circle.r - cellSize * 2.2;

  const cellAllowed = (c: number, r: number): boolean => {
    const x = (c + 0.5) * cellSize;
    const y = (r + 0.5) * cellSize;
    const d = Math.hypot(x - cx, y - cy);
    return d <= innerLimit;
  };
  const startCellAllowed = (c: number, r: number): boolean => {
    const x = (c + 0.5) * cellSize;
    const y = (r + 0.5) * cellSize;
    const d = Math.hypot(x - cx, y - cy);
    return d > ringInner && d <= innerLimit;
  };

  for (let attempt = 0; attempt < CIRCLE_MAX_RETRIES; attempt++) {
    const seed = id * 9311 + 60013 + attempt * 137;
    const rng = pickRng(seed);
    const colors = pickCompatibleColors(numColors, PALETTE_SIZE, rng);
    if (!isCompatibleColorSet(colors)) continue;

    // 워크 생성 (mask 적용)
    const r = constructiveGenerateWithColors(colors, {
      width: BOARD,
      height: BOARD,
      cellSize,
      minLen: cfg.minLen,
      maxLen: cfg.maxLen,
      seed,
      maxWalkAttempts: 12,
      cellAllowed,
      startCellAllowed,
    });
    if (!r) continue;

    const snapped = snapAndValidate(r, cellSize, circle);
    if (!snapped) continue;

    const lvl: Level = {
      id,
      name: nameForCircle(id, numColors),
      width: BOARD,
      height: BOARD,
      dots: snapped.dots,
      circle,
    };
    if (isTriviallySolvable(lvl)) continue;
    return lvl;
  }
  throw new Error(`레벨 ${id}: 원형 puzzle 생성 실패 (${CIRCLE_MAX_RETRIES}회 시도)`);
}

function generateAccepted(id: number): Level {
  const cfg = difficultyOf(id);
  const numColors = Math.min(cfg.numColors, maxCompatibleColors(PALETTE_SIZE));

  // 시드 시퀀스를 시도하면서 색 선택과 워크 생성 모두 retry
  for (let attempt = 0; attempt < MAX_RETRIES_PER_LEVEL; attempt++) {
    const seed = id * 9301 + 49297 + attempt * 131;
    const rng = pickRng(seed);
    const colors = pickCompatibleColors(numColors, PALETTE_SIZE, rng);
    if (!isCompatibleColorSet(colors)) continue;

    const r = constructiveGenerateNonTrivial(
      colors,
      {
        width: BOARD,
        height: BOARD,
        cellSize: cfg.cellSize,
        minLen: cfg.minLen,
        maxLen: cfg.maxLen,
        seed,
        maxWalkAttempts: 6,
      },
      (dots) =>
        isTriviallySolvable({
          id,
          name: "x",
          width: BOARD,
          height: BOARD,
          dots,
        }),
      40,
    );
    if (!r) continue;

    return {
      id,
      name: nameFor(id, numColors),
      width: BOARD,
      height: BOARD,
      dots: r.dots,
    };
  }
  throw new Error(`레벨 ${id}: ${MAX_RETRIES_PER_LEVEL}회 시도 후에도 비자명 + solvable 후보 없음`);
}

function buildAll(): Level[] {
  const all: Level[] = [];
  for (const s of SAMPLES) {
    const cset = new Set(s.dots.map((d) => d.colorId));
    if (!isCompatibleColorSet(cset))
      throw new Error(`수동 레벨 ${s.id} 색약 위반`);
    if (!isSolvable(s, { cellSize: 20, maxAttempts: 30 }))
      throw new Error(`수동 레벨 ${s.id} unsolvable`);
    if (s.id >= 3 && isTriviallySolvable(s))
      throw new Error(`수동 레벨 ${s.id} 직선 풀이 가능 (CLAUDE.md §8 위반)`);
    all.push(s);
  }
  // 6~7: 일반 사각 보드
  for (let id = 6; id <= 7; id++) all.push(generateAccepted(id));
  // 8~100: 원형 영역 puzzle
  for (let id = 8; id <= 100; id++) all.push(generateCircleLevel(id));
  return all;
}

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "data", "levels.json");
const start = Date.now();
const pack = { version: 1, levels: buildAll() };
writeFileSync(out, JSON.stringify(pack, null, 2) + "\n", "utf8");
const ms = Date.now() - start;
console.log(`wrote ${pack.levels.length} levels (${ms}ms) → ${out}`);
