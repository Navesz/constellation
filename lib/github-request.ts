export const GITHUB_REQUEST_TIMEOUT_MS = 8_000;

export type GitHubFailureReason =
  | "timeout"
  | "rate-limit"
  | "not-found"
  | "upstream-error"
  | "invalid-response"
  | "network";

export class GitHubRequestError extends Error {
  reason: GitHubFailureReason;
  status: number | null;
  retryAt: string | null;

  constructor(
    reason: GitHubFailureReason,
    status: number | null = null,
    options?: ErrorOptions & { retryAt?: string | null },
  ) {
    super(`GITHUB_${reason.toUpperCase().replace("-", "_")}`, options);
    this.name = "GitHubRequestError";
    this.reason = reason;
    this.status = status;
    this.retryAt = options?.retryAt ?? null;
  }
}

export function githubFailureFromStatus(status: number) {
  if (status === 404) return new GitHubRequestError("not-found", status);
  if (status === 403 || status === 429) return new GitHubRequestError("rate-limit", status);
  return new GitHubRequestError("upstream-error", status);
}

function validIsoTimestamp(timestampMs: number) {
  const date = new Date(timestampMs);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function githubRateLimitRetryAt(headers: Pick<Headers, "get">, nowMs = Date.now()) {
  const retryAfter = headers.get("retry-after")?.trim();
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      const retryTimestamp = validIsoTimestamp(nowMs + seconds * 1_000);
      if (retryTimestamp) return retryTimestamp;
    }

    const retryDate = Date.parse(retryAfter);
    if (!Number.isNaN(retryDate)) {
      const retryTimestamp = validIsoTimestamp(retryDate);
      if (retryTimestamp) return retryTimestamp;
    }
  }

  const resetSeconds = Number(headers.get("x-ratelimit-reset"));
  if (Number.isFinite(resetSeconds) && resetSeconds > 0) {
    return validIsoTimestamp(resetSeconds * 1_000);
  }

  return null;
}

export function githubFailureFromResponse(
  response: Pick<Response, "status" | "headers">,
  nowMs = Date.now(),
) {
  const failure = githubFailureFromStatus(response.status);
  if (failure.reason !== "rate-limit") return failure;

  return new GitHubRequestError(failure.reason, failure.status, {
    retryAt: githubRateLimitRetryAt(response.headers, nowMs),
  });
}

export function formatGitHubRetryAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

export function githubFailureDiagnostic(error: unknown) {
  const reason = error instanceof GitHubRequestError ? error.reason : "network";
  const messages: Record<GitHubFailureReason, string> = {
    timeout: `tempo limite de ${GITHUB_REQUEST_TIMEOUT_MS / 1_000} segundos excedido`,
    "rate-limit": "limite temporário de consultas do GitHub",
    "not-found": "fonte pública não encontrada",
    "upstream-error": "GitHub respondeu com erro",
    "invalid-response": "GitHub retornou uma resposta inválida",
    network: "falha de rede ao consultar o GitHub",
  };

  const diagnostic = { reason, message: messages[reason] };
  return error instanceof GitHubRequestError && error.retryAt
    ? { ...diagnostic, retryAt: error.retryAt }
    : diagnostic;
}

export async function fetchGitHubWithTimeout(
  input: Parameters<typeof fetch>[0],
  init: RequestInit = {},
  timeoutMs = GITHUB_REQUEST_TIMEOUT_MS,
  fetcher: typeof fetch = fetch,
) {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof GitHubRequestError) throw error;
    throw new GitHubRequestError(timedOut ? "timeout" : "network", null, { cause: error });
  } finally {
    clearTimeout(timeoutId);
  }
}
