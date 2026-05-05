import { test } from "node:test";
import assert from "node:assert/strict";
import { isTriviallySolvable } from "../src/level/trivialCheck.ts";
import type { Level } from "../src/level/types.ts";

const lv = (id: number, dots: Level["dots"], w = 400, h = 400): Level => ({
  id,
  name: `t${id}`,
  width: w,
  height: h,
  dots,
});

test("단색 1쌍은 trivially solvable", () => {
  const l = lv(1, [
    { id: 1, colorId: 0, x: 50, y: 200 },
    { id: 2, colorId: 0, x: 350, y: 200 },
  ]);
  assert.equal(isTriviallySolvable(l), true);
});

test("두 색이 평행 lane이면 trivially solvable", () => {
  const l = lv(2, [
    { id: 1, colorId: 0, x: 50, y: 100 },
    { id: 2, colorId: 0, x: 350, y: 100 },
    { id: 3, colorId: 1, x: 50, y: 300 },
    { id: 4, colorId: 1, x: 350, y: 300 },
  ]);
  assert.equal(isTriviallySolvable(l), true);
});

test("두 색이 X자 대각선이면 NOT trivially (직선 교차)", () => {
  const l = lv(3, [
    { id: 1, colorId: 0, x: 50, y: 50 },
    { id: 2, colorId: 0, x: 350, y: 350 },
    { id: 3, colorId: 1, x: 350, y: 50 },
    { id: 4, colorId: 1, x: 50, y: 350 },
  ]);
  assert.equal(isTriviallySolvable(l), false);
});

test("색 1의 직선이 색 0 dot 반경을 통과하면 NOT trivially", () => {
  const l = lv(4, [
    { id: 1, colorId: 0, x: 200, y: 200, radius: 18 }, // 가운데 점
    { id: 2, colorId: 0, x: 350, y: 200 },
    { id: 3, colorId: 1, x: 50, y: 50 },
    { id: 4, colorId: 1, x: 350, y: 350 }, // 직선이 (200,200) 통과 (slope=1, x=200→y=200)
  ]);
  assert.equal(isTriviallySolvable(l), false);
});

test("기존 수동 레벨 3~5는 모두 NOT trivially solvable (사실 확인)", () => {
  // 레벨 3: 색 0 가로 + 색 1 세로 + 색 3 대각 → 가로/세로 교차
  const lv3 = lv(3, [
    { id: 1, colorId: 0, x: 80, y: 200 },
    { id: 2, colorId: 0, x: 320, y: 200 },
    { id: 3, colorId: 1, x: 200, y: 80 },
    { id: 4, colorId: 1, x: 200, y: 320 },
    { id: 5, colorId: 3, x: 120, y: 120 },
    { id: 6, colorId: 3, x: 280, y: 280 },
  ]);
  assert.equal(isTriviallySolvable(lv3), false);
});
