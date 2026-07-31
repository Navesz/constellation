# Como contribuir

Constellation aceita melhorias pequenas, verificáveis e orientadas à utilidade
real de quem acompanha um perfil do GitHub.

## Fluxo

1. Crie uma branch curta a partir de `main`.
2. Faça commits descritivos e focados.
3. Execute lint, tipos, testes e auditoria das dependências de produção.
4. Abra um pull request explicando o impacto para o produto e a verificação.
5. Mescle somente depois que o CI estiver aprovado.

## Coautoria legítima (Pair Extraordinaire)

A conquista **Pair Extraordinaire** conta commits com coautoria em pull requests **mesclados**
em repositórios **públicos**. Terminal, interface web e agentes contam igual — o que importa é o
PR mergeado na branch padrão.

Use o trailer no fim da mensagem de commit:

```text
Co-authored-by: Nome do Parceiro <id+usuario@users.noreply.github.com>
```

Regras:

- Registre coautoria só quando a pessoa **contribuiu de verdade** (pair programming, revisão
  substancial, sugestão aceita via GitHub).
- O e-mail deve corresponder à conta GitHub do coautor (use o `users.noreply.github.com` do perfil).
- Repositórios **privados** normalmente **não** contam nas conquistas, mesmo com muitos merges.

Este guia foi revisado com [@ElssoM](https://github.com/ElssoM) para deixar o fluxo claro para
quem colabora em projetos de estudo e portfólio.

## Integridade dos dados

- Nunca converta uma fonte indisponível em zero.
- Diferencie valores medidos de mínimos inferidos por um selo visível.
- Não incentive estrelas combinadas, atividade vazia ou respostas artificiais.
- Não registre tokens do GitHub, dados privados ou histórico local no repositório.
