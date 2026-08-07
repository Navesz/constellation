import type { Metadata } from "next";
import Link from "next/link";
import { AUDIT_SCHEMA_VERSION } from "@/lib/achievements";
import {
  API_DOCS_PATH,
  OPENAPI_PATH,
  PUBLIC_SITE_URL,
  STATUS_PATH,
} from "@/lib/openapi";
import { AUDIT_SCHEMA_PATH } from "@/lib/audit-schema";
import { AUDIT_EXPORT_SCHEMA_PATH, AUDIT_EXPORT_VERSION } from "@/lib/audit-export";
import { ExportValidator } from "./export-validator";

export const metadata: Metadata = {
  title: "Guia da API — Constellation",
  description:
    "Integre auditorias públicas de perfis do GitHub com contratos versionados e diagnósticos explícitos.",
};

const curlExample = `curl --get \\
  --data-urlencode "login=octocat" \\
  "http://localhost:3000/api/audit"`;

const browserExample = `const response = await fetch(
  "/api/audit?login=octocat"
);
const requestId = response.headers.get(
  "X-Constellation-Request-Id"
);

if (!response.ok) {
  const problem = await response.json();
  throw new Error(
    problem.error + " [" + (requestId ?? "sem referência") + "]"
  );
}

const schemaVersion = response.headers.get(
  "X-Constellation-Schema-Version"
);
const audit = await response.json();`;

const statusExample = `{
  "status": "ok",
  "service": "constellation",
  "auditSchemaVersion": ${AUDIT_SCHEMA_VERSION},
  "auditExportVersion": ${AUDIT_EXPORT_VERSION},
  "dependencies": {
    "github": "not-checked"
  },
  "contracts": {
    "auditSchema": "https://example.test/api/audit/schema/2",
    "exportSchema": "https://example.test/api/export/schema/${AUDIT_EXPORT_VERSION}",
    "openApi": "https://example.test/api/openapi.json",
    "documentation": "https://example.test/docs"
  },
  "checkedAt": "2026-07-31T12:00:00.000Z"
}`;

const responseStates = [
  ["200", "Auditoria completa ou parcial", "Confira sources, sourceDiagnostics e warnings antes de usar métricas secundárias."],
  ["400", "Consulta inválida", "Login, parâmetro repetido, chave de atualização expirada ou parâmetro desconhecido."],
  ["404", "Perfil não encontrado", "O login não corresponde a um perfil público do GitHub."],
  ["405", "Método não permitido", "Use GET na auditoria; HEAD fica restrito às rotas locais de status e contratos."],
  ["429", "Limite temporário", "Use Retry-After ou retryAt para decidir quando repetir a consulta."],
  ["502", "Resposta inesperada", "O GitHub não entregou uma resposta utilizável para a fonte obrigatória."],
  ["504", "Tempo esgotado", "A consulta obrigatória excedeu o prazo de oito segundos."],
] as const;

export default function ApiDocsPage() {
  return (
    <main className="docs-shell">
      <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <nav className="site-nav" aria-label="Navegação da documentação">
        <Link className="brand" href="/" aria-label="Constellation, observatório">
          <span className="brand-mark" aria-hidden="true">✦</span>
          <span>Constellation</span>
        </Link>
        <div className="nav-actions">
          <Link className="nav-link" href="/">Abrir observatório</Link>
          <a
            className="nav-link nav-link-external"
            href="https://github.com/Navesz/constellation"
            target="_blank"
            rel="noreferrer"
          >
            Código <span aria-hidden="true">↗</span>
          </a>
        </div>
      </nav>

      <article className="docs-page">
        <header className="docs-hero">
          <div>
            <p className="kicker"><span /> dados públicos · contrato v{AUDIT_SCHEMA_VERSION}</p>
            <h1 id="main-content" tabIndex={-1}>Integre o observatório sem adivinhar o contrato.</h1>
            <p>
              Uma API somente de leitura para observar sinais públicos de perfis do GitHub.
              Respostas parciais identificam cada lacuna; ausência de dados nunca vira zero por conveniência.
            </p>
          </div>
          <dl className="docs-contract-card">
            <div><dt>Base</dt><dd>{PUBLIC_SITE_URL}</dd></div>
            <div><dt>Formato</dt><dd>JSON · UTF-8</dd></div>
            <div><dt>Acesso</dt><dd>Dados públicos · site privado</dd></div>
            <div><dt>CORS</dt><dd>GET, HEAD e OPTIONS</dd></div>
          </dl>
        </header>

        <section className="docs-section docs-quickstart" aria-labelledby="quickstart-title">
          <div>
            <p className="eyebrow">01 · primeira leitura</p>
            <h2 id="quickstart-title">Comece com um login.</h2>
            <p>
              O perfil público é a única fonte obrigatória. Repositórios, pull requests e selos
              podem falhar isoladamente sem transformar a auditoria inteira em erro. O exemplo
              usa o projeto local; na implantação privada, faça a chamada na sessão autorizada.
            </p>
          </div>
          <pre aria-label="Exemplo de consulta com curl"><code>{curlExample}</code></pre>
        </section>

        <section className="docs-section" aria-labelledby="routes-title">
          <div className="docs-section-heading">
            <div>
              <p className="eyebrow">02 · superfície</p>
              <h2 id="routes-title">Seis rotas principais, responsabilidades explícitas.</h2>
            </div>
            <p>A alias sem versão do esquema continua disponível, mas integrações novas devem fixar a versão.</p>
          </div>
          <div className="docs-route-grid">
            <article><span>GET</span><code>/api/audit?login=octocat</code><p>Executa a leitura pública do perfil.</p></article>
            <article><span>GET · HEAD</span><code>{AUDIT_SCHEMA_PATH}</code><p>Publica o JSON Schema Draft 2020-12 da resposta.</p></article>
            <article><span>GET · HEAD</span><code>{AUDIT_EXPORT_SCHEMA_PATH}</code><p>Valida arquivos exportados sem depender da interface.</p></article>
            <article><span>GET · HEAD</span><code>{OPENAPI_PATH}</code><p>Descreve parâmetros, respostas e erros em OpenAPI 3.1.1.</p></article>
            <article><span>GET</span><code>{API_DOCS_PATH}</code><p>Mantém este guia humano junto do serviço.</p></article>
            <article className="docs-route-wide"><span>GET · HEAD</span><code>{STATUS_PATH}</code><p>Confirma a aplicação sem consultar o GitHub nem consumir a cota externa.</p></article>
          </div>
        </section>

        <section className="docs-section docs-contracts" aria-labelledby="contracts-title">
          <div>
            <p className="eyebrow">03 · contratos verificáveis</p>
            <h2 id="contracts-title">Use a máquina antes da suposição.</h2>
            <p>
              Toda resposta da auditoria anuncia este guia, a descrição OpenAPI e o JSON Schema no
              cabeçalho <code>Link</code>. Exportações JSON carregam a URL do próprio esquema, e os
              cabeçalhos de versão ficam expostos para navegadores.
            </p>
            <p>
              OpenAPI e os schemas também retornam <code>ETag</code>. Reenvie esse valor em
              <code> If-None-Match</code> para receber <code>304</code> sem corpo quando o contrato
              não mudou; cache, CORS, descoberta e versão continuam disponíveis na resposta.
            </p>
            <p>
              Cada resposta da API inclui <code>X-Constellation-Request-Id</code>, um UUID aleatório
              que não codifica login nem dados do perfil. Registre-o junto do status nos logs da
              integração para manter uma referência segura quando uma leitura falhar.
            </p>
            <p>
              Use <code>HEAD</code> no status, OpenAPI ou schemas para conferir disponibilidade,
              versão, cache e descoberta sem transferir o corpo. A auditoria rejeita
              <code> HEAD</code> antes de consultar o GitHub, evitando consumo externo acidental.
            </p>
            <div className="docs-contract-links">
              <a href={OPENAPI_PATH}>Abrir OpenAPI <span aria-hidden="true">↗</span></a>
              <a href={AUDIT_SCHEMA_PATH}>Abrir JSON Schema <span aria-hidden="true">↗</span></a>
              <a href={AUDIT_EXPORT_SCHEMA_PATH}>Validar exportações <span aria-hidden="true">↗</span></a>
              <a href={STATUS_PATH}>Ver status <span aria-hidden="true">↗</span></a>
            </div>
          </div>
          <pre aria-label="Exemplo de integração no navegador"><code>{browserExample}</code></pre>
        </section>

        <ExportValidator />

        <section className="docs-section" aria-labelledby="responses-title">
          <div className="docs-section-heading">
            <div>
              <p className="eyebrow">05 · respostas</p>
              <h2 id="responses-title">Falhas acionáveis, não mensagens opacas.</h2>
            </div>
            <p>Erros usam um campo <code>error</code> legível; limites podem incluir <code>retryAt</code>.</p>
          </div>
          <div className="docs-response-table-wrap">
            <table className="docs-response-table">
              <thead><tr><th>HTTP</th><th>Significado</th><th>Como tratar</th></tr></thead>
              <tbody>
                {responseStates.map(([status, meaning, action]) => (
                  <tr key={status}><td><code>{status}</code></td><td>{meaning}</td><td>{action}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="docs-section docs-quickstart" aria-labelledby="status-title">
          <div>
            <p className="eyebrow">06 · monitoramento</p>
            <h2 id="status-title">Saúde sem gastar uma consulta externa.</h2>
            <p>
              <code>{STATUS_PATH}</code> confirma que a camada da aplicação está respondendo e usa
              <code> Cache-Control: no-store</code>. O valor <code>github: not-checked</code> deixa
              explícito que essa leitura não mede a disponibilidade do GitHub.
            </p>
          </div>
          <pre aria-label="Exemplo de resposta do status"><code>{statusExample}</code></pre>
        </section>

        <section className="docs-principles" aria-labelledby="principles-title">
          <div>
            <p className="eyebrow">07 · limites honestos</p>
            <h2 id="principles-title">O que uma integração deve preservar.</h2>
          </div>
          <ul>
            <li><strong>Dados públicos:</strong> a aplicação não pede token do GitHub nem acessa informações privadas; a hospedagem atual pode exigir a sessão do proprietário.</li>
            <li><strong>Parcial é parcial:</strong> consulte <code>sources</code> antes de calcular ou comparar métricas.</li>
            <li><strong>Cache consciente:</strong> a resposta pode ser compartilhada por alguns minutos; atualizações manuais usam uma chave curta e limitada.</li>
            <li><strong>Monitoramento isolado:</strong> use a rota de status para disponibilidade da aplicação e a auditoria somente quando precisar consultar um perfil.</li>
            <li><strong>Origem canônica:</strong> metadata social usa a origem oficial ou um endereço local explícito; hosts encaminhados desconhecidos não são refletidos.</li>
            <li><strong>Navegação defensiva:</strong> todas as respostas limitam referrer, MIME sniffing, objetos incorporados e permissões de câmera, localização e microfone.</li>
            <li><strong>Sem spam:</strong> o catálogo orienta ações legítimas e não automatiza atividade para fabricar conquistas.</li>
          </ul>
        </section>
      </article>

      <footer>
        <span>Constellation · guia da API</span>
        <Link href="/">Voltar ao observatório</Link>
      </footer>
    </main>
  );
}
