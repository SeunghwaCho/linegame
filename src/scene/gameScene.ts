import type { Scene } from "./scene.ts";
import type { Layout } from "../ui/types.ts";
import type { SceneContext } from "./context.ts";
import type { Level, LevelTemplate } from "../level/types.ts";
import { Board } from "../game/board.ts";
import { toGameDots } from "../level/loader.ts";
import { Renderer } from "./renderer.ts";
import { Effects } from "./effects.ts";
import { Button } from "../ui/button.ts";
import { Modal } from "../ui/modal.ts";
import { nextHint, type HintResult } from "../game/hint.ts";
import { computeStars } from "../game/stars.ts";
import { colorOf } from "./colors.ts";
import { sceneRegistry } from "./registry.ts";

function formatTime(sec: number): string {
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * 한 레벨 플레이 화면.
 * - 상단 툴바: ◀(메뉴), 레벨 이름, 💡, 🔊/🔇, ↺(다시 시작)
 * - 본문: Board (Renderer가 boardRect 안에 letterbox로 그림)
 * - 다시 시작 시 Modal 컨펌 (native confirm 대체)
 */
export class GameScene implements Scene {
  private readonly ctx: SceneContext;
  private readonly level: Level;
  private readonly template: LevelTemplate;
  private readonly board: Board;
  private readonly renderer: Renderer;
  private readonly effects: Effects;

  // 툴바 위젯
  private readonly btnBack: Button;
  private readonly btnHint: Button;
  private readonly btnMute: Button;
  private readonly btnPause: Button;
  private readonly btnReset: Button;
  private readonly resetModal: Modal;

  private cleared = false;
  private paused = false;
  private elapsedSec = 0;
  private rejectCount = 0;
  private hintActive: HintResult | null = null;
  private hintAge = 0;

  // 롱프레스 path 제거
  private longPressTimerId: ReturnType<typeof setTimeout> | null = null;
  private longPressColorId: number | null = null;
  private longPressStart: { x: number; y: number } | null = null;
  private static readonly LONG_PRESS_MS = 450;
  private static readonly LONG_PRESS_MOVE_TOLERANCE = 8;

  constructor(c: SceneContext, level: Level, template: LevelTemplate) {
    this.ctx = c;
    this.level = level;
    this.template = template;
    this.board = new Board(toGameDots(level), {
      cellSize: 60,
      lineHalfWidth: 2.5,
      circle: level.circle,
    });
    this.renderer = new Renderer({
      worldWidth: level.width,
      worldHeight: level.height,
      lineWidth: 5,
      circle: level.circle,
    });

    this.effects = new Effects();

    this.btnBack = new Button({
      bounds: { x: 0, y: 0, w: 0, h: 0 },
      label: "◀",
      onPress: () => this.gotoMenu(),
    });
    this.btnHint = new Button({
      bounds: { x: 0, y: 0, w: 0, h: 0 },
      label: "💡",
      onPress: () => this.showHint(),
    });
    this.btnMute = new Button({
      bounds: { x: 0, y: 0, w: 0, h: 0 },
      label: "🔊",
      onPress: () => this.toggleMute(),
    });
    this.btnPause = new Button({
      bounds: { x: 0, y: 0, w: 0, h: 0 },
      label: "⏸",
      onPress: () => this.togglePause(),
    });
    this.btnReset = new Button({
      bounds: { x: 0, y: 0, w: 0, h: 0 },
      label: "↺",
      onPress: () => this.resetModal.show(),
    });

    this.resetModal = new Modal(
      "다시 시작",
      "현재 진행 상황이 사라집니다. 다시 시작할까요?",
      [
        { label: "취소", onSelect: () => {} },
        { label: "다시 시작", onSelect: () => this.resetBoard(), primary: true },
      ],
    );
    this.btnMute.active = c.sound.isMuted();
    this.btnMute.label = c.sound.isMuted() ? "🔇" : "🔊";
  }

  enter(): void {
    void this.ctx.persistence.setLastLevelId(this.level.id);
  }

  update(dt: number, layout: Layout): void {
    this.layoutToolbar(layout);
    this.resetModal.setLayout(layout.width, layout.height);
    this.effects.update(dt);
    this.hintAge += dt;
    if (!this.paused && !this.cleared) this.elapsedSec += dt;
  }

  private layoutToolbar(layout: Layout): void {
    const h = layout.toolbarH - 12;
    const y = 6;
    const btnW = 44;
    const gap = 4;
    // 좌측: ◀, 우측: 💡 ⏸ 🔊 ↺
    this.btnBack.setBounds({ x: 8, y, w: btnW, h });
    this.btnReset.setBounds({ x: layout.width - 8 - btnW, y, w: btnW, h });
    this.btnMute.setBounds({
      x: layout.width - 8 - btnW * 2 - gap,
      y,
      w: btnW,
      h,
    });
    this.btnPause.setBounds({
      x: layout.width - 8 - btnW * 3 - gap * 2,
      y,
      w: btnW,
      h,
    });
    this.btnHint.setBounds({
      x: layout.width - 8 - btnW * 4 - gap * 3,
      y,
      w: btnW,
      h,
    });
  }

  draw(ctx: CanvasRenderingContext2D, layout: Layout): void {
    // 툴바 배경
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, layout.width, layout.toolbarH);
    ctx.strokeStyle = "#e0e0e0";
    ctx.beginPath();
    ctx.moveTo(0, layout.toolbarH);
    ctx.lineTo(layout.width, layout.toolbarH);
    ctx.stroke();

    // 레벨 이름 (가운데, 적당한 폭에 맞춤) + 타이머
    ctx.fillStyle = "#222";
    ctx.font = "600 15px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const title = this.cleared
      ? `🎉 ${this.level.name}`
      : `${this.level.name}`;
    ctx.fillText(title, layout.width / 2, layout.toolbarH / 2 - 8);

    ctx.fillStyle = "#666";
    ctx.font = "12px -apple-system, system-ui, sans-serif";
    ctx.fillText(
      `${formatTime(this.elapsedSec)}${this.paused ? " (일시정지)" : ""}`,
      layout.width / 2,
      layout.toolbarH / 2 + 10,
    );
    ctx.restore();

    // 보드 — boardRect 안에 letterbox
    this.drawBoard(ctx, layout);

    // 툴바 위젯
    this.btnBack.draw(ctx);
    this.btnHint.draw(ctx);
    this.btnPause.draw(ctx);
    this.btnMute.draw(ctx);
    this.btnReset.draw(ctx);

    // 일시정지 오버레이
    if (this.paused && !this.cleared) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(
        layout.boardRect.x,
        layout.boardRect.y,
        layout.boardRect.w,
        layout.boardRect.h,
      );
      ctx.fillStyle = "#fff";
      ctx.font = "600 32px -apple-system, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        "일시정지",
        layout.boardRect.x + layout.boardRect.w / 2,
        layout.boardRect.y + layout.boardRect.h / 2,
      );
      ctx.restore();
    }

    // 모달
    this.resetModal.draw(ctx, layout.width, layout.height);
  }

  /**
   * Renderer는 자체 transform을 쓰므로 save/restore로 격리.
   * boardRect 영역에 letterbox로 board 좌표계를 매핑.
   */
  private drawBoard(ctx: CanvasRenderingContext2D, layout: Layout): void {
    const r = layout.boardRect;
    const sx = r.w / this.level.width;
    const sy = r.h / this.level.height;
    const scale = Math.min(sx, sy);
    const offX = r.x + (r.w - this.level.width * scale) / 2;
    const offY = r.y + (r.h - this.level.height * scale) / 2;

    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);
    // Renderer는 본인 scale을 알아야 dot/line stroke를 화면 픽셀 단위로 맞춤
    this.renderer.setExternalScale(scale);
    this.renderer.draw(ctx, this.board);
    if (this.hintActive) this.drawHintInWorld(ctx);
    this.effects.draw(ctx);
    ctx.restore();

    // 보드 좌표 ↔ 화면 좌표 변환 캐시
    this.boardOffX = offX;
    this.boardOffY = offY;
    this.boardScale = scale;
  }

  private boardOffX = 0;
  private boardOffY = 0;
  private boardScale = 1;

  private screenToBoard(cssX: number, cssY: number): { x: number; y: number } {
    return {
      x: (cssX - this.boardOffX) / this.boardScale,
      y: (cssY - this.boardOffY) / this.boardScale,
    };
  }

  private inBoard(cssX: number, cssY: number, layout: Layout): boolean {
    const r = layout.boardRect;
    return cssX >= r.x && cssX <= r.x + r.w && cssY >= r.y && cssY <= r.y + r.h;
  }

  private drawHintInWorld(ctx: CanvasRenderingContext2D): void {
    if (!this.hintActive) return;
    if (this.hintAge > 3) {
      this.hintActive = null;
      return;
    }
    const pulse = 1 + 0.3 * Math.sin(this.hintAge * 8);
    const color = colorOf(this.hintActive.colorId);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3 / this.boardScale;
    ctx.globalAlpha = 0.6;
    for (const d of this.hintActive.dots) {
      ctx.beginPath();
      ctx.arc(d.center.x, d.center.y, d.radius * 1.6 * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  onDown(cssX: number, cssY: number): void {
    if (this.resetModal.visible) {
      this.resetModal.onDown(cssX, cssY);
      return;
    }
    // 툴바 hit-test
    if (this.btnBack.onDown(cssX, cssY)) return;
    if (this.btnHint.onDown(cssX, cssY)) return;
    if (this.btnPause.onDown(cssX, cssY)) return;
    if (this.btnMute.onDown(cssX, cssY)) return;
    if (this.btnReset.onDown(cssX, cssY)) return;

    if (this.cleared || this.paused) return;
    const layout = this.ctx.app.getLayout();
    if (!this.inBoard(cssX, cssY, layout)) return;

    this.ctx.sound.ensureCtx();
    const w = this.screenToBoard(cssX, cssY);
    const dot = this.board.findDotAt(w);
    if (dot) {
      this.board.startPath(dot.id);
      this.ctx.sound.playStart();
      this.hintActive = null;
      return;
    }
    // 완성된 path 위 롱프레스 → 해당 색 path 제거
    const tolerance = 12 / this.boardScale;
    const fp = this.board.findFinalizedPathAt(w, tolerance);
    if (fp) this.beginLongPress(cssX, cssY, fp.colorId);
  }

  onMove(cssX: number, cssY: number): void {
    this.btnBack.onMove(cssX, cssY);
    this.btnHint.onMove(cssX, cssY);
    this.btnPause.onMove(cssX, cssY);
    this.btnMute.onMove(cssX, cssY);
    this.btnReset.onMove(cssX, cssY);
    this.resetModal.onMove(cssX, cssY);

    if (this.cleared || this.paused) return;

    // 롱프레스 도중 일정 거리 이상 움직이면 취소
    if (this.longPressStart) {
      const dx = cssX - this.longPressStart.x;
      const dy = cssY - this.longPressStart.y;
      if (dx * dx + dy * dy > GameScene.LONG_PRESS_MOVE_TOLERANCE ** 2) {
        this.cancelLongPress();
      }
    }

    if (!this.board.getCurrentBuilder()) return;
    const w = this.screenToBoard(cssX, cssY);
    const r = this.board.updatePath(w);
    if (r.kind === "finalized") {
      this.ctx.sound.playFinalize();
      this.checkClear();
    } else if (r.kind === "rejected" && r.reason !== "min-step") {
      this.rejectCount++;
    }
  }

  onUp(cssX: number, cssY: number): void {
    if (this.resetModal.visible) {
      this.resetModal.onUp(cssX, cssY);
      return;
    }
    if (this.btnBack.onUp(cssX, cssY)) return;
    if (this.btnHint.onUp(cssX, cssY)) return;
    if (this.btnPause.onUp(cssX, cssY)) return;
    if (this.btnMute.onUp(cssX, cssY)) return;
    if (this.btnReset.onUp(cssX, cssY)) return;
    this.cancelLongPress();
    this.board.endPath();
  }

  private beginLongPress(cssX: number, cssY: number, colorId: number): void {
    this.cancelLongPress();
    this.longPressColorId = colorId;
    this.longPressStart = { x: cssX, y: cssY };
    this.longPressTimerId = setTimeout(() => {
      if (this.longPressColorId !== null) {
        this.board.removeFinalizedPath(this.longPressColorId);
        this.ctx.sound.playReject();
      }
      this.cancelLongPress();
    }, GameScene.LONG_PRESS_MS);
  }

  private cancelLongPress(): void {
    if (this.longPressTimerId !== null) clearTimeout(this.longPressTimerId);
    this.longPressTimerId = null;
    this.longPressColorId = null;
    this.longPressStart = null;
  }

  private gotoMenu(): void {
    this.ctx.app.setScene(sceneRegistry.menu(this.ctx));
  }

  private resetBoard(): void {
    this.board.reset();
    this.cleared = false;
    this.hintActive = null;
    this.elapsedSec = 0;
    this.rejectCount = 0;
    this.paused = false;
    this.btnPause.label = "⏸";
    this.btnPause.active = false;
  }

  private togglePause(): void {
    if (this.cleared) return;
    this.paused = !this.paused;
    this.btnPause.label = this.paused ? "▶" : "⏸";
    this.btnPause.active = this.paused;
  }

  private toggleMute(): void {
    this.ctx.sound.setMuted(!this.ctx.sound.isMuted());
    this.btnMute.active = this.ctx.sound.isMuted();
    this.btnMute.label = this.ctx.sound.isMuted() ? "🔇" : "🔊";
    void this.ctx.persistence.setMuted(this.ctx.sound.isMuted());
  }

  private showHint(): void {
    const h = nextHint(this.board);
    if (!h) return;
    this.hintActive = h;
    this.hintAge = 0;
  }

  private checkClear(): void {
    if (this.board.isCleared() && !this.cleared) {
      this.cleared = true;
      this.ctx.sound.playClear();
      this.fireClearEffect();
      const numColors = new Set(this.level.dots.map((d) => d.colorId)).size;
      const stars = computeStars(this.elapsedSec, this.rejectCount, numColors);
      void this.ctx.persistence.markCompleted(this.level.id);
      void this.ctx.persistence.recordStars(this.level.id, stars);
      const elapsed = this.elapsedSec;
      const tmpl = this.template;
      setTimeout(() => {
        this.ctx.app.setScene(
          sceneRegistry.result(this.ctx, {
            level: this.level,
            template: tmpl,
            stars,
            elapsedSec: elapsed,
          }),
        );
      }, 1200);
    }
  }

  private fireClearEffect(): void {
    const dots = this.board.getDots();
    const points = dots.map((d) => d.center);
    const colors = dots.map((d) => colorOf(d.colorId));
    this.effects.clearBurst(points, colors);
  }
}
