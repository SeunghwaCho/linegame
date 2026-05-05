/** colorId → CSS color. 색맹 친화 팔레트 (Okabe-Ito 변형). */
const PALETTE: ReadonlyArray<string> = [
  "#e63946", // red
  "#1d3557", // navy
  "#2a9d8f", // teal
  "#f4a261", // orange
  "#9b5de5", // purple
  "#06d6a0", // mint
  "#ffd166", // yellow
  "#118ab2", // blue
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
