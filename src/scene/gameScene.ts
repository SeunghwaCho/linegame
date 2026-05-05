import type { Scene } from "./scene.ts";
import type { Layout } from "../ui/types.ts";
import type { SceneContext } from "./context.ts";
import type { Level, LevelTemplate } from "../level/types.ts";
import { Board } from "../game/board.ts";
import { toGameDots } from "../level/loader.ts";
import { Renderer } from "./renderer.ts";
import { Effects } from "./effects.ts";
import { Button, roundRect } from "../ui/button.ts";
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

// 색당 20초의 제한시간, 최소 60초.
function computeTimeLimit(numColors: number): number {
  return Math.max(60, numColors * 20);
}

const RAINBOW_STOPS = [
  "#ff3b30",
  "#ff9500",
  "#ffcc00",
  "#34c759",
  "#00c7be",
  "#007aff",
  "#af52de",
];

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
  private readonly timeOutModal: Modal;

  private cleared = false;
  private paused = false;
  private gameOver = false;
  private elapsedSec = 0;
  private readonly timeLimitSec: number;
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
    this.timeOutModal = new Modal(
      "⏰ 시간 초과",
      "제한 시간 안에 풀지 못했습니다.",
      [
        { label: "메뉴", onSelect: () => this.gotoMenu() },
        { label: "다시 시작", onSelect: () => this.resetBoard(), primary: true },
      ],
    );
    this.btnMute.active = c.sound.isMuted();
    this.btnMute.label = c.sound.isMuted() ? "🔇" : "🔊";
    const numColors = new Set(level.dots.map((d) => d.colorId)).size;
    this.timeLimitSec = computeTimeLimit(numColors);
  }

  enter(): void {
    void this.ctx.persistence.setLastLevelId(this.level.id);
  }

  update(dt: number, layout: Layout): void {
    this.layoutToolbar(layout);
    this.resetModal.setLayout(layout.width, layout.height);
    this.timeOutModal.setLayout(layout.width, layout.height);
    this.effects.update(dt);
    this.hintAge += dt;
    if (!this.paused && !this.cleared && !this.gameOver) {
      this.elapsedSec += dt;
      if (this.elapsedSec >= this.timeLimitSec) {
        this.elapsedSec = this.timeLimitSec;
        this.triggerGameOver();
      }
    }
  }

  private triggerGameOver(): void {
    if (this.gameOver) return;
    this.gameOver = true;
    this.board.endPath();
    this.cancelLongPress();
    this.ctx.sound.playReject();
    this.timeOutModal.show();
  }

  // 툴바 위젯 배치 상수 (drawTimerBar / layoutToolbar 공용)
  private static readonly TB_BTN_W = 44;
  private static readonly TB_GAP = 4;
  private static readonly TB_EDGE = 8;
  private static readonly TB_PAD = 8; // 버튼과 타이머바 사이 여백

  private layoutToolbar(layout: Layout): void {
    const h = layout.toolbarH - 12;
    const y = 6;
    const btnW = GameScene.TB_BTN_W;
    const gap = GameScene.TB_GAP;
    const edge = GameScene.TB_EDGE;
    // 좌측: ◀, 우측: 💡 ⏸ 🔊 ↺
    this.btnBack.setBounds({ x: edge, y, w: btnW, h });
    this.btnReset.setBounds({ x: layout.width - edge - btnW, y, w: btnW, h });
    this.btnMute.setBounds({
      x: layout.width - edge - btnW * 2 - gap,
      y,
      w: btnW,
      h,
    });
    this.btnPause.setBounds({
      x: layout.width - edge - btnW * 3 - gap * 2,
      y,
      w: btnW,
      h,
    });
    this.btnHint.setBounds({
      x: layout.width - edge - btnW * 4 - gap * 3,
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

    // 레벨 이름 (가운데, 적당한 폭에 맞춤) + 무지개 시간바
    ctx.fillStyle = "#222";
    ctx.font = "600 15px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const title = this.cleared
      ? `🎉 ${this.level.name}`
      : `${this.level.name}`;
    // 좌/우 버튼 사이 가용 영역의 중심에 정렬 (우측 버튼이 4개라 비대칭).
    ctx.fillText(title, this.toolbarMidX(layout), layout.toolbarH / 2 - 14);
    ctx.restore();

    this.drawTimerBar(ctx, layout);

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
    this.timeOutModal.draw(ctx, layout.width, layout.height);
  }

  /** 좌/우 버튼 사이 가용 영역의 중심 X. */
  private toolbarMidX(layout: Layout): number {
    const { TB_BTN_W: btnW, TB_GAP: gap, TB_EDGE: edge, TB_PAD: pad } = GameScene;
    const leftEdge = edge + btnW + pad;
    const rightEdge = layout.width - edge - btnW * 4 - gap * 3 - pad;
    return (leftEdge + rightEdge) / 2;
  }

  private drawTimerBar(ctx: CanvasRenderingContext2D, layout: Layout): void {
    const remaining = Math.max(0, this.timeLimitSec - this.elapsedSec);
    const frac = Math.max(0, Math.min(1, remaining / this.timeLimitSec));
    // 좌/우 버튼 영역을 침범하지 않도록 가용 폭으로 제한.
    const { TB_BTN_W: btnW, TB_GAP: gap, TB_EDGE: edge, TB_PAD: pad } = GameScene;
    const leftEdge = edge + btnW + pad;
    const rightEdge = layout.width - edge - btnW * 4 - gap * 3 - pad;
    const available = Math.max(40, rightEdge - leftEdge);
    const barW = Math.min(560, available);
    const barH = 15;
    const center = (leftEdge + rightEdge) / 2;
    const bx = center - barW / 2;
    const by = layout.toolbarH / 2 - 2;

    ctx.save();
    // 배경(트랙)
    ctx.fillStyle = "#eeeeee";
    ctx.strokeStyle = "#cfcfcf";
    ctx.lineWidth = 1;
    roundRect(ctx, bx + 0.5, by + 0.5, barW - 1, barH - 1, barH / 2);
    ctx.fill();
    ctx.stroke();

    // 무지개 채움(remaining)
    const fillW = (barW - 2) * frac;
    if (fillW > 0.5) {
      const grad = ctx.createLinearGradient(bx, 0, bx + barW - 2, 0);
      for (let i = 0; i < RAINBOW_STOPS.length; i++) {
        grad.addColorStop(i / (RAINBOW_STOPS.length - 1), RAINBOW_STOPS[i]!);
      }
      ctx.save();
      roundRect(ctx, bx + 1, by + 1, barW - 2, barH - 2, (barH - 2) / 2);
      ctx.clip();
      ctx.fillStyle = grad;
      ctx.fillRect(bx + 1, by + 1, fillW, barH - 2);
      ctx.restore();
    }

    // 잔여 시간 < 10초 또는 10% 미만이면 점멸 강조
    const lowTime = remaining <= 10 || frac < 0.1;
    if (lowTime && !this.cleared && !this.gameOver) {
      const pulse = 0.5 + 0.5 * Math.sin(this.elapsedSec * 8);
      ctx.globalAlpha = 0.3 + 0.5 * pulse;
      ctx.strokeStyle = "#ff3b30";
      ctx.lineWidth = 2;
      roundRect(ctx, bx, by, barW, barH, barH / 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 잔여 시간 텍스트(작게, 바 우측)
    ctx.fillStyle = this.paused ? "#999" : "#666";
    ctx.font = "11px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(
      this.paused ? "일시정지" : formatTime(remaining),
      bx + barW,
      by + barH + 2,
    );
    ctx.restore();
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
    if (this.timeOutModal.visible) {
      this.timeOutModal.onDown(cssX, cssY);
      return;
    }
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

    if (this.cleared || this.paused || this.gameOver) return;
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
    this.timeOutModal.onMove(cssX, cssY);

    if (this.cleared || this.paused || this.gameOver) return;

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
    if (this.timeOutModal.visible) {
      this.timeOutModal.onUp(cssX, cssY);
      return;
    }
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
    this.gameOver = false;
    this.timeOutModal.hide();
    this.hintActive = null;
    this.elapsedSec = 0;
    this.rejectCount = 0;
    this.paused = false;
    this.btnPause.label = "⏸";
    this.btnPause.active = false;
  }

  private togglePause(): void {
    if (this.cleared || this.gameOver) return;
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
