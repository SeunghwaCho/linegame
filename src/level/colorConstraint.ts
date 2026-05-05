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

/**
 * 적/녹 호환을 만족하는 numColors 크기의 팔레트 부분집합을 모두 enum.
 * 변형(variant)이 색을 새로 뽑을 때, 시드 기반으로 풀에서 결정적으로 선택하기 위함.
 *
 * 구현: 빨강 모드(GREEN_GROUP 제외) 가능 색들 + 초록 모드(RED_GROUP 제외) 가능 색들
 *      각각에서 nCk 조합을 생성. 두 모드의 교집합(둘 다 사용 안 함)은 한 번만 카운트.
 *
 * 결과는 정렬된 색 ID 배열의 정렬된 목록(결정적).
 */
export function enumerateCompatibleSets(
  numColors: number,
  totalPalette: number,
): number[][] {
  if (numColors <= 0) return [];
  if (numColors > maxCompatibleColors(totalPalette)) return [];

  const collect = (forbidden: ReadonlySet<number>): number[][] => {
    const allowed: number[] = [];
    for (let c = 0; c < totalPalette; c++) {
      if (!forbidden.has(c)) allowed.push(c);
    }
    if (numColors > allowed.length) return [];
    const out: number[][] = [];
    const cur: number[] = [];
    const rec = (start: number): void => {
      if (cur.length === numColors) {
        out.push(cur.slice());
        return;
      }
      const remaining = numColors - cur.length;
      for (let i = start; i <= allowed.length - remaining; i++) {
        cur.push(allowed[i]!);
        rec(i + 1);
        cur.pop();
      }
    };
    rec(0);
    return out;
  };

  const redMode = collect(GREEN_GROUP); // 빨강 그룹 사용 가능
  const greenMode = collect(RED_GROUP); // 녹색 그룹 사용 가능
  // 두 모드의 합집합 — 같은 부분집합(둘 다 RED·GREEN을 안 쓰는 것)은 중복 가능
  const seen = new Set<string>();
  const out: number[][] = [];
  for (const arr of [...redMode, ...greenMode]) {
    const key = arr.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(arr);
  }
  // 결정적 정렬 — lex
  out.sort((a, b) => {
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i]! - b[i]!;
    }
    return 0;
  });
  return out;
}
