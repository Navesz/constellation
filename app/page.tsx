"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { AchievementProgress, AuditResponse } from "@/lib/achievements";

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

function compactNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact" }).format(value);
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
  return (
    <article className={`achievement ${achievement.unlocked ? "is-unlocked" : ""}`}>
      <div className="achievement-topline">
        <span className="achievement-glyph" aria-hidden="true">
          {achievementGlyphs[achievement.slug] ?? "·"}
        </span>
        <span className="eyebrow">
          {achievement.unlocked ? `Desbloqueada · nível ${achievement.tier}` : "Em rota"}
        </span>
      </div>
      <h3>{achievement.name}</h3>
      <p>{achievement.description}</p>
      <ProgressBar achievement={achievement} />
      <div className="achievement-footer">
        <span>{achievement.progressLabel}</span>
        <span>{achievement.nextThreshold ? `Próximo: ${achievement.nextThreshold}` : "Concluída"}</span>
      </div>
    </article>
  );
}

export default function Home() {
  const [login, setLogin] = useState(DEFAULT_LOGIN);
  const [activeLogin, setActiveLogin] = useState(DEFAULT_LOGIN);
  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAudit() {
      try {
        const response = await fetch(`/api/audit?login=${encodeURIComponent(activeLogin)}`, {
          signal: controller.signal,
        });
        const payload = (await response.json()) as AuditResponse & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error || "Não foi possível analisar esse perfil.");
        }

        setAudit(payload);
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
  }, [activeLogin, refreshKey]);

  const nextMission = useMemo(() => {
    if (!audit) return null;
    return [...audit.achievements]
      .filter((achievement) => achievement.nextThreshold)
      .sort((a, b) => {
        const aRemaining = (a.nextThreshold ?? a.current) - a.current;
        const bRemaining = (b.nextThreshold ?? b.current) - b.current;
        return aRemaining - bRemaining;
      })[0];
  }, [audit]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = login.trim().replace(/^@/, "");
    if (normalized) {
      setLoading(true);
      setError("");
      setActiveLogin(normalized);
      setRefreshKey((current) => current + 1);
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
              id="github-login"
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              placeholder="octocat"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" disabled={loading}>
              {loading ? "Mapeando…" : "Mapear perfil"}
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

      {loading && !audit ? (
        <section className="loading-grid" aria-label="Carregando auditoria" aria-live="polite">
          <div /><div /><div /><div />
        </section>
      ) : null}

      {audit ? (
        <div className="dashboard">
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
            <div className="profile-meta">
              <span><strong>{compactNumber(audit.profile.followers)}</strong> seguidores</span>
              <span><strong>{compactNumber(audit.profile.publicRepos)}</strong> repositórios</span>
            </div>
          </section>

          <section className="metric-grid" aria-label="Métricas principais">
            <article>
              <span className="metric-index">01</span>
              <strong>{audit.visibleAchievementCount}</strong>
              <p>conquistas visíveis</p>
            </article>
            <article>
              <span className="metric-index">02</span>
              <strong>{audit.metrics.mergedPullRequests}</strong>
              <p>pull requests públicos mesclados</p>
            </article>
            <article>
              <span className="metric-index">03</span>
              <strong>{audit.metrics.topRepository?.stars ?? 0}</strong>
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
              </div>
              <div className="mission-number" aria-label={nextMission.progressLabel}>
                <strong>{nextMission.current}</strong>
                <span>/ {nextMission.nextThreshold}</span>
              </div>
            </section>
          ) : null}

          <section className="section-heading">
            <div>
              <p className="eyebrow">mapa de conquistas</p>
              <h2>Progresso, não teatro.</h2>
            </div>
            <p>Os níveis sem contador público usam o menor valor confirmado pelo selo atual.</p>
          </section>

          <section className="achievement-grid">
            {audit.achievements.map((achievement) => (
              <AchievementCard key={achievement.slug} achievement={achievement} />
            ))}
          </section>

          <section className="repo-signal">
            <div>
              <p className="eyebrow">sinal mais forte</p>
              <h2>{audit.metrics.topRepository?.name ?? "Nenhum repositório encontrado"}</h2>
              <p>{audit.metrics.topRepository?.description || "O projeto público com maior alcance do perfil."}</p>
            </div>
            {audit.metrics.topRepository ? (
              <a href={audit.metrics.topRepository.url} target="_blank" rel="noreferrer">
                {audit.metrics.topRepository.stars} ★ · abrir repositório <span aria-hidden="true">↗</span>
              </a>
            ) : null}
          </section>
        </div>
      ) : null}

      <footer>
        <span>Constellation · projeto independente</span>
        <span>Dados podem levar alguns minutos para refletir mudanças no GitHub.</span>
      </footer>
    </main>
  );
}
