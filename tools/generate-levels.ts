/**
 * 1~100 레벨 데이터 생성기 v2.
 * - CLAUDE.md §8 신규 규칙 준수:
 *     1) 모든 레벨은 solvability 검증 통과
 *     2) 적녹색약 배려 — 적색군과 녹색군 동시 등장 금지
 * - 1~5: 수동 레벨 (색 분류표 준수하도록 ID 재배치)
 * - 6~100: 난이도 버킷별 자동 생성
 *     6~25 easy   : 2~3색, 분리 lane
 *     26~50 normal : 3~4색, lane + 가벼운 interlock
 *     51~75 hard   : 4~5색, interlock 비율 ↑
 *     76~100 expert: 5~7색, 무작위 산포
 *   각 후보 → solver 검증 → 통과만 채택. MAX_RETRIES 초과 시 빌드 실패.
 *
 * 실행: node --experimental-strip-types tools/generate-levels.ts
 * 결과: data/levels.json 덮어씀.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isSolvable } from "../src/level/solver.ts";
import {
  pickCompatibleColors,
  isCompatibleColorSet,
  maxCompatibleColors,
} from "../src/level/colorConstraint.ts";
import type { Level, LevelDot } from "../src/level/types.ts";

const PALETTE_SIZE = 8;
const BOARD = 400;
const MARGIN = 50;
const MAX_RETRIES = 200;

// 색 분류표 준수: 색 0(red) 와 2/5(녹) 동시 등장 금지.
// 수동 레벨은 모두 적색 모드(녹 제외) 사용 — 색 ID는 {0,1,3,4,6,7} 중 선택.
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
    name: "두 색",
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
    id: 5,
    name: "지그재그",
    width: BOARD,
    height: BOARD,
    dots: [
      { id: 1, colorId: 0, x: 60, y: 60 },
      { id: 2, colorId: 0, x: 340, y: 60 },
      { id: 3, colorId: 1, x: 340, y: 140 },
      { id: 4, colorId: 1, x: 60, y: 140 },
      { id: 5, colorId: 3, x: 60, y: 220 },
      { id: 6, colorId: 3, x: 340, y: 220 },
      { id: 7, colorId: 4, x: 340, y: 300 },
      { id: 8, colorId: 4, x: 60, y: 300 },
    ],
  },
];

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DifficultyConfig {
  numColors: number;
  /** 각 색의 두 dot 좌우 위치를 swap 할 확률 (interlock 강도) */
  interlockProb: number;
  /** 0: lane 분리 / 1: 무작위 산포 */
  randomScatter: number;
}

function difficultyOf(id: number): DifficultyConfig {
  if (id <= 25) return { numColors: pickIn(2, 3, id), interlockProb: 0, randomScatter: 0 };
  if (id <= 50) return { numColors: pickIn(3, 4, id), interlockProb: 0.3, randomScatter: 0 };
  if (id <= 75) return { numColors: pickIn(4, 5, id), interlockProb: 0.5, randomScatter: 0.3 };
  // expert: 5~7 색 (palette 적/녹 제약 하에 max=7)
  return {
    numColors: pickIn(5, Math.min(7, maxCompatibleColors(PALETTE_SIZE)), id),
    interlockProb: 0.7,
    randomScatter: 0.6,
  };
}

function pickIn(lo: number, hi: number, id: number): number {
  if (hi <= lo) return lo;
  return lo + (id % (hi - lo + 1));
}

/**
 * 한 후보 레벨 생성. lane / interlock / random scatter 혼합.
 * 색약 제약은 색 선택 단계에서 보장됨 (pickCompatibleColors).
 */
function generateCandidate(id: number, attempt: number, cfg: DifficultyConfig): Level {
  const rng = makeRng(id * 9301 + 49297 + attempt * 131);
  const colors = pickCompatibleColors(cfg.numColors, PALETTE_SIZE, rng);
  if (!isCompatibleColorSet(colors)) throw new Error("color picker bug");

  const dots: LevelDot[] = [];
  let nextId = 1;

  if (rng() < cfg.randomScatter) {
    // 무작위 산포 + 최소 거리 보장
    const minDist = 60;
    const placed: Array<{ x: number; y: number }> = [];
    for (const c of colors) {
      for (let pair = 0; pair < 2; pair++) {
        let tries = 0;
        let p: { x: number; y: number };
        do {
          p = {
            x: MARGIN + rng() * (BOARD - 2 * MARGIN),
            y: MARGIN + rng() * (BOARD - 2 * MARGIN),
          };
          tries++;
          if (tries > 200) break;
        } while (placed.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < minDist));
        placed.push(p);
        dots.push({ id: nextId++, colorId: c, x: round(p.x), y: round(p.y) });
      }
    }
  } else {
    // lane 기반 + interlock 옵션
    const orientation = id % 2 === 0 ? "vertical" : "horizontal";
    const usable = (orientation === "horizontal" ? BOARD : BOARD) - MARGIN * 2;
    const laneSpan = usable / colors.length;
    const lo = MARGIN + 10;
    const hi = BOARD - MARGIN - 10;
    for (let li = 0; li < colors.length; li++) {
      const c = colors[li]!;
      const laneCenter = MARGIN + laneSpan * (li + 0.5);
      const jA = (rng() - 0.5) * laneSpan * 0.5;
      const jB = (rng() - 0.5) * laneSpan * 0.5;
      const interlock = rng() < cfg.interlockProb;
      const swap = interlock !== rng() < 0.5; // interlock일 때 강제 swap, 아니면 무작위
      if (orientation === "horizontal") {
        const yA = laneCenter + jA;
        const yB = laneCenter + jB;
        const x1 = swap ? hi : lo;
        const x2 = swap ? lo : hi;
        dots.push({ id: nextId++, colorId: c, x: round(x1), y: round(yA) });
        dots.push({ id: nextId++, colorId: c, x: round(x2), y: round(yB) });
      } else {
        const xA = laneCenter + jA;
        const xB = laneCenter + jB;
        const y1 = swap ? hi : lo;
        const y2 = swap ? lo : hi;
        dots.push({ id: nextId++, colorId: c, x: round(xA), y: round(y1) });
        dots.push({ id: nextId++, colorId: c, x: round(xB), y: round(y2) });
      }
    }
  }

  return { id, name: nameFor(id, cfg.numColors), width: BOARD, height: BOARD, dots };
}

function nameFor(id: number, numColors: number): string {
  const themes = ["통로", "교차로", "오솔길", "골목", "회로", "미로", "회랑", "광장"];
  return `${themes[id % themes.length]} ${id} (${numColors}색)`;
}

function round(v: number): number {
  return Math.round(v);
}

/**
 * 한 레벨 슬롯에 대해 solvable + 색약-호환 후보가 나올 때까지 재시도.
 * MAX_RETRIES 초과 시 throw.
 */
function generateAccepted(id: number): Level {
  const cfg = difficultyOf(id);
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const cand = generateCandidate(id, attempt, cfg);
    const cset = new Set(cand.dots.map((d) => d.colorId));
    if (!isCompatibleColorSet(cset)) continue;
    if (isSolvable(cand, { cellSize: 20, maxAttempts: 30 })) return cand;
  }
  throw new Error(`level ${id}: 후보 ${MAX_RETRIES}회 모두 실패`);
}

function buildAll(): Level[] {
  const all: Level[] = [];
  // 수동 레벨도 색약 검증 + solvability 확인
  for (const s of SAMPLES) {
    const cset = new Set(s.dots.map((d) => d.colorId));
    if (!isCompatibleColorSet(cset)) {
      throw new Error(`수동 레벨 ${s.id} 색약 위반: colors=${[...cset].join(",")}`);
    }
    if (!isSolvable(s, { cellSize: 20, maxAttempts: 30 })) {
      throw new Error(`수동 레벨 ${s.id} unsolvable`);
    }
    all.push(s);
  }
  for (let id = 6; id <= 100; id++) {
    all.push(generateAccepted(id));
  }
  return all;
}

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "data", "levels.json");
const start = Date.now();
const pack = { version: 1, levels: buildAll() };
writeFileSync(out, JSON.stringify(pack, null, 2) + "\n", "utf8");
const ms = Date.now() - start;
console.log(`wrote ${pack.levels.length} levels (${ms}ms) → ${out}`);
