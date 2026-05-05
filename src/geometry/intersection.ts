import type { Point, Segment } from "./types.ts";

const EPSILON = 1e-9;

/**
 * 외적 기반 CCW 판정.
 * 양수: c가 ab의 좌측(반시계). 음수: 우측(시계). 0: 공선.
 */
export function ccw(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** 부동소수 안전 부호화. EPSILON 이하는 0으로 본다. */
export function signOf(v: number): -1 | 0 | 1 {
  if (v > EPSILON) return 1;
  if (v < -EPSILON) return -1;
  return 0;
}

/** 1D AABB가 x축, y축 모두 겹치는지. 공선 케이스에서 실제 겹침 여부 확인용. */
export function aabb1DOverlap(s1: Segment, s2: Segment): boolean {
  const minX1 = Math.min(s1.a.x, s1.b.x);
  const maxX1 = Math.max(s1.a.x, s1.b.x);
  const minX2 = Math.min(s2.a.x, s2.b.x);
  const maxX2 = Math.max(s2.a.x, s2.b.x);
  if (maxX1 < minX2 - EPSILON || maxX2 < minX1 - EPSILON) return false;

  const minY1 = Math.min(s1.a.y, s1.b.y);
  const maxY1 = Math.max(s1.a.y, s1.b.y);
  const minY2 = Math.min(s2.a.y, s2.b.y);
  const maxY2 = Math.max(s2.a.y, s2.b.y);
  if (maxY1 < minY2 - EPSILON || maxY2 < minY1 - EPSILON) return false;

  return true;
}

/**
 * 점 r이 선분 pq 위에 있는지 (p, q, r이 이미 공선이라고 가정).
 * 끝점 포함.
 */
export function onSegmentCollinear(p: Point, q: Point, r: Point): boolean {
  return (
    r.x <= Math.max(p.x, q.x) + EPSILON &&
    r.x >= Math.min(p.x, q.x) - EPSILON &&
    r.y <= Math.max(p.y, q.y) + EPSILON &&
    r.y >= Math.min(p.y, q.y) - EPSILON
  );
}

/**
 * 두 세그먼트 교차 판정.
 * 정책: 공통 endpoint도 교차로 간주한다 (호출부에서 같은 path의 인접 세그먼트는 제외할 책임).
 */
export function segmentsIntersect(s1: Segment, s2: Segment): boolean {
  const d1 = signOf(ccw(s2.a, s2.b, s1.a));
  const d2 = signOf(ccw(s2.a, s2.b, s1.b));
  const d3 = signOf(ccw(s1.a, s1.b, s2.a));
  const d4 = signOf(ccw(s1.a, s1.b, s2.b));

  // 일반 X자 교차: 양쪽 모두 부호가 갈림
  if (d1 !== d2 && d3 !== d4 && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0) {
    return true;
  }

  // 완전 공선 케이스: 1D AABB로 실제 겹침 확인
  if (d1 === 0 && d2 === 0 && d3 === 0 && d4 === 0) {
    return aabb1DOverlap(s1, s2);
  }

  // T자/끝점-위 케이스: 한 쪽 끝점이 상대 세그먼트 위
  if (d1 === 0 && onSegmentCollinear(s2.a, s2.b, s1.a)) return true;
  if (d2 === 0 && onSegmentCollinear(s2.a, s2.b, s1.b)) return true;
  if (d3 === 0 && onSegmentCollinear(s1.a, s1.b, s2.a)) return true;
  if (d4 === 0 && onSegmentCollinear(s1.a, s1.b, s2.b)) return true;

  // 한쪽 부호가 갈리지만 나머지 한쪽은 동일 → 한 직선의 양 끝이 상대 직선 같은 편
  // → 실제 교차 없음
  if (d1 !== d2 && d3 === d4 && d3 !== 0) return false;
  if (d3 !== d4 && d1 === d2 && d1 !== 0) return false;

  return false;
}

/**
 * 점 c에서 선분 ab까지의 최단 거리.
 * 0길이 세그먼트(a==b)도 안전 처리.
 */
export function pointSegDistance(a: Point, b: Point, c: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < EPSILON) return Math.hypot(c.x - a.x, c.y - a.y);
  let t = ((c.x - a.x) * dx + (c.y - a.y) * dy) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(c.x - px, c.y - py);
}

/** 점 c에서 선분 ab 위 가장 가까운 점(끝점에 클램프). */
export function closestPointOnSegment(a: Point, b: Point, c: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < EPSILON) return { x: a.x, y: a.y };
  let t = ((c.x - a.x) * dx + (c.y - a.y) * dy) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return { x: a.x + t * dx, y: a.y + t * dy };
}
