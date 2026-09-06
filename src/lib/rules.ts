export function crewLimit(teamType: string, requested?: number) {
  if (teamType === "solo") return 1;
  if (teamType === "dual") return 2;
  return Math.max(3, Math.min(20, requested || 5));
}

export function shouldSuspend(dingCount: number) {
  return dingCount >= 3;
}

export function orderStatusAfterAbandon(workersLeft: number) {
  return workersLeft > 0 ? "claimed" : "available";
}

export function paymentSplitsAreValid(total: number, splits: number[]) {
  if (
    !Number.isFinite(total) ||
    total < 0 ||
    splits.some((split) => !Number.isFinite(split) || split < 0)
  )
    return false;
  return (
    Math.abs(splits.reduce((sum, split) => sum + split, 0) - total) <= 0.009
  );
}
