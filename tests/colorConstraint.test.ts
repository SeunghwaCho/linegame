import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isCompatibleColorSet,
  pickCompatibleColors,
  maxCompatibleColors,
  RED_GROUP,
  GREEN_GROUP,
} from "../src/level/colorConstraint.ts";

test("RED + GREEN 동시 사용은 불가", () => {
  assert.equal(isCompatibleColorSet([0, 2]), false); // red + teal
  assert.equal(isCompatibleColorSet([0, 5]), false); // red + mint
  assert.equal(isCompatibleColorSet([0, 2, 5]), false);
});

test("RED 단독 또는 GREEN 단독은 OK", () => {
  assert.equal(isCompatibleColorSet([0, 1, 3, 7]), true); // red 포함, 녹 없음
  assert.equal(isCompatibleColorSet([2, 5, 1, 3]), true); // 녹 포함, 적 없음
  assert.equal(isCompatibleColorSet([1, 3, 4, 6, 7]), true); // 둘 다 없음
});

test("RED_GROUP / GREEN_GROUP 분류 노출", () => {
  assert.ok(RED_GROUP.has(0));
  assert.ok(GREEN_GROUP.has(2));
  assert.ok(GREEN_GROUP.has(5));
});

test("maxCompatibleColors: 8색 팔레트에서 적·녹 분류 시 최대 7색", () => {
  // 적 1개 vs 녹 2개 → 녹 제외 시 7색이 최대
  assert.equal(maxCompatibleColors(8), 7);
});

test("pickCompatibleColors 결과는 항상 호환적", () => {
  const rng = makeRng(1);
  for (let i = 0; i < 100; i++) {
    const n = 2 + Math.floor(rng() * 6); // 2~7
    const picked = pickCompatibleColors(n, 8, rng);
    assert.equal(picked.length, n, `iter=${i} expected ${n} got ${picked.length}`);
    assert.ok(isCompatibleColorSet(picked), `iter=${i} picked=${picked.join(",")}`);
  }
});

test("pickCompatibleColors: 요청 수가 capacity 초과면 throw", () => {
  const rng = makeRng(1);
  assert.throws(() => pickCompatibleColors(8, 8, rng), /exceeds compatible max/);
});

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
