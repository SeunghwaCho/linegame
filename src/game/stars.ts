/**
 * 별 평점 계산.
 * 입력:
 *   - elapsedSec: 클리어까지 경과 시간(초)
 *   - rejectCount: 드래그 중 거부(min-step 제외) 횟수 = 자기교차/타교차/터널링 발생 수
 *   - numColors: 레벨의 색 수 (난이도 보정)
 * 출력: 1~3 별. 클리어 시 최소 1 보장.
 *
 * 휴리스틱:
 *   - 빠르고 깨끗하게(거부 적게) 풀수록 별 ↑
 *   - 색 수에 비례해 시간/거부 임계값 늘어남
 */
export function computeStars(
  elapsedSec: number,
  rejectCount: number,
  numColors: number,
): 1 | 2 | 3 {
  const fastThresh = numColors * 6; // 색당 6초 이내 → fast
  const okThresh = numColors * 14; // 색당 14초 이내 → ok
  const cleanRejects = numColors; // 색당 1회 정도 실수면 깨끗
  const okRejects = numColors * 4;

  if (elapsedSec <= fastThresh && rejectCount <= cleanRejects) return 3;
  if (elapsedSec <= okThresh && rejectCount <= okRejects) return 2;
  return 1;
}
