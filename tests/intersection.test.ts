import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ccw,
  signOf,
  segmentsIntersect,
  onSegmentCollinear,
  aabb1DOverlap,
  pointSegDistance,
  closestPointOnSegment,
} from "../src/geometry/intersection.ts";
import type { Point, Segment } from "../src/geometry/types.ts";

const P = (x: number, y: number): Point => ({ x, y });
const S = (ax: number, ay: number, bx: number, by: number): Segment => ({
  a: P(ax, ay),
  b: P(bx, by),
});

test("ccw: 부호 — 좌회전(>0), 우회전(<0), 공선(=0)", () => {
  assert.ok(ccw(P(0, 0), P(1, 0), P(1, 1)) > 0);
  assert.ok(ccw(P(0, 0), P(1, 0), P(1, -1)) < 0);
  assert.equal(ccw(P(0, 0), P(2, 2), P(1, 1)), 0);
});

test("signOf: 임계값 이하는 0", () => {
  assert.equal(signOf(0), 0);
  assert.equal(signOf(1e-12), 0);
  assert.equal(signOf(-1e-12), 0);
  assert.equal(signOf(1), 1);
  assert.equal(signOf(-1), -1);
});

test("segmentsIntersect: 전형적 X자 교차", () => {
  assert.equal(segmentsIntersect(S(0, 0, 10, 10), S(0, 10, 10, 0)), true);
});

test("segmentsIntersect: 떨어진 평행선은 false", () => {
  assert.equal(segmentsIntersect(S(0, 0, 10, 0), S(0, 5, 10, 5)), false);
});

test("segmentsIntersect: 한 쪽 끝점이 다른 세그먼트 위 (T자)", () => {
  assert.equal(segmentsIntersect(S(0, 0, 10, 0), S(5, 0, 5, 10)), true);
});

test("segmentsIntersect: 공선이지만 분리된 세그먼트는 false (AABB miss)", () => {
  assert.equal(segmentsIntersect(S(0, 0, 5, 0), S(10, 0, 15, 0)), false);
});

test("segmentsIntersect: 공선 + 부분 겹침 → true", () => {
  assert.equal(segmentsIntersect(S(0, 0, 10, 0), S(5, 0, 15, 0)), true);
});

test("segmentsIntersect: 공선 + 한 쪽 포함 → true", () => {
  assert.equal(segmentsIntersect(S(0, 0, 10, 0), S(3, 0, 7, 0)), true);
});

test("segmentsIntersect: 공선 + 끝점만 닿음(접점) → true", () => {
  assert.equal(segmentsIntersect(S(0, 0, 5, 0), S(5, 0, 10, 0)), true);
});

test("segmentsIntersect: T자 + 끝점이 다른 세그먼트의 끝점에 정확히 일치", () => {
  assert.equal(segmentsIntersect(S(0, 0, 10, 0), S(0, 0, 5, 10)), true);
});

test("segmentsIntersect: 평행하지만 같은 직선 위가 아닌 (다른 y) 분리 케이스 — 공선 아님", () => {
  // 두 세그먼트가 같은 기울기지만 다른 y절편 → CCW 모두 같은 부호 → false
  assert.equal(segmentsIntersect(S(0, 0, 10, 10), S(0, 5, 10, 15)), false);
});

test("aabb1DOverlap: x/y 모두 겹쳐야 true", () => {
  assert.equal(aabb1DOverlap(S(0, 0, 5, 0), S(3, 0, 7, 0)), true);
  assert.equal(aabb1DOverlap(S(0, 0, 5, 0), S(6, 0, 10, 0)), false);
});

test("onSegmentCollinear: 점이 공선 세그먼트 위에 있는지", () => {
  assert.equal(onSegmentCollinear(P(0, 0), P(10, 0), P(5, 0)), true);
  assert.equal(onSegmentCollinear(P(0, 0), P(10, 0), P(15, 0)), false);
  assert.equal(onSegmentCollinear(P(0, 0), P(10, 0), P(0, 0)), true); // 끝점 포함
});

test("pointSegDistance: 수직 거리 / 끝점 거리", () => {
  assert.equal(pointSegDistance(P(0, 0), P(10, 0), P(5, 3)), 3);
  assert.equal(pointSegDistance(P(0, 0), P(10, 0), P(-3, 0)), 3); // 끝점 너머
  assert.equal(pointSegDistance(P(0, 0), P(10, 0), P(13, 0)), 3);
  assert.equal(pointSegDistance(P(5, 5), P(5, 5), P(8, 9)), 5); // 0길이 세그먼트
});

test("closestPointOnSegment: 투영점 좌표", () => {
  const p = closestPointOnSegment(P(0, 0), P(10, 0), P(5, 3));
  assert.deepEqual(p, P(5, 0));
  const p2 = closestPointOnSegment(P(0, 0), P(10, 0), P(-5, 0));
  assert.deepEqual(p2, P(0, 0)); // 시작점에 클램프
  const p3 = closestPointOnSegment(P(0, 0), P(10, 0), P(99, 0));
  assert.deepEqual(p3, P(10, 0)); // 끝점에 클램프
});

test("segmentsIntersect: T자가 아닌 진짜 끝점-끝점 V자 (공통점 외 무교차)", () => {
  // 같은 점에서 출발해 다른 방향으로 — 공통 endpoint 외 교차 없음.
  // 우리 판정은 "공통 endpoint를 교차로 본다"가 정책. 호출부에서 같은 path 인접 세그먼트는
  // 검사 대상에서 제외한다.
  assert.equal(segmentsIntersect(S(0, 0, 10, 0), S(0, 0, 0, 10)), true);
});
