import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseLevelPack } from "../src/level/loader.ts";
import { isSolvable } from "../src/level/solver.ts";
import { isCompatibleColorSet } from "../src/level/colorConstraint.ts";
import { isTriviallySolvable } from "../src/level/trivialCheck.ts";
import type { Level } from "../src/level/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const sampleJson = readFileSync(join(here, "..", "data", "levels.json"), "utf8");
const pack = parseLevelPack(sampleJson);

// 각 (template, variant) 쌍에 대해 동적 테스트
for (const tmpl of pack.levels) {
  for (let vi = 0; vi < tmpl.variants.length; vi++) {
    const variant = tmpl.variants[vi]!;
    const lv: Level = {
      id: tmpl.id,
      name: tmpl.name,
      width: tmpl.width,
      height: tmpl.height,
      dots: variant.dots,
      circle: variant.circle,
    };

    test(`레벨 ${tmpl.id} v${vi} (${tmpl.name}): 색약 제약 통과`, () => {
      const colors = new Set(variant.dots.map((d) => d.colorId));
      assert.ok(
        isCompatibleColorSet(colors),
        `색 ${[...colors].join(",")} 가 적/녹 동시 포함`,
      );
    });

    test(`레벨 ${tmpl.id} v${vi}: solvable`, () => {
      // solver는 휴리스틱이라 false negative 가능 — 단계적으로 정밀도 ↑
      const ok =
        isSolvable(lv, { cellSize: 14, maxAttempts: 80 }) ||
        isSolvable(lv, { cellSize: 10, maxAttempts: 200 }) ||
        isSolvable(lv, { cellSize: 6, maxAttempts: 500 });
      assert.ok(ok, `unsolvable: dots=${JSON.stringify(variant.dots)}`);
    });

    if (tmpl.id >= 3) {
      test(`레벨 ${tmpl.id} v${vi}: 직선 단순 풀이 차단 (CLAUDE.md §8)`, () => {
        assert.equal(
          isTriviallySolvable(lv),
          false,
          `직선 풀이 가능: dots=${JSON.stringify(variant.dots)}`,
        );
      });
    }
  }
}
