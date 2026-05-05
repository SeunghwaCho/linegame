/**
 * 레벨 solvability 검증기.
 * - 보드를 격자로 이산화 → 각 색마다 BFS로 두 dot을 잇는 경로 탐색.
 * - 다른 색 경로/다른 색 dot은 장애물.
 * - 색 순서를 무작위로 여러 번(maxAttempts) 시도. 한 번이라도 모두 라우팅 성공하면 solvable.
 *
 * 한계: NP-complete 문제의 휴리스틱. false positive(solvable인데 실패)는 maxAttempts를 늘려 완화.
 *      generate-levels.ts 는 이 검증기를 통과한 것만 채택하므로, false negative(unsolvable인데 통과)는 0.
 *      false positive로 잘못 unsolvable 판정된 후보는 단순히 버려지고 다음 시드로 진행.
 */
import type { Level, LevelDot } from "./types.ts";

export interface SolverOptions {
  /** 격자 셀 크기 (px). 작을수록 정확, 클수록 빠름. 기본 20. */
  cellSize?: number;
  /** 색 순서 무작위 시도 횟수. 기본 50. */
  maxAttempts?: number;
  /** 결정적 검증을 위한 시드. 기본 0. */
  seed?: number;
}

export function isSolvable(level: Level, opts: SolverOptions = {}): boolean {
  const cellSize = opts.cellSize ?? 20;
  const maxAttempts = opts.maxAttempts ?? 50;
  const cols = Math.ceil(level.width / cellSize);
  const rows = Math.ceil(level.height / cellSize);

  // disk 마스크 — 원형 레벨이면 각 셀 중심이 disk 안 (거리 ≤ r) 인지로 판단.
  // dot 이 들어있는 셀은 강제로 허용 (BFS가 dot 위치에서 출발/도착하기 위해).
  const inDisk = (() => {
    if (!level.circle) return null;
    const { cx, cy, r } = level.circle;
    const r2 = r * r;
    const mask = new Uint8Array(cols * rows);
    for (let ry = 0; ry < rows; ry++) {
      for (let cx2 = 0; cx2 < cols; cx2++) {
        const x = (cx2 + 0.5) * cellSize;
        const y = (ry + 0.5) * cellSize;
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) mask[ry * cols + cx2] = 1;
      }
    }
    // dot 이 들어있는 셀 강제 허용
    for (const d of level.dots) {
      const c = Math.min(cols - 1, Math.max(0, Math.floor(d.x / cellSize)));
      const r3 = Math.min(rows - 1, Math.max(0, Math.floor(d.y / cellSize)));
      mask[r3 * cols + c] = 1;
    }
    return mask;
  })();

  // 색별 두 dot을 그룹화
  const byColor = new Map<number, LevelDot[]>();
  for (const d of level.dots) {
    let arr = byColor.get(d.colorId);
    if (!arr) {
      arr = [];
      byColor.set(d.colorId, arr);
    }
    arr.push(d);
  }
  for (const [c, arr] of byColor) {
    if (arr.length !== 2) {
      throw new Error(`color ${c} must have exactly 2 dots, got ${arr.length}`);
    }
  }

  // dot 위치를 cell 좌표로
  const dotCell = (d: LevelDot): [number, number] => [
    Math.min(cols - 1, Math.max(0, Math.floor(d.x / cellSize))),
    Math.min(rows - 1, Math.max(0, Math.floor(d.y / cellSize))),
  ];

  // 같은 cell에 두 dot이 떨어지면 격자 너무 거칠다 → false (다음 cellSize에서 재시도 권장)
  const cellMap = new Map<string, number>(); // "c,r" → dotId
  for (const d of level.dots) {
    const [c, r] = dotCell(d);
    const key = `${c},${r}`;
    if (cellMap.has(key)) return false;
    cellMap.set(key, d.id);
  }

  const colorIds = Array.from(byColor.keys());
  const rng = makeRng(opts.seed ?? 1);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const order = shuffle(colorIds.slice(), rng);
    if (tryRoute(order)) return true;
  }
  return false;

  function tryRoute(order: number[]): boolean {
    // 격자: -1 = 빈 칸 / -2 = 마스크 외 (disk 밖) / 100+colorId = 다른 색 dot (블록) / colorId = 그 색 path 점유
    const grid: Int16Array = new Int16Array(cols * rows);
    for (let i = 0; i < grid.length; i++) {
      grid[i] = inDisk ? (inDisk[i] ? -1 : -2) : -1;
    }
    // 모든 dot을 일단 100+colorId로 표시 (블록)
    for (const d of level.dots) {
      const [c, r] = dotCell(d);
      grid[r * cols + c] = 100 + d.colorId;
    }
    for (const colorId of order) {
      const [a, b] = byColor.get(colorId)!;
      const [ax, ay] = dotCell(a!);
      const [bx, by] = dotCell(b!);
      // 출발/도착 dot은 자기 색의 경로로 임시 통과 가능하게 표시
      grid[ay * cols + ax] = colorId;
      grid[by * cols + bx] = colorId;
      // BFS
      const path = bfs(grid, cols, rows, ax, ay, bx, by, colorId);
      if (!path) return false;
      for (const [px, py] of path) grid[py * cols + px] = colorId;
    }
    return true;
  }
}

function bfs(
  grid: Int16Array,
  cols: number,
  rows: number,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  colorId: number,
): Array<[number, number]> | null {
  if (sx === tx && sy === ty) return [[sx, sy]];
  const visited = new Uint8Array(cols * rows);
  const parent = new Int32Array(cols * rows).fill(-1);
  const queue: number[] = [];
  const startIdx = sy * cols + sx;
  visited[startIdx] = 1;
  queue.push(startIdx);
  const targetIdx = ty * cols + tx;
  let found = false;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === targetIdx) {
      found = true;
      break;
    }
    const cx = cur % cols;
    const cy = (cur - cx) / cols;
    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx! < 0 || nx! >= cols || ny! < 0 || ny! >= rows) continue;
      const nIdx = ny! * cols + nx!;
      if (visited[nIdx]) continue;
      const v = grid[nIdx]!;
      // 통과 조건: 빈 칸(-1) 또는 본인 색 표시(colorId)
      if (v !== -1 && v !== colorId) continue;
      visited[nIdx] = 1;
      parent[nIdx] = cur;
      queue.push(nIdx);
    }
  }
  if (!found) return null;
  // 경로 복원
  const path: Array<[number, number]> = [];
  let cur = targetIdx;
  while (cur !== -1) {
    const cx = cur % cols;
    const cy = (cur - cx) / cols;
    path.push([cx, cy]);
    cur = parent[cur]!;
  }
  return path.reverse();
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function makeRng(seed: number): () => number {
  let s = (seed | 0) >>> 0;
  return (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
