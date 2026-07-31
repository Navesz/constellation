function safeFilenameSegment(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "perfil";
}

export function constellationExportFilename(
  login: string,
  comparisonLogin: string | null | undefined,
  extension: string,
) {
  const primary = safeFilenameSegment(login);
  const comparison = comparisonLogin ? `-vs-${safeFilenameSegment(comparisonLogin)}` : "";
  return `constellation-${primary}${comparison}.${extension}`;
}
