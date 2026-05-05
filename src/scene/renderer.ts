import type { Board } from "../game/board.ts";
import { colorOf, colorOfWithAlpha } from "./colors.ts";

export interface RendererOptions {
  /** 보드 좌표계의 폭/높이 (level.width, level.height) */
  worldWidth: number;
  worldHeight: number;
  lineWidth?: number;
}

/**
 * Canvas에 보드 상태를 그린다.
 * - DPR 스케일링으로 폴더블 / 고해상도 화면에서도 선명.
 * - 보드 좌표계는 worldWidth × worldHeight 고정. CSS 픽셀과의 비율은 자동 계산.
 */
export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly worldWidth: number;
  private readonly worldHeight: number;
  private readonly lineWidth: number;
  private cssWidth = 0;
  private cssHeight = 0;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;

  constructor(canvas: HTMLCanvasElement, opts: RendererOptions) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
    this.worldWidth = opts.worldWidth;
    this.worldHeight = opts.worldHeight;
    this.lineWidth = opts.lineWidth ?? 8;
  }

  /** 캔버스 표시 크기를 컨테이너에 맞춰 갱신. resize 시 호출. */
  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;

    // 보드 좌표계가 정사각형이 아닐 수도 있고, 화면 비율도 다를 수 있다.
    // 보드를 contain (letterbox) 방식으로 맞춘다.
    const scaleX = cssWidth / this.worldWidth;
    const scaleY = cssHeight / this.worldHeight;
    this.scale = Math.min(scaleX, scaleY);
    this.offsetX = (cssWidth - this.worldWidth * this.scale) / 2;
    this.offsetY = (cssHeight - this.worldHeight * this.scale) / 2;

    // ctx 변환: dpr * scale + offset
    this.ctx.setTransform(
      dpr * this.scale,
      0,
      0,
      dpr * this.scale,
      dpr * this.offsetX,
      dpr * this.offsetY,
    );
  }

  /** CSS 좌표(이벤트 clientX-rect.left)를 보드 좌표계로 변환. */
  screenToWorld(cssX: number, cssY: number): { x: number; y: number } {
    return {
      x: (cssX - this.offsetX) / this.scale,
      y: (cssY - this.offsetY) / this.scale,
    };
  }

  draw(board: Board): void {
    const ctx = this.ctx;
    // 배경
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();

    // 보드 영역 표시 (살짝 다른 배경)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);

    // 보드 경계선
    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = 1 / this.scale;
    ctx.strokeRect(0, 0, this.worldWidth, this.worldHeight);

    // 완성된 path
    for (const fp of board.getFinalizedPaths().values()) {
      this.drawPolyline(
        fp.segments.map((s) => s.a).concat([fp.segments[fp.segments.length - 1]!.b]),
        colorOf(fp.colorId),
        this.lineWidth,
        1,
      );
    }

    // 진행 중 path
    const cur = board.getCurrentBuilder();
    if (cur) {
      const segs = cur.getSegments();
      if (segs.length > 0) {
        const pts = segs.map((s) => s.a).concat([segs[segs.length - 1]!.b]);
        this.drawPolyline(pts, colorOf(cur.getColorId()), this.lineWidth, 0.85);
      }
    }

    // dots
    for (const d of board.getDots()) {
      ctx.beginPath();
      ctx.arc(d.center.x, d.center.y, d.radius, 0, Math.PI * 2);
      ctx.fillStyle = colorOf(d.colorId);
      ctx.fill();
      ctx.lineWidth = 2 / this.scale;
      ctx.strokeStyle = colorOfWithAlpha(d.colorId, 0.4);
      ctx.stroke();
    }
  }

  private drawPolyline(
    points: ReadonlyArray<{ x: number; y: number }>,
    color: string,
    width: number,
    alpha: number,
  ): void {
    if (points.length < 2) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(points[0]!.x, points[0]!.y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i]!.x, points[i]!.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  getCssSize(): { width: number; height: number } {
    return { width: this.cssWidth, height: this.cssHeight };
  }

  /** 외부 모듈(이펙트 등)이 같은 변환 행렬로 그릴 수 있도록 컨텍스트 노출. */
  getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }
}
