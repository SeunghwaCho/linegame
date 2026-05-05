import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseLevelPack } from "../src/level/loader.ts";
import { isSolvable } from "../src/level/solver.ts";
import { isCompatibleColorSet } from "../src/level/colorConstraint.ts";

const here = dirname(fileURLToPath(import.meta.url));
const sampleJson = readFileSync(join(here, "..", "data", "levels.json"), "utf8");
const pack = parseLevelPack(sampleJson);

// 각 레벨에 대한 동적 테스트 (빌드 게이트)
for (const lv of pack.levels) {
  test(`레벨 ${lv.id} (${lv.name}): 색약 제약 통과`, () => {
    const colors = new Set(lv.dots.map((d) => d.colorId));
    assert.ok(
      isCompatibleColorSet(colors),
      `색 ${[...colors].join(",")} 가 적/녹 동시 포함`,
    );
  });

  test(`레벨 ${lv.id}: solvable`, () => {
    assert.ok(
      isSolvable(lv, { cellSize: 20, maxAttempts: 50 }),
      `unsolvable: dots=${JSON.stringify(lv.dots)}`,
    );
  });
}
