import { Board } from "../game/board.ts";
import type { Level } from "../level/types.ts";
import { toGameDots } from "../level/loader.ts";
import { Renderer } from "./renderer.ts";
import { InputHandler } from "./input.ts";
import { Sound } from "../audio/sound.ts";
import { Effects } from "./effects.ts";
import { nextHint, type HintResult } from "../game/hint.ts";
import { colorOf } from "./colors.ts";

/**
 * 한 레벨 게임 인스턴스. Board + Renderer + InputHandler + Sound + Effects.
 */
export class GameScene {
  private readonly canvas: HTMLCanvasElement;
  private readonly board: Board;
  private readonly renderer: Renderer;
  private readonly input: InputHandler;
  private readonly sound: Sound;
  private readonly effects: Effects;

  private rafId: number | null = null;
  private cleared = false;
  private onClear: (() => void) | null = null;
  private lastFrameMs = 0;

  // 힌트 펄스 상태
  private hintActive: HintResult | null = null;
  private hintAge = 0;

  constructor(canvas: HTMLCanvasElement, level: Level, sound: Sound) {
    this.canvas = canvas;
    const dots = toGameDots(level);
    this.board = new Board(dots, { cellSize: 60, lineHalfWidth: 4 });
    this.renderer = new Renderer(canvas, {
      worldWidth: level.width,
      worldHeight: level.height,
      lineWidth: 8,
    });
    this.sound = sound;
    this.effects = new Effects();
    this.input = new InputHandler(canvas, {
      onDown: (x, y) => this.handleDown(x, y),
      onMove: (x, y) => this.handleMove(x, y),
      onUp: () => this.handleUp(),
    });
  }

  setOnClear(cb: () => void): void {
    this.onClear = cb;
  }

  start(): void {
    this.fitToContainer();
    this.lastFrameMs = performance.now();
    const loop = (now: number): void => {
      const dt = Math.min(0.05, (now - this.lastFrameMs) / 1000);
      this.lastFrameMs = now;
      this.effects.update(dt);
      this.hintAge += dt;
      this.draw();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.input.detach();
  }

  reset(): void {
    this.board.reset();
    this.cleared = false;
    this.hintActive = null;
  }

  fitToContainer(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.renderer.resize(rect.width, rect.height, dpr);
  }

  /** 외부에서 힌트 버튼 클릭 시 호출. */
  showHint(): void {
    const h = nextHint(this.board);
    if (!h) return;
    this.hintActive = h;
    this.hintAge = 0;
  }

  getBoard(): Board {
    return this.board;
  }

  private draw(): void {
    this.renderer.draw(this.board);
    if (this.hintActive) this.drawHint();
    const ctx = this.renderer.getContext();
    if (ctx) this.effects.draw(ctx);
  }

  private drawHint(): void {
    if (!this.hintActive) return;
    // 3초간만 펄스 후 제거
    if (this.hintAge > 3) {
      this.hintActive = null;
      return;
    }
    const ctx = this.renderer.getContext();
    if (!ctx) return;
    const pulse = 1 + 0.3 * Math.sin(this.hintAge * 8);
    const color = colorOf(this.hintActive.colorId);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.6;
    for (const d of this.hintActive.dots) {
      ctx.beginPath();
      ctx.arc(d.center.x, d.center.y, d.radius * 1.6 * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private handleDown(cssX: number, cssY: number): void {
    this.sound.ensureCtx();
    if (this.cleared) return;
    const w = this.renderer.screenToWorld(cssX, cssY);
    const dot = this.board.findDotAt(w);
    if (!dot) return;
    this.board.startPath(dot.id);
    this.sound.playStart();
    this.hintActive = null;
  }

  private handleMove(cssX: number, cssY: number): void {
    if (this.cleared) return;
    if (!this.board.getCurrentBuilder()) return;
    const w = this.renderer.screenToWorld(cssX, cssY);
    const r = this.board.updatePath(w);
    if (r.kind === "finalized") {
      this.sound.playFinalize();
      this.checkClear();
    } else if (r.kind === "rejected" && r.reason !== "min-step") {
      // 너무 자주 울리면 거슬리니 reason 별로 분기 가능
    }
  }

  private handleUp(): void {
    this.board.endPath();
  }

  private checkClear(): void {
    if (this.board.isCleared() && !this.cleared) {
      this.cleared = true;
      this.sound.playClear();
      this.fireClearEffect();
      this.onClear?.();
    }
  }

  private fireClearEffect(): void {
    const dots = this.board.getDots();
    const points = dots.map((d) => d.center);
    const colors = dots.map((d) => colorOf(d.colorId));
    this.effects.clearBurst(points, colors);
  }
}
