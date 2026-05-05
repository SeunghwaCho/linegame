export interface PointerEvents {
  onDown: (cssX: number, cssY: number) => void;
  onMove: (cssX: number, cssY: number) => void;
  onUp: () => void;
}

/**
 * 마우스/터치 통합 입력. 단일 포인터(드래그)만 지원.
 * pointer events API 사용 (modern browsers).
 */
export class InputHandler {
  private readonly canvas: HTMLCanvasElement;
  private readonly handlers: PointerEvents;
  private activePointerId: number | null = null;

  constructor(canvas: HTMLCanvasElement, handlers: PointerEvents) {
    this.canvas = canvas;
    this.handlers = handlers;
    this.attach();
  }

  private attach(): void {
    const c = this.canvas;
    // touch-action은 CSS로도 설정하지만 안전하게 한 번 더.
    c.style.touchAction = "none";
    c.addEventListener("pointerdown", this.onDown);
    c.addEventListener("pointermove", this.onMove);
    c.addEventListener("pointerup", this.onUp);
    c.addEventListener("pointercancel", this.onUp);
    c.addEventListener("pointerleave", this.onUp);
  }

  detach(): void {
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onUp);
    c.removeEventListener("pointerleave", this.onUp);
  }

  private toCss(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onDown = (e: PointerEvent): void => {
    if (this.activePointerId !== null) return;
    this.activePointerId = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);
    const { x, y } = this.toCss(e);
    this.handlers.onDown(x, y);
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointerId) return;
    const { x, y } = this.toCss(e);
    this.handlers.onMove(x, y);
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointerId) return;
    this.activePointerId = null;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      // capture 해제 실패는 무시 (이미 해제됨)
    }
    this.handlers.onUp();
  };
}
