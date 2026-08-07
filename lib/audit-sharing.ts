export type AuditSharePayload = {
  title: string;
  text: string;
  url: string;
};

export type AuditShareResult = "shared" | "copied" | "cancelled" | "unavailable";

type AuditShareTarget = {
  share?: (payload: ShareData) => Promise<void>;
  clipboard?: {
    writeText: (value: string) => Promise<void>;
  };
};

function wasCancelled(error: unknown) {
  return Boolean(
    error
      && typeof error === "object"
      && "name" in error
      && error.name === "AbortError",
  );
}

export function buildAuditSharePayload(
  primaryLogin: string,
  comparisonLogin: string | null | undefined,
  url: string,
): AuditSharePayload {
  if (comparisonLogin) {
    return {
      title: `Constellation — @${primaryLogin} × @${comparisonLogin}`,
      text: `Compare os sinais públicos de @${primaryLogin} e @${comparisonLogin} no Constellation.`,
      url,
    };
  }

  return {
    title: `Constellation — @${primaryLogin}`,
    text: `Veja a auditoria de sinais públicos de @${primaryLogin} no Constellation.`,
    url,
  };
}

export async function shareAudit(
  payload: AuditSharePayload,
  target: AuditShareTarget,
): Promise<AuditShareResult> {
  if (target.share) {
    try {
      await target.share(payload);
      return "shared";
    } catch (error) {
      if (wasCancelled(error)) return "cancelled";
    }
  }

  if (target.clipboard) {
    try {
      await target.clipboard.writeText(payload.url);
      return "copied";
    } catch {
      // The caller receives an explicit unavailable state below.
    }
  }

  return "unavailable";
}
