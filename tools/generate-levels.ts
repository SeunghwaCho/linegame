/**
 * 1~100 레벨 데이터 생성기 v5 — 단조 난이도 곡선 + 레벨당 3개 base variant.
 *
 * 변경:
 *   - difficultyOf: % 진동 제거. 단조 비감소 곡선 (id 10에서 4색 진입).
 *   - 사각판(6~7) dot은 보드 내접 disk 안에 위치하도록 제약 (런타임 회전 안전).
 *   - 레벨당 3개의 base variant 생성 (1~5 SAMPLES는 디자인된 1 variant 유지).
 *   - 새 JSON 스키마: levels[i].variants: Variant[].
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
import type {
  LevelTemplate,
  Variant,
  LevelCircle,
  LevelDot,
  Level,
} from "../src/level/types.ts";

const PALETTE_SIZE = 8;
const BOARD = 400;
const VARIANTS_PER_LEVEL = 3;
const MAX_RETRIES_PER_VARIANT = 80;

// ─── 단조 난이도 곡선 ─────────────────────────────────────────────────────────
//
// id=6→2색, 10→4색, 20→5색, 40→6색, 76+→7색 (단조 비감소)
// 길이는 id에 비례 — 레벨 오를수록 항상 더 김
//
interface DifficultyConfig {
  numColors: number;
  cellSize: number;
  minLen: number;
  maxLen: number;
}

function difficultyOf(id: number): DifficultyConfig {
  // 색 수: 단조 비감소 step. 6-7→2, 8-9→3, 10-14→4, 15-24→5, 25-49→6, 50+→7
  let numColors: number;
  if (id <= 7) numColors = 2;
  else if (id <= 9) numColors = 3;
  else if (id <= 14) numColors = 4;
  else if (id <= 24) numColors = 5;
  else if (id <= 49) numColors = 6;
  else numColors = 7;

  let cellSize: number;
  let minLen: number;
  let maxLen: number;
  if (id <= 15) {
    cellSize = 32;
    minLen = 6;
    maxLen = 10;
  } else if (id <= 35) {
    cellSize = 28;
    minLen = 9;
    maxLen = 13;
  } else if (id <= 60) {
    cellSize = 25;
    minLen = 12;
    maxLen = 16;
  } else {
    cellSize = 22;
    minLen = 14;
    maxLen = 18;
  }
  return { numColors, cellSize, minLen, maxLen };
}

// ─── 수동 레벨 (디자인된 비자명 케이스, 1 variant) ───────────────────────────
const SAMPLES: LevelTemplate[] = [
  {
    id: 1,
    name: "튜토리얼",
    width: BOARD,
    height: BOARD,
    variants: [
      {
        dots: [
          { id: 1, colorId: 0, x: 80, y: 200 },
          { id: 2, colorId: 0, x: 320, y: 200 },
        ],
      },
    ],
  },
  {
    id: 2,
    name: "두 색 교차",
    width: BOARD,
    height: BOARD,
    variants: [
      {
        dots: [
          { id: 1, colorId: 0, x: 80, y: 80 },
          { id: 2, colorId: 0, x: 320, y: 320 },
          { id: 3, colorId: 1, x: 320, y: 80 },
          { id: 4, colorId: 1, x: 80, y: 320 },
        ],
      },
    ],
  },
  {
    id: 3,
    name: "세 색 십자",
    width: BOARD,
    height: BOARD,
    variants: [
      {
        dots: [
          { id: 1, colorId: 0, x: 80, y: 200 },
          { id: 2, colorId: 0, x: 320, y: 200 },
          { id: 3, colorId: 1, x: 200, y: 80 },
          { id: 4, colorId: 1, x: 200, y: 320 },
          { id: 5, colorId: 3, x: 120, y: 120 },
          { id: 6, colorId: 3, x: 280, y: 280 },
        ],
      },
    ],
  },
  {
    id: 4,
    name: "포위",
    width: BOARD,
    height: BOARD,
    variants: [
      {
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
    ],
  },
  {
    id: 5,
    name: "사방으로",
    width: BOARD,
    height: BOARD,
    variants: [
      {
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
    ],
  },
];

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
const CIRCLE_R = 200 - 20; // BOARD/2 - 20 = 180

// ─── 사각판(6~7) — 회전 안전성을 위한 내접 disk 제약 ─────────────────────────
//
// 사각 보드 내접 disk: 중심 (BOARD/2, BOARD/2), 반경 BOARD/2 - margin.
// 모든 dot이 이 disk 안에 들어오면 어떤 각도로 회전해도 보드 밖으로 나가지 않음.
//
const RECT_INSCRIBED_R = BOARD / 2 - 30; // 170 — DOT_RADIUS + 회전 시 떨림 마진

function rectCellAllowed(c: number, r: number, cellSize: number): boolean {
  const x = (c + 0.5) * cellSize;
  const y = (r + 0.5) * cellSize;
  const dx = x - BOARD / 2;
  const dy = y - BOARD / 2;
  return dx * dx + dy * dy <= RECT_INSCRIBED_R * RECT_INSCRIBED_R;
}

interface SnappedResult {
  dots: ConstructiveResult["dots"];
  paths: ConstructiveResult["paths"];
  circle: LevelCircle;
}

function snapAndValidate(
  r: ConstructiveResult,
  cellSize: number,
  circle: LevelCircle,
): SnappedResult | null {
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
    const c0 = walk[0]!;
    const cx0 = px(c0[0]);
    const cy0 = px(c0[1]);
    const dx = cx0 - circle.cx;
    const dy = cy0 - circle.cy;
    const dlen = Math.hypot(dx, dy);
    if (dlen < 1) return null;
    const ux = dx / dlen;
    const uy = dy / dlen;
    const snapPt = {
      x: circle.cx + ux * circle.r,
      y: circle.cy + uy * circle.r,
    };
    const segs: Array<[{ x: number; y: number }, { x: number; y: number }]> = [];
    let prev = snapPt;
    for (let j = 1; j < walk.length; j++) {
      const cj = walk[j]!;
      const cur = { x: px(cj[0]), y: px(cj[1]) };
      segs.push([prev, cur]);
      prev = cur;
    }
    if (segs.length === 0) return null;
    colorPaths.push({ colorId, segments: segs, snapPt });
  }

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

  for (const cp of colorPaths) {
    const segs = cp.segments;
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 2; j < segs.length; j++) {
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

const CIRCLE_MAX_RETRIES = 600;

function genCircleVariant(id: number, varIdx: number): Variant {
  const cfg = difficultyOf(id);
  const numColors = Math.min(cfg.numColors, maxCompatibleColors(PALETTE_SIZE));
  const circle: LevelCircle = { cx: BOARD / 2, cy: BOARD / 2, r: CIRCLE_R };
  const cellSize = cfg.cellSize;
  const cx = circle.cx;
  const cy = circle.cy;
  const innerLimit = circle.r - cellSize * 0.5;
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
    // varIdx 별로 다른 시드 시퀀스
    const seed = id * 9311 + 60013 + varIdx * 7919 + attempt * 137;
    const rng = pickRng(seed);
    const colors = pickCompatibleColors(numColors, PALETTE_SIZE, rng);
    if (!isCompatibleColorSet(colors)) continue;

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

    const variant: Variant = { dots: snapped.dots, circle };
    // 검증: variant를 임시 Level로 변환하여 trivial / solvable 검사
    const tmpLevel: Level = {
      id,
      name: "tmp",
      width: BOARD,
      height: BOARD,
      dots: variant.dots,
      circle: variant.circle,
    };
    if (isTriviallySolvable(tmpLevel)) continue;
    return variant;
  }
  throw new Error(`레벨 ${id} variant ${varIdx}: 원형 puzzle 생성 실패`);
}

function genRectVariant(id: number, varIdx: number): Variant {
  const cfg = difficultyOf(id);
  const numColors = Math.min(cfg.numColors, maxCompatibleColors(PALETTE_SIZE));

  for (let attempt = 0; attempt < MAX_RETRIES_PER_VARIANT; attempt++) {
    const seed = id * 9301 + 49297 + varIdx * 7307 + attempt * 131;
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
        cellAllowed: (c, r) => rectCellAllowed(c, r, cfg.cellSize),
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
    return { dots: r.dots };
  }
  throw new Error(`레벨 ${id} variant ${varIdx}: 사각판 puzzle 생성 실패`);
}

// 같은 레벨의 두 variant가 dot 좌표 다중집합이 동일하면 중복으로 간주
function variantsEqual(a: Variant, b: Variant): boolean {
  if (a.dots.length !== b.dots.length) return false;
  const key = (d: LevelDot): string =>
    `${d.colorId}:${Math.round(d.x)},${Math.round(d.y)}`;
  const sa = a.dots.map(key).sort().join("|");
  const sb = b.dots.map(key).sort().join("|");
  return sa === sb;
}

function genTemplate(id: number): LevelTemplate {
  const cfg = difficultyOf(id);
  const numColors = Math.min(cfg.numColors, maxCompatibleColors(PALETTE_SIZE));
  const isCircle = id >= 8;

  const variants: Variant[] = [];
  let varIdx = 0;
  let safety = 0;
  while (variants.length < VARIANTS_PER_LEVEL) {
    if (safety++ > VARIANTS_PER_LEVEL * 10) {
      throw new Error(`레벨 ${id}: ${variants.length}/${VARIANTS_PER_LEVEL} variant만 생성됨 (중복 회피 실패)`);
    }
    const v = isCircle ? genCircleVariant(id, varIdx) : genRectVariant(id, varIdx);
    varIdx++;
    if (variants.some((existing) => variantsEqual(existing, v))) continue;
    variants.push(v);
  }

  const name = isCircle ? nameForCircle(id, numColors) : nameFor(id, numColors);
  return { id, name, width: BOARD, height: BOARD, variants };
}

function buildAll(): LevelTemplate[] {
  const all: LevelTemplate[] = [];
  for (const s of SAMPLES) {
    for (const v of s.variants) {
      const cset = new Set(v.dots.map((d) => d.colorId));
      if (!isCompatibleColorSet(cset))
        throw new Error(`수동 레벨 ${s.id} 색약 위반`);
      const tmp: Level = {
        id: s.id,
        name: s.name,
        width: s.width,
        height: s.height,
        dots: v.dots,
        circle: v.circle,
      };
      if (!isSolvable(tmp, { cellSize: 20, maxAttempts: 30 }))
        throw new Error(`수동 레벨 ${s.id} unsolvable`);
      if (s.id >= 3 && isTriviallySolvable(tmp))
        throw new Error(`수동 레벨 ${s.id} 직선 풀이 가능 (CLAUDE.md §8 위반)`);
    }
    all.push(s);
  }
  for (let id = 6; id <= 100; id++) all.push(genTemplate(id));
  return all;
}

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "data", "levels.json");
const start = Date.now();
const pack = { version: 2, levels: buildAll() };
writeFileSync(out, JSON.stringify(pack, null, 2) + "\n", "utf8");
const ms = Date.now() - start;
console.log(`wrote ${pack.levels.length} templates (${ms}ms) → ${out}`);
