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

  constructor(reason: GitHubFailureReason, status: number | null = null, options?: ErrorOptions) {
    super(`GITHUB_${reason.toUpperCase().replace("-", "_")}`, options);
    this.name = "GitHubRequestError";
    this.reason = reason;
    this.status = status;
  }
}

export function githubFailureFromStatus(status: number) {
  if (status === 404) return new GitHubRequestError("not-found", status);
  if (status === 403 || status === 429) return new GitHubRequestError("rate-limit", status);
  return new GitHubRequestError("upstream-error", status);
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

  return { reason, message: messages[reason] };
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
