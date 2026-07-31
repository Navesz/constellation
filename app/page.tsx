"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import {
  AUDIT_HISTORY_STORAGE_KEY,
  MAX_SNAPSHOTS_PER_PROFILE,
  MAX_TRACKED_PROFILES,
  appendAuditSnapshot,
  compareAuditSnapshots,
  createAuditSnapshot,
  findComparisonSnapshot,
  parseAuditHistory,
  removeProfileHistory,
  serializeAuditHistory,
  type AuditChanges,
  type AuditSnapshot,
} from "@/lib/audit-history";
import type { AchievementProgress, AuditResponse } from "@/lib/achievements";
import { normalizeGitHubLogin } from "@/lib/github-profile";
import { compareProfiles, type ComparisonAchievementState } from "@/lib/profile-comparison";

const DEFAULT_LOGIN = "Navesz";

const achievementGlyphs: Record<string, string> = {
  "pair-extraordinaire": "◇",
  "pull-shark": "≈",
  quickdraw: "↗",
  yolo: "↑",
  "galaxy-brain": "✳",
  starstruck: "★",
  "public-sponsor": "♥",
};

type LocalProgressMemory = {
  current: AuditSnapshot;
  previous: AuditSnapshot | null;
  changes: AuditChanges | null;
  recorded: boolean;
  storageAvailable: boolean;
  cleared: boolean;
};

type ComparisonRequestState = {
  login: string;
  audit: AuditResponse | null;
  error: string;
};

function compactNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact" }).format(value);
}

function signedNumber(value: number) {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}

function comparisonAchievementLabel(state: ComparisonAchievementState) {
  if (state.badgeStatus === "unavailable") return "Fonte indisponível";
  if (state.unlocked) return `Nível ${state.tier}`;
  if (state.nextThreshold) return `${state.current} de ${state.nextThreshold}`;
  return "Não visível";
}

function ProgressBar({ achievement }: { achievement: AchievementProgress }) {
  const percent = achievement.nextThreshold
    ? Math.min(100, Math.round((achievement.current / achievement.nextThreshold) * 100))
    : achievement.unlocked
      ? 100
      : 0;

  return (
    <div className="progress" aria-label={`${percent}% do próximo marco`}>
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

function AchievementCard({ achievement }: { achievement: AchievementProgress }) {
  const statusLabel =
    achievement.badgeStatus === "unavailable"
      ? "Selo indisponível"
      : achievement.unlocked
        ? `Desbloqueada · nível ${achievement.tier}`
        : "Em rota";
  const milestoneLabel = achievement.nextThreshold
    ? `Próximo: ${achievement.nextThreshold}`
    : achievement.badgeStatus === "unavailable"
      ? "Aguardando fonte"
      : achievement.unlocked
        ? "Concluída"
        : "Sem marco";

  return (
    <article
      className={`achievement ${achievement.unlocked ? "is-unlocked" : ""} ${achievement.badgeStatus === "unavailable" ? "is-unknown" : ""}`}
    >
      <div className="achievement-topline">
        <span className="achievement-glyph" aria-hidden="true">
          {achievementGlyphs[achievement.slug] ?? "·"}
        </span>
        <span className="eyebrow">{statusLabel}</span>
      </div>
      <h3>{achievement.name}</h3>
      <p>{achievement.description}</p>
      <span className={`confidence confidence-${achievement.measurementKind}`}>
        {achievement.confidenceLabel}
      </span>
      <ProgressBar achievement={achievement} />
      <div className="achievement-footer">
        <span>{achievement.progressLabel}</span>
        <span>{milestoneLabel}</span>
      </div>
    </article>
  );
}

function ProgressHistory({
  audit,
  memory,
  onClear,
}: {
  audit: AuditResponse;
  memory: LocalProgressMemory;
  onClear: () => void;
}) {
  const changedSignals = memory.changes
    ? [
        { value: memory.changes.visibleAchievements, label: "conquistas visíveis" },
        { value: memory.changes.mergedPullRequests, label: "PRs mesclados" },
        { value: memory.changes.topRepositoryStars, label: "estrelas no melhor projeto" },
        { value: memory.changes.publicRepositories, label: "repositórios públicos" },
      ].filter((signal): signal is { value: number; label: string } => signal.value !== null && signal.value !== 0)
    : [];
  const unlockedNames = (memory.changes?.newlyUnlockedSlugs ?? []).map(
    (slug) => audit.achievements.find((achievement) => achievement.slug === slug)?.name ?? slug,
  );
  const hasChanges = changedSignals.length > 0 || unlockedNames.length > 0;
  const previousDate = memory.previous
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
        new Date(memory.previous.capturedAt),
      )
    : null;

  return (
    <section className="history-panel" aria-labelledby="history-title" aria-live="polite">
      <div className="history-heading">
        <div>
          <p className="kicker"><span /> memória local</p>
          <h2 id="history-title">O pulso entre duas leituras.</h2>
        </div>
        <p>
          O histórico fica somente neste navegador, guarda até {MAX_SNAPSHOTS_PER_PROFILE} estados completos por perfil em {MAX_TRACKED_PROFILES} perfis recentes e nunca entra no link compartilhado.
        </p>
      </div>

      {!memory.storageAvailable ? (
        <p className="history-empty">Este navegador não permitiu salvar o histórico. A auditoria atual continua funcionando normalmente.</p>
      ) : memory.cleared ? (
        <p className="history-empty">Histórico deste perfil apagado. Uma nova leitura criará outra linha de base.</p>
      ) : !memory.previous ? (
        <p className="history-empty">
          {memory.recorded
            ? "Linha de base salva. Volte ou remapeie o perfil depois para enxergar o que mudou."
            : "Esta leitura está parcial e não substituiu sua última linha de base."}
        </p>
      ) : hasChanges ? (
        <>
          <p className="history-since">Mudanças desde o último estado diferente, observado em {previousDate}.</p>
          <div className="history-signal-grid">
            {changedSignals.map((signal) => (
              <article className={signal.value < 0 ? "is-negative" : ""} key={signal.label}>
                <strong>{signedNumber(signal.value)}</strong>
                <span>{signal.label}</span>
              </article>
            ))}
            {unlockedNames.length ? (
              <article className="history-unlocked">
                <strong>✦</strong>
                <span>Novo selo: {unlockedNames.join(", ")}</span>
              </article>
            ) : null}
          </div>
        </>
      ) : (
        <p className="history-empty">Nenhuma mudança nos sinais comparáveis desde {previousDate}.</p>
      )}

      {memory.storageAvailable && !memory.cleared && (memory.recorded || memory.previous) ? (
        <button className="history-clear" type="button" onClick={onClear}>Apagar histórico deste perfil</button>
      ) : null}
      {!memory.recorded && memory.previous && !memory.cleared ? (
        <p className="history-note">Leitura parcial: a linha de base anterior foi preservada.</p>
      ) : null}
    </section>
  );
}

function ProfileComparisonPanel({
  primary,
  secondary,
  onRemove,
}: {
  primary: AuditResponse;
  secondary: AuditResponse;
  onRemove: () => void;
}) {
  const comparison = compareProfiles(primary, secondary);

  return (
    <section className="comparison-panel" aria-labelledby="comparison-title">
      <div className="comparison-heading">
        <div>
          <p className="kicker"><span /> órbita comparativa</p>
          <h2 id="comparison-title">{primary.profile.login} × {secondary.profile.login}</h2>
          <p>Diferenças públicas lado a lado, sem ranking composto ou nota inventada.</p>
        </div>
        <button type="button" onClick={onRemove}>Encerrar comparação</button>
      </div>

      <div className="comparison-identities" aria-label="Perfis comparados">
        {[primary, secondary].map((item, index) => (
          <div className="comparison-identity" key={item.profile.login}>
            <Image src={item.profile.avatarUrl} alt="" width={52} height={52} unoptimized />
            <div>
              <span className="eyebrow">{index === 0 ? "perfil principal" : "segundo perfil"}</span>
              <strong>{item.profile.name || item.profile.login}</strong>
              <a href={item.profile.htmlUrl} target="_blank" rel="noreferrer">@{item.profile.login} ↗</a>
            </div>
          </div>
        ))}
      </div>

      {secondary.warnings.length ? (
        <p className="comparison-warning" role="status">
          A segunda auditoria está parcial; sinais indisponíveis aparecem como travessão e não entram no delta.
        </p>
      ) : null}

      <div className="comparison-table-wrap">
        <table className="comparison-table">
          <caption>O delta representa o segundo perfil menos o perfil principal.</caption>
          <thead>
            <tr>
              <th scope="col">Sinal público</th>
              <th scope="col">@{primary.profile.login}</th>
              <th scope="col">@{secondary.profile.login}</th>
              <th scope="col">Δ segundo − principal</th>
            </tr>
          </thead>
          <tbody>
            {comparison.metrics.map((metric) => (
              <tr key={metric.id}>
                <th scope="row">{metric.label}</th>
                <td>{metric.primary ?? "—"}</td>
                <td>{metric.secondary ?? "—"}</td>
                <td className={metric.difference !== null && metric.difference < 0 ? "is-negative" : ""}>
                  {metric.difference === null ? "—" : signedNumber(metric.difference)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="comparison-summary" aria-label="Resumo das conquistas">
        <span><strong>{comparison.sharedUnlocked}</strong> visíveis em comum</span>
        <span><strong>{comparison.primaryOnlyUnlocked.length}</strong> apenas no principal</span>
        <span><strong>{comparison.secondaryOnlyUnlocked.length}</strong> apenas no segundo</span>
      </div>

      <div className="comparison-achievements" aria-label="Conquistas comparadas">
        {comparison.achievements.map((achievement) => (
          <article key={achievement.slug}>
            <h3>{achievement.name}</h3>
            <div>
              <span className={achievement.primary.unlocked ? "is-visible" : ""}>
                <small>@{primary.profile.login}</small>
                {comparisonAchievementLabel(achievement.primary)}
              </span>
              <span className={achievement.secondary.unlocked ? "is-visible" : ""}>
                <small>@{secondary.profile.login}</small>
                {comparisonAchievementLabel(achievement.secondary)}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Observatory() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeLogin = normalizeGitHubLogin(searchParams.get("login")) ?? DEFAULT_LOGIN;
  const requestedComparisonLogin = normalizeGitHubLogin(searchParams.get("compare"));
  const comparisonLogin =
    requestedComparisonLogin?.toLowerCase() === routeLogin.toLowerCase()
      ? null
      : requestedComparisonLogin;
  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [error, setError] = useState("");
  const [errorLogin, setErrorLogin] = useState("");
  const [searchError, setSearchError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [localProgress, setLocalProgress] = useState<LocalProgressMemory | null>(null);
  const [comparisonState, setComparisonState] = useState<ComparisonRequestState | null>(null);
  const [comparisonFormError, setComparisonFormError] = useState("");
  const [comparisonRefreshKey, setComparisonRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAudit() {
      try {
        const response = await fetch(`/api/audit?login=${encodeURIComponent(routeLogin)}`, {
          signal: controller.signal,
        });
        const payload = (await response.json()) as AuditResponse & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error || "Não foi possível analisar esse perfil.");
        }
        if (controller.signal.aborted) return;

        const currentSnapshot = createAuditSnapshot(payload);
        try {
          const history = parseAuditHistory(window.localStorage.getItem(AUDIT_HISTORY_STORAGE_KEY));
          const previous = findComparisonSnapshot(history, currentSnapshot);
          const changes = previous ? compareAuditSnapshots(currentSnapshot, previous) : null;

          if (currentSnapshot.complete) {
            const nextHistory = appendAuditSnapshot(history, currentSnapshot);
            window.localStorage.setItem(AUDIT_HISTORY_STORAGE_KEY, serializeAuditHistory(nextHistory));
          }

          setLocalProgress({
            current: currentSnapshot,
            previous,
            changes,
            recorded: currentSnapshot.complete,
            storageAvailable: true,
            cleared: false,
          });
        } catch {
          setLocalProgress({
            current: currentSnapshot,
            previous: null,
            changes: null,
            recorded: false,
            storageAvailable: false,
            cleared: false,
          });
        }

        setAudit(payload);
        setError("");
        setErrorLogin("");
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setAudit(null);
        setLocalProgress(null);
        setError(caught instanceof Error ? caught.message : "Falha inesperada na auditoria.");
        setErrorLogin(routeLogin);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadAudit();
    return () => controller.abort();
  }, [routeLogin, refreshKey]);

  useEffect(() => {
    if (!comparisonLogin) return;
    const activeComparisonLogin: string = comparisonLogin;
    const controller = new AbortController();

    async function loadComparison() {
      try {
        const response = await fetch(`/api/audit?login=${encodeURIComponent(activeComparisonLogin)}`, {
          signal: controller.signal,
        });
        const payload = (await response.json()) as AuditResponse & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error || "Não foi possível analisar o segundo perfil.");
        }
        if (controller.signal.aborted) return;

        setComparisonState({ login: activeComparisonLogin, audit: payload, error: "" });
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setComparisonState({
          login: activeComparisonLogin,
          audit: null,
          error: caught instanceof Error ? caught.message : "Falha inesperada na comparação.",
        });
      }
    }

    void loadComparison();
    return () => controller.abort();
  }, [comparisonLogin, comparisonRefreshKey]);

  const nextMission = useMemo(() => {
    if (!audit) return null;
    return [...audit.achievements]
      .filter((achievement) => achievement.nextThreshold && achievement.measurementKind !== "unavailable")
      .sort((a, b) => {
        const aRemaining = Math.max(0, (a.nextThreshold ?? a.current) - a.current);
        const bRemaining = Math.max(0, (b.nextThreshold ?? b.current) - b.current);
        return aRemaining - bRemaining;
      })[0];
  }, [audit]);

  const auditIsCurrent = Boolean(
    audit && audit.profile.login.toLowerCase() === routeLogin.toLowerCase(),
  );
  const routeIsPending = Boolean(audit && !auditIsCurrent);
  const errorIsCurrent = Boolean(error && errorLogin.toLowerCase() === routeLogin.toLowerCase());
  const showLoading = loading || (!auditIsCurrent && !errorIsCurrent);
  const comparisonIsCurrent = Boolean(
    comparisonLogin && comparisonState?.login.toLowerCase() === comparisonLogin.toLowerCase(),
  );
  const comparisonAudit = comparisonIsCurrent ? comparisonState?.audit ?? null : null;
  const comparisonError = comparisonIsCurrent ? comparisonState?.error ?? "" : "";
  const comparisonLoading = Boolean(comparisonLogin && !comparisonIsCurrent);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const requestedLogin = normalizeGitHubLogin(String(formData.get("login") ?? ""));

    if (!requestedLogin) {
      setSearchError("Use um login válido do GitHub, com até 39 caracteres.");
      return;
    }

    setSearchError("");
    setLoading(true);
    setAudit(null);
    setLocalProgress(null);
    setError("");
    setErrorLogin("");
    setCopied(false);

    if (requestedLogin === routeLogin) {
      setRefreshKey((current) => current + 1);
      return;
    }

    router.push(`/?login=${encodeURIComponent(requestedLogin)}`, { scroll: false });
  }

  function submitComparison(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const requestedLogin = normalizeGitHubLogin(String(formData.get("compare") ?? ""));

    if (!requestedLogin) {
      setComparisonFormError("Informe um segundo login válido do GitHub.");
      return;
    }
    if (requestedLogin.toLowerCase() === routeLogin.toLowerCase()) {
      setComparisonFormError("Escolha um perfil diferente do principal.");
      return;
    }

    setComparisonFormError("");
    if (comparisonLogin?.toLowerCase() === requestedLogin.toLowerCase()) {
      setComparisonState(null);
      setComparisonRefreshKey((current) => current + 1);
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set("login", audit?.profile.login ?? routeLogin);
    params.set("compare", requestedLogin);
    router.push(`/?${params.toString()}`, { scroll: false });
  }

  function removeComparison() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("login", audit?.profile.login ?? routeLogin);
    params.delete("compare");
    setComparisonFormError("");
    router.push(`/?${params.toString()}`, { scroll: false });
  }

  async function copyShareLink() {
    const shareUrl = new URL(window.location.href);
    shareUrl.searchParams.set("login", audit?.profile.login ?? routeLogin);
    if (comparisonLogin) {
      shareUrl.searchParams.set("compare", comparisonLogin);
    } else {
      shareUrl.searchParams.delete("compare");
    }

    try {
      await navigator.clipboard.writeText(shareUrl.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      setCopied(false);
    }
  }

  function clearLocalProgress() {
    if (!audit || !localProgress) return;

    try {
      const history = parseAuditHistory(window.localStorage.getItem(AUDIT_HISTORY_STORAGE_KEY));
      const nextHistory = removeProfileHistory(history, audit.profile.login);

      if (Object.keys(nextHistory).length) {
        window.localStorage.setItem(AUDIT_HISTORY_STORAGE_KEY, serializeAuditHistory(nextHistory));
      } else {
        window.localStorage.removeItem(AUDIT_HISTORY_STORAGE_KEY);
      }

      setLocalProgress({
        ...localProgress,
        previous: null,
        changes: null,
        recorded: false,
        cleared: true,
      });
    } catch {
      setLocalProgress({
        ...localProgress,
        storageAvailable: false,
      });
    }
  }

  return (
    <main>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <nav className="site-nav" aria-label="Navegação principal">
        <a className="brand" href="#top" aria-label="Constellation, início">
          <span className="brand-mark" aria-hidden="true">✦</span>
          <span>Constellation</span>
        </a>
        <a
          className="nav-link"
          href="https://github.com/Navesz/github-achievements-lab"
          target="_blank"
          rel="noreferrer"
        >
          Projeto aberto <span aria-hidden="true">↗</span>
        </a>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="kicker"><span /> observatório de perfil</p>
          <h1>Transforme sinais do GitHub em uma rota clara.</h1>
          <p className="hero-lede">
            Uma leitura honesta das suas conquistas, marcos e repositórios — sem contas falsas,
            estrelas combinadas ou atividade vazia.
          </p>
        </div>

        <form className="search" onSubmit={submit}>
          <label htmlFor="github-login">Usuário do GitHub</label>
          <div className="search-row">
            <span aria-hidden="true">@</span>
            <input
              key={routeLogin}
              id="github-login"
              name="login"
              defaultValue={routeLogin}
              placeholder="octocat"
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(searchError)}
              aria-describedby={searchError ? "github-login-note github-login-error" : "github-login-note"}
            />
            <button type="submit" disabled={showLoading}>
              {showLoading ? "Mapeando…" : "Mapear perfil"}
            </button>
          </div>
          <p id="github-login-note">Somente dados públicos. Nenhum token é enviado pelo navegador.</p>
          {searchError ? <p className="search-error" id="github-login-error" role="alert">{searchError}</p> : null}
        </form>
      </section>

      {errorIsCurrent ? (
        <section className="error-panel" role="alert">
          <span aria-hidden="true">!</span>
          <div>
            <strong>Rota interrompida</strong>
            <p>{error}</p>
          </div>
        </section>
      ) : null}

      {showLoading && (!audit || routeIsPending) ? (
        <section className="loading-grid" aria-label="Carregando auditoria" aria-live="polite">
          <div /><div /><div /><div />
        </section>
      ) : null}

      {audit && auditIsCurrent ? (
        <div className="dashboard">
          {audit.warnings.length ? (
            <section className="data-warning" role="status" aria-label="Auditoria com dados parciais">
              <div>
                <span className="eyebrow">leitura resiliente</span>
                <strong>O perfil continua disponível, mas algumas fontes não responderam.</strong>
              </div>
              <ul>
                {audit.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </section>
          ) : null}

          <section className="profile-strip" aria-label="Resumo do perfil">
            <div className="identity">
              <Image src={audit.profile.avatarUrl} alt="" width={72} height={72} unoptimized />
              <div>
                <span className="eyebrow">perfil observado</span>
                <h2>{audit.profile.name || audit.profile.login}</h2>
                <a href={audit.profile.htmlUrl} target="_blank" rel="noreferrer">
                  @{audit.profile.login} <span aria-hidden="true">↗</span>
                </a>
              </div>
            </div>
            <p className="profile-bio">{audit.profile.bio || "Perfil sem bio pública."}</p>
            <div className="profile-side">
              <div className="profile-meta">
                <span><strong>{compactNumber(audit.profile.followers)}</strong> seguidores</span>
                <span><strong>{compactNumber(audit.profile.publicRepos)}</strong> repositórios</span>
              </div>
              <button className="share-button" type="button" onClick={copyShareLink}>
                {copied ? "Link copiado" : "Copiar auditoria"}
              </button>
            </div>
          </section>

          <section className="comparison-control" aria-labelledby="comparison-control-title">
            <div>
              <p className="eyebrow">segunda constelação</p>
              <h2 id="comparison-control-title">Coloque outro perfil na mesma órbita.</h2>
              <p>A comparação entra na URL e usa somente sinais públicos equivalentes.</p>
            </div>
            <form onSubmit={submitComparison}>
              <label htmlFor="comparison-login">Perfil para comparar</label>
              <div>
                <span aria-hidden="true">@</span>
                <input
                  key={comparisonLogin ?? "empty-comparison"}
                  id="comparison-login"
                  name="compare"
                  defaultValue={comparisonLogin ?? ""}
                  placeholder="monalisa"
                  maxLength={40}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={Boolean(comparisonFormError)}
                  aria-describedby={comparisonFormError ? "comparison-form-error" : undefined}
                />
                <button type="submit" disabled={comparisonLoading}>
                  {comparisonLoading ? "Consultando…" : comparisonLogin ? "Atualizar comparação" : "Comparar perfis"}
                </button>
              </div>
              {comparisonFormError ? (
                <p id="comparison-form-error" role="alert">{comparisonFormError}</p>
              ) : null}
            </form>
          </section>

          <section className="metric-grid" aria-label="Métricas principais">
            <article>
              <span className="metric-index">01</span>
              <strong className={audit.visibleAchievementCount === null ? "metric-unavailable" : undefined}>
                {audit.visibleAchievementCount ?? "—"}
              </strong>
              <p>conquistas visíveis</p>
            </article>
            <article>
              <span className="metric-index">02</span>
              <strong className={audit.metrics.mergedPullRequests === null ? "metric-unavailable" : undefined}>
                {audit.metrics.mergedPullRequests ?? "—"}
              </strong>
              <p>pull requests públicos mesclados</p>
            </article>
            <article>
              <span className="metric-index">03</span>
              <strong className={audit.sources.repositories === "unavailable" ? "metric-unavailable" : undefined}>
                {audit.sources.repositories === "unavailable" ? "—" : audit.metrics.topRepository?.stars ?? 0}
              </strong>
              <p>estrelas no melhor projeto</p>
            </article>
            <article>
              <span className="metric-index">04</span>
              <strong>{audit.profile.publicRepos}</strong>
              <p>projetos públicos</p>
            </article>
          </section>

          {comparisonLoading ? (
            <section className="comparison-loading" aria-live="polite" aria-label="Carregando segundo perfil">
              <span />
              <p>Mapeando a segunda constelação…</p>
            </section>
          ) : null}

          {comparisonError ? (
            <section className="comparison-error" role="alert">
              <strong>Não foi possível comparar agora.</strong>
              <p>{comparisonError}</p>
              <button type="button" onClick={removeComparison}>Remover segundo perfil</button>
            </section>
          ) : null}

          {comparisonAudit ? (
            <ProfileComparisonPanel primary={audit} secondary={comparisonAudit} onRemove={removeComparison} />
          ) : null}

          {localProgress ? (
            <ProgressHistory audit={audit} memory={localProgress} onClear={clearLocalProgress} />
          ) : null}

          {nextMission ? (
            <section className="mission">
              <div>
                <p className="kicker"><span /> próxima missão</p>
                <h2>{nextMission.name}</h2>
                <p>{nextMission.nextAction}</p>
                <span className="mission-confidence">{nextMission.confidenceLabel}</span>
              </div>
              <div className="mission-number" aria-label={nextMission.progressLabel}>
                <strong>
                  {nextMission.current}
                  {nextMission.currentIsMinimum ? <small>+</small> : null}
                </strong>
                <span>/ {nextMission.nextThreshold}</span>
              </div>
            </section>
          ) : null}

          <section className="section-heading">
            <div>
              <p className="eyebrow">mapa de conquistas</p>
              <h2>Progresso, não teatro.</h2>
            </div>
            <p>Agora cada número declara se foi medido ou apenas confirmado como valor mínimo pelo selo.</p>
          </section>

          <aside className="trust-legend" aria-label="Legenda de confiabilidade dos dados">
            <span><i className="legend-measured" /> medido com dados públicos</span>
            <span><i className="legend-minimum" /> mínimo confirmado pelo selo</span>
            <span><i className="legend-private" /> contador não é público</span>
            <span><i className="legend-unavailable" /> fonte temporariamente indisponível</span>
          </aside>

          <section className="achievement-grid">
            {audit.achievements.map((achievement) => (
              <AchievementCard key={achievement.slug} achievement={achievement} />
            ))}
          </section>

          <section className="repo-signal">
            <div>
              <p className="eyebrow">sinal mais forte</p>
              <h2>
                {audit.sources.repositories === "unavailable"
                  ? "Projetos temporariamente indisponíveis"
                  : audit.metrics.topRepository?.name ?? "Nenhum repositório autoral encontrado"}
              </h2>
              <p>
                {audit.sources.repositories === "unavailable"
                  ? "A auditoria preservou o restante do perfil e tentará essa fonte numa próxima leitura."
                  : audit.metrics.topRepository?.description || "O projeto público com maior alcance do perfil."}
              </p>
            </div>
            {audit.metrics.topRepository ? (
              <a href={audit.metrics.topRepository.url} target="_blank" rel="noreferrer">
                {audit.metrics.topRepository.stars} ★ · abrir repositório <span aria-hidden="true">↗</span>
              </a>
            ) : null}
          </section>

          <p className="freshness">
            Auditoria gerada em <time dateTime={audit.generatedAt}>
              {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
                new Date(audit.generatedAt),
              )}
            </time>.
            {audit.warnings.length ? <span> · auditoria parcial</span> : null}
          </p>
        </div>
      ) : null}

      <footer>
        <span>Constellation · projeto independente</span>
        <span>Dados podem levar alguns minutos para refletir mudanças no GitHub.</span>
      </footer>
    </main>
  );
}

function PageFallback() {
  return (
    <main>
      <nav className="site-nav">
        <span className="brand"><span className="brand-mark">✦</span> Constellation</span>
      </nav>
      <section className="loading-grid page-fallback" aria-label="Preparando observatório" aria-live="polite">
        <div /><div /><div /><div />
      </section>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Observatory />
    </Suspense>
  );
}
