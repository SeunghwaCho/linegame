import type { Board } from "./board.ts";
import type { Dot } from "./types.ts";

export interface HintResult {
  colorId: number;
  dots: [Dot, Dot];
}

/**
 * 다음에 풀어볼 후보 색을 제안.
 * 우선순위: 가장 가까운 미연결 색 쌍 (빠른 성공감 우선).
 * 미연결 색이 없으면 null.
 */
export function nextHint(board: Board): HintResult | null {
  const finalized = board.getFinalizedPaths();
  const dotsByColor = new Map<number, Dot[]>();
  for (const d of board.getDots()) {
    let arr = dotsByColor.get(d.colorId);
    if (!arr) {
      arr = [];
      dotsByColor.set(d.colorId, arr);
    }
    arr.push(d);
  }

  let best: HintResult | null = null;
  let bestDistance = Infinity;
  for (const [colorId, ds] of dotsByColor) {
    if (finalized.has(colorId)) continue;
    if (ds.length !== 2) continue;
    const [a, b] = ds as [Dot, Dot];
    const dist = Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y);
    if (dist < bestDistance) {
      bestDistance = dist;
      best = { colorId, dots: [a, b] };
    }
  }
  return best;
}
