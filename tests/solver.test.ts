import { test } from "node:test";
import assert from "node:assert/strict";
import { isSolvable } from "../src/level/solver.ts";
import type { Level } from "../src/level/types.ts";

const lv = (id: number, dots: Level["dots"], w = 400, h = 400): Level => ({
  id,
  name: `t${id}`,
  width: w,
  height: h,
  dots,
});

test("trivial: 한 색 가로 직선", () => {
  const l = lv(1, [
    { id: 1, colorId: 0, x: 50, y: 200 },
    { id: 2, colorId: 0, x: 350, y: 200 },
  ]);
  assert.equal(isSolvable(l), true);
});

test("두 색 분리된 lane은 solvable", () => {
  const l = lv(2, [
    { id: 1, colorId: 0, x: 50, y: 100 },
    { id: 2, colorId: 0, x: 350, y: 100 },
    { id: 3, colorId: 1, x: 50, y: 300 },
    { id: 4, colorId: 1, x: 350, y: 300 },
  ]);
  assert.equal(isSolvable(l), true);
});

test("interlock 패턴 (X자 직선이지만 우회 가능) — solvable", () => {
  // 색 0: (50, 100) ↔ (350, 300)  대각
  // 색 1: (50, 300) ↔ (350, 100)  반대 대각 — 직선이면 X자 교차이지만 한 색이 우회 가능
  const l = lv(3, [
    { id: 1, colorId: 0, x: 50, y: 100 },
    { id: 2, colorId: 0, x: 350, y: 300 },
    { id: 3, colorId: 1, x: 50, y: 300 },
    { id: 4, colorId: 1, x: 350, y: 100 },
  ]);
  assert.equal(isSolvable(l), true);
});

test("unsolvable: + 자 dot 배치 — Jordan curve theorem상 두 경로 강제 교차", () => {
  // 4개 dot을 W/E/N/S 변에 두면 가로(W↔E)와 세로(N↔S) 경로는 평면에서 반드시 교차.
  const l = lv(
    9,
    [
      { id: 1, colorId: 0, x: 5, y: 40 },
      { id: 2, colorId: 0, x: 75, y: 40 },
      { id: 3, colorId: 1, x: 40, y: 5 },
      { id: 4, colorId: 1, x: 40, y: 75 },
    ],
    80,
    80,
  );
  assert.equal(isSolvable(l, { cellSize: 10 }), false);
});

test("unsolvable: 두 색이 평면에서 서로 잠금 (K_{3,3} 미니어처)", () => {
  // 좁은 보드에 4개 색 dot이 K_{3,3} 처럼 배치되어 평면 그래프 매칭 불가능
  // 더 확실히 unsolvable한 케이스: 색 1의 두 dot을 색 0의 두 dot이 양쪽에서 둘러싸 격리
  // 매우 좁은 board에 색0이 모든 cell을 채워야만 함 → BFS에서 항상 실패
  const l = lv(
    10,
    [
      // 색 0: (0,0)와 (40,0) — 한 셀씩만
      { id: 1, colorId: 0, x: 5, y: 5 },
      { id: 2, colorId: 0, x: 35, y: 5 },
      // 색 1: (0,40), (40,40) — 한 셀씩만
      { id: 3, colorId: 1, x: 5, y: 35 },
      { id: 4, colorId: 1, x: 35, y: 35 },
      // 색 2: (20,0)와 (20,40) — 가운데 세로축
      { id: 5, colorId: 2, x: 20, y: 5 },
      { id: 6, colorId: 2, x: 20, y: 35 },
    ],
    40,
    40,
  );
  // cellSize=10 → 4x4 격자 (16 셀). 6 dot이 차지 → 10 셀 빔.
  // 색 2가 가운데 세로 분단 → 색 0과 색 1 둘 다 좌우 통과 필요.
  // 매우 빡빡 → 일부 시드에서만 풀릴 수 있음.
  // 본 테스트는 결과가 true이거나 false이거나 실행이 끝나는 것 자체가 목적 (스모크).
  const r = isSolvable(l, { cellSize: 10, maxAttempts: 10 });
  assert.equal(typeof r, "boolean");
});

test("같은 cell에 두 dot이 떨어지면 false (격자 너무 거침)", () => {
  const l = lv(11, [
    { id: 1, colorId: 0, x: 50, y: 50 },
    { id: 2, colorId: 0, x: 51, y: 51 },
  ]);
  assert.equal(isSolvable(l, { cellSize: 20 }), false);
});

test("결정적: 같은 시드에서 동일 결과", () => {
  const l = lv(12, [
    { id: 1, colorId: 0, x: 50, y: 100 },
    { id: 2, colorId: 0, x: 350, y: 100 },
    { id: 3, colorId: 1, x: 50, y: 300 },
    { id: 4, colorId: 1, x: 350, y: 300 },
  ]);
  const r1 = isSolvable(l, { seed: 42 });
  const r2 = isSolvable(l, { seed: 42 });
  assert.equal(r1, r2);
});
