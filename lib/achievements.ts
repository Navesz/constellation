export type VisibleAchievement = {
  name: string;
  slug: string;
  tier: number;
};

type AchievementDefinition = {
  name: string;
  slug: string;
  description: string;
  nextAction: string;
  thresholds: number[];
  metric?: "mergedPullRequests" | "topRepositoryStars";
};

type CatalogedAchievementDefinition = AchievementDefinition & {
  catalogStatus: "modeled" | "discovered";
};

export type AchievementProgress = CatalogedAchievementDefinition & {
  unlocked: boolean;
  tier: number;
  current: number | null;
  nextThreshold: number | null;
  progressLabel: string;
  badgeStatus: "visible" | "not-visible" | "unavailable";
  measurementKind: "measured" | "confirmed-minimum" | "not-public" | "unavailable";
  currentIsMinimum: boolean;
  confidenceLabel: string;
};

export type AuditSourceAvailability = "available" | "unavailable";

export type AuditSourceFailureReason =
  | "timeout"
  | "rate-limit"
  | "not-found"
  | "upstream-error"
  | "invalid-response"
  | "network";

export type AuditSourceDiagnostic = {
  reason: AuditSourceFailureReason;
  message: string;
};

export type AuditResponse = {
  profile: {
    login: string;
    name: string | null;
    bio: string | null;
    avatarUrl: string;
    htmlUrl: string;
    followers: number;
    following: number;
    publicRepos: number;
  };
  metrics: {
    mergedPullRequests: number | null;
    topRepository: null | {
      name: string;
      description: string | null;
      stars: number;
      forks: number;
      url: string;
    };
  };
  sources: {
    achievements: AuditSourceAvailability;
    mergedPullRequests: AuditSourceAvailability;
    repositories: AuditSourceAvailability;
  };
  sourceDiagnostics?: {
    achievements: AuditSourceDiagnostic | null;
    mergedPullRequests: AuditSourceDiagnostic | null;
    repositories: AuditSourceDiagnostic | null;
  };
  visibleAchievementCount: number | null;
  achievements: AchievementProgress[];
  warnings: string[];
  generatedAt: string;
};

export const achievementDefinitions: AchievementDefinition[] = [
  {
    name: "Quickdraw",
    slug: "quickdraw",
    description: "Encerrar uma issue ou um pull request em até cinco minutos.",
    nextAction: "Faça uma triagem real e encerre uma issue resolvida logo após a abertura.",
    thresholds: [1],
  },
  {
    name: "Pull Shark",
    slug: "pull-shark",
    description: "Abrir pull requests que sejam posteriormente mesclados.",
    nextAction: "Entregue uma melhoria pequena, testada e revisável por pull request.",
    thresholds: [2, 16, 128, 1024],
    metric: "mergedPullRequests",
  },
  {
    name: "Pair Extraordinaire",
    slug: "pair-extraordinaire",
    description: "Participar como coautor de commits em pull requests mesclados.",
    nextAction: "Colabore de verdade e registre coautoria somente quando houver contribuição compartilhada.",
    thresholds: [1, 10, 24, 48],
  },
  {
    name: "Galaxy Brain",
    slug: "galaxy-brain",
    description: "Ter respostas aceitas em perguntas do GitHub Discussions.",
    nextAction: "Responda perguntas reais com contexto, fontes e uma solução reproduzível.",
    thresholds: [2, 8, 16, 32],
  },
  {
    name: "Starstruck",
    slug: "starstruck",
    description: "Criar um repositório que receba estrelas de outros usuários.",
    nextAction: "Resolva um problema concreto, documente bem e compartilhe o projeto com a comunidade certa.",
    thresholds: [16, 128, 512, 4096],
    metric: "topRepositoryStars",
  },
  {
    name: "YOLO",
    slug: "yolo",
    description: "Mesclar um pull request sem revisão de código.",
    nextAction: "Use apenas em uma mudança segura e bem testada de um projeto sob seu controle.",
    thresholds: [1],
  },
  {
    name: "Public Sponsor",
    slug: "public-sponsor",
    description: "Patrocinar publicamente um mantenedor pelo GitHub Sponsors.",
    nextAction: "Escolha conscientemente um projeto que você usa e confirme o pagamento no GitHub.",
    thresholds: [1],
  },
];

export function buildAchievementProgress(
  visibleAchievements: VisibleAchievement[],
  metrics: { mergedPullRequests?: number; topRepositoryStars?: number },
  options: { achievementScanAvailable?: boolean } = {},
): AchievementProgress[] {
  const visibleBySlug = new Map(visibleAchievements.map((item) => [item.slug, item]));
  const achievementScanAvailable = options.achievementScanAvailable ?? true;
  const modeledSlugs = new Set(achievementDefinitions.map((definition) => definition.slug));
  const definitions: CatalogedAchievementDefinition[] = [
    ...achievementDefinitions.map((definition) => ({
      ...definition,
      catalogStatus: "modeled" as const,
    })),
    ...visibleAchievements
      .filter((achievement) => !modeledSlugs.has(achievement.slug))
      .map((achievement) => ({
        name: achievement.name,
        slug: achievement.slug,
        description:
          "Conquista exibida publicamente no perfil, ainda sem critérios estáveis catalogados pelo Constellation.",
        nextAction: "Abra o selo no GitHub para consultar os eventos públicos associados.",
        thresholds: [],
        catalogStatus: "discovered" as const,
      })),
  ];

  return definitions.map((definition) => {
    const visible = visibleBySlug.get(definition.slug);
    const measuredCurrent = definition.metric ? metrics[definition.metric] : undefined;
    const tierFloor = visible
      ? definition.thresholds[Math.min(visible.tier, definition.thresholds.length) - 1]
      : undefined;
    const current = measuredCurrent !== undefined || tierFloor !== undefined
      ? Math.max(measuredCurrent ?? 0, tierFloor ?? 0)
      : null;
    const tier = visible?.tier ?? 0;
    const unlocked = Boolean(visible);
    const badgeStatus = visible
      ? "visible"
      : achievementScanAvailable
        ? "not-visible"
        : "unavailable";
    const nextThreshold = unlocked
      ? definition.thresholds[tier] ?? null
      : measuredCurrent !== undefined
        ? definition.thresholds.find((threshold) => threshold > measuredCurrent) ?? null
        : achievementScanAvailable
          ? definition.thresholds[0] ?? null
          : null;
    const currentIsMinimum =
      definition.catalogStatus === "modeled" &&
      Boolean(visible) &&
      current !== null &&
      (measuredCurrent === undefined || (tierFloor ?? 0) > measuredCurrent);
    const measurementKind = currentIsMinimum
      ? "confirmed-minimum"
      : measuredCurrent !== undefined
        ? "measured"
        : !achievementScanAvailable
          ? "unavailable"
        : "not-public";
    const confidenceLabel =
      definition.catalogStatus === "discovered"
        ? "selo público detectado; critérios não catalogados"
        : measurementKind === "confirmed-minimum"
          ? "mínimo confirmado pelo selo"
          : measurementKind === "measured"
            ? "medido com dados públicos"
            : measurementKind === "unavailable"
              ? "fonte temporariamente indisponível"
              : unlocked
                ? "desbloqueio confirmado; contador privado"
                : "contador não é público";
    const progressLabel =
      definition.catalogStatus === "discovered"
        ? "selo público detectado"
        : measurementKind === "unavailable"
          ? "estado temporariamente indisponível"
          : measurementKind === "not-public"
            ? unlocked
              ? "desbloqueio visível; contador privado"
              : "progresso não público"
            : nextThreshold && current !== null
              ? `${currentIsMinimum ? "pelo menos " : ""}${current} de ${nextThreshold}`
              : unlocked
                ? "marco concluído"
                : measuredCurrent !== undefined && current !== null && current > 0
                  ? `${current} medidos; selo não confirmado`
                  : "sem marco público";

    return {
      ...definition,
      unlocked,
      tier,
      current,
      nextThreshold,
      progressLabel,
      badgeStatus,
      measurementKind,
      currentIsMinimum,
      confidenceLabel,
    };
  });
}

export type ActionableAchievement = AchievementProgress & {
  current: number;
  nextThreshold: number;
};

export function isActionableAchievement(
  achievement: AchievementProgress,
): achievement is ActionableAchievement {
  return (
    achievement.current !== null &&
    achievement.nextThreshold !== null &&
    (achievement.measurementKind === "measured" || achievement.measurementKind === "confirmed-minimum")
  );
}

export function selectNextMission(achievements: AchievementProgress[]): ActionableAchievement | null {
  return [...achievements]
    .filter(isActionableAchievement)
    .sort((left, right) => {
      const leftRemaining = Math.max(0, left.nextThreshold - left.current);
      const rightRemaining = Math.max(0, right.nextThreshold - right.current);
      return leftRemaining - rightRemaining;
    })[0] ?? null;
}
