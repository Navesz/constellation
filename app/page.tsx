"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import type { AchievementProgress, AuditResponse } from "@/lib/achievements";

const DEFAULT_LOGIN = "Navesz";
const LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

const achievementGlyphs: Record<string, string> = {
  "pair-extraordinaire": "◇",
  "pull-shark": "≈",
  quickdraw: "↗",
  yolo: "↑",
  "galaxy-brain": "✳",
  starstruck: "★",
  "public-sponsor": "♥",
};

function compactNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact" }).format(value);
}

function normalizedLogin(value: string | null) {
  const normalized = value?.trim().replace(/^@/, "") ?? "";
  return LOGIN_PATTERN.test(normalized) ? normalized : DEFAULT_LOGIN;
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

function Observatory() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeLogin = normalizedLogin(searchParams.get("login"));
  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [copied, setCopied] = useState(false);

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

        setAudit(payload);
        setError("");
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setAudit(null);
        setError(caught instanceof Error ? caught.message : "Falha inesperada na auditoria.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadAudit();
    return () => controller.abort();
  }, [routeLogin, refreshKey]);

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

  const routeIsPending = Boolean(
    audit && audit.profile.login.toLowerCase() !== routeLogin.toLowerCase(),
  );
  const showLoading = loading || routeIsPending;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const requestedLogin = normalizedLogin(String(formData.get("login") ?? ""));

    setLoading(true);
    setAudit(null);
    setError("");
    setCopied(false);

    if (requestedLogin === routeLogin) {
      setRefreshKey((current) => current + 1);
      return;
    }

    router.push(`/?login=${encodeURIComponent(requestedLogin)}`, { scroll: false });
  }

  async function copyShareLink() {
    const shareUrl = new URL(window.location.href);
    shareUrl.searchParams.set("login", audit?.profile.login ?? routeLogin);

    try {
      await navigator.clipboard.writeText(shareUrl.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      setCopied(false);
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
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" disabled={showLoading}>
              {showLoading ? "Mapeando…" : "Mapear perfil"}
            </button>
          </div>
          <p>Somente dados públicos. Nenhum token é enviado pelo navegador.</p>
        </form>
      </section>

      {error ? (
        <section className="error-panel" role="alert">
          <span aria-hidden="true">!</span>
          <div>
            <strong>Rota interrompida</strong>
            <p>{error}</p>
          </div>
        </section>
      ) : null}

      {showLoading && !audit ? (
        <section className="loading-grid" aria-label="Carregando auditoria" aria-live="polite">
          <div /><div /><div /><div />
        </section>
      ) : null}

      {audit ? (
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
