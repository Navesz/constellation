import {
  auditDataFilename,
  serializeAuditDataExport,
  type ParsedAuditDataExport,
} from "./audit-export.ts";
import { auditHtmlReportFilename, buildAuditHtml } from "./audit-html-report.ts";
import { auditReportFilename, buildAuditMarkdown } from "./audit-report.ts";

export type AuditExportArtifact = {
  format: "markdown" | "html" | "json";
  label: string;
  filename: string;
  mimeType: string;
  contents: string;
};

export function buildAuditExportArtifacts(
  parsed: ParsedAuditDataExport,
): AuditExportArtifact[] {
  const { primary, comparison, shareUrl, exportedAt } = parsed.data;
  const primaryLogin = primary.profile.login;
  const comparisonLogin = comparison?.profile.login;
  const reportOptions = {
    audit: primary,
    comparison,
    shareUrl,
  };

  return [
    {
      format: "markdown",
      label: "Baixar Markdown",
      filename: auditReportFilename(primaryLogin, comparisonLogin),
      mimeType: "text/markdown;charset=utf-8",
      contents: buildAuditMarkdown(reportOptions),
    },
    {
      format: "html",
      label: "Baixar HTML",
      filename: auditHtmlReportFilename(primaryLogin, comparisonLogin),
      mimeType: "text/html;charset=utf-8",
      contents: buildAuditHtml(reportOptions),
    },
    {
      format: "json",
      label: parsed.sourceVersion === 1
        ? "Atualizar para JSON v2"
        : "Baixar JSON validado",
      filename: auditDataFilename(primaryLogin, comparisonLogin),
      mimeType: "application/json;charset=utf-8",
      contents: serializeAuditDataExport({
        audit: primary,
        comparison,
        shareUrl,
        exportedAt,
      }),
    },
  ];
}
