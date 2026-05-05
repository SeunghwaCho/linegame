/**
 * 1~100 레벨 데이터 생성기 v3 — 구성적(constructive) 생성기 사용.
 *
 * CLAUDE.md §8 준수:
 *   1) 풀 수 없는 레벨 금지 — 구성적 생성으로 자동 보장 (경로가 곧 해)
 *   2) 적녹색약 — pickCompatibleColors 사용
 *   3) (신규) 레벨 3 이상은 직선 단순 연결로 풀리는 케이스 금지
 *      → isTriviallySolvable 필터로 retry, 안 되면 build 실패.
 *
 * - 1~5: 수동 레벨 (디자인된 비자명 케이스)
 * - 6~100: 구성적 생성기 + non-trivial 필터
 *   난이도(난수 워크 길이/색 수)는 4단계 점진 증가
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
import { constructiveGenerateNonTrivial } from "../src/level/constructive.ts";
import type { Level } from "../src/level/types.ts";

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
  for (let id = 6; id <= 100; id++) all.push(generateAccepted(id));
  return all;
}

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "data", "levels.json");
const start = Date.now();
const pack = { version: 1, levels: buildAll() };
writeFileSync(out, JSON.stringify(pack, null, 2) + "\n", "utf8");
const ms = Date.now() - start;
console.log(`wrote ${pack.levels.length} levels (${ms}ms) → ${out}`);
