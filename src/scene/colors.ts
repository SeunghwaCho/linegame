/** colorId → CSS color. 색맹 친화 팔레트 (Okabe-Ito 변형). */
const PALETTE: ReadonlyArray<string> = [
  "#e63946", // 0 red       — RED_GROUP
  "#1d3557", // 1 navy
  "#2a9d8f", // 2 teal      — GREEN_GROUP
  "#f4a261", // 3 orange
  "#9b5de5", // 4 purple
  "#06d6a0", // 5 mint      — GREEN_GROUP
  "#ffd166", // 6 yellow
  "#118ab2", // 7 blue
  "#ec407a", // 8 pink
  "#6d4c41", // 9 brown
  "#00bcd4", // 10 cyan
];

export function colorOf(colorId: number): string {
  return PALETTE[colorId % PALETTE.length]!;
}

export function colorOfWithAlpha(colorId: number, alpha: number): string {
  const hex = colorOf(colorId);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
