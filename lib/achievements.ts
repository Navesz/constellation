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

export type AchievementProgress = AchievementDefinition & {
  unlocked: boolean;
  tier: number;
  current: number;
  nextThreshold: number | null;
  progressLabel: string;
  measurementKind: "measured" | "confirmed-minimum" | "not-public";
  currentIsMinimum: boolean;
  confidenceLabel: string;
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
    mergedPullRequests: number;
    topRepository: null | {
      name: string;
      description: string | null;
      stars: number;
      forks: number;
      url: string;
    };
  };
  visibleAchievementCount: number;
  achievements: AchievementProgress[];
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
  metrics: { mergedPullRequests: number; topRepositoryStars: number },
): AchievementProgress[] {
  const visibleBySlug = new Map(visibleAchievements.map((item) => [item.slug, item]));

  return achievementDefinitions.map((definition) => {
    const visible = visibleBySlug.get(definition.slug);
    const measuredCurrent = definition.metric ? metrics[definition.metric] : undefined;
    const tierFloor = visible
      ? definition.thresholds[Math.min(visible.tier, definition.thresholds.length) - 1]
      : 0;
    const current = Math.max(measuredCurrent ?? 0, tierFloor ?? 0);
    const tier = visible?.tier ?? 0;
    const unlocked = Boolean(visible);
    const nextThreshold = unlocked
      ? definition.thresholds[tier] ?? null
      : definition.thresholds[0] ?? null;
    const currentIsMinimum = Boolean(visible) && (measuredCurrent === undefined || tierFloor > measuredCurrent);
    const measurementKind = currentIsMinimum
      ? "confirmed-minimum"
      : measuredCurrent !== undefined
        ? "measured"
        : "not-public";
    const confidenceLabel =
      measurementKind === "confirmed-minimum"
        ? "mínimo confirmado pelo selo"
        : measurementKind === "measured"
          ? "medido com dados públicos"
          : unlocked
            ? "desbloqueio confirmado; contador privado"
            : "contador não é público";
    const progressLabel = nextThreshold
      ? `${currentIsMinimum ? "pelo menos " : ""}${current} de ${nextThreshold}`
      : unlocked
        ? "marco concluído"
        : "sem marco público";

    return {
      ...definition,
      unlocked,
      tier,
      current,
      nextThreshold,
      progressLabel,
      measurementKind,
      currentIsMinimum,
      confidenceLabel,
    };
  });
}
