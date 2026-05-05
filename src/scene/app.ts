import type { Scene } from "./scene.ts";
import type { Layout, Rect } from "../ui/types.ts";

const TOOLBAR_H = 56;
const PADDING = 12;

/**
 * 단일 Canvas + RAF 루프 + Scene 관리.
 * - 매 프레임 fitLayout()로 캔버스 dpr 백버퍼 / layout 계산 (폴더 전환에 견고).
 * - PointerEvent 통합 입력 → 현재 Scene으로 디스패치.
 * - ctx 변환은 항상 dpr-only(CSS pixel) 로 시작 — 각 scene은 필요시 저장/추가 변환 후 복원.
 */
export class App {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private currentScene: Scene | null = null;
  private rafId: number | null = null;
  private lastFrameMs = 0;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private layout: Layout = {
    width: 0,
    height: 0,
    toolbarH: TOOLBAR_H,
    boardRect: { x: 0, y: 0, w: 0, h: 0 },
  };
  private activePointerId: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const c = canvas.getContext("2d");
    if (!c) throw new Error("2d context unavailable");
    this.ctx = c;
    this.attachInput();
    this.attachResize();
  }

  setScene(s: Scene): void {
    this.currentScene?.leave?.();
    this.currentScene = s;
    s.enter?.();
  }

  start(): void {
    this.fitLayout();
    this.lastFrameMs = performance.now();
    const loop = (now: number): void => {
      const dt = Math.min(0.05, (now - this.lastFrameMs) / 1000);
      this.lastFrameMs = now;
      this.fitLayout();
      const layout = this.layout;
      this.currentScene?.update?.(dt, layout);
      this.drawFrame(layout);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private drawFrame(layout: Layout): void {
    const ctx = this.ctx;
    // 화면 전체 클리어 — DPR 적용된 백버퍼 픽셀 기준
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // dpr-only 변환: 이후 모든 좌표는 CSS pixel
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.currentScene?.draw(ctx, layout);
  }

  private fitLayout(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const newDpr = window.devicePixelRatio || 1;
    if (
      rect.width === this.cssW &&
      rect.height === this.cssH &&
      newDpr === this.dpr
    ) {
      return;
    }
    this.cssW = rect.width;
    this.cssH = rect.height;
    this.dpr = newDpr;
    this.canvas.width = Math.round(rect.width * newDpr);
    this.canvas.height = Math.round(rect.height * newDpr);
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.computeLayout();
  }

  private computeLayout(): void {
    const w = this.cssW;
    const h = this.cssH;
    const toolbarH = TOOLBAR_H;
    const boardRect: Rect = {
      x: PADDING,
      y: toolbarH + PADDING,
      w: w - PADDING * 2,
      h: h - toolbarH - PADDING * 2,
    };
    this.layout = { width: w, height: h, toolbarH, boardRect };
  }

  getLayout(): Layout {
    return this.layout;
  }

  private toCss(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private attachInput(): void {
    const c = this.canvas;
    c.style.touchAction = "none";
    c.addEventListener("pointerdown", (e) => {
      if (this.activePointerId !== null) return;
      this.activePointerId = e.pointerId;
      try {
        c.setPointerCapture(e.pointerId);
      } catch { /* ignore */ }
      const { x, y } = this.toCss(e);
      this.currentScene?.onDown(x, y);
    });
    c.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.activePointerId) {
        // 캡처 중이 아니어도 hover 효과 등은 갱신
        const { x, y } = this.toCss(e);
        this.currentScene?.onMove(x, y);
        return;
      }
      const { x, y } = this.toCss(e);
      this.currentScene?.onMove(x, y);
    });
    const upHandler = (e: PointerEvent): void => {
      if (e.pointerId !== this.activePointerId) return;
      this.activePointerId = null;
      try {
        c.releasePointerCapture(e.pointerId);
      } catch { /* ignore */ }
      const { x, y } = this.toCss(e);
      this.currentScene?.onUp(x, y);
    };
    c.addEventListener("pointerup", upHandler);
    c.addEventListener("pointercancel", upHandler);
    c.addEventListener("pointerleave", (e) => {
      if (e.pointerId === this.activePointerId) upHandler(e);
    });
  }

  private attachResize(): void {
    const trigger = (): void => this.fitLayout();
    window.addEventListener("resize", trigger);
    window.addEventListener("orientationchange", () => setTimeout(trigger, 100));
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", trigger);
    }
  }
}
