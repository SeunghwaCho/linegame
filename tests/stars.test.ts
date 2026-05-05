import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStars } from "../src/game/stars.ts";

test("3성: 빠르고 깨끗", () => {
  assert.equal(computeStars(10, 1, 3), 3); // 18s 이내, 3회 이내
});

test("2성: 적당", () => {
  assert.equal(computeStars(30, 5, 3), 2);
});

test("1성: 느리거나 실수 많음", () => {
  assert.equal(computeStars(120, 50, 3), 1);
});

test("색 수 많을수록 임계값 완화", () => {
  // 6색이면 36초 까지 3성 가능 (fastThresh = 36)
  assert.equal(computeStars(35, 5, 6), 3);
});

test("아주 적은 시간이라도 reject 많으면 강등", () => {
  assert.equal(computeStars(1, 100, 3), 1);
});
