-- =====================================================================
--  Sistema Rainha do Alho · Estoque, Lotes, Pedidos, Custos e Preços
--  Rode este arquivo inteiro no Supabase: SQL Editor → New query → Run
-- =====================================================================
--  Papéis (profiles.papel):
--    admin    → tudo: cadastros, custos, preços, calculadora, usuários
--    producao → produção (gera lotes), compras e ajustes de estoque, separar/entregar pedidos
--    vendas   → pedidos (criar, editar, separar, entregar, cancelar)
--    pendente → acabou de se cadastrar; não vê nada até um admin liberar
--  O PRIMEIRO usuário que se cadastrar vira admin automaticamente.
--
--  Custos (de insumos, mão de obra, compras e percentuais) ficam em tabelas
--  que só o admin consegue ler. Toda alteração de estoque passa por funções
--  que conferem o papel de quem chamou e gravam o histórico.
-- =====================================================================

-- ---------- PERFIS / PAPÉIS ----------
create table if not exists public.profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  nome      text not null default '',
  email     text,
  papel     text not null default 'pendente' check (papel in ('admin','producao','vendas','pendente')),
  criado_em timestamptz not null default now()
);

create or replace function public.meu_papel()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select papel from public.profiles where id = auth.uid()), 'anon');
$$;

create or replace function public.tem_papel(variadic papeis text[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.meu_papel() = any(papeis);
$$;

create or replace function public.ativo()
returns boolean language sql stable security definer set search_path = public as $$
  select public.meu_papel() in ('admin','producao','vendas');
$$;

create or replace function public.nome_usuario(p_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select nome from public.profiles where id = p_id and public.ativo();
$$;

-- cria o perfil quando alguém se cadastra; o primeiro vira admin
create or replace function public.novo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(4242);
  insert into public.profiles (id, nome, email, papel)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.email,
    case when exists (select 1 from public.profiles) then 'pendente' else 'admin' end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.novo_usuario();

-- ---------- CADASTROS ----------
create table if not exists public.insumos (
  id        bigint generated always as identity primary key,
  nome      text not null,
  unidade   text not null default 'kg',
  estoque   numeric(14,4) not null default 0,
  minimo    numeric(14,4) not null default 0,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.insumo_custos (          -- só admin
  insumo_id bigint primary key references public.insumos(id) on delete cascade,
  custo     numeric(14,4) not null default 0             -- custo médio por unidade
);

create table if not exists public.produtos (
  id            bigint generated always as identity primary key,
  nome          text not null,
  preco         numeric(14,2) not null default 0,         -- preço de venda
  minimo        numeric(14,4) not null default 0,         -- estoque mínimo (un.)
  validade_dias int not null default 90,                  -- validade padrão do lote
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

create table if not exists public.produto_custos (         -- só admin
  produto_id bigint primary key references public.produtos(id) on delete cascade,
  mao_obra   numeric(14,4) not null default 0             -- mão de obra por unidade
);

create table if not exists public.receitas (               -- insumos por 1 unidade de produto
  produto_id bigint not null references public.produtos(id) on delete cascade,
  insumo_id  bigint not null references public.insumos(id),
  quantidade numeric(14,4) not null check (quantidade > 0),
  primary key (produto_id, insumo_id)
);

create table if not exists public.config (                 -- só admin
  id        int primary key default 1 check (id = 1),
  impostos  numeric(6,2) not null default 6,
  comissao  numeric(6,2) not null default 3,
  despesas  numeric(6,2) not null default 10,
  margem    numeric(6,2) not null default 20
);
insert into public.config (id) values (1) on conflict do nothing;

-- ---------- LOTES ----------
create table if not exists public.lotes (
  id                 bigint generated always as identity primary key,
  codigo             text unique,
  produto_id         bigint not null references public.produtos(id),
  quantidade_inicial numeric(14,4) not null,
  saldo              numeric(14,4) not null check (saldo >= 0),
  fabricacao         date not null default current_date,
  validade           date not null,
  observacao         text,
  criado_por         uuid references auth.users(id) on delete set null,
  criado_em          timestamptz not null default now()
);
create index if not exists lotes_produto_idx on public.lotes (produto_id, validade) where saldo > 0;

-- ---------- PEDIDOS ----------
create table if not exists public.pedidos (
  id            bigint generated always as identity primary key,
  cliente       text not null,
  telefone      text,
  endereco      text,
  observacao    text,
  data_entrega  date,
  status        text not null default 'aberto' check (status in ('aberto','separado','entregue','cancelado')),
  criado_por    uuid references auth.users(id) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.pedido_itens (
  id         bigint generated always as identity primary key,
  pedido_id  bigint not null references public.pedidos(id) on delete cascade,
  produto_id bigint not null references public.produtos(id),
  quantidade numeric(14,4) not null check (quantidade > 0),
  preco_unit numeric(14,2) not null default 0
);

create table if not exists public.pedido_item_lotes (       -- de qual lote saiu cada item
  id             bigint generated always as identity primary key,
  pedido_item_id bigint not null references public.pedido_itens(id) on delete cascade,
  lote_id        bigint not null references public.lotes(id),
  quantidade     numeric(14,4) not null
);

-- ---------- HISTÓRICO ----------
create table if not exists public.movimentos (
  id         bigint generated always as identity primary key,
  data       timestamptz not null default now(),
  tipo       text not null,  -- producao | consumo_producao | compra | ajuste_insumo | ajuste_lote | saida_pedido | estorno_pedido
  insumo_id  bigint references public.insumos(id),
  produto_id bigint references public.produtos(id),
  lote_id    bigint references public.lotes(id),
  pedido_id  bigint references public.pedidos(id),
  quantidade numeric(14,4) not null,
  observacao text,
  usuario    uuid references auth.users(id) on delete set null,
  usuario_nome text
);
create index if not exists movimentos_data_idx on public.movimentos (data desc);

create table if not exists public.compras (                -- só admin (tem valores)
  id          bigint generated always as identity primary key,
  data        timestamptz not null default now(),
  insumo_id   bigint not null references public.insumos(id),
  quantidade  numeric(14,4) not null,
  valor_total numeric(14,2) not null default 0,
  observacao  text,
  usuario     uuid references auth.users(id) on delete set null
);

-- ---------- VIEWS ----------
create or replace view public.v_produtos with (security_invoker = true) as
select p.*,
  coalesce(sum(l.saldo), 0)                                                    as estoque,
  coalesce(sum(l.saldo) filter (where l.validade < current_date), 0)           as vencido,
  coalesce(sum(l.saldo) filter (where l.validade between current_date and current_date + 15), 0) as vence_15d,
  min(l.validade) filter (where l.saldo > 0 and l.validade >= current_date)    as proxima_validade
from public.produtos p
left join public.lotes l on l.produto_id = p.id and l.saldo > 0
group by p.id;

create or replace view public.v_pedidos with (security_invoker = true) as
select pd.*,
  coalesce((select sum(i.quantidade * i.preco_unit) from public.pedido_itens i where i.pedido_id = pd.id), 0) as total,
  (select count(*) from public.pedido_itens i where i.pedido_id = pd.id) as qtd_itens,
  public.nome_usuario(pd.criado_por) as criado_por_nome
from public.pedidos pd;

-- ---------- SEGURANÇA (RLS) ----------
alter table public.profiles          enable row level security;
alter table public.insumos           enable row level security;
alter table public.insumo_custos     enable row level security;
alter table public.produtos          enable row level security;
alter table public.produto_custos    enable row level security;
alter table public.receitas          enable row level security;
alter table public.config            enable row level security;
alter table public.lotes             enable row level security;
alter table public.pedidos           enable row level security;
alter table public.pedido_itens      enable row level security;
alter table public.pedido_item_lotes enable row level security;
alter table public.movimentos        enable row level security;
alter table public.compras           enable row level security;

-- leitura para quem está liberado; escrita só pelas funções abaixo
drop policy if exists ler on public.profiles;
create policy ler on public.profiles for select to authenticated using (id = auth.uid() or public.tem_papel('admin'));

drop policy if exists ler on public.insumos;           create policy ler on public.insumos           for select to authenticated using (public.ativo());
drop policy if exists ler on public.produtos;          create policy ler on public.produtos          for select to authenticated using (public.ativo());
drop policy if exists ler on public.receitas;          create policy ler on public.receitas          for select to authenticated using (public.ativo());
drop policy if exists ler on public.lotes;             create policy ler on public.lotes             for select to authenticated using (public.ativo());
drop policy if exists ler on public.pedidos;           create policy ler on public.pedidos           for select to authenticated using (public.ativo());
drop policy if exists ler on public.pedido_itens;      create policy ler on public.pedido_itens      for select to authenticated using (public.ativo());
drop policy if exists ler on public.pedido_item_lotes; create policy ler on public.pedido_item_lotes for select to authenticated using (public.ativo());
drop policy if exists ler on public.movimentos;        create policy ler on public.movimentos        for select to authenticated using (public.ativo());

drop policy if exists admin_ler on public.insumo_custos;  create policy admin_ler on public.insumo_custos  for select to authenticated using (public.tem_papel('admin'));
drop policy if exists admin_ler on public.produto_custos; create policy admin_ler on public.produto_custos for select to authenticated using (public.tem_papel('admin'));
drop policy if exists admin_ler on public.config;         create policy admin_ler on public.config         for select to authenticated using (public.tem_papel('admin'));
drop policy if exists admin_ler on public.compras;        create policy admin_ler on public.compras        for select to authenticated using (public.tem_papel('admin'));

-- ---------- FUNÇÕES ----------
create or replace function public._exigir(variadic papeis text[])
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.meu_papel() = any(papeis) then
    raise exception 'Sem permissão para esta ação.' using errcode = '42501';
  end if;
end $$;

create or replace function public._meu_nome()
returns text language sql stable security definer set search_path = public as $$
  select nome from public.profiles where id = auth.uid();
$$;

-- Usuários ------------------------------------------------------------
create or replace function public.definir_papel(p_usuario uuid, p_papel text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._exigir('admin');
  if p_papel not in ('admin','producao','vendas','pendente') then raise exception 'Papel inválido.'; end if;
  if p_papel <> 'admin' and (select papel from profiles where id = p_usuario) = 'admin'
     and (select count(*) from profiles where papel = 'admin') <= 1 then
    raise exception 'Precisa existir pelo menos um admin.';
  end if;
  update profiles set papel = p_papel where id = p_usuario;
end $$;

create or replace function public.atualizar_meu_nome(p_nome text)
returns void language sql security definer set search_path = public as $$
  update public.profiles set nome = trim(p_nome) where id = auth.uid() and trim(p_nome) <> '';
$$;

-- Cadastros (admin) ------------------------------------------------------
create or replace function public.salvar_insumo(
  p_id bigint, p_nome text, p_unidade text, p_minimo numeric, p_custo numeric,
  p_ativo boolean default true, p_estoque_inicial numeric default 0)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  perform public._exigir('admin');
  if coalesce(trim(p_nome),'') = '' then raise exception 'Informe o nome do insumo.'; end if;
  if p_id is null then
    insert into insumos (nome, unidade, minimo, estoque, ativo)
    values (trim(p_nome), p_unidade, coalesce(p_minimo,0), coalesce(p_estoque_inicial,0), coalesce(p_ativo,true))
    returning id into v_id;
    if coalesce(p_estoque_inicial,0) <> 0 then
      insert into movimentos (tipo, insumo_id, quantidade, observacao, usuario, usuario_nome)
      values ('ajuste_insumo', v_id, p_estoque_inicial, 'Estoque inicial', auth.uid(), _meu_nome());
    end if;
  else
    update insumos set nome = trim(p_nome), unidade = p_unidade, minimo = coalesce(p_minimo,0), ativo = coalesce(p_ativo,true)
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Insumo não encontrado.'; end if;
  end if;
  insert into insumo_custos (insumo_id, custo) values (v_id, coalesce(p_custo,0))
  on conflict (insumo_id) do update set custo = excluded.custo;
  return v_id;
end $$;

-- p_receita: [{"insumo_id": 1, "quantidade": 1.3}, ...]
create or replace function public.salvar_produto(
  p_id bigint, p_nome text, p_preco numeric, p_minimo numeric, p_validade_dias int,
  p_mao_obra numeric, p_receita jsonb, p_ativo boolean default true)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  perform public._exigir('admin');
  if coalesce(trim(p_nome),'') = '' then raise exception 'Informe o nome do produto.'; end if;
  if p_id is null then
    insert into produtos (nome, preco, minimo, validade_dias, ativo)
    values (trim(p_nome), coalesce(p_preco,0), coalesce(p_minimo,0), coalesce(p_validade_dias,90), coalesce(p_ativo,true))
    returning id into v_id;
  else
    update produtos set nome = trim(p_nome), preco = coalesce(p_preco,0), minimo = coalesce(p_minimo,0),
      validade_dias = coalesce(p_validade_dias,90), ativo = coalesce(p_ativo,true)
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Produto não encontrado.'; end if;
  end if;
  insert into produto_custos (produto_id, mao_obra) values (v_id, coalesce(p_mao_obra,0))
  on conflict (produto_id) do update set mao_obra = excluded.mao_obra;
  delete from receitas where produto_id = v_id;
  insert into receitas (produto_id, insumo_id, quantidade)
  select v_id, (r->>'insumo_id')::bigint, sum((r->>'quantidade')::numeric)
  from jsonb_array_elements(coalesce(p_receita,'[]'::jsonb)) r
  where (r->>'quantidade')::numeric > 0
  group by (r->>'insumo_id')::bigint;
  return v_id;
end $$;

create or replace function public.atualizar_preco(p_produto bigint, p_preco numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._exigir('admin');
  if p_preco < 0 then raise exception 'Preço inválido.'; end if;
  update produtos set preco = round(p_preco, 2) where id = p_produto;
end $$;

create or replace function public.salvar_config(p_impostos numeric, p_comissao numeric, p_despesas numeric, p_margem numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._exigir('admin');
  if p_impostos + p_comissao + p_despesas + p_margem >= 100 then raise exception 'A soma dos percentuais precisa ser menor que 100%%.'; end if;
  update config set impostos = p_impostos, comissao = p_comissao, despesas = p_despesas, margem = p_margem where id = 1;
end $$;

-- Estoque (admin, produção) ---------------------------------------------
create or replace function public.registrar_producao(
  p_produto bigint, p_quantidade numeric, p_fabricacao date default null, p_validade date default null,
  p_codigo text default null, p_observacao text default null, p_permitir_negativo boolean default false,
  p_sem_consumir boolean default false)   -- true = estoque inicial / lote antigo: não baixa insumos (só admin)
returns public.lotes language plpgsql security definer set search_path = public as $$
declare
  v_prod produtos; v_lote lotes; r record; v_falta text := '';
  v_fab date := coalesce(p_fabricacao, current_date);
begin
  perform public._exigir('admin','producao');
  if coalesce(p_quantidade,0) <= 0 then raise exception 'Informe uma quantidade maior que zero.'; end if;
  select * into v_prod from produtos where id = p_produto;
  if not found then raise exception 'Produto não encontrado.'; end if;
  if p_sem_consumir and not public.tem_papel('admin') then raise exception 'Só o admin pode lançar estoque inicial.'; end if;

  -- trava os insumos da receita e confere se tem o suficiente
  for r in
    select i.id, i.nome, i.unidade, i.estoque, rc.quantidade * p_quantidade as precisa
    from receitas rc join insumos i on i.id = rc.insumo_id
    where rc.produto_id = p_produto order by i.id for update of i
  loop
    if r.estoque < r.precisa then
      v_falta := v_falta || format(E'\n• %s: precisa %s %s, tem %s', r.nome, round(r.precisa,3), r.unidade, round(r.estoque,3));
    end if;
  end loop;
  if v_falta <> '' and not p_permitir_negativo and not p_sem_consumir then
    raise exception 'Insumo insuficiente:%', v_falta using errcode = 'P0001', hint = 'FALTA_INSUMO';
  end if;

  insert into lotes (codigo, produto_id, quantidade_inicial, saldo, fabricacao, validade, observacao, criado_por)
  values (nullif(trim(p_codigo),''), p_produto, p_quantidade, p_quantidade, v_fab,
          coalesce(p_validade, v_fab + v_prod.validade_dias), p_observacao, auth.uid())
  returning * into v_lote;
  if v_lote.codigo is null then
    update lotes set codigo = 'L' || to_char(v_fab,'YYMMDD') || '-' || v_lote.id where id = v_lote.id returning * into v_lote;
  end if;

  if not p_sem_consumir then
    update insumos i set estoque = i.estoque - rc.quantidade * p_quantidade
    from receitas rc where rc.produto_id = p_produto and rc.insumo_id = i.id;

    insert into movimentos (tipo, insumo_id, lote_id, quantidade, observacao, usuario, usuario_nome)
    select 'consumo_producao', rc.insumo_id, v_lote.id, -(rc.quantidade * p_quantidade), 'Produção ' || v_lote.codigo, auth.uid(), _meu_nome()
    from receitas rc where rc.produto_id = p_produto;
  end if;

  insert into movimentos (tipo, produto_id, lote_id, quantidade, observacao, usuario, usuario_nome)
  values (case when p_sem_consumir then 'estoque_inicial' else 'producao' end, p_produto, v_lote.id, p_quantidade,
          p_observacao, auth.uid(), _meu_nome());
  return v_lote;
end $$;

create or replace function public.registrar_compra(p_insumo bigint, p_quantidade numeric, p_valor_total numeric, p_observacao text default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_est numeric; v_custo numeric; v_novo numeric;
begin
  perform public._exigir('admin','producao');
  if coalesce(p_quantidade,0) <= 0 then raise exception 'Informe uma quantidade maior que zero.'; end if;
  select estoque into v_est from insumos where id = p_insumo for update;
  if not found then raise exception 'Insumo não encontrado.'; end if;
  select custo into v_custo from insumo_custos where insumo_id = p_insumo;
  v_custo := coalesce(v_custo, 0);
  if coalesce(p_valor_total,0) > 0 then
    v_novo := (v_custo * greatest(v_est,0) + p_valor_total) / (greatest(v_est,0) + p_quantidade);
    insert into insumo_custos (insumo_id, custo) values (p_insumo, v_novo)
    on conflict (insumo_id) do update set custo = excluded.custo;
  else
    v_novo := v_custo;
  end if;
  update insumos set estoque = estoque + p_quantidade where id = p_insumo;
  insert into compras (insumo_id, quantidade, valor_total, observacao, usuario)
  values (p_insumo, p_quantidade, coalesce(p_valor_total,0), p_observacao, auth.uid());
  insert into movimentos (tipo, insumo_id, quantidade, observacao, usuario, usuario_nome)
  values ('compra', p_insumo, p_quantidade, p_observacao, auth.uid(), _meu_nome());
  -- só o admin recebe o custo de volta
  return case when public.tem_papel('admin') then v_novo else null end;
end $$;

create or replace function public.ajustar_insumo(p_insumo bigint, p_delta numeric, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_est numeric;
begin
  perform public._exigir('admin','producao');
  if coalesce(p_delta,0) = 0 then raise exception 'Informe a quantidade do ajuste.'; end if;
  if coalesce(trim(p_motivo),'') = '' then raise exception 'Informe o motivo do ajuste.'; end if;
  select estoque into v_est from insumos where id = p_insumo for update;
  if not found then raise exception 'Insumo não encontrado.'; end if;
  if v_est + p_delta < 0 then raise exception 'O estoque ficaria negativo (atual: %).', round(v_est,3); end if;
  update insumos set estoque = estoque + p_delta where id = p_insumo;
  insert into movimentos (tipo, insumo_id, quantidade, observacao, usuario, usuario_nome)
  values ('ajuste_insumo', p_insumo, p_delta, p_motivo, auth.uid(), _meu_nome());
end $$;

create or replace function public.ajustar_lote(p_lote bigint, p_delta numeric, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_l lotes;
begin
  perform public._exigir('admin','producao');
  if coalesce(p_delta,0) = 0 then raise exception 'Informe a quantidade do ajuste.'; end if;
  if coalesce(trim(p_motivo),'') = '' then raise exception 'Informe o motivo do ajuste.'; end if;
  select * into v_l from lotes where id = p_lote for update;
  if not found then raise exception 'Lote não encontrado.'; end if;
  if v_l.saldo + p_delta < 0 then raise exception 'O lote ficaria negativo (saldo: %).', round(v_l.saldo,3); end if;
  update lotes set saldo = saldo + p_delta where id = p_lote;
  insert into movimentos (tipo, produto_id, lote_id, quantidade, observacao, usuario, usuario_nome)
  values ('ajuste_lote', v_l.produto_id, p_lote, p_delta, p_motivo, auth.uid(), _meu_nome());
end $$;

-- Pedidos (admin, vendas; separar/entregar também produção) ---------------
-- p_itens: [{"produto_id": 1, "quantidade": 2, "preco_unit": 39.9}, ...]  (preco_unit opcional)
create or replace function public.salvar_pedido(
  p_id bigint, p_cliente text, p_telefone text, p_endereco text, p_observacao text,
  p_data_entrega date, p_itens jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_status text;
begin
  perform public._exigir('admin','vendas');
  if coalesce(trim(p_cliente),'') = '' then raise exception 'Informe o cliente.'; end if;
  if jsonb_array_length(coalesce(p_itens,'[]'::jsonb)) = 0 then raise exception 'Adicione pelo menos um produto.'; end if;
  if p_id is null then
    insert into pedidos (cliente, telefone, endereco, observacao, data_entrega, criado_por)
    values (trim(p_cliente), p_telefone, p_endereco, p_observacao, p_data_entrega, auth.uid())
    returning id into v_id;
  else
    select status into v_status from pedidos where id = p_id for update;
    if not found then raise exception 'Pedido não encontrado.'; end if;
    if v_status <> 'aberto' then raise exception 'Só dá para editar pedidos em aberto.'; end if;
    update pedidos set cliente = trim(p_cliente), telefone = p_telefone, endereco = p_endereco,
      observacao = p_observacao, data_entrega = p_data_entrega, atualizado_em = now()
    where id = p_id;
    delete from pedido_itens where pedido_id = p_id;
    v_id := p_id;
  end if;
  insert into pedido_itens (pedido_id, produto_id, quantidade, preco_unit)
  select v_id, (it->>'produto_id')::bigint, (it->>'quantidade')::numeric,
         coalesce(nullif(it->>'preco_unit','')::numeric, p.preco)
  from jsonb_array_elements(p_itens) it
  join produtos p on p.id = (it->>'produto_id')::bigint
  where (it->>'quantidade')::numeric > 0;
  if not exists (select 1 from pedido_itens where pedido_id = v_id) then
    raise exception 'Adicione pelo menos um produto com quantidade.';
  end if;
  return v_id;
end $$;

-- baixa o estoque pelos lotes que vencem primeiro (FEFO), ignorando lotes vencidos
create or replace function public.separar_pedido(p_pedido bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text; it record; l record; v_resta numeric; v_tira numeric; v_falta text := '';
begin
  perform public._exigir('admin','vendas','producao');
  select status into v_status from pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if v_status <> 'aberto' then raise exception 'Este pedido não está em aberto.'; end if;

  -- confere disponibilidade de tudo antes de mexer
  for it in
    select p.nome, sum(i.quantidade) as qtd,
      (select coalesce(sum(saldo),0) from lotes where produto_id = i.produto_id and saldo > 0 and validade >= current_date) as disp
    from pedido_itens i join produtos p on p.id = i.produto_id
    where i.pedido_id = p_pedido group by i.produto_id, p.nome
  loop
    if it.disp < it.qtd then
      v_falta := v_falta || format(E'\n• %s: pedido %s, disponível %s', it.nome, round(it.qtd,3), round(it.disp,3));
    end if;
  end loop;
  if v_falta <> '' then raise exception 'Estoque insuficiente (lotes dentro da validade):%', v_falta; end if;

  for it in select * from pedido_itens where pedido_id = p_pedido order by id loop
    v_resta := it.quantidade;
    for l in
      select * from lotes where produto_id = it.produto_id and saldo > 0 and validade >= current_date
      order by validade, id for update
    loop
      exit when v_resta <= 0;
      v_tira := least(l.saldo, v_resta);
      update lotes set saldo = saldo - v_tira where id = l.id;
      insert into pedido_item_lotes (pedido_item_id, lote_id, quantidade) values (it.id, l.id, v_tira);
      insert into movimentos (tipo, produto_id, lote_id, pedido_id, quantidade, observacao, usuario, usuario_nome)
      values ('saida_pedido', it.produto_id, l.id, p_pedido, -v_tira, 'Pedido #' || p_pedido, auth.uid(), _meu_nome());
      v_resta := v_resta - v_tira;
    end loop;
    if v_resta > 0 then raise exception 'Estoque mudou durante a separação. Tente de novo.'; end if;
  end loop;
  update pedidos set status = 'separado', atualizado_em = now() where id = p_pedido;
end $$;

create or replace function public.entregar_pedido(p_pedido bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  perform public._exigir('admin','vendas','producao');
  select status into v_status from pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if v_status <> 'separado' then raise exception 'Separe o pedido antes de marcar como entregue.'; end if;
  update pedidos set status = 'entregue', atualizado_em = now() where id = p_pedido;
end $$;

create or replace function public.cancelar_pedido(p_pedido bigint, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text; x record;
begin
  perform public._exigir('admin','vendas');
  select status into v_status from pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if v_status in ('entregue','cancelado') then raise exception 'Pedido % não pode ser cancelado.', v_status; end if;
  if v_status = 'separado' then
    for x in
      select pil.lote_id, pil.quantidade, i.produto_id
      from pedido_item_lotes pil join pedido_itens i on i.id = pil.pedido_item_id
      where i.pedido_id = p_pedido
    loop
      update lotes set saldo = saldo + x.quantidade where id = x.lote_id;
      insert into movimentos (tipo, produto_id, lote_id, pedido_id, quantidade, observacao, usuario, usuario_nome)
      values ('estorno_pedido', x.produto_id, x.lote_id, p_pedido, x.quantidade,
              'Cancelamento pedido #' || p_pedido || coalesce(' – ' || p_motivo, ''), auth.uid(), _meu_nome());
    end loop;
    delete from pedido_item_lotes where pedido_item_id in (select id from pedido_itens where pedido_id = p_pedido);
  end if;
  update pedidos set status = 'cancelado', atualizado_em = now(),
    observacao = concat_ws(E'\n', observacao, 'Cancelado: ' || coalesce(nullif(trim(p_motivo),''), 'sem motivo'))
  where id = p_pedido;
end $$;

-- ---------- PERMISSÕES DAS FUNÇÕES ----------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.novo_usuario() from authenticated;

-- o app só lê tabelas; nenhuma escrita direta (tudo pelas funções)
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
