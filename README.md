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

Cada auditoria tem uma URL compartilhável no formato `/?login=octocat`. O
painel também separa contagens medidas pela API de mínimos confirmados pelo
nível do selo, para não apresentar estimativas como valores exatos.

O mesmo retrato pode ser baixado como um relatório Markdown portátil, incluindo
fontes indisponíveis e a comparação carregada. O arquivo nunca inclui o
histórico local do navegador, por isso pode ser anexado a documentação, perfis
profissionais ou arquivos pessoais sem transportar essa memória privada.

Como o GitHub permite ocultar todas as conquistas ou somente um selo, a ausência
de um badge público nunca é tratada como contador zero. Nesses casos, cartões e
comparações mostram progresso não público, e a próxima missão considera apenas
sinais medidos ou mínimos efetivamente confirmados.

O perfil público é a única fonte obrigatória. Se a busca de pull requests, a
lista de repositórios ou a leitura dos selos falhar temporariamente, a auditoria
continua com os dados disponíveis e identifica cada lacuna em vez de exibir
zeros enganosos.

Auditorias completas também formam um histórico local com até 12 estados por
perfil e oito perfis recentes. Essa memória fica somente no navegador, não é
incluída nos links compartilhados e pode ser apagada por perfil na interface.
Leituras parciais nunca substituem uma linha de base completa. A linha do tempo
mostra todas as observações distintas, seus quatro sinais e a mudança desde o
estado anterior.

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
