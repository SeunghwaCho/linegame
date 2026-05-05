import { test } from "node:test";
import assert from "node:assert/strict";
import { PathBuilder } from "../src/game/path.ts";
import { SpatialHash } from "../src/geometry/spatialHash.ts";
import type { Dot } from "../src/game/types.ts";
import type { Point } from "../src/geometry/types.ts";

const P = (x: number, y: number): Point => ({ x, y });
const D = (id: number, colorId: number, x: number, y: number, r = 18): Dot => ({
  id,
  colorId,
  center: P(x, y),
  radius: r,
});

function makeBuilder(opts: {
  startDot: Dot;
  allDots: Dot[];
  pathId?: number;
  hash?: SpatialHash;
}) {
  const hash = opts.hash ?? new SpatialHash(50);
  const pb = new PathBuilder({
    colorId: opts.startDot.colorId,
    startDot: opts.startDot,
    allDots: opts.allDots,
    spatialHash: hash,
    pathId: opts.pathId ?? 1,
    minStep: 2,
    rewindRadius: 10,
    lineHalfWidth: 3,
  });
  return { pb, hash };
}

test("초기 상태: tip은 시작 dot 중심, 세그먼트는 비어있음", () => {
  const start = D(1, 0, 100, 100);
  const { pb } = makeBuilder({ startDot: start, allDots: [start] });
  assert.deepEqual(pb.getTip(), P(100, 100));
  assert.equal(pb.getSegmentCount(), 0);
  assert.equal(pb.isFinalized(), false);
});

test("일반 전진: 새 세그먼트 추가됨", () => {
  const start = D(1, 0, 100, 100);
  const { pb } = makeBuilder({ startDot: start, allDots: [start] });
  const r = pb.onPointerMove(P(150, 100));
  assert.equal(r.kind, "extended");
  assert.equal(pb.getSegmentCount(), 1);
  assert.deepEqual(pb.getTip(), P(150, 100));
});

test("MIN_STEP: 너무 가까운 이동은 reject (segment 추가 안됨)", () => {
  const start = D(1, 0, 100, 100);
  const { pb } = makeBuilder({ startDot: start, allDots: [start] });
  const r = pb.onPointerMove(P(101, 100));
  assert.equal(r.kind, "rejected");
  if (r.kind === "rejected") assert.equal(r.reason, "min-step");
  assert.equal(pb.getSegmentCount(), 0);
});

test("되감기: 직전 세그먼트가 아닌 과거 세그먼트 근처로 가면 pop", () => {
  const start = D(1, 0, 100, 100);
  const { pb } = makeBuilder({ startDot: start, allDots: [start] });
  pb.onPointerMove(P(150, 100)); // seg 1
  pb.onPointerMove(P(150, 150)); // seg 2
  pb.onPointerMove(P(200, 150)); // seg 3
  assert.equal(pb.getSegmentCount(), 3);

  // 이제 (155, 100) 근처로 — seg 1 위로 되감기
  const r = pb.onPointerMove(P(155, 100));
  assert.equal(r.kind, "rewound");
  // seg 2, 3는 pop, seg 1은 잘림(또는 유지)
  assert.ok(pb.getSegmentCount() <= 1);
});

test("자기 교차: 직전 세그먼트가 아닌 본인 세그먼트와 X자 교차하면 reject", () => {
  const start = D(1, 0, 0, 0);
  const { pb } = makeBuilder({ startDot: start, allDots: [start] });
  // ㄱ자: 오른쪽 100 → 아래 100 → 왼쪽 100
  pb.onPointerMove(P(100, 0));
  pb.onPointerMove(P(100, 100));
  pb.onPointerMove(P(0, 100));
  // 이제 (50, -50) 으로 가면 첫 세그먼트(0,0)-(100,0)을 통과
  // 직전 세그먼트는 (100,100)-(0,100), 그 이전을 검사
  const r = pb.onPointerMove(P(50, -50));
  // 자기교차이지만 사실 (0,100)-(50,-50) 이 (0,0)-(100,0)과 교차함
  assert.equal(r.kind, "rejected");
  if (r.kind === "rejected") assert.equal(r.reason, "self-cross");
});

test("타 path 교차: 다른 색의 세그먼트와 교차하면 reject", () => {
  const start = D(1, 0, 0, 50);
  const otherStart = D(2, 1, 100, 100);
  const hash = new SpatialHash(50);
  // 다른 색 path 의 세그먼트를 미리 등록 (수직선)
  hash.insert(2, { a: P(50, 0), b: P(50, 100) });
  const { pb } = makeBuilder({
    startDot: start,
    allDots: [start, otherStart],
    pathId: 1,
    hash,
  });
  const r = pb.onPointerMove(P(100, 50));
  assert.equal(r.kind, "rejected");
  if (r.kind === "rejected") assert.equal(r.reason, "cross-other");
});

test("터널링 방지: 다른 색 dot 반경을 통과하는 세그먼트는 reject", () => {
  const start = D(1, 0, 0, 0);
  const foreignDot = D(5, 9, 50, 0, 18); // 다른 색, (50,0) 반경 18
  const { pb } = makeBuilder({ startDot: start, allDots: [start, foreignDot] });
  const r = pb.onPointerMove(P(100, 0)); // 곧장 통과
  assert.equal(r.kind, "rejected");
  if (r.kind === "rejected") assert.equal(r.reason, "foreign-dot");
});

test("터널링 우회: 다른 색 dot 옆을 비껴가면 통과", () => {
  const start = D(1, 0, 0, 0);
  const foreignDot = D(5, 9, 50, 0, 10);
  const { pb } = makeBuilder({ startDot: start, allDots: [start, foreignDot] });
  const r = pb.onPointerMove(P(100, 50)); // 위로 비껴감
  assert.equal(r.kind, "extended");
});

test("같은 색 목적 dot에 닿으면 finalize", () => {
  const start = D(1, 0, 0, 0);
  const target = D(2, 0, 100, 0); // 같은 colorId=0
  const { pb } = makeBuilder({ startDot: start, allDots: [start, target] });
  const r = pb.onPointerMove(P(100, 0));
  assert.equal(r.kind, "finalized");
  if (r.kind === "finalized") assert.equal(r.endDot.id, target.id);
  assert.equal(pb.isFinalized(), true);
});

test("시작 dot 자신은 foreign 충돌로 잡히지 않음 (출발 직후)", () => {
  const start = D(1, 0, 50, 50);
  const { pb } = makeBuilder({ startDot: start, allDots: [start] });
  // 시작점에서 살짝 벗어남
  const r = pb.onPointerMove(P(80, 50));
  assert.equal(r.kind, "extended");
});

test("cancel: SpatialHash에서 본인 path 세그먼트 모두 제거", () => {
  const start = D(1, 0, 0, 0);
  const hash = new SpatialHash(50);
  const { pb } = makeBuilder({
    startDot: start,
    allDots: [start],
    pathId: 7,
    hash,
  });
  pb.onPointerMove(P(50, 0));
  pb.onPointerMove(P(50, 50));
  assert.equal(pb.getSegmentCount(), 2);
  pb.cancel();
  // hash에서 모두 사라졌는지: 동일 영역 query 결과 없음
  assert.equal(hash.query({ a: P(0, 0), b: P(60, 60) }).length, 0);
});

test("finalize 후에는 더 이상 onPointerMove 처리 안함", () => {
  const start = D(1, 0, 0, 0);
  const target = D(2, 0, 100, 0);
  const { pb } = makeBuilder({ startDot: start, allDots: [start, target] });
  pb.onPointerMove(P(100, 0));
  assert.equal(pb.isFinalized(), true);
  const segCount = pb.getSegmentCount();
  pb.onPointerMove(P(200, 0));
  assert.equal(pb.getSegmentCount(), segCount); // 변화 없음
});
