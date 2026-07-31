"use client";

import { ChangeEvent, useState } from "react";
import {
  INVALID_AUDIT_EXPORT_MESSAGE,
  isOfficialAuditShareUrl,
  readAuditDataExport,
  type ParsedAuditDataExport,
} from "@/lib/audit-export";

const MAX_EXPORT_FILE_BYTES = 512 * 1024;

type ValidatorState =
  | { status: "idle" | "reading" }
  | { status: "valid"; filename: string; parsed: ParsedAuditDataExport }
  | { status: "error"; message: string };

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "long",
  timeStyle: "short",
});

export function ExportValidator() {
  const [state, setState] = useState<ValidatorState>({ status: "idle" });

  async function validateFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setState({ status: "reading" });
    try {
      if (file.size > MAX_EXPORT_FILE_BYTES) {
        setState({
          status: "error",
          message: "O arquivo excede o limite local de 512 KB.",
        });
        return;
      }

      const parsed = readAuditDataExport(await file.text());
      setState({ status: "valid", filename: file.name, parsed });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : INVALID_AUDIT_EXPORT_MESSAGE,
      });
    } finally {
      input.value = "";
    }
  }

  const valid = state.status === "valid" ? state : null;
  const officialShareUrl = valid
    ? isOfficialAuditShareUrl(valid.parsed.data.shareUrl)
    : false;
  const shareOrigin = valid
    ? new URL(valid.parsed.data.shareUrl).origin
    : null;

  return (
    <section className="docs-section docs-export-validator" aria-labelledby="export-validator-title">
      <div className="docs-export-validator-copy">
        <p className="eyebrow">04 · verificador local</p>
        <h2 id="export-validator-title">Confirme o arquivo antes de confiar nele.</h2>
        <p>
          Abra uma exportação <code>constellation-audit</code> para conferir versão,
          privacidade e contrato. O conteúdo é processado somente neste navegador:
          nenhum arquivo é enviado e nenhuma consulta ao GitHub acontece.
        </p>
        <p className="docs-export-privacy" id="export-validator-note">
          <strong>Limite de 512 KB.</strong> Formatos atuais e arquivos legados v1 são aceitos;
          backups do histórico local são deliberadamente rejeitados. A rota precisa corresponder
          aos perfis do arquivo, e somente a origem oficial se torna um link direto.
        </p>
      </div>

      <div className="docs-export-validator-tool">
        <label className={state.status === "reading" ? "is-reading" : undefined}>
          <input
            type="file"
            accept="application/json,.json"
            aria-describedby="export-validator-note"
            disabled={state.status === "reading"}
            onChange={validateFile}
          />
          <span>{state.status === "reading" ? "Verificando…" : "Escolher exportação .json"}</span>
          <small>Leitura local · sem upload</small>
        </label>

        {state.status === "idle" || state.status === "reading" ? (
          <p className="docs-export-validator-empty" aria-live="polite">
            {state.status === "reading"
              ? "Conferindo o envelope e cada auditoria…"
              : "O resumo seguro do arquivo aparecerá aqui."}
          </p>
        ) : null}

        {state.status === "error" ? (
          <div className="docs-export-validator-result is-error" role="alert">
            <span>arquivo rejeitado</span>
            <h3>O contrato não pôde ser confirmado.</h3>
            <p>{state.message}</p>
          </div>
        ) : null}

        {valid ? (
          <div className="docs-export-validator-result is-valid" role="status" aria-live="polite">
            <span>arquivo válido · exportação v{valid.parsed.sourceVersion}</span>
            <h3>@{valid.parsed.data.primary.profile.login}</h3>
            <p>
              {valid.parsed.data.comparison
                ? `Comparação preservada com @${valid.parsed.data.comparison.profile.login}.`
                : "Auditoria de um único perfil."}
            </p>
            <dl>
              <div><dt>Arquivo</dt><dd>{valid.filename}</dd></div>
              <div><dt>Exportado</dt><dd>{dateFormatter.format(new Date(valid.parsed.data.exportedAt))}</dd></div>
              <div><dt>Privacidade</dt><dd>somente dados públicos · sem histórico local</dd></div>
            </dl>
            {officialShareUrl ? (
              <a href={valid.parsed.data.shareUrl} target="_blank" rel="noreferrer">
                Abrir rota oficial compartilhada <span aria-hidden="true">↗</span>
              </a>
            ) : (
              <p className="docs-export-origin-warning">
                <strong>Origem externa preservada, mas não aberta.</strong>{" "}
                A rota corresponde aos perfis do arquivo, porém aponta para <code>{shareOrigin}</code>.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
