-- =====================================================================
--  OPCIONAL · Cadastro inicial de insumos e produtos da Rainha do Alho
--  Rode DEPOIS do schema.sql, uma única vez (SQL Editor → Run).
--
--  ATENÇÃO: custos, mão de obra, preços e quantidades das receitas abaixo
--  são EXEMPLOS. Corrija tudo no sistema (tela Cadastros) com os valores reais.
--  Estoques começam zerados: lance o estoque atual pelo sistema.
-- =====================================================================
do $$
declare
  ins jsonb := '[
    ["Alho in natura","kg",100,18.00],
    ["Alho roxo nacional (cabeça)","kg",40,22.00],
    ["Cebola","kg",30,4.50],
    ["Salsa","kg",3,12.00],
    ["Sal","kg",5,2.50],
    ["Óleo de soja","L",10,9.00],
    ["Acidulante (ác. cítrico)","kg",2,28.00],
    ["Pote 125 g / 90 g","un",200,0.45],
    ["Pote 200 g","un",300,0.55],
    ["Pote 400 g","un",200,0.75],
    ["Pote 500 g","un",50,0.95],
    ["Balde 1 kg","un",100,1.40],
    ["Balde 3 kg","un",50,2.80],
    ["Pote de vidro 140 g c/ tampa dourada","un",80,3.20],
    ["Saco 1 kg (descascado)","un",150,0.35],
    ["Saco 25 kg","un",10,2.20],
    ["Cartela (bandeja + filme)","un",100,0.60],
    ["Redinha","un",200,0.20],
    ["Caixa 10 kg (granel)","un",20,3.50],
    ["Rótulo","un",1000,0.12]
  ]';
  -- nome, preço, mínimo, validade (dias), mão de obra, receita [[insumo, qtd por unidade], ...]
  prods jsonb := '[
    ["Alho Picado Gourmet 140 g",19.90,30,120,0.80,[["Alho in natura",0.19],["Acidulante (ác. cítrico)",0.001],["Pote de vidro 140 g c/ tampa dourada",1],["Rótulo",1]]],
    ["Alho Descascado Gourmet 125 g",6.90,40,20,0.35,[["Alho in natura",0.16],["Pote 125 g / 90 g",1],["Rótulo",1]]],
    ["Alho Cartela Gourmet 150 g",9.90,30,60,0.30,[["Alho roxo nacional (cabeça)",0.15],["Cartela (bandeja + filme)",1],["Rótulo",1]]],
    ["Alho Redinha Gourmet 150 g",7.90,40,60,0.20,[["Alho roxo nacional (cabeça)",0.15],["Redinha",1],["Rótulo",1]]],
    ["Alho a Granel Gourmet 10 kg",329.00,4,60,2.00,[["Alho roxo nacional (cabeça)",10],["Caixa 10 kg (granel)",1]]],
    ["Alho Picado 200 g",9.90,60,90,0.40,[["Alho in natura",0.27],["Acidulante (ác. cítrico)",0.002],["Pote 200 g",1],["Rótulo",1]]],
    ["Alho Picado 400 g",17.90,40,90,0.50,[["Alho in natura",0.54],["Acidulante (ác. cítrico)",0.004],["Pote 400 g",1],["Rótulo",1]]],
    ["Alho Picado 1 kg",39.90,30,90,0.90,[["Alho in natura",1.30],["Acidulante (ác. cítrico)",0.01],["Balde 1 kg",1],["Rótulo",1]]],
    ["Alho Picado 3 kg",109.00,15,90,1.80,[["Alho in natura",3.90],["Acidulante (ác. cítrico)",0.03],["Balde 3 kg",1],["Rótulo",1]]],
    ["Alho e Cebola 200 g",8.50,30,60,0.40,[["Alho in natura",0.14],["Cebola",0.12],["Sal",0.005],["Pote 200 g",1],["Rótulo",1]]],
    ["Alho, Cebola e Salsa 200 g",8.90,30,45,0.45,[["Alho in natura",0.13],["Cebola",0.11],["Salsa",0.02],["Pote 200 g",1],["Rótulo",1]]],
    ["Cebola Picada 200 g",5.90,30,45,0.35,[["Cebola",0.25],["Acidulante (ác. cítrico)",0.002],["Pote 200 g",1],["Rótulo",1]]],
    ["Cebola Picada 400 g",9.90,25,45,0.45,[["Cebola",0.50],["Acidulante (ác. cítrico)",0.004],["Pote 400 g",1],["Rótulo",1]]],
    ["Alho Frito 90 g",12.90,40,180,0.60,[["Alho in natura",0.30],["Óleo de soja",0.05],["Pote 125 g / 90 g",1],["Rótulo",1]]],
    ["Alho Frito 500 g",59.90,15,180,1.50,[["Alho in natura",1.60],["Óleo de soja",0.25],["Pote 500 g",1],["Rótulo",1]]],
    ["Alho Descascado 1 kg",34.90,30,20,0.80,[["Alho in natura",1.25],["Saco 1 kg (descascado)",1],["Rótulo",1]]],
    ["Alho Descascado 25 kg",799.00,2,20,12.00,[["Alho in natura",31.0],["Saco 25 kg",1],["Rótulo",1]]]
  ]';
  x jsonb; r jsonb; v_id bigint;
begin
  if exists (select 1 from public.produtos) or exists (select 1 from public.insumos) then
    raise notice 'Já existem cadastros — seed ignorado.';
    return;
  end if;
  for x in select * from jsonb_array_elements(ins) loop
    insert into public.insumos (nome, unidade, minimo) values (x->>0, x->>1, (x->>2)::numeric) returning id into v_id;
    insert into public.insumo_custos (insumo_id, custo) values (v_id, (x->>3)::numeric);
  end loop;
  for x in select * from jsonb_array_elements(prods) loop
    insert into public.produtos (nome, preco, minimo, validade_dias)
    values (x->>0, (x->>1)::numeric, (x->>2)::numeric, (x->>3)::int) returning id into v_id;
    insert into public.produto_custos (produto_id, mao_obra) values (v_id, (x->>4)::numeric);
    for r in select * from jsonb_array_elements(x->5) loop
      insert into public.receitas (produto_id, insumo_id, quantidade)
      select v_id, i.id, (r->>1)::numeric from public.insumos i where i.nome = r->>0;
    end loop;
  end loop;
end $$;
