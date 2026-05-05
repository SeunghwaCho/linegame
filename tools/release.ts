/**
 * release/ 폴더 구성: dist.js + index.html(번들 참조로 변경) + data/.
 * 실행: node --experimental-strip-types tools/release.ts
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const releaseDir = join(root, "release");

if (!existsSync(releaseDir)) mkdirSync(releaseDir, { recursive: true });

// 1) dist.js 는 bundle.ts 가 이미 만들어 둠. 존재 확인.
if (!existsSync(join(releaseDir, "dist.js"))) {
  throw new Error("release/dist.js 가 없습니다. 먼저 bundle.ts 실행하세요.");
}

// 2) index.html 을 번들 버전으로 변환 — type=module 제거, src 변경
const html = readFileSync(join(root, "index.html"), "utf8")
  .replace(
    /<script\s+type="module"\s+src="\.\/build\/main\.js"><\/script>/,
    '<script src="./dist.js" defer></script>',
  );
writeFileSync(join(releaseDir, "index.html"), html, "utf8");

// 3) data/ 복사
const dataSrc = join(root, "data", "levels.json");
const dataDst = join(releaseDir, "data");
if (!existsSync(dataDst)) mkdirSync(dataDst, { recursive: true });
copyFileSync(dataSrc, join(dataDst, "levels.json"));

console.log(`release: dist.js, index.html, data/levels.json → ${releaseDir}`);
