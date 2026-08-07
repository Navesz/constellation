export type ParsedAchievement = {
  name: string;
  slug: string;
  tier: number;
};

export const GITHUB_LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

export function normalizeGitHubLogin(value: string | null | undefined) {
  const normalized = value?.trim().replace(/^@/, "") ?? "";
  return GITHUB_LOGIN_PATTERN.test(normalized) ? normalized : null;
}

export function githubAchievementDetailUrl(login: string, slug: string) {
  const normalizedLogin = normalizeGitHubLogin(login);
  const normalizedSlug = slug.trim().toLowerCase();
  if (!normalizedLogin || !/^[a-z0-9-]+$/.test(normalizedSlug)) return null;

  const url = new URL(`https://github.com/${normalizedLogin}`);
  url.searchParams.set("achievement", normalizedSlug);
  url.searchParams.set("tab", "achievements");
  return url.toString();
}

function htmlAttribute(attributes: string, name: "href" | "alt") {
  const match = attributes.match(
    new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"),
  );
  return match?.[1] ?? match?.[2] ?? null;
}

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
  };

  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|amp|apos|gt|lt|quot);/gi, (entity, code: string) => {
    if (!code.startsWith("#")) return named[code.toLowerCase()] ?? entity;

    const hexadecimal = code[1]?.toLowerCase() === "x";
    const codePoint = Number.parseInt(code.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    if (!Number.isSafeInteger(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return entity;

    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return entity;
    }
  });
}

function achievementSlugFromHref(href: string, expectedLogin: string | null) {
  try {
    const url = new URL(decodeHtmlEntities(href), "https://github.com");
    if (url.origin !== "https://github.com" || url.hash) return null;

    const pathSegments = url.pathname.split("/").filter(Boolean);
    if (pathSegments.length !== 1) return null;
    const linkedLogin = normalizeGitHubLogin(decodeURIComponent(pathSegments[0]));
    if (!linkedLogin || (expectedLogin && linkedLogin.toLowerCase() !== expectedLogin.toLowerCase())) {
      return null;
    }

    const achievements = url.searchParams.getAll("achievement");
    const tabs = url.searchParams.getAll("tab");
    if (achievements.length !== 1 || tabs.length !== 1 || tabs[0] !== "achievements") return null;

    const slug = achievements[0].trim().toLowerCase();
    return /^[a-z0-9-]+$/.test(slug) ? slug : null;
  } catch {
    return null;
  }
}

function achievementName(content: string) {
  for (const image of content.matchAll(/<img\b([^>]*)>/gi)) {
    const alt = htmlAttribute(image[1], "alt");
    if (!alt) continue;
    const decoded = decodeHtmlEntities(alt).match(/^Achievement:\s*(.+)$/i)?.[1]?.trim();
    if (decoded) return decoded;
  }
  return null;
}

export function parseVisibleAchievements(html: string, profileLogin?: string): ParsedAchievement[] {
  const expectedLogin = profileLogin === undefined ? null : normalizeGitHubLogin(profileLogin);
  if (profileLogin !== undefined && !expectedLogin) return [];

  const bySlug = new Map<string, ParsedAchievement>();
  const achievementLinks = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(achievementLinks)) {
    const href = htmlAttribute(match[1], "href");
    const content = match[2];
    const slug = href ? achievementSlugFromHref(href, expectedLogin) : null;
    const name = achievementName(content);
    if (!slug || !name) continue;

    const parsedTier = Number(content.match(/>\s*x(\d+)\s*</i)?.[1] ?? 1);
    const tier = Number.isSafeInteger(parsedTier) && parsedTier > 0 ? parsedTier : 1;
    const current = bySlug.get(slug);

    if (!current || tier > current.tier) {
      bySlug.set(slug, { slug, name, tier });
    }
  }

  return [...bySlug.values()];
}
