"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { ChangeEvent, FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import {
  AUDIT_HISTORY_STORAGE_KEY,
  MAX_SNAPSHOTS_PER_PROFILE,
  MAX_TRACKED_PROFILES,
  appendAuditSnapshot,
  auditHistoryBackupFilename,
  buildAuditTimeline,
  compareAuditSnapshots,
  countAuditHistorySnapshots,
  createAuditSnapshot,
  findComparisonSnapshot,
  listRecentAuditProfiles,
  mergeAuditHistories,
  parseAuditHistory,
  parseAuditHistoryBackup,
  removeProfileHistory,
  serializeAuditHistory,
  serializeAuditHistoryBackup,
  type AuditChanges,
  type AuditSnapshot,
  type AuditTimelineEntry,
  type RecentAuditProfile,
} from "@/lib/audit-history";
import { selectNextMission, type AchievementProgress, type AuditResponse } from "@/lib/achievements";
import {
  ACHIEVEMENT_FILTER_OPTIONS,
  countAchievementFilters,
  filterAchievements,
  type AchievementFilter,
} from "@/lib/achievement-filters";
import { auditDataFilename, serializeAuditDataExport } from "@/lib/audit-export";
import { auditReportFilename, buildAuditMarkdown } from "@/lib/audit-report";
import { buildAuditEvidenceSources } from "@/lib/audit-sources";
import { normalizeGitHubLogin } from "@/lib/github-profile";
import { compareProfiles, comparisonAchievementLabel } from "@/lib/profile-comparison";

const DEFAULT_LOGIN = "Navesz";
const MAX_HISTORY_BACKUP_BYTES = 512 * 1024;

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
  timeline: AuditTimelineEntry[];
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

function timelineMetric(value: number | null) {
  return value === null ? "—" : value.toLocaleString("pt-BR");
}

function timelineChangeSummary(changes: AuditChanges | null) {
  if (!changes) return "linha de base";

  const signals = [
    { value: changes.visibleAchievements, label: "selos" },
    { value: changes.mergedPullRequests, label: "PRs" },
    { value: changes.topRepositoryStars, label: "estrelas" },
    { value: changes.publicRepositories, label: "repositórios" },
  ]
    .filter((signal): signal is { value: number; label: string } => signal.value !== null && signal.value !== 0)
    .map((signal) => `${signedNumber(signal.value)} ${signal.label}`);

  if (changes.newlyUnlockedSlugs.length) {
    const count = changes.newlyUnlockedSlugs.length;
    signals.push(`+${count} ${count === 1 ? "novo selo" : "novos selos"}`);
  }

  return signals.length ? signals.join(" · ") : "sem mudança numérica";
}

function downloadTextFile(contents: string, mimeType: string, filename: string) {
  const blobUrl = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
}

function RecentOrbits({
  profiles,
  currentLogin,
}: {
  profiles: RecentAuditProfile[];
  currentLogin: string;
}) {
  if (profiles.length < 2) return null;

  const observedDate = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <section className="recent-orbits" aria-labelledby="recent-orbits-title">
      <div className="recent-orbits-heading">
        <div>
          <p className="eyebrow">órbitas recentes</p>
          <h2 id="recent-orbits-title">Volte ao que já observou.</h2>
        </div>
        <p>Atalhos criados somente a partir da memória local deste navegador. Abrir um perfil faz uma nova leitura pública.</p>
      </div>
      <ul>
        {profiles.map((profile) => {
          const isCurrent = profile.login.toLowerCase() === currentLogin.toLowerCase();
          return (
            <li key={profile.login.toLowerCase()}>
              <a
                className={isCurrent ? "is-current" : undefined}
                href={`/?login=${encodeURIComponent(profile.login)}`}
                aria-current={isCurrent ? "page" : undefined}
              >
                <span className="recent-orbit-identity">
                  <strong>@{profile.login}</strong>
                  <small>
                    {isCurrent ? "perfil atual · " : ""}
                    {profile.observationCount} {profile.observationCount === 1 ? "leitura" : "leituras"}
                  </small>
                </span>
                <span className="recent-orbit-date">
                  observado em <time dateTime={profile.lastObservedAt}>{observedDate.format(new Date(profile.lastObservedAt))}</time>
                </span>
                <span className="recent-orbit-signals" aria-label={`Últimos sinais de ${profile.login}`}>
                  <span><strong>{timelineMetric(profile.visibleAchievementCount)}</strong> selos</span>
                  <span><strong>{timelineMetric(profile.mergedPullRequests)}</strong> PRs</span>
                  <span><strong>{timelineMetric(profile.topRepositoryStars)}</strong> estrelas</span>
                  <span><strong>{timelineMetric(profile.publicRepositories)}</strong> repos</span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function EvidenceLedger({
  audit,
  comparison,
}: {
  audit: AuditResponse;
  comparison?: AuditResponse | null;
}) {
  const sources = buildAuditEvidenceSources(audit);
  const comparisonSources = comparison ? buildAuditEvidenceSources(comparison) : [];

  return (
    <section className="evidence-ledger" aria-labelledby="evidence-ledger-title">
      <div className="evidence-ledger-heading">
        <div>
          <p className="eyebrow">trilha de evidência</p>
          <h2 id="evidence-ledger-title">Cada número deixa um rastro.</h2>
        </div>
        <p>Estas são as consultas públicas usadas nesta leitura. Uma fonte indisponível continua visível como lacuna, nunca como zero.</p>
      </div>
      <ol>
        {sources.map((source, index) => (
          <li className={source.status === "available" ? "is-available" : "is-unavailable"} key={source.id}>
            <span className="evidence-index">{String(index + 1).padStart(2, "0")}</span>
            <span className="evidence-status">
              <i aria-hidden="true" />
              {source.status === "available" ? "fonte lida" : "indisponível nesta leitura"}
            </span>
            <h3>{source.label}</h3>
            <strong>{source.result}</strong>
            <p><span>{source.method}</span>{source.detail}</p>
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.urlLabel} <span aria-hidden="true">↗</span>
            </a>
          </li>
        ))}
      </ol>
      {comparison ? (
        <div className="comparison-evidence" aria-labelledby="comparison-evidence-title">
          <div>
            <p className="eyebrow">perfil comparado</p>
            <h3 id="comparison-evidence-title">Fontes de @{comparison.profile.login}</h3>
          </div>
          <ul>
            {comparisonSources.map((source) => (
              <li key={source.id}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  <span>{source.label}</span>
                  <strong>{source.result}</strong>
                  <small className={source.status === "available" ? "is-available" : "is-unavailable"}>
                    {source.status === "available" ? "fonte lida" : "indisponível"} <span aria-hidden="true">↗</span>
                  </small>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function ProgressBar({ achievement }: { achievement: AchievementProgress }) {
  if (achievement.catalogStatus === "discovered") {
    return (
      <div className="progress" role="img" aria-label="Selo público detectado">
        <span style={{ width: "100%" }} />
      </div>
    );
  }

  if (
    achievement.current === null ||
    achievement.measurementKind === "not-public" ||
    achievement.measurementKind === "unavailable"
  ) {
    return (
      <div
        className="progress is-indeterminate"
        role="img"
        aria-label={
          achievement.measurementKind === "unavailable"
            ? "Progresso indisponível"
            : "Progresso não público"
        }
      >
        <span />
      </div>
    );
  }

  if (achievement.nextThreshold === null) {
    return (
      <div
        className="progress"
        role="img"
        aria-label={
          achievement.unlocked
            ? "Marco conhecido concluído"
            : "Marcos numéricos conhecidos atingidos; selo não visível"
        }
      >
        <span style={{ width: "100%" }} />
      </div>
    );
  }

  const percent = Math.min(
    100,
    Math.round((achievement.current / achievement.nextThreshold) * 100),
  );

  return (
    <div
      className="progress"
      role="progressbar"
      aria-label="Progresso até o próximo marco"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

function AchievementCard({ achievement }: { achievement: AchievementProgress }) {
  const statusLabel =
    achievement.badgeStatus === "unavailable"
      ? "Selo indisponível"
      : achievement.catalogStatus === "discovered"
        ? `Detectada no perfil · nível ${achievement.tier}`
        : achievement.unlocked
          ? `Desbloqueada · nível ${achievement.tier}`
          : "Não visível no perfil";
  const milestoneLabel = achievement.nextThreshold
    ? `Próximo: ${achievement.nextThreshold}`
    : achievement.catalogStatus === "discovered"
      ? "Critério não publicado"
      : achievement.badgeStatus === "unavailable"
        ? "Aguardando fonte"
        : achievement.unlocked
          ? "Concluída"
          : "Sem marco";

  return (
    <article
      className={`achievement ${achievement.unlocked ? "is-unlocked" : ""} ${achievement.badgeStatus === "unavailable" ? "is-unknown" : ""} ${achievement.catalogStatus === "discovered" ? "is-discovered" : ""}`}
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
  onDownloadBackup,
  onImportBackup,
  backupStatus,
}: {
  audit: AuditResponse;
  memory: LocalProgressMemory;
  onClear: () => void;
  onDownloadBackup: () => void;
  onImportBackup: (event: ChangeEvent<HTMLInputElement>) => void;
  backupStatus: string;
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
  const timelineDate = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <section className="history-panel" aria-labelledby="history-title">
      <div className="history-heading">
        <div>
          <p className="kicker"><span /> memória local</p>
          <h2 id="history-title">O pulso ao longo do tempo.</h2>
        </div>
        <p>
          O histórico fica somente neste navegador, guarda até {MAX_SNAPSHOTS_PER_PROFILE} estados completos por perfil em {MAX_TRACKED_PROFILES} perfis recentes e nunca entra no link compartilhado.
        </p>
      </div>

      <div aria-live="polite">
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
      </div>

      {memory.storageAvailable && !memory.cleared && memory.timeline.length ? (
        <div className="history-timeline">
          <div className="history-timeline-heading">
            <h3>Linha do tempo local</h3>
            <span>{memory.timeline.length} {memory.timeline.length === 1 ? "leitura distinta" : "leituras distintas"}</span>
          </div>
          <div className="history-table-wrap">
            <table className="history-table">
              <caption>Estados completos preservados neste navegador, do mais recente ao mais antigo.</caption>
              <thead>
                <tr>
                  <th scope="col">Observação</th>
                  <th scope="col">Selos</th>
                  <th scope="col">PRs</th>
                  <th scope="col">Estrelas</th>
                  <th scope="col">Repositórios</th>
                  <th scope="col">Desde a anterior</th>
                </tr>
              </thead>
              <tbody>
                {memory.timeline.map((entry, index) => (
                  <tr key={`${entry.snapshot.capturedAt}-${index}`}>
                    <th scope="row">
                      <time dateTime={entry.snapshot.capturedAt}>
                        {timelineDate.format(new Date(entry.snapshot.capturedAt))}
                      </time>
                      {index === 0 ? <small>mais recente</small> : null}
                    </th>
                    <td>{timelineMetric(entry.snapshot.visibleAchievementCount)}</td>
                    <td>{timelineMetric(entry.snapshot.mergedPullRequests)}</td>
                    <td>{timelineMetric(entry.snapshot.topRepositoryStars)}</td>
                    <td>{timelineMetric(entry.snapshot.publicRepositories)}</td>
                    <td className="timeline-change">{timelineChangeSummary(entry.changes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {memory.storageAvailable && !memory.cleared && (memory.recorded || memory.previous) ? (
        <button className="history-clear" type="button" onClick={onClear}>Apagar histórico deste perfil</button>
      ) : null}
      {!memory.recorded && memory.previous && !memory.cleared ? (
        <p className="history-note">Leitura parcial: a linha de base anterior foi preservada.</p>
      ) : null}

      {memory.storageAvailable ? (
        <div className="history-backup">
          <div>
            <h3>Backup privado</h3>
            <p>Baixe todas as linhas do tempo deste navegador ou restaure um backup. A restauração valida e mescla os estados; não substitui observações mais recentes.</p>
          </div>
          <div className="history-backup-actions">
            <button type="button" onClick={onDownloadBackup}>Baixar backup .json</button>
            <label>
              Restaurar backup
              <input type="file" accept=".json,application/json" onChange={onImportBackup} />
            </label>
          </div>
          {backupStatus ? <p className="history-backup-status" role="status">{backupStatus}</p> : null}
        </div>
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
  const [historyBackupStatus, setHistoryBackupStatus] = useState("");
  const [recentProfiles, setRecentProfiles] = useState<RecentAuditProfile[]>([]);
  const [achievementFilter, setAchievementFilter] = useState<AchievementFilter>("all");

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
          let nextHistory = history;

          if (currentSnapshot.complete) {
            nextHistory = appendAuditSnapshot(history, currentSnapshot);
            window.localStorage.setItem(AUDIT_HISTORY_STORAGE_KEY, serializeAuditHistory(nextHistory));
          }

          setRecentProfiles(listRecentAuditProfiles(nextHistory));

          setLocalProgress({
            current: currentSnapshot,
            previous,
            changes,
            timeline: buildAuditTimeline(nextHistory, currentSnapshot.login),
            recorded: currentSnapshot.complete,
            storageAvailable: true,
            cleared: false,
          });
        } catch {
          setRecentProfiles([]);
          setLocalProgress({
            current: currentSnapshot,
            previous: null,
            changes: null,
            timeline: [],
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

  const nextMission = useMemo(
    () => audit ? selectNextMission(audit.achievements) : null,
    [audit],
  );
  const filteredAchievements = useMemo(
    () => audit ? filterAchievements(audit.achievements, achievementFilter) : [],
    [achievementFilter, audit],
  );
  const achievementFilterCounts = useMemo(
    () => countAchievementFilters(audit?.achievements ?? []),
    [audit],
  );

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

  function buildShareUrl(comparison?: string | null) {
    const shareUrl = new URL(window.location.href);
    shareUrl.searchParams.set("login", audit?.profile.login ?? routeLogin);
    if (comparison) {
      shareUrl.searchParams.set("compare", comparison);
    } else {
      shareUrl.searchParams.delete("compare");
    }

    return shareUrl;
  }

  async function copyShareLink() {
    const shareUrl = buildShareUrl(comparisonLogin);

    try {
      await navigator.clipboard.writeText(shareUrl.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      setCopied(false);
    }
  }

  function downloadAuditReport() {
    if (!audit) return;

    const comparison = comparisonAudit ?? null;
    const markdown = buildAuditMarkdown({
      audit,
      comparison,
      shareUrl: buildShareUrl(comparison?.profile.login).toString(),
    });
    downloadTextFile(
      markdown,
      "text/markdown;charset=utf-8",
      auditReportFilename(audit.profile.login, comparison?.profile.login),
    );
  }

  function downloadAuditData() {
    if (!audit) return;

    const comparison = comparisonAudit ?? null;
    downloadTextFile(
      serializeAuditDataExport({
        audit,
        comparison,
        shareUrl: buildShareUrl(comparison?.profile.login).toString(),
      }),
      "application/json;charset=utf-8",
      auditDataFilename(audit.profile.login, comparison?.profile.login),
    );
  }

  function downloadHistoryBackup() {
    try {
      const history = parseAuditHistory(window.localStorage.getItem(AUDIT_HISTORY_STORAGE_KEY));
      const snapshotCount = countAuditHistorySnapshots(history);
      if (snapshotCount === 0) {
        setHistoryBackupStatus("Ainda não há leituras completas para incluir no backup.");
        return;
      }

      const exportedAt = new Date().toISOString();
      downloadTextFile(
        serializeAuditHistoryBackup(history, exportedAt),
        "application/json;charset=utf-8",
        auditHistoryBackupFilename(exportedAt),
      );
      setHistoryBackupStatus(
        `Backup baixado com ${snapshotCount} ${snapshotCount === 1 ? "leitura" : "leituras"}.`,
      );
    } catch {
      setHistoryBackupStatus("Este navegador não permitiu ler o histórico para o backup.");
    }
  }

  async function importHistoryBackup(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    if (file.size > MAX_HISTORY_BACKUP_BYTES) {
      setHistoryBackupStatus("O arquivo excede o limite seguro de 512 KB.");
      return;
    }

    try {
      const backup = parseAuditHistoryBackup(await file.text());
      if (!backup) {
        setHistoryBackupStatus("Backup inválido ou incompatível com esta versão do Constellation.");
        return;
      }

      const currentHistory = parseAuditHistory(window.localStorage.getItem(AUDIT_HISTORY_STORAGE_KEY));
      const mergedHistory = mergeAuditHistories(currentHistory, backup.history);
      window.localStorage.setItem(AUDIT_HISTORY_STORAGE_KEY, serializeAuditHistory(mergedHistory));
      setRecentProfiles(listRecentAuditProfiles(mergedHistory));

      if (audit) {
        const currentSnapshot = createAuditSnapshot(audit);
        const previous = findComparisonSnapshot(mergedHistory, currentSnapshot);
        setLocalProgress({
          current: currentSnapshot,
          previous,
          changes: previous ? compareAuditSnapshots(currentSnapshot, previous) : null,
          timeline: buildAuditTimeline(mergedHistory, currentSnapshot.login),
          recorded: currentSnapshot.complete,
          storageAvailable: true,
          cleared: false,
        });
      }

      const snapshotCount = countAuditHistorySnapshots(mergedHistory);
      const profileCount = Object.keys(mergedHistory).length;
      setHistoryBackupStatus(
        `Backup restaurado: ${snapshotCount} ${snapshotCount === 1 ? "leitura" : "leituras"} em ${profileCount} ${profileCount === 1 ? "perfil" : "perfis"}.`,
      );
    } catch {
      setHistoryBackupStatus("Não foi possível restaurar o backup neste navegador.");
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
      setRecentProfiles(listRecentAuditProfiles(nextHistory));

      setLocalProgress({
        ...localProgress,
        previous: null,
        changes: null,
        timeline: [],
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
          href="https://github.com/Navesz/constellation"
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
              <div className="profile-actions">
                <button className="share-button" type="button" onClick={copyShareLink}>
                  {copied ? "Link copiado" : "Copiar link"}
                </button>
                <button
                  className="report-button"
                  type="button"
                  onClick={downloadAuditReport}
                  disabled={comparisonLoading}
                >
                  {comparisonLoading ? "Preparando comparação" : "Baixar relatório .md"}
                </button>
                <button
                  className="data-button"
                  type="button"
                  onClick={downloadAuditData}
                  disabled={comparisonLoading}
                >
                  {comparisonLoading ? "Preparando comparação" : "Baixar dados .json"}
                </button>
              </div>
            </div>
          </section>

          <RecentOrbits profiles={recentProfiles} currentLogin={audit.profile.login} />

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
            <ProgressHistory
              audit={audit}
              memory={localProgress}
              onClear={clearLocalProgress}
              onDownloadBackup={downloadHistoryBackup}
              onImportBackup={importHistoryBackup}
              backupStatus={historyBackupStatus}
            />
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
            <p>Selos novos ou históricos também entram no mapa, sem inventar critérios ou progresso que o GitHub não publica.</p>
          </section>

          <aside className="trust-legend" aria-label="Legenda de confiabilidade dos dados">
            <span><i className="legend-measured" /> medido com dados públicos</span>
            <span><i className="legend-minimum" /> mínimo confirmado pelo selo</span>
            <span><i className="legend-private" /> contador ou critério não é público</span>
            <span><i className="legend-unavailable" /> fonte temporariamente indisponível</span>
          </aside>

          <div className="achievement-controls">
            <div role="group" aria-label="Filtrar mapa de conquistas">
              {ACHIEVEMENT_FILTER_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  aria-controls="achievement-map"
                  aria-pressed={achievementFilter === option.id}
                  onClick={() => setAchievementFilter(option.id)}
                >
                  {option.label}
                  <span>{achievementFilterCounts[option.id]}</span>
                </button>
              ))}
            </div>
            <p aria-live="polite">
              {filteredAchievements.length} {filteredAchievements.length === 1 ? "conquista exibida" : "conquistas exibidas"}
            </p>
          </div>

          {filteredAchievements.length ? (
            <section className="achievement-grid" id="achievement-map">
              {filteredAchievements.map((achievement) => (
                <AchievementCard key={achievement.slug} achievement={achievement} />
              ))}
            </section>
          ) : (
            <section className="achievement-empty" id="achievement-map" role="status">
              <strong>Nenhuma conquista corresponde a este filtro.</strong>
              <p>Os dados continuam preservados; escolha outra leitura do mapa.</p>
              <button type="button" onClick={() => setAchievementFilter("all")}>Mostrar todas</button>
            </section>
          )}

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

          <EvidenceLedger audit={audit} comparison={comparisonAudit} />

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
