export type ParsedAchievement = {
  name: string;
  slug: string;
  tier: number;
};

export function parseVisibleAchievements(html: string): ParsedAchievement[] {
  const bySlug = new Map<string, ParsedAchievement>();
  const achievementLink =
    /<a\b[^>]*href=["'][^"']*[?&]achievement=([a-z0-9-]+)(?:&amp;|&)tab=achievements[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(achievementLink)) {
    const slug = match[1].toLowerCase();
    const content = match[2];
    const name = content.match(/alt=["']Achievement:\s*([^"']+)["']/i)?.[1]?.trim();
    if (!name) continue;

    const parsedTier = Number(content.match(/>\s*x(\d+)\s*</i)?.[1] ?? 1);
    const tier = Number.isFinite(parsedTier) && parsedTier > 0 ? parsedTier : 1;
    const current = bySlug.get(slug);

    if (!current || tier > current.tier) {
      bySlug.set(slug, { slug, name, tier });
    }
  }

  return [...bySlug.values()];
}
