/**
 * 1~100 레벨 데이터 생성기.
 * - 1~5: 기존 샘플 유지 (수동 디자인).
 * - 6~100: 색당 1개 lane을 가지는 자동 생성. lane이 분리되어 있어 항상 solvable.
 *
 * 실행: node --experimental-strip-types tools/generate-levels.ts
 * 결과: data/levels.json 덮어씀.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

interface LevelDot {
  id: number;
  colorId: number;
  x: number;
  y: number;
}
interface Level {
  id: number;
  name: string;
  width: number;
  height: number;
  dots: LevelDot[];
}

const SAMPLES: Level[] = [
  {
    id: 1,
    name: "튜토리얼",
    width: 400,
    height: 400,
    dots: [
      { id: 1, colorId: 0, x: 80, y: 200 },
      { id: 2, colorId: 0, x: 320, y: 200 },
    ],
  },
  {
    id: 2,
    name: "두 색",
    width: 400,
    height: 400,
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
    width: 400,
    height: 400,
    dots: [
      { id: 1, colorId: 0, x: 80, y: 200 },
      { id: 2, colorId: 0, x: 320, y: 200 },
      { id: 3, colorId: 1, x: 200, y: 80 },
      { id: 4, colorId: 1, x: 200, y: 320 },
      { id: 5, colorId: 2, x: 120, y: 120 },
      { id: 6, colorId: 2, x: 280, y: 280 },
    ],
  },
  {
    id: 4,
    name: "포위",
    width: 400,
    height: 400,
    dots: [
      { id: 1, colorId: 0, x: 200, y: 200 },
      { id: 2, colorId: 0, x: 80, y: 80 },
      { id: 3, colorId: 1, x: 80, y: 200 },
      { id: 4, colorId: 1, x: 320, y: 200 },
      { id: 5, colorId: 2, x: 200, y: 80 },
      { id: 6, colorId: 2, x: 200, y: 320 },
      { id: 7, colorId: 3, x: 320, y: 320 },
      { id: 8, colorId: 3, x: 80, y: 320 },
    ],
  },
  {
    id: 5,
    name: "지그재그",
    width: 400,
    height: 400,
    dots: [
      { id: 1, colorId: 0, x: 60, y: 60 },
      { id: 2, colorId: 0, x: 340, y: 60 },
      { id: 3, colorId: 1, x: 340, y: 140 },
      { id: 4, colorId: 1, x: 60, y: 140 },
      { id: 5, colorId: 2, x: 60, y: 220 },
      { id: 6, colorId: 2, x: 340, y: 220 },
      { id: 7, colorId: 3, x: 340, y: 300 },
      { id: 8, colorId: 3, x: 60, y: 300 },
    ],
  },
];

/** Mulberry32 PRNG — 결정적 시드 → 재현 가능한 레벨. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * lane 기반 자동 생성. 각 색은 자신만의 lane(가로 또는 세로)을 가져 항상 solvable.
 * 시각적 다양성을 위해 lane 방향을 회전 + 좌우 무작위 + lane 끝에 살짝 jitter.
 */
function generateLevel(id: number): Level {
  const rng = makeRng(id * 9301 + 49297);
  const numColors = Math.min(8, 2 + Math.floor((id - 6) / 14)); // 6~19: 2색, 20~33: 3색, ...
  const orientation = id % 4 === 0 ? "vertical" : "horizontal";
  const width = 400;
  const height = 400;
  const margin = 50;
  const usable = (orientation === "horizontal" ? height : width) - margin * 2;
  const laneSpan = usable / numColors;
  const dots: LevelDot[] = [];
  let nextDotId = 1;

  for (let c = 0; c < numColors; c++) {
    const laneCenter = margin + laneSpan * (c + 0.5);
    // lane 중심 ± jitter (lane 폭의 25% 이내)
    const jitterA = (rng() - 0.5) * laneSpan * 0.5;
    const jitterB = (rng() - 0.5) * laneSpan * 0.5;
    // 좌우(또는 상하) 위치를 무작위 swap
    const swap = rng() < 0.5;
    const lo = margin + 10 + rng() * 30;
    const hi = (orientation === "horizontal" ? width : height) - margin - 10 - rng() * 30;
    if (orientation === "horizontal") {
      const yA = laneCenter + jitterA;
      const yB = laneCenter + jitterB;
      const x1 = swap ? hi : lo;
      const x2 = swap ? lo : hi;
      dots.push({ id: nextDotId++, colorId: c, x: round(x1), y: round(yA) });
      dots.push({ id: nextDotId++, colorId: c, x: round(x2), y: round(yB) });
    } else {
      const xA = laneCenter + jitterA;
      const xB = laneCenter + jitterB;
      const y1 = swap ? hi : lo;
      const y2 = swap ? lo : hi;
      dots.push({ id: nextDotId++, colorId: c, x: round(xA), y: round(y1) });
      dots.push({ id: nextDotId++, colorId: c, x: round(xB), y: round(y2) });
    }
  }

  return {
    id,
    name: nameFor(id, numColors),
    width,
    height,
    dots,
  };
}

function nameFor(id: number, numColors: number): string {
  const themes = ["통로", "교차로", "오솔길", "골목", "회로", "미로", "회랑", "광장"];
  return `${themes[id % themes.length]} ${id} (${numColors}색)`;
}

function round(v: number): number {
  return Math.round(v);
}

function buildAll(): Level[] {
  const all: Level[] = [...SAMPLES];
  for (let id = 6; id <= 100; id++) {
    all.push(generateLevel(id));
  }
  return all;
}

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "data", "levels.json");
const pack = { version: 1, levels: buildAll() };
writeFileSync(out, JSON.stringify(pack, null, 2) + "\n", "utf8");
console.log(`wrote ${pack.levels.length} levels to ${out}`);
