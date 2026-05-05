/**
 * "직선 단순 연결로 풀리는가?" 검사.
 * 모든 색의 두 dot을 직선으로만 그렸을 때
 *   - 어느 두 직선도 교차하지 않고
 *   - 어떤 직선도 다른 색 dot의 반경을 침범하지 않으면
 * → trivially solvable.
 *
 * 레벨 3 이상은 이 검사를 통과하면 안 됨 (생성기에서 reject).
 */
import type { Level } from "./types.ts";
import {
  segmentsIntersect,
  pointSegDistance,
} from "../geometry/intersection.ts";
import type { Segment } from "../geometry/types.ts";

export function isTriviallySolvable(level: Level): boolean {
  const byColor = new Map<number, Level["dots"]>();
  for (const d of level.dots) {
    let arr = byColor.get(d.colorId);
    if (!arr) {
      arr = [];
      byColor.set(d.colorId, arr);
    }
    arr.push(d);
  }

  // 색별 직선 세그먼트
  interface ColorSeg {
    colorId: number;
    seg: Segment;
    aId: number;
    bId: number;
  }
  const segs: ColorSeg[] = [];
  for (const [c, ds] of byColor) {
    if (ds.length !== 2) return false; // 룰 위반 — 그냥 false 반환 (호출부가 다른 곳에서 검증)
    const [a, b] = ds as [Level["dots"][number], Level["dots"][number]];
    segs.push({
      colorId: c,
      seg: { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } },
      aId: a.id,
      bId: b.id,
    });
  }

  // 1) 어떤 직선도 다른 색 dot의 반경에 닿으면 직선으로 못 풀림
  const DEFAULT_R = 18;
  for (const s of segs) {
    for (const d of level.dots) {
      if (d.id === s.aId || d.id === s.bId) continue; // 본인 endpoint는 스킵
      const r = (d.radius ?? DEFAULT_R) - 1; // 살짝 안쪽까지만 트리거 (수치 안전 마진)
      if (r <= 0) continue;
      if (pointSegDistance(s.seg.a, s.seg.b, { x: d.x, y: d.y }) < r) return false;
    }
  }

  // 2) 두 직선이 교차하면 직선으로 못 풀림 (공통 endpoint는 룰상 없음 — 색별 dot이 다름)
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      if (segmentsIntersect(segs[i]!.seg, segs[j]!.seg)) return false;
    }
  }

  return true;
}
