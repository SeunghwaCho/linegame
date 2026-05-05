/**
 * 자체 번들러: build/ 의 ES module .js 파일들을 단일 dist.js 로 합친다.
 * - 외부 의존 X (Node 빌트인만 사용)
 * - main.js 부터 import를 따라 위상정렬
 * - 각 파일의 import 라인 제거, export 키워드만 제거 (선언 자체는 유지)
 * - 전체를 IIFE로 감싸서 글로벌 오염 방지
 *
 * 실행: node --experimental-strip-types tools/bundle.ts
 * 입력: build/ (tsc 산출물)
 * 출력: release/dist.js
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const buildDir = join(root, "build");
const releaseDir = join(root, "release");
const entry = join(buildDir, "main.js");

interface Module {
  path: string;
  source: string;
  deps: string[]; // 절대 경로
}

const modules = new Map<string, Module>();

function loadModule(absPath: string): void {
  if (modules.has(absPath)) return;
  const source = readFileSync(absPath, "utf8");
  const deps: string[] = [];
  const lines = source.split("\n");
  for (const line of lines) {
    const m =
      line.match(/^import\s+.+\s+from\s+["'](.+?)["'];?\s*$/) ??
      line.match(/^import\s+["'](.+?)["'];?\s*$/);
    if (!m) continue;
    const spec = m[1]!;
    if (!spec.startsWith(".") && !spec.startsWith("/")) continue; // 외부 모듈 (있으면 안 됨)
    const depAbs = resolve(dirname(absPath), spec);
    deps.push(depAbs);
  }
  modules.set(absPath, { path: absPath, source, deps });
  for (const d of deps) loadModule(d);
}

function topoSort(rootPath: string): string[] {
  const visited = new Set<string>();
  const order: string[] = [];
  function visit(p: string): void {
    if (visited.has(p)) return;
    visited.add(p);
    const m = modules.get(p);
    if (!m) throw new Error(`module not loaded: ${p}`);
    for (const d of m.deps) visit(d);
    order.push(p);
  }
  visit(rootPath);
  return order;
}

function stripModuleSyntax(source: string, sourceLabel: string): string {
  const lines = source.split("\n");
  const out: string[] = [];
  for (const raw of lines) {
    // import 라인 제거 (단일 라인 가정 — tsc 출력은 그렇다)
    if (
      /^import\s+.+\s+from\s+["'].+?["'];?\s*$/.test(raw) ||
      /^import\s+["'].+?["'];?\s*$/.test(raw)
    ) {
      continue;
    }
    // export ... from "..." (re-export) 제거
    if (/^export\s+(\{[^}]*\}|\*)\s+from\s+["'].+?["'];?\s*$/.test(raw)) continue;
    // export 키워드 prefix 제거 (`export class X`, `export const Y`, `export function Z`, `export default ...`)
    let line = raw.replace(/^export\s+default\s+/, "");
    line = line.replace(/^export\s+/, "");
    // tsc가 가끔 마지막에 빈 export {} 를 넣음 — 안전하게 제거
    if (/^\{\s*\}\s*;?\s*$/.test(line.trim())) continue;
    // sourceMappingURL 주석 제거 (release/에는 .map 파일이 없음)
    if (/^\/\/#\s*sourceMappingURL=/.test(line.trim())) continue;
    out.push(line);
  }
  // 모듈 라벨 주석 (디버깅 용)
  return `// --- module: ${sourceLabel} ---\n` + out.join("\n");
}

function relPath(abs: string): string {
  return abs.startsWith(buildDir) ? abs.slice(buildDir.length + 1) : abs;
}

function build(): void {
  if (!existsSync(buildDir)) {
    throw new Error(`build/ 가 없습니다. 먼저 'tsc -p tsconfig.build.json' 실행 필요.`);
  }
  loadModule(entry);
  const order = topoSort(entry);
  const chunks: string[] = [];
  chunks.push("// linegame — bundled dist.js (자체 번들러 산출물)");
  chunks.push("(function(){");
  chunks.push('"use strict";');
  for (const p of order) {
    chunks.push(stripModuleSyntax(modules.get(p)!.source, relPath(p)));
  }
  chunks.push("})();");

  if (!existsSync(releaseDir)) mkdirSync(releaseDir, { recursive: true });
  const outPath = join(releaseDir, "dist.js");
  writeFileSync(outPath, chunks.join("\n") + "\n", "utf8");
  console.log(`bundled ${order.length} modules → ${outPath}`);
}

build();
