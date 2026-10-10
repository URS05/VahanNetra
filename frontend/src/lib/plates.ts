import { CONFIG } from "../config";

export function normalizePlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function plateError(value: string): string | null {
  const plate = normalizePlate(value);
  if (!plate) return "Enter a plate.";
  if (!CONFIG.platePattern.test(plate)) {
    return "Use 5 to 12 letters or digits.";
  }
  return null;
}

export function editDistance(a: string, b: string): number {
  const left = normalizePlate(a);
  const right = normalizePlate(b);
  const rows = left.length + 1;
  const cols = right.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[left.length][right.length];
}
