/**
 * 구성적(constructive) 레벨 생성기.
 *
 * 아이디어: 격자 위에서 N개의 무작위 워크 경로를 서로 교차하지 않게 차례로 깐다.
 *   - 경로 자체가 정답이므로 **solvability 자동 보장** (solver 호출 불필요)
 *   - 경로가 충분히 굴곡지면 양 끝 dot의 직선 연결은 다른 경로/dot에 의해 막힘
 *     → trivially-solvable 일 가능성을 크게 낮춤
 *
 * 입력: numColors, board 크기, cellSize, 워크 길이 범위, 시드.
 * 출력: 격자 좌표를 px로 변환한 dot 배열 (dot 1 = 시작, dot 2 = 끝).
 */

export interface ConstructiveOptions {
  numColors: number;
  width: number;
  height: number;
  cellSize: number;
  /** 워크 최소 길이 (셀 수) */
  minLen: number;
  /** 워크 최대 길이 (셀 수) */
  maxLen: number;
  /** 결정적 시드 */
  seed: number;
  /** 한 색당 워크 시도 횟수 */
  maxWalkAttempts?: number;
  /** 셀(c, r)을 사용 가능한지 — 없으면 모든 셀 허용. 격자에 마스크를 입힐 때 사용. */
  cellAllowed?: (c: number, r: number) => boolean;
  /** 시작 셀로 가능한지 — 없으면 cellAllowed 와 동일. boundary ring 강제용. */
  startCellAllowed?: (c: number, r: number) => boolean;
}

export interface ConstructiveResult {
  dots: Array<{ id: number; colorId: number; x: number; y: number }>;
  /** 생성된 경로 (검증/디버깅용 — 게임에서는 사용 X). 셀 좌표. */
  paths: Array<Array<[number, number]>>;
}

/** Mulberry32 결정적 PRNG */
function makeRng(seed: number): () => number {
  let s = (seed | 0) >>> 0;
  return (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * 시도 1회 — colors가 모두 워크에 성공하면 결과 반환, 어떤 색 하나라도 실패하면 null.
 */
function tryGenerate(
  colorIds: number[],
  cols: number,
  rows: number,
  cellSize: number,
  minLen: number,
  maxLen: number,
  rng: () => number,
  maxWalkAttempts: number,
  cellAllowed: (c: number, r: number) => boolean,
  startCellAllowed: (c: number, r: number) => boolean,
): ConstructiveResult | null {
  // grid: -2 = 마스크 (사용 금지), -1 = free, 그 외는 colorId
  const grid = new Int16Array(cols * rows);
  const idx = (c: number, r: number): number => r * cols + c;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      grid[idx(c, r)] = cellAllowed(c, r) ? -1 : -2;
    }
  }
  const dots: ConstructiveResult["dots"] = [];
  const paths: ConstructiveResult["paths"] = [];
  let nextDotId = 1;

  for (const colorId of colorIds) {
    let walked: Array<[number, number]> | null = null;
    for (let att = 0; att < maxWalkAttempts && !walked; att++) {
      // 시작 셀: startCellAllowed 통과 + 비어있는 것 중 무작위
      const free: Array<[number, number]> = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (grid[idx(c, r)] === -1 && startCellAllowed(c, r)) free.push([c, r]);
        }
      }
      if (free.length === 0) return null;
      const start = free[Math.floor(rng() * free.length)]!;

      const targetLen =
        minLen + Math.floor(rng() * Math.max(1, maxLen - minLen + 1));
      const path: Array<[number, number]> = [start];
      const used = new Set<number>([idx(start[0], start[1])]);
      let pos = start;
      let stuck = false;

      while (path.length < targetLen) {
        const dirs: Array<[number, number]> = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ];
        shuffle(dirs, rng);
        let moved = false;
        for (const [dc, dr] of dirs) {
          const nc = pos[0] + dc;
          const nr = pos[1] + dr;
          if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
          const nIdx = idx(nc, nr);
          if (grid[nIdx] !== -1) continue; // 다른 색 점유
          if (used.has(nIdx)) continue; // 자기 워크에서 이미 지나감
          // 인접한 셀이 다른 색인 경우는 OK (블록만 안 되면 됨)
          // 단, 경로의 양 끝점이 다른 색의 인접 셀이면 dot 충돌 가능 → 마지막에 검사
          pos = [nc, nr];
          used.add(nIdx);
          path.push(pos);
          moved = true;
          break;
        }
        if (!moved) {
          stuck = true;
          break;
        }
      }
      if (path.length >= minLen && (!stuck || path.length >= minLen)) {
        walked = path;
      }
    }

    if (!walked) return null;

    // 경로의 모든 셀에 colorId 마킹
    for (const [c, r] of walked) grid[idx(c, r)] = colorId;
    paths.push(walked);

    // dot은 양 끝점만 사용 (px 변환). 셀의 중앙으로 환산.
    const start = walked[0]!;
    const end = walked[walked.length - 1]!;
    const px = (c: number): number => Math.round((c + 0.5) * cellSize);
    dots.push({ id: nextDotId++, colorId, x: px(start[0]), y: px(start[1]) });
    dots.push({ id: nextDotId++, colorId, x: px(end[0]), y: px(end[1]) });
  }

  return { dots, paths };
}

export function constructiveGenerate(
  opts: ConstructiveOptions,
): ConstructiveResult | null {
  const cols = Math.floor(opts.width / opts.cellSize);
  const rows = Math.floor(opts.height / opts.cellSize);
  const rng = makeRng(opts.seed);
  const colorIds = Array.from({ length: opts.numColors }, (_, i) => i); // caller가 바꿔치기
  // 색 순서 무작위
  shuffle(colorIds, rng);
  const cellAllowed = opts.cellAllowed ?? (() => true);
  const startCellAllowed = opts.startCellAllowed ?? cellAllowed;
  return tryGenerate(
    colorIds,
    cols,
    rows,
    opts.cellSize,
    opts.minLen,
    opts.maxLen,
    rng,
    opts.maxWalkAttempts ?? 5,
    cellAllowed,
    startCellAllowed,
  );
}

export function constructiveGenerateWithColors(
  colorIds: number[],
  opts: Omit<ConstructiveOptions, "numColors">,
): ConstructiveResult | null {
  const cols = Math.floor(opts.width / opts.cellSize);
  const rows = Math.floor(opts.height / opts.cellSize);
  const rng = makeRng(opts.seed);
  const order = colorIds.slice();
  shuffle(order, rng);
  const cellAllowed = opts.cellAllowed ?? (() => true);
  const startCellAllowed = opts.startCellAllowed ?? cellAllowed;
  return tryGenerate(
    order,
    cols,
    rows,
    opts.cellSize,
    opts.minLen,
    opts.maxLen,
    rng,
    opts.maxWalkAttempts ?? 5,
    cellAllowed,
    startCellAllowed,
  );
}

/**
 * 비자명(non-trivial) 보장 래퍼.
 * constructive 결과를 trivialPredicate 로 검증하여 통과할 때까지 시드를 바꿔 재시도.
 * 모두 실패하면 null.
 */
export function constructiveGenerateNonTrivial(
  colorIds: number[],
  opts: Omit<ConstructiveOptions, "numColors">,
  trivialPredicate: (dots: ConstructiveResult["dots"]) => boolean,
  maxAttempts: number,
): ConstructiveResult | null {
  for (let i = 0; i < maxAttempts; i++) {
    const r = constructiveGenerateWithColors(colorIds, {
      ...opts,
      seed: opts.seed + i * 1009,
    });
    if (!r) continue;
    if (trivialPredicate(r.dots)) continue;
    return r;
  }
  return null;
}
