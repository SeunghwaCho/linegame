import { parseLevelPack } from "./level/loader.ts";
import type { LevelPack } from "./level/types.ts";
import { GameScene } from "./scene/game.ts";
import { Sound } from "./audio/sound.ts";
import { Persistence } from "./storage/persistence.ts";

async function loadLevels(): Promise<LevelPack> {
  const res = await fetch("./data/levels.json");
  if (!res.ok) throw new Error(`failed to load levels: ${res.status}`);
  const text = await res.text();
  return parseLevelPack(text);
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`element #${id} not found`);
  return el;
}

async function main(): Promise<void> {
  const pack = await loadLevels();
  const canvas = $("game-canvas") as HTMLCanvasElement;
  const levelSelect = $("level-select") as HTMLSelectElement;
  const resetBtn = $("reset-btn") as HTMLButtonElement;
  const hintBtn = $("hint-btn") as HTMLButtonElement;
  const muteBtn = $("mute-btn") as HTMLButtonElement;
  const status = $("status");

  const sound = new Sound();
  const persistence = new Persistence();
  await persistence.init();

  // 옵션 채우기 + 클리어 표시 (✓)
  const completed = await persistence.getCompletedLevels();
  for (const lv of pack.levels) {
    const opt = document.createElement("option");
    opt.value = String(lv.id);
    opt.textContent = `${completed.has(lv.id) ? "✓ " : ""}${lv.id}. ${lv.name}`;
    levelSelect.appendChild(opt);
  }

  // 마지막 진행 레벨 복원 (없으면 1)
  const lastLevel = (await persistence.getLastLevelId()) ?? pack.levels[0]!.id;
  levelSelect.value = String(lastLevel);

  // 뮤트 상태 복원
  const muted = (await persistence.getMuted()) ?? false;
  sound.setMuted(muted);
  updateMuteLabel();

  let scene: GameScene | null = null;

  function updateMuteLabel(): void {
    muteBtn.textContent = sound.isMuted() ? "🔇" : "🔊";
  }

  async function refreshLevelOptions(): Promise<void> {
    const set = await persistence.getCompletedLevels();
    for (const opt of Array.from(levelSelect.options)) {
      const id = Number(opt.value);
      const lv = pack.levels.find((l) => l.id === id);
      if (!lv) continue;
      opt.textContent = `${set.has(id) ? "✓ " : ""}${id}. ${lv.name}`;
    }
  }

  function startLevel(levelId: number): void {
    if (scene) scene.stop();
    const lv = pack.levels.find((l) => l.id === levelId);
    if (!lv) return;
    scene = new GameScene(canvas, lv, sound);
    scene.setOnClear(() => {
      status.textContent = `🎉 ${lv.name} 클리어!`;
      void persistence.markCompleted(lv.id);
      void refreshLevelOptions();
    });
    status.textContent = `${lv.name} — 같은 색을 이으세요`;
    void persistence.setLastLevelId(lv.id);
    scene.start();
  }

  levelSelect.addEventListener("change", () => {
    startLevel(Number(levelSelect.value));
  });

  resetBtn.addEventListener("click", () => {
    if (!scene) return;
    if (!window.confirm("정말 다시 시작하시겠습니까?")) return;
    scene.reset();
    status.textContent = "다시 시작 — 같은 색을 이으세요";
  });

  hintBtn.addEventListener("click", () => {
    scene?.showHint();
  });

  muteBtn.addEventListener("click", () => {
    sound.setMuted(!sound.isMuted());
    updateMuteLabel();
    void persistence.setMuted(sound.isMuted());
  });

  window.addEventListener("resize", () => {
    scene?.fitToContainer();
  });

  startLevel(lastLevel);
}

main().catch((err: unknown) => {
  console.error(err);
  const status = document.getElementById("status");
  if (status) status.textContent = `오류: ${(err as Error).message}`;
});
