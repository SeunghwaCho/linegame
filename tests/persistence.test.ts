import { test } from "node:test";
import assert from "node:assert/strict";
import { Persistence } from "../src/storage/persistence.ts";

// Node 환경에는 indexedDB가 없으므로 init()이 자동으로 memory fallback로 떨어진다.

test("init: IndexedDB 없는 환경에서는 memory fallback", async () => {
  const p = new Persistence();
  await p.init();
  assert.equal(p.isUsingMemory(), true);
});

test("markCompleted + getCompletedLevels", async () => {
  const p = new Persistence();
  await p.init();
  await p.markCompleted(1);
  await p.markCompleted(3);
  await p.markCompleted(1); // 중복은 idempotent
  const set = await p.getCompletedLevels();
  assert.equal(set.size, 2);
  assert.ok(set.has(1));
  assert.ok(set.has(3));
});

test("getLastLevelId 초기값 undefined, set 후 반영", async () => {
  const p = new Persistence();
  await p.init();
  assert.equal(await p.getLastLevelId(), undefined);
  await p.setLastLevelId(7);
  assert.equal(await p.getLastLevelId(), 7);
});

test("muted 옵션 round-trip", async () => {
  const p = new Persistence();
  await p.init();
  assert.equal(await p.getMuted(), undefined);
  await p.setMuted(true);
  assert.equal(await p.getMuted(), true);
  await p.setMuted(false);
  assert.equal(await p.getMuted(), false);
});

test("두 인스턴스 간 메모리는 공유되지 않음 (fallback이므로 OK)", async () => {
  const a = new Persistence();
  const b = new Persistence();
  await a.init();
  await b.init();
  await a.markCompleted(42);
  const setB = await b.getCompletedLevels();
  assert.equal(setB.has(42), false);
});
