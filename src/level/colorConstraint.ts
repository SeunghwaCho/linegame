/**
 * 적녹색약(red-green color blindness) 배려: 적색과 녹색 계열은 같은 레벨에 동시 등장 금지.
 * 팔레트(`src/scene/colors.ts`)와 동기화 유지 필수.
 */
export const RED_GROUP: ReadonlySet<number> = new Set<number>([0]); // red
export const GREEN_GROUP: ReadonlySet<number> = new Set<number>([2, 5]); // teal, mint

/** 색 집합이 적/녹 동시 사용을 피하는지 확인. */
export function isCompatibleColorSet(colorIds: Iterable<number>): boolean {
  let hasRed = false;
  let hasGreen = false;
  for (const c of colorIds) {
    if (RED_GROUP.has(c)) hasRed = true;
    if (GREEN_GROUP.has(c)) hasGreen = true;
    if (hasRed && hasGreen) return false;
  }
  return true;
}

/** 적/녹 제약 하에서 팔레트가 제공할 수 있는 최대 색 수. */
export function maxCompatibleColors(totalPalette: number): number {
  // 적색 그룹을 제외한 크기 vs 녹색 그룹을 제외한 크기 중 큰 쪽
  return Math.max(totalPalette - RED_GROUP.size, totalPalette - GREEN_GROUP.size);
}

/**
 * 적/녹 동시 사용을 피하면서 numColors 개를 골라 반환.
 * 모드 선택은 capacity를 고려: 요청 수가 한쪽 모드의 최대를 넘으면 다른 모드로 강제.
 */
export function pickCompatibleColors(
  numColors: number,
  totalPalette: number,
  rng: () => number,
): number[] {
  if (numColors > totalPalette) throw new Error("numColors exceeds palette size");
  if (numColors > maxCompatibleColors(totalPalette)) {
    throw new Error(
      `numColors=${numColors} exceeds compatible max ${maxCompatibleColors(totalPalette)}`,
    );
  }
  // useRed=true 면 GREEN_GROUP을 제외 → 사용 가능 색 수 = total - GREEN.size
  const useRedCapacity = totalPalette - GREEN_GROUP.size;
  const useGreenCapacity = totalPalette - RED_GROUP.size;

  // 모드 결정: 양쪽 다 가능하면 무작위, 한쪽만 가능하면 그쪽
  let useRed: boolean;
  if (numColors > useRedCapacity) useRed = false; // 빨강 모드로는 못 맞춤
  else if (numColors > useGreenCapacity) useRed = true; // 초록 모드로는 못 맞춤
  else useRed = rng() < 0.5;

  const forbidden = useRed ? GREEN_GROUP : RED_GROUP;
  const allowed: number[] = [];
  for (let c = 0; c < totalPalette; c++) {
    if (!forbidden.has(c)) allowed.push(c);
  }
  // 셔플 후 앞에서 numColors 개 채택
  for (let i = allowed.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [allowed[i], allowed[j]] = [allowed[j]!, allowed[i]!];
  }
  return allowed.slice(0, numColors).sort((a, b) => a - b);
}
