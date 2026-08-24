# Constellation

Repositório independente do observatório Constellation. O histórico do produto
foi preservado desde a primeira versão criada no laboratório de conquistas.

Constellation é um observatório público de perfis do GitHub. A aplicação
combina dados da API pública com as conquistas visíveis no perfil para mostrar:

- conquistas desbloqueadas e seus níveis;
- reconhecimentos históricos Mars 2020 e Arctic Code Vault identificados como eventos encerrados, com fontes oficiais;
- selos recém-lançados descobertos diretamente no perfil, mesmo quando ainda não fazem parte do catálogo interno;
- progresso conhecido para o próximo marco;
- seguidores, perfis seguidos e repositórios públicos;
- pull requests públicos mesclados;
- repositório autoral com mais estrelas em todo o perfil, mesmo quando existem mais de 100 projetos;
- uma próxima ação legítima, sem incentivar spam.

O mapa pode ser filtrado por conquistas visíveis, sinais com próximo marco
mensurável ou estados sem contador público. Os filtros se sobrepõem de propósito
e nunca alteram a classificação de confiança da auditoria.

A navegação por teclado oferece um salto direto sobre o menu tanto no observatório
quanto no guia da API. Depois de uma busca enviada pelo formulário principal, o foco chega ao
nome do perfil carregado ou ao erro correspondente; carregamentos iniciais e
atualizações acionadas por outros controles não deslocam o foco inesperadamente.
O formulário de comparação segue o mesmo comportamento: depois do envio, o foco
chega ao resultado lado a lado ou à falha do segundo perfil, enquanto URLs abertas
diretamente continuam sem deslocamento automático.
Preferências do sistema também são respeitadas: movimento reduzido desativa as
animações contínuas; a preferência por mais contraste reforça textos secundários,
divisórias, contornos de foco, barras de progresso e estados indisponíveis; e cores
forçadas preservam esses sinais com a paleta escolhida no sistema.

O catálogo de critérios foi revisto em 31 de julho de 2026. O próprio GitHub
mantém Achievements em prévia pública e não oferece uma API oficial nem um
contrato completo de limiares; por isso, cada cartão e relatório distingue
critérios catalogados, eventos históricos com contexto oficial e selos ainda
sem critério conhecido. A orientação de Galaxy Brain também registra que a
Community oficial deixou de conceder conquistas para conter spam, sem confundir
essa restrição com Discussions legítimas de outros projetos.

Cada conquista visível oferece um link direto para seu detalhe no GitHub, onde
o próprio GitHub pode exibir os eventos associados conforme a permissão de quem
abre a página. Esses links também acompanham o relatório Markdown e a comparação.

Cada auditoria tem uma URL compartilhável no formato `/?login=octocat`. O
botão de compartilhamento abre o menu nativo do dispositivo quando disponível;
se esse recurso falhar ou não existir, copia somente a URL canônica. Cancelamentos
e bloqueios do navegador aparecem de forma explícita, sem afirmar que algo foi
enviado. O painel também separa contagens medidas pela API de mínimos confirmados pelo
nível do selo, para não apresentar estimativas como valores exatos.

Uma leitura pode ser atualizada explicitamente em janelas de 15 segundos. Cada
janela recebe uma chave curta compartilhável pelo cache, com uma margem de relógio
limitada a cinco minutos; o servidor rejeita chaves expiradas, parâmetros extras
e valores repetidos antes de consultar o GitHub. Enquanto a nova consulta
acontece, o último resultado permanece visível; se o GitHub falhar, a interface
preserva essa leitura e identifica a falha. A atualização da comparação segue o
mesmo contrato.

O mesmo retrato pode ser baixado como um relatório Markdown portátil, incluindo
fontes indisponíveis e a comparação carregada. O arquivo nunca inclui o
histórico local do navegador, por isso pode ser anexado a documentação, perfis
profissionais ou arquivos pessoais sem transportar essa memória privada.

O retrato também pode ser baixado como HTML autocontido, pronto para abrir
offline ou imprimir. Ele não executa scripts, não carrega fontes, imagens ou
outros recursos externos e, assim como o Markdown, não inclui o histórico local.

A auditoria atual também pode ser exportada como JSON estruturado. O envelope
`constellation-audit`, atualmente na versão 2, preserva os dados públicos, os
diagnósticos de cada fonte e a comparação carregada. Campos de privacidade no
próprio arquivo registram que o histórico local não foi incluído. Essa exportação
é separada do backup JSON da memória privada do navegador. Cada arquivo informa
seu JSON Schema em `$schema`; o contrato atual fica em `GET /api/export/schema/2`,
e o contrato legado da versão 1 permanece disponível em `GET /api/export/schema/1`.
O guia em `GET /docs` também oferece um verificador de arquivos que roda somente
no navegador, aceita os dois formatos e rejeita backups ou envelopes com dados
inesperados sem fazer upload nem consultar o GitHub.
Depois da validação, o mesmo retrato pode ser recuperado localmente como relatório
Markdown, HTML autocontido ou JSON normalizado. Um arquivo legado v1 é migrado para
o contrato v2 apenas no novo download; o original permanece intocado.
O verificador exige ainda que a rota compartilhável use somente `login` e
`compare`, corresponda exatamente aos perfis embutidos e não carregue caminho,
fragmento ou credenciais. Links da origem oficial podem ser abertos diretamente;
uma origem externa legítima, como um ambiente local, fica identificada sem virar
um link confiável por acidente.

A rota `GET /api/audit?login=octocat` expõe o mesmo retrato para integrações.
Cada perfil carregado também oferece um link direto para esse JSON canônico em
uma nova aba, sem reutilizar a chave temporária de atualização nem incluir o
histórico privado do navegador.
Respostas bem-sucedidas carregam `schemaVersion: 2` no corpo e o cabeçalho
`X-Constellation-Schema-Version: 2`. A versão 2 distingue conquistas ativas,
históricas e ainda desconhecidas, além de publicar uma fonte oficial quando
disponível. O navegador valida integralmente esse
contrato antes de atualizar a interface; respostas incompletas ou de outra
versão falham de forma legível, sem produzir contagens parciais acidentais.
O JSON Schema Draft 2020-12 oficial fica em `GET /api/audit/schema/2` e também é
anunciado pelo cabeçalho `Link` de cada auditoria bem-sucedida.
Uma descrição OpenAPI 3.1.1 completa fica em `GET /api/openapi.json`; ela
documenta parâmetros, respostas, erros e referencia os JSON Schemas versionados.
OpenAPI e os schemas retornam um `ETag` fraco derivado do conteúdo. Integrações
podem reenviá-lo em `If-None-Match`; documentos inalterados respondem `304` com
corpo vazio, preservando cache, descoberta, CORS e cabeçalhos de versão.
O guia humano em `GET /docs` reúne exemplos prontos, estados de resposta,
privacidade e limites operacionais. O mesmo cabeçalho `Link` anuncia a descrição
com `service-desc`, o guia com `service-doc` e `GET /api/status` com `status`,
permitindo que pessoas e ferramentas descubram todos a partir de qualquer
resposta da auditoria. A rota de status não consulta o GitHub, responde com
`Cache-Control: no-store` e distingue explicitamente saúde da aplicação de
disponibilidade do serviço externo.
As rotas públicas aceitam `GET` entre origens com CORS explícito e respondem a
preflight `OPTIONS`; status, OpenAPI e schemas também aceitam `HEAD`, preservando
status e cabeçalhos sem transferir o corpo. A auditoria rejeita `HEAD` com `405`
antes de consultar o GitHub, evitando consumo externo acidental. `Link`,
`Retry-After` e a versão do esquema ficam expostos ao navegador junto com
`ETag`, e `If-None-Match` é aceito explicitamente.
Cada resposta da API recebe ainda `X-Constellation-Request-Id`, um UUID v4
aleatório exposto por CORS. O valor não incorpora login, parâmetros ou dados do
perfil e pode ser preservado nos logs da integração como referência operacional.
Quando a API responde com uma falha, a interface mostra essa referência junto
da mensagem; erros de rede que acontecem antes de existir uma resposta continuam
explicitamente sem identificador.
Respostas `429` usam ainda o cabeçalho HTTP `Retry-After`, além do
campo estruturado `retryAt` no corpo.
Todas as respostas preservam esses contratos enquanto aplicam proteção uniforme
contra MIME sniffing, referrer excessivo, objetos incorporados e permissões de
sensores, câmera, captura de tela, localização, microfone, pagamentos, USB e
realidade estendida. Visitas futuras também ficam fixadas em HTTPS por um ano.
A política de conteúdo e o cabeçalho de compatibilidade
também impedem que o observatório seja enquadrado por outra página, reduzindo o
risco de clickjacking. O compartilhamento nativo continua permitido somente para
a própria origem. A metadata social aceita somente a origem oficial ou loopback
explícito, sem refletir hosts encaminhados desconhecidos.

Como o GitHub permite ocultar todas as conquistas ou somente um selo, a ausência
de um badge público nunca é tratada como contador zero. Nesses casos, cartões e
comparações mostram progresso não público, e a próxima missão considera apenas
sinais medidos ou mínimos efetivamente confirmados.
O leitor aceita links de selo mesmo quando o GitHub muda a ordem dos parâmetros,
mas valida origem, perfil, aba e identificador antes de registrar a conquista;
links parecidos fora do perfil auditado são ignorados.

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
incluída nos links compartilhados e pode ser apagada por perfil ou por completo
na interface. As duas exclusões exigem confirmação; a limpeza total também pausa
novas gravações para que a memória não seja recriada sem uma decisão explícita.
Novas gravações podem ser pausadas e retomadas com uma preferência persistida
somente no dispositivo; pausar preserva tudo que já foi salvo, enquanto retomar
registra imediatamente a leitura atual quando ela estiver completa.
Leituras parciais nunca substituem uma linha de base completa. A linha do tempo
mostra todas as observações distintas, seus seis sinais — seguidores, perfis
seguidos, selos, PRs, estrelas e repositórios — e a mudança desde o estado
anterior. Leituras antigas são migradas sem inventar a contagem de perfis
seguidos quando esse campo ainda não era preservado.

Quando existem pelo menos dois perfis nessa memória, o painel mostra órbitas
recentes ordenadas pela última observação, com um resumo dos seis sinais e
acesso direto para remapear cada login. Esses atalhos são carregados antes da
consulta atual e continuam disponíveis quando o GitHub ou a API falha; a tela de
erro também permite tentar novamente sem apagar nem regravar a memória privada.
Os logins dessa mesma memória aparecem ainda como sugestões nativas nos campos
de busca e comparação. A seleção continua local até o formulário ser enviado,
e navegadores sem suporte mantêm os campos de texto normais.

Essa memória também pode ser baixada explicitamente como um backup JSON e
restaurada em outro navegador. A importação valida o formato, mescla estados
sem apagar observações mais recentes e reaplica os mesmos limites de retenção.
Esse arquivo é separado do relatório Markdown público.

A linha do tempo do perfil aberto também pode ser baixada como CSV em ordem
cronológica, com métricas, mudanças desde a leitura anterior e os selos visíveis.
O arquivo é local e inclui somente o perfil selecionado, pronto para planilhas.

Backups atuais usam a versão 3 e incluem seguidores e perfis seguidos. Arquivos
das versões 1 e 2 continuam aceitos; sinais que ainda não existiam em cada
formato permanecem indisponíveis até que duas novas leituras permitam calcular
uma mudança honesta.

Um segundo perfil pode ser adicionado para comparação. A URL preserva os dois
logins, o painel calcula o delta como `segundo - principal` e omite qualquer
diferença cuja fonte esteja indisponível. A comparação não cria pontuação geral
nem declara um vencedor. O controle “Inverter perfis” troca a referência,
recalcula o sentido dos deltas e atualiza a URL; as leituras já carregadas mudam
de posição imediatamente enquanto a aplicação confirma novamente os dados públicos.
Seguidores, perfis seguidos e repositórios públicos aparecem lado a lado como
contagens neutras; nenhum deles é interpretado isoladamente como qualidade ou vitória.
A comparação também pode ser baixada como CSV, com as cinco métricas públicas,
os deltas e o estado de cada conquista para os dois perfis. Sinais indisponíveis
permanecem vazios no arquivo em vez de serem convertidos em zero, e textos são
neutralizados antes de chegar a uma planilha para não serem interpretados como fórmulas.

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

## Colaboradores

Veja [CONTRIBUTORS.md](./CONTRIBUTORS.md).

## Limites conhecidos

O GitHub não oferece uma API oficial de conquistas. Por isso, a aplicação
lê somente selos exibidos publicamente. Contadores privados não são expostos;
para conquistas sem contador público, o painel usa o menor valor confirmado
pelo nível visível. Selos que o Constellation ainda não conhece também são
exibidos, mas ficam explicitamente sem critério ou estimativa de progresso.
