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
