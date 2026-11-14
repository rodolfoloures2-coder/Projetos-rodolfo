# Estoque & Custos · Rainha do Alho (versão de teste)

Sistema simples de controle de estoque com calculadora de custo e preço embutida.
É um único arquivo `index.html`: é só abrir no navegador, sem precisar instalar nada.

## O que faz

- **Insumos**: alho in natura, cebola, potes, baldes, rótulos… com estoque, mínimo e custo por unidade.
- **Produtos**: cada produto tem uma *receita* (quanto de cada insumo vai em 1 unidade) + mão de obra. O custo é calculado sozinho.
- **Movimentar**:
  - *Produção* — baixa os insumos da receita e soma o produto pronto (avisa se faltar insumo).
  - *Venda* — tira do estoque e estima o lucro.
  - *Compra de insumo* — soma no estoque e atualiza o **custo médio**.
  - *Ajustes / perdas*.
- **Calculadora de preço**: composição do custo, preço sugerido pela margem desejada, preço mínimo, margem do preço atual e simulação para todos os produtos.
- **Painel**: valor do estoque, itens abaixo do mínimo, margem por produto.
- **Backup**: exportar/importar `.json` e exportar histórico em CSV.

## Fórmula do preço sugerido

```
preço = custo ÷ (1 − (impostos% + comissão% + despesas% + margem%) ÷ 100)
```

A margem é sobre o preço de venda, já descontando impostos, comissões e despesas.

## Observações

- Os dados ficam salvos **no navegador** (localStorage). Trocar de navegador/computador = usar o backup.
- Os valores iniciais são **exemplos fictícios** — troque pelos custos reais.
