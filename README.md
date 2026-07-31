# Constellation

Constellation é um observatório público de perfis do GitHub. A aplicação
combina dados da API pública com as conquistas visíveis no perfil para mostrar:

- conquistas desbloqueadas e seus níveis;
- progresso conhecido para o próximo marco;
- pull requests públicos mesclados;
- repositório autoral com mais estrelas;
- uma próxima ação legítima, sem incentivar spam.

## Desenvolvimento

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`.

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
