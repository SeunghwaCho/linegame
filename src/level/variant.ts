/**
 * 런타임 변형(variant) 적용 및 파라미터 결정.
 *
 * 한 LevelTemplate은 2~3개의 base variant를 가진다. 한 판 시작 시:
 *   1) variantIdx 선택 (template.variants 중 하나)
 *   2) rotationDeg 선택 (disk 중심 또는 보드 중심 기준)
 *   3) 색 매핑 선택 (호환 색 세트 풀에서)
 * 위 3개를 합쳐 Level로 resolve. 동일 파라미터 → 동일 Level (결정적).
 *
 * 회전 안전성: disk 변형은 회전 불변. 사각판 변형은 generate-levels에서
 * 모든 dot이 보드 내접 disk 안에 위치하도록 강제하여 회전 후에도 보드 안.
 *
 * boundary dot float 정확성: 회전 후 disk 경계 dot은 각도로부터
 * (cx + r·cosθ, cy + r·sinθ) 로 재구성하여 누적 오차 0.
 */
import type { Level, LevelTemplate, Variant, LevelDot } from "./types.ts";
import { enumerateCompatibleSets } from "./colorConstraint.ts";

const PALETTE_SIZE = 8;
const CIRCLE_BOUNDARY_TOL = 0.5; // loader.ts와 동일 — 검증 실패 회피

export interface VariantParams {
  variantIdx: number;
  rotationDeg: number;
  /** srcColorId → dstColorId. JSON-직렬화 가능한 [src, dst] 쌍 배열. */
  colorMap: Array<[number, number]>;
}

/** Mulberry32 결정적 PRNG */
export function makeRng(seed: number): () => number {
  let s = (seed | 0) >>> 0;
  return (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DOT_RADIUS_SAFE = 20; // dot 반경 + 회전 시 떨림 마진

/**
 * 회전 후 모든 dot이 보드 안에 있는가?
 * - disk variant: 항상 안전 (disk 자체가 회전 불변)
 * - 사각판: dot 중심이 보드의 inscribed disk(반경 = min(w,h)/2 - DOT_RADIUS_SAFE) 안에 있어야 함
 */
function isRotationSafe(template: LevelTemplate, variant: Variant): boolean {
  if (variant.circle) return true;
  const cx = template.width / 2;
  const cy = template.height / 2;
  const r = Math.min(template.width, template.height) / 2 - DOT_RADIUS_SAFE;
  for (const d of variant.dots) {
    if (Math.hypot(d.x - cx, d.y - cy) > r) return false;
  }
  return true;
}

/**
 * 템플릿에서 새 변형 파라미터를 무작위로 뽑는다.
 * - variantIdx: variants.length 중 하나
 * - rotationDeg: ±[30, 150] (회전 안전한 경우만, 아니면 0)
 * - colorMap: variant의 색 수에 맞는 호환 세트를 enum 풀에서 균등 선택 후 매핑
 */
export function pickVariantParams(
  template: LevelTemplate,
  rng: () => number,
): VariantParams {
  const variantIdx = Math.floor(rng() * template.variants.length);
  const variant = template.variants[variantIdx]!;

  // 회전: 안전한 경우 부호 + [30,150], 아니면 0 (수동 디자인된 SAMPLES 일부 보호)
  const sign = rng() < 0.5 ? -1 : 1;
  const safe = isRotationSafe(template, variant);
  const rotationDeg = safe ? sign * (30 + rng() * 120) : 0;

  // 현재 variant의 색 수
  const srcColors = uniqueSortedColors(variant.dots);
  const numColors = srcColors.length;

  // 호환 가능한 dst 색 세트 풀 — 결정적 enum
  const pool = enumerateCompatibleSets(numColors, PALETTE_SIZE);
  if (pool.length === 0) {
    throw new Error(
      `no compatible color set of size ${numColors} for palette ${PALETTE_SIZE}`,
    );
  }
  const dstSet = pool[Math.floor(rng() * pool.length)]!.slice();

  // src를 무작위 순서로 dst에 매핑 (dst 내부도 셔플)
  shuffle(dstSet, rng);
  const colorMap: Array<[number, number]> = [];
  for (let i = 0; i < srcColors.length; i++) {
    colorMap.push([srcColors[i]!, dstSet[i]!]);
  }
  return { variantIdx, rotationDeg, colorMap };
}

/**
 * 변형 파라미터를 적용해 LevelTemplate을 Level로 resolve.
 */
export function resolveLevel(
  template: LevelTemplate,
  params: VariantParams,
): Level {
  const variant = template.variants[params.variantIdx];
  if (!variant)
    throw new Error(
      `variantIdx ${params.variantIdx} out of range (max ${template.variants.length - 1})`,
    );

  // 회전 중심: disk가 있으면 disk 중심, 없으면 보드 중심
  const cx = variant.circle ? variant.circle.cx : template.width / 2;
  const cy = variant.circle ? variant.circle.cy : template.height / 2;

  const colorRemap = new Map<number, number>(params.colorMap);
  const transformed = applyVariant(variant, {
    rotationDeg: params.rotationDeg,
    rotationCenter: { x: cx, y: cy },
    colorRemap,
  });

  return {
    id: template.id,
    name: template.name,
    width: template.width,
    height: template.height,
    dots: transformed.dots,
    circle: transformed.circle,
  };
}

interface ApplyOptions {
  rotationDeg: number;
  rotationCenter: { x: number; y: number };
  /** srcColorId → dstColorId. 누락된 colorId는 그대로 둔다. */
  colorRemap: Map<number, number>;
}

/**
 * Variant를 회전+색매핑하여 새 Variant로 반환.
 * disk 경계 dot은 각도로부터 재구성하여 부동소수 오차를 0으로 둔다.
 */
export function applyVariant(v: Variant, opts: ApplyOptions): Variant {
  const theta = (opts.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const cx = opts.rotationCenter.x;
  const cy = opts.rotationCenter.y;

  const rotate = (x: number, y: number): { x: number; y: number } => {
    const dx = x - cx;
    const dy = y - cy;
    return {
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos,
    };
  };

  const dots: LevelDot[] = v.dots.map((d) => {
    const newColor = opts.colorRemap.get(d.colorId) ?? d.colorId;
    // disk 경계 dot은 각도 재구성으로 보정
    if (v.circle) {
      const dist = Math.hypot(d.x - v.circle.cx, d.y - v.circle.cy);
      if (Math.abs(dist - v.circle.r) <= CIRCLE_BOUNDARY_TOL) {
        // 원래 각도 + 회전각으로 boundary 위 점을 정확히 구성
        const ang0 = Math.atan2(d.y - v.circle.cy, d.x - v.circle.cx);
        const ang1 = ang0 + theta;
        return {
          id: d.id,
          colorId: newColor,
          x: v.circle.cx + v.circle.r * Math.cos(ang1),
          y: v.circle.cy + v.circle.r * Math.sin(ang1),
          radius: d.radius,
        };
      }
    }
    const p = rotate(d.x, d.y);
    return {
      id: d.id,
      colorId: newColor,
      x: p.x,
      y: p.y,
      radius: d.radius,
    };
  });

  // disk는 회전 불변 (자기 중심 회전이면 원 자체는 동일)
  return { dots, circle: v.circle };
}

function uniqueSortedColors(dots: ReadonlyArray<LevelDot>): number[] {
  const s = new Set<number>();
  for (const d of dots) s.add(d.colorId);
  return [...s].sort((a, b) => a - b);
}

function shuffle<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}
