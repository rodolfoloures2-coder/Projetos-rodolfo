# Sistema Rainha do Alho

Sistema interno da Rainha do Alho para **estoque, produção com lotes e validade, pedidos e custos e preços**.
Funciona no computador e no celular (dá para instalar como app), com login e níveis de acesso.

- **Banco de dados e login:** [Supabase](https://supabase.com) (plano grátis)
- **Site:** [Netlify](https://netlify.com) (onde já está o rainhadoalho.com)
- Sem build: é HTML + JavaScript puro, na pasta `app/`

```
sistema-rainha-do-alho/
├── app/                 ← o site (é esta pasta que vai para a Netlify)
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── config.js        ← cole aqui a URL e a chave do Supabase
│   ├── manifest.webmanifest, sw.js, icons/   (para instalar como app)
└── supabase/
    ├── schema.sql       ← cria tabelas, segurança e funções (rodar 1x)
    └── seed.sql         ← opcional: cadastra os produtos e insumos da Rainha do Alho
```

## O que o sistema faz

| Tela | O que tem |
|---|---|
| **Painel** | Pedidos em aberto, próximas entregas, lotes vencendo, produtos e insumos abaixo do mínimo. Admin vê também valor do estoque e margem média. |
| **Pedidos** | Cria pedido (cliente, telefone, itens, preço, data de entrega). Fluxo **Aberto → Separado → Entregue**. Ao **separar**, o estoque é baixado automaticamente pelos **lotes que vencem primeiro** (lotes vencidos não saem). Cancelar um pedido separado devolve para os mesmos lotes. Botão para mandar o resumo no WhatsApp do cliente. |
| **Estoque e lotes** | Estoque de cada produto pronto, quanto vence em 15 dias, quanto está vencido. Clicando, vê os lotes (código, fabricação, validade, saldo) e faz ajustes (quebra, descarte, contagem). |
| **Produção** | Registra produção → cria um **lote** com validade (calculada pelos dias de validade do produto) e **baixa os insumos da receita**. Avisa se faltar insumo. Admin pode lançar *estoque inicial* sem baixar insumos. |
| **Insumos** | Estoque de matéria-prima e embalagens. **Compra** (atualiza o custo médio) e **Ajuste**. |
| **Histórico** | Toda movimentação, com quem fez e quando. Exporta CSV (abre no Excel). |
| **Custos e preços** (admin) | Custo de cada produto (receita × custo médio + mão de obra), preço sugerido pela margem desejada, preço mínimo, margem do preço atual, simulação de todos os produtos e botão para aplicar o preço. |
| **Cadastros** (admin) | Produtos (preço, mínimo, validade, mão de obra, receita) e insumos (unidade, custo, mínimo). Desativar em vez de apagar, para não perder o histórico. |
| **Usuários** (admin) | Libera quem criou conta e define o nível. |

### Níveis de acesso

| | Admin | Produção | Vendas |
|---|:-:|:-:|:-:|
| Ver estoque, lotes, pedidos, histórico | ✅ | ✅ | ✅ |
| Criar / editar / cancelar pedidos | ✅ | — | ✅ |
| Separar e marcar pedido entregue | ✅ | ✅ | ✅ |
| Registrar produção, compras e ajustes | ✅ | ✅ | — |
| Ver custos, margens, calculadora | ✅ | — | — |
| Cadastros e usuários | ✅ | — | — |

A segurança está **no banco** (Row Level Security + funções que conferem o nível), não só na tela:
mesmo alguém mexendo no navegador não consegue ver custos nem alterar nada sem permissão.

---

## Como colocar no ar (≈ 15 minutos)

### 1. Criar o banco no Supabase
1. Entre em **supabase.com** → *Start your project* → crie uma conta (pode ser com o GitHub).
2. **New project** → nome `rainha-do-alho`, crie uma senha forte para o banco (guarde), região **South America (São Paulo)**.
3. Quando o projeto terminar de criar: menu **SQL Editor** → **New query** → cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
4. (Opcional, recomendado) Nova query → cole [`supabase/seed.sql`](supabase/seed.sql) → **Run**. Isso cadastra os 17 produtos e 20 insumos com receitas **de exemplo** — depois corrija custos, preços e receitas em *Cadastros*.

### 2. Pegar as chaves
**Project Settings → API** (ou botão **Connect**): copie
- **Project URL** (ex.: `https://abcd1234.supabase.co`)
- **anon public key** (um texto grande começando com `eyJ...` ou `sb_publishable_...`)

Abra `app/config.js` e cole os dois no lugar de `SEU-PROJETO` e `COLE-AQUI-A-CHAVE-ANON`.
> A chave *anon* pode ficar pública. **Nunca** use a chave `service_role` no site.

### 3. Configurar o login
**Authentication → URL Configuration**:
- **Site URL**: o endereço do sistema (ex.: `https://sistema.rainhadoalho.com`)
- **Redirect URLs**: adicione o mesmo endereço

Assim os links de confirmação de e-mail e de "esqueci minha senha" voltam para o sistema.

### 4. Publicar na Netlify
**Jeito mais fácil:** em app.netlify.com → **Add new site → Deploy manually** → arraste a pasta **`app`**.

**Jeito automático (recomendado):** **Add new site → Import from Git** → escolha este repositório →
- *Base directory*: `sistema-rainha-do-alho/app`
- *Build command*: (vazio)
- *Publish directory*: `sistema-rainha-do-alho/app`

A cada `git push`, o sistema se atualiza sozinho.

**Endereço próprio:** em *Domain management* adicione `sistema.rainhadoalho.com` (o domínio já está na Netlify).

### 5. Primeiro acesso
1. Abra o sistema → **Criar conta**. **A primeira conta criada vira Administrador.**
2. Confirme o e-mail pelo link que chegar.
3. Peça para cada funcionário criar a conta dele; depois vá em **Usuários** e escolha o nível (Produção ou Vendas).
4. Lance o estoque atual: produtos em **Produção** marcando *Estoque inicial*; insumos em **Insumos → Ajuste** (motivo *Contagem de estoque*).

### Instalar no celular
- **Android (Chrome):** abra o sistema → menu ⋮ → **Instalar app**.
- **iPhone (Safari):** botão compartilhar → **Adicionar à Tela de Início**.

---

## Fórmulas

- **Custo do produto** = Σ (quantidade do insumo na receita × custo médio do insumo) + mão de obra
- **Custo médio do insumo** (a cada compra) = (custo atual × estoque + valor pago) ÷ (estoque + quantidade comprada)
- **Preço sugerido** = custo ÷ (1 − (impostos% + comissão% + despesas% + margem%) ÷ 100)
- **Margem líquida** = (preço − custo − preço × (impostos% + comissão% + despesas%)) ÷ preço

## Dúvidas comuns

- **"Esqueci a senha"** → na tela de login, digite o e-mail e clique em *Esqueci minha senha*.
- **O e-mail de confirmação não chega** → veja o spam. O Supabase grátis manda poucos e-mails por hora; para mais, configure um SMTP em *Authentication → Emails*. Ou desligue *Confirm email* em *Authentication → Sign In / Providers → Email* (aí a conta é criada direto, mas continua "Aguardando liberação" até o admin liberar).
- **Projeto pausado** → no plano grátis, o Supabase pausa projetos sem uso por 7 dias; é só entrar no painel e clicar em *Restore*. Com uso diário isso não acontece.
- **Backup** → Supabase → *Database → Backups* (plano pago) ou exporte as tabelas em CSV pelo *Table Editor*.
