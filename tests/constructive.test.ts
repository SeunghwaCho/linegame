import { test } from "node:test";
import assert from "node:assert/strict";
import { constructiveGenerateWithColors } from "../src/level/constructive.ts";
import { isSolvable } from "../src/level/solver.ts";
import { isTriviallySolvable } from "../src/level/trivialCheck.ts";

test("constructive: 2색 결과 dots 4개", () => {
  const r = constructiveGenerateWithColors([0, 1], {
    width: 400,
    height: 400,
    cellSize: 25,
    minLen: 6,
    maxLen: 12,
    seed: 1,
  });
  assert.notEqual(r, null);
  assert.equal(r!.dots.length, 4);
  assert.equal(r!.paths.length, 2);
});

test("constructive: 같은 색 dot 정확히 2개씩", () => {
  const r = constructiveGenerateWithColors([0, 1, 3, 4, 6], {
    width: 400,
    height: 400,
    cellSize: 25,
    minLen: 6,
    maxLen: 14,
    seed: 7,
  });
  assert.notEqual(r, null);
  const byColor = new Map<number, number>();
  for (const d of r!.dots) byColor.set(d.colorId, (byColor.get(d.colorId) ?? 0) + 1);
  for (const [, n] of byColor) assert.equal(n, 2);
});

test("constructive: solver가 solvable로 인정 (구성으로 보장된 해)", () => {
  const r = constructiveGenerateWithColors([0, 1, 3], {
    width: 400,
    height: 400,
    cellSize: 25,
    minLen: 8,
    maxLen: 16,
    seed: 42,
  });
  assert.notEqual(r, null);
  const lv = {
    id: 1,
    name: "t",
    width: 400,
    height: 400,
    dots: r!.dots,
  };
  assert.equal(isSolvable(lv, { cellSize: 25, maxAttempts: 30 }), true);
});

test("constructiveGenerateNonTrivial: 비자명 보장 래퍼는 항상 trivial이 아님", async () => {
  const { constructiveGenerateNonTrivial } = await import(
    "../src/level/constructive.ts"
  );
  for (let s = 1; s <= 10; s++) {
    const r = constructiveGenerateNonTrivial(
      [0, 1, 3, 4],
      {
        width: 400,
        height: 400,
        cellSize: 25,
        minLen: 10,
        maxLen: 20,
        seed: s,
      },
      (dots) =>
        isTriviallySolvable({
          id: 0,
          name: "t",
          width: 400,
          height: 400,
          dots,
        }),
      50,
    );
    assert.notEqual(r, null, `seed=${s} 결과 없음`);
    const lv = {
      id: s,
      name: "t",
      width: 400,
      height: 400,
      dots: r!.dots,
    };
    assert.equal(isTriviallySolvable(lv), false, `seed=${s} 가 trivial`);
  }
});
