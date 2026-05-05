import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLevelPack, toGameDots } from "../src/level/loader.ts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const sampleJson = readFileSync(join(here, "..", "data", "levels.json"), "utf8");

test("샘플 levels.json 파싱 성공 + 100 레벨", () => {
  const pack = parseLevelPack(sampleJson);
  assert.equal(pack.version, 1);
  assert.equal(pack.levels.length, 100);
  // 모든 레벨 id가 1..100이어야 함
  const ids = pack.levels.map((l) => l.id).sort((a, b) => a - b);
  for (let i = 0; i < 100; i++) assert.equal(ids[i], i + 1);
});

test("같은 색이 정확히 2개 아니면 에러", () => {
  const bad = JSON.stringify({
    version: 1,
    levels: [
      {
        id: 1,
        name: "x",
        width: 100,
        height: 100,
        dots: [
          { id: 1, colorId: 0, x: 0, y: 0 },
          { id: 2, colorId: 0, x: 50, y: 0 },
          { id: 3, colorId: 0, x: 100, y: 0 },
        ],
      },
    ],
  });
  assert.throws(() => parseLevelPack(bad), /color 0 must have exactly 2 dots/);
});

test("dot id 중복 시 에러", () => {
  const bad = JSON.stringify({
    version: 1,
    levels: [
      {
        id: 1,
        name: "x",
        width: 100,
        height: 100,
        dots: [
          { id: 1, colorId: 0, x: 0, y: 0 },
          { id: 1, colorId: 0, x: 50, y: 0 },
        ],
      },
    ],
  });
  assert.throws(() => parseLevelPack(bad), /duplicate dot id/);
});

test("필수 필드 누락 시 에러", () => {
  const bad = JSON.stringify({ version: 1, levels: [{ id: 1 }] });
  assert.throws(() => parseLevelPack(bad));
});

test("toGameDots: 기본 반경 적용 + 좌표 변환", () => {
  const pack = parseLevelPack(sampleJson);
  const dots = toGameDots(pack.levels[0]!);
  assert.equal(dots.length, 2);
  assert.equal(dots[0]!.radius, 18);
  assert.deepEqual(dots[0]!.center, { x: 80, y: 200 });
});

test("커스텀 dot radius 보존", () => {
  const json = JSON.stringify({
    version: 1,
    levels: [
      {
        id: 1,
        name: "x",
        width: 100,
        height: 100,
        dots: [
          { id: 1, colorId: 0, x: 0, y: 0, radius: 25 },
          { id: 2, colorId: 0, x: 50, y: 0, radius: 25 },
        ],
      },
    ],
  });
  const pack = parseLevelPack(json);
  const dots = toGameDots(pack.levels[0]!);
  assert.equal(dots[0]!.radius, 25);
});

test("circle: 한 dot은 boundary 위, 한 dot은 안에 있으면 OK", () => {
  const json = JSON.stringify({
    version: 1,
    levels: [
      {
        id: 1,
        name: "원형",
        width: 400,
        height: 400,
        circle: { cx: 200, cy: 200, r: 180 },
        dots: [
          { id: 1, colorId: 0, x: 380, y: 200 }, // (200+180, 200) — boundary
          { id: 2, colorId: 0, x: 200, y: 200 }, // 중심 — inside
        ],
      },
    ],
  });
  const pack = parseLevelPack(json);
  assert.equal(pack.levels[0]!.circle?.r, 180);
});

test("circle: dot 이 원 밖이면 에러", () => {
  const json = JSON.stringify({
    version: 1,
    levels: [
      {
        id: 1,
        name: "원형",
        width: 400,
        height: 400,
        circle: { cx: 200, cy: 200, r: 100 },
        dots: [
          { id: 1, colorId: 0, x: 350, y: 200 }, // 원 밖
          { id: 2, colorId: 0, x: 200, y: 200 },
        ],
      },
    ],
  });
  assert.throws(() => parseLevelPack(json), /outside circle/);
});

test("circle: 두 dot이 둘 다 boundary 면 에러", () => {
  const json = JSON.stringify({
    version: 1,
    levels: [
      {
        id: 1,
        name: "원형",
        width: 400,
        height: 400,
        circle: { cx: 200, cy: 200, r: 100 },
        dots: [
          { id: 1, colorId: 0, x: 300, y: 200 }, // boundary
          { id: 2, colorId: 0, x: 100, y: 200 }, // boundary
        ],
      },
    ],
  });
  assert.throws(() => parseLevelPack(json), /must have exactly 1 boundary/);
});
