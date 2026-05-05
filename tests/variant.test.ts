import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseLevelPack } from "../src/level/loader.ts";
import {
  pickVariantParams,
  resolveLevel,
  applyVariant,
  makeRng,
  type VariantParams,
} from "../src/level/variant.ts";
import { isSolvable } from "../src/level/solver.ts";
import { isTriviallySolvable } from "../src/level/trivialCheck.ts";
import { isCompatibleColorSet } from "../src/level/colorConstraint.ts";
import type { Level, Variant } from "../src/level/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const sampleJson = readFileSync(join(here, "..", "data", "levels.json"), "utf8");
const pack = parseLevelPack(sampleJson);

test("pickVariantParams: 결정성 — 같은 시드 → 같은 결과", () => {
  const tmpl = pack.levels[9]!; // 레벨 10
  const a = pickVariantParams(tmpl, makeRng(42));
  const b = pickVariantParams(tmpl, makeRng(42));
  assert.deepEqual(a, b);
});

test("pickVariantParams: 회전각 ∈ [-150, -30] ∪ [30, 150]", () => {
  const tmpl = pack.levels[9]!;
  for (let s = 1; s <= 100; s++) {
    const p = pickVariantParams(tmpl, makeRng(s));
    const a = Math.abs(p.rotationDeg);
    assert.ok(a >= 30 && a <= 150, `rotationDeg=${p.rotationDeg}`);
  }
});

test("resolveLevel: 색약 제약 보존 (모든 변형이 호환 색 세트)", () => {
  for (const tmpl of pack.levels) {
    for (let s = 0; s < 8; s++) {
      const p = pickVariantParams(tmpl, makeRng(s * 13 + tmpl.id));
      const lv = resolveLevel(tmpl, p);
      const colors = new Set(lv.dots.map((d) => d.colorId));
      assert.ok(
        isCompatibleColorSet(colors),
        `level ${tmpl.id} seed ${s}: ${[...colors].join(",")}`,
      );
    }
  }
});

test("resolveLevel: solvability·non-triviality 보존", () => {
  // 표본 — 처음 12 + 매 10번째 + 마지막
  const indices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 19, 29, 49, 79, 99];
  for (const i of indices) {
    const tmpl = pack.levels[i]!;
    for (let s = 0; s < 3; s++) {
      const p = pickVariantParams(tmpl, makeRng(s * 7 + tmpl.id * 3));
      const lv = resolveLevel(tmpl, p);
      const ok =
        isSolvable(lv, { cellSize: 14, maxAttempts: 80 }) ||
        isSolvable(lv, { cellSize: 10, maxAttempts: 200 }) ||
        isSolvable(lv, { cellSize: 6, maxAttempts: 500 });
      assert.ok(ok, `level ${tmpl.id} seed ${s} unsolvable`);
      if (tmpl.id >= 3) {
        assert.equal(
          isTriviallySolvable(lv),
          false,
          `level ${tmpl.id} seed ${s} trivially solvable`,
        );
      }
    }
  }
});

test("resolveLevel: 모든 dot이 보드 안", () => {
  for (const tmpl of pack.levels) {
    for (let s = 0; s < 3; s++) {
      const p = pickVariantParams(tmpl, makeRng(s + tmpl.id));
      const lv = resolveLevel(tmpl, p);
      for (const d of lv.dots) {
        assert.ok(
          d.x >= 0 && d.x <= lv.width && d.y >= 0 && d.y <= lv.height,
          `level ${tmpl.id} dot ${d.id} 보드 밖: (${d.x}, ${d.y})`,
        );
      }
    }
  }
});

test("resolveLevel: disk boundary dot은 경계 위에 정확히 (float 0 오차)", () => {
  for (const tmpl of pack.levels) {
    if (!tmpl.variants[0]!.circle) continue;
    for (let s = 0; s < 3; s++) {
      const p = pickVariantParams(tmpl, makeRng(s + tmpl.id));
      const lv = resolveLevel(tmpl, p);
      if (!lv.circle) continue;
      // 색별 정확히 한 dot이 경계 위
      const byColor = new Map<number, typeof lv.dots>();
      for (const d of lv.dots) {
        let arr = byColor.get(d.colorId);
        if (!arr) {
          arr = [];
          byColor.set(d.colorId, arr);
        }
        arr.push(d);
      }
      for (const [, ds] of byColor) {
        let onBoundary = 0;
        for (const d of ds) {
          const dist = Math.hypot(d.x - lv.circle.cx, d.y - lv.circle.cy);
          if (Math.abs(dist - lv.circle.r) <= 1e-9) onBoundary++;
        }
        assert.equal(
          onBoundary,
          1,
          `level ${tmpl.id} 색당 boundary dot 1개여야 — got ${onBoundary}`,
        );
      }
    }
  }
});

test("applyVariant: 회전 0 + 항등 colorMap = 위상 동일 (좌표는 동일)", () => {
  const v: Variant = {
    dots: [
      { id: 1, colorId: 0, x: 100, y: 100 },
      { id: 2, colorId: 0, x: 200, y: 200 },
    ],
  };
  const out = applyVariant(v, {
    rotationDeg: 0,
    rotationCenter: { x: 200, y: 200 },
    colorRemap: new Map(),
  });
  for (let i = 0; i < v.dots.length; i++) {
    assert.ok(Math.abs(out.dots[i]!.x - v.dots[i]!.x) < 1e-9);
    assert.ok(Math.abs(out.dots[i]!.y - v.dots[i]!.y) < 1e-9);
    assert.equal(out.dots[i]!.colorId, v.dots[i]!.colorId);
  }
});

test("applyVariant: colorMap 적용", () => {
  const v: Variant = {
    dots: [
      { id: 1, colorId: 0, x: 100, y: 100 },
      { id: 2, colorId: 0, x: 200, y: 200 },
      { id: 3, colorId: 1, x: 50, y: 50 },
      { id: 4, colorId: 1, x: 250, y: 250 },
    ],
  };
  const remap = new Map<number, number>([
    [0, 3],
    [1, 4],
  ]);
  const out = applyVariant(v, {
    rotationDeg: 0,
    rotationCenter: { x: 200, y: 200 },
    colorRemap: remap,
  });
  assert.equal(out.dots[0]!.colorId, 3);
  assert.equal(out.dots[2]!.colorId, 4);
});

test("VariantParams round-trip JSON 직렬화", () => {
  const tmpl = pack.levels[9]!;
  const p = pickVariantParams(tmpl, makeRng(123));
  const json = JSON.stringify(p);
  const back = JSON.parse(json) as VariantParams;
  const lv1 = resolveLevel(tmpl, p);
  const lv2 = resolveLevel(tmpl, back);
  assert.deepEqual(lv1, lv2);
});
