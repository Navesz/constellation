# Constellation

Repositório independente do observatório Constellation. O histórico do produto
foi preservado desde a primeira versão criada no laboratório de conquistas.

Constellation é um observatório público de perfis do GitHub. A aplicação
combina dados da API pública com as conquistas visíveis no perfil para mostrar:

- conquistas desbloqueadas e seus níveis;
- selos históricos ou recém-lançados descobertos diretamente no perfil, mesmo quando ainda não fazem parte do catálogo interno;
- progresso conhecido para o próximo marco;
- pull requests públicos mesclados;
- repositório autoral com mais estrelas em todo o perfil, mesmo quando existem mais de 100 projetos;
- uma próxima ação legítima, sem incentivar spam.

O mapa pode ser filtrado por conquistas visíveis, sinais com próximo marco
mensurável ou estados sem contador público. Os filtros se sobrepõem de propósito
e nunca alteram a classificação de confiança da auditoria.

Cada auditoria tem uma URL compartilhável no formato `/?login=octocat`. O
painel também separa contagens medidas pela API de mínimos confirmados pelo
nível do selo, para não apresentar estimativas como valores exatos.

Uma leitura pode ser atualizada explicitamente sem depender da janela do cache
compartilhado. Enquanto a nova consulta acontece, o último resultado permanece
visível; se o GitHub falhar, a interface preserva essa leitura e identifica a
falha. A atualização da comparação segue o mesmo contrato.

O mesmo retrato pode ser baixado como um relatório Markdown portátil, incluindo
fontes indisponíveis e a comparação carregada. O arquivo nunca inclui o
histórico local do navegador, por isso pode ser anexado a documentação, perfis
profissionais ou arquivos pessoais sem transportar essa memória privada.

A auditoria atual também pode ser exportada como JSON estruturado. O envelope
`constellation-audit`, atualmente na versão 1, preserva os dados públicos, os
diagnósticos de cada fonte e a comparação carregada. Campos de privacidade no
próprio arquivo registram que o histórico local não foi incluído. Essa exportação
é separada do backup JSON da memória privada do navegador.

A rota `GET /api/audit?login=octocat` expõe o mesmo retrato para integrações.
Respostas bem-sucedidas carregam `schemaVersion: 1` no corpo e o cabeçalho
`X-Constellation-Schema-Version: 1`. O navegador valida integralmente esse
contrato antes de atualizar a interface; respostas incompletas ou de outra
versão falham de forma legível, sem produzir contagens parciais acidentais.
O JSON Schema Draft 2020-12 oficial fica em `GET /api/audit/schema` e também é
anunciado pelo cabeçalho `Link` de cada auditoria bem-sucedida.
As duas rotas aceitam `GET` entre origens com CORS explícito e respondem a
preflight `OPTIONS`; `Link`, `Retry-After` e a versão do esquema ficam expostos
ao navegador. Respostas `429` usam ainda o cabeçalho HTTP `Retry-After`, além do
campo estruturado `retryAt` no corpo.

Como o GitHub permite ocultar todas as conquistas ou somente um selo, a ausência
de um badge público nunca é tratada como contador zero. Nesses casos, cartões e
comparações mostram progresso não público, e a próxima missão considera apenas
sinais medidos ou mínimos efetivamente confirmados.

O perfil público é a única fonte obrigatória. Se a busca de pull requests, a
lista de repositórios ou a leitura dos selos falhar temporariamente, a auditoria
continua com os dados disponíveis e identifica cada lacuna em vez de exibir
zeros enganosos.

O painel e o relatório Markdown também exibem uma trilha de evidência com o
método, o estado e um link direto para cada consulta pública usada. Assim, uma
leitura completa pode ser inspecionada e uma falha permanece identificável.

Cada consulta ao GitHub tem um prazo de oito segundos. Fontes secundárias que
excedem esse limite preservam uma auditoria parcial com diagnóstico de timeout,
limite de consultas, rede, resposta inválida ou erro do GitHub. O perfil público
continua sendo a única fonte obrigatória.

Quando o GitHub informa o fim de um bloqueio temporário, o Constellation
preserva esse horário no diagnóstico e mostra exatamente quando a consulta pode
ser repetida. A orientação também acompanha os relatórios Markdown e JSON.

Auditorias completas também formam um histórico local com até 12 estados por
perfil e oito perfis recentes. Essa memória fica somente no navegador, não é
incluída nos links compartilhados e pode ser apagada por perfil na interface.
Leituras parciais nunca substituem uma linha de base completa. A linha do tempo
mostra todas as observações distintas, seus cinco sinais — seguidores, selos,
PRs, estrelas e repositórios — e a mudança desde o estado anterior.

Quando existem pelo menos dois perfis nessa memória, o painel mostra órbitas
recentes ordenadas pela última observação, com um resumo dos quatro sinais e
acesso direto para remapear cada login.

Essa memória também pode ser baixada explicitamente como um backup JSON e
restaurada em outro navegador. A importação valida o formato, mescla estados
sem apagar observações mais recentes e reaplica os mesmos limites de retenção.
Esse arquivo é separado do relatório Markdown público.

Backups atuais usam a versão 2 e incluem seguidores. Arquivos da versão 1
continuam aceitos; como esse sinal não existia neles, o valor antigo permanece
indisponível até que duas novas leituras permitam calcular uma mudança honesta.

Um segundo perfil pode ser adicionado para comparação. A URL preserva os dois
logins, o painel calcula o delta como `segundo - principal` e omite qualquer
diferença cuja fonte esteja indisponível. A comparação não cria pontuação geral
nem declara um vencedor.

## Desenvolvimento

```bash
npm ci
npm run dev
```

Acesse `http://localhost:3000` ou abra diretamente um perfil com
`http://localhost:3000/?login=octocat`.

## Verificação

```bash
npm run lint
npx tsc --noEmit
npm test
npm audit --omit=dev
```

## Limites conhecidos

O GitHub não oferece uma API oficial de conquistas. Por isso, a aplicação
lê somente selos exibidos publicamente. Contadores privados não são expostos;
para conquistas sem contador público, o painel usa o menor valor confirmado
pelo nível visível. Selos que o Constellation ainda não conhece também são
exibidos, mas ficam explicitamente sem critério ou estimativa de progresso.
