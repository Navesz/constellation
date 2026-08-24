export type ComparisonFocusTarget = "result" | "error" | null;

export function comparisonFocusTarget({
  pendingLogin,
  comparisonLogin,
  loading,
  hasResult,
  hasError,
}: {
  pendingLogin: string | null;
  comparisonLogin: string | null;
  loading: boolean;
  hasResult: boolean;
  hasError: boolean;
}): ComparisonFocusTarget {
  if (
    loading
    || !pendingLogin
    || !comparisonLogin
    || pendingLogin.toLowerCase() !== comparisonLogin.toLowerCase()
  ) {
    return null;
  }

  if (hasError) return "error";
  if (hasResult) return "result";
  return null;
}
