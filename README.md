# Constellation

Constellation é um observatório público de perfis do GitHub. A aplicação
combina dados da API pública com as conquistas visíveis no perfil para mostrar:

- conquistas desbloqueadas e seus níveis;
- progresso conhecido para o próximo marco;
- pull requests públicos mesclados;
- repositório autoral com mais estrelas;
- uma próxima ação legítima, sem incentivar spam.

Cada auditoria tem uma URL compartilhável no formato `/?login=octocat`. O
painel também separa contagens medidas pela API de mínimos confirmados pelo
nível do selo, para não apresentar estimativas como valores exatos.

O perfil público é a única fonte obrigatória. Se a busca de pull requests, a
lista de repositórios ou a leitura dos selos falhar temporariamente, a auditoria
continua com os dados disponíveis e identifica cada lacuna em vez de exibir
zeros enganosos.

Auditorias completas também formam um histórico local com até 12 estados por
perfil e oito perfis recentes. Essa memória fica somente no navegador, não é
incluída nos links compartilhados e pode ser apagada por perfil na interface.
Leituras parciais nunca substituem uma linha de base completa.

Um segundo perfil pode ser adicionado para comparação. A URL preserva os dois
logins, o painel calcula o delta como `segundo - principal` e omite qualquer
diferença cuja fonte esteja indisponível. A comparação não cria pontuação geral
nem declara um vencedor.

## Desenvolvimento

```bash
npm install
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
pelo nível visível.
