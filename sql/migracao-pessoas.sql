-- =====================================================================
--  MIGRAÇÃO — da versão antiga (tabela "arrecadacao") para a nova
--  estrutura de pessoas + pagamentos, com valor por pessoa e cores.
--
--  Use ESTE arquivo se você já rodou o schema.sql anterior e tem dados.
--  Em instalação nova, rode apenas sql/schema.sql.
--
--  É seguro rodar mais de uma vez: nada é duplicado e a tabela antiga
--  não é apagada (ela vira só um backup, o site para de usá-la).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Novas colunas de configuração
-- ---------------------------------------------------------------------
alter table public.config
  add column if not exists valor_por_pessoa numeric(12,2) not null default 3000,
  add column if not exists cor_nao_doou     text not null default '#f87171',
  add column if not exists cor_parcial      text not null default '#f0b429',
  add column if not exists cor_total        text not null default '#34d399',
  add column if not exists cor_especial     text not null default '#60a5fa',
  add column if not exists rotulo_nao_doou  text not null default 'Não contribuiu',
  add column if not exists rotulo_parcial   text not null default 'Parcial',
  add column if not exists rotulo_total     text not null default 'Completo',
  add column if not exists rotulo_especial  text not null default 'Especial';

-- Se você rodou uma versão anterior desta migração, o rótulo tinha sido
-- gravado como "Não doou". Atualiza só se ainda estiver no texto antigo
-- (um rótulo que você personalizou no painel é preservado).
update public.config
   set rotulo_nao_doou = 'Não contribuiu'
 where id = 1 and rotulo_nao_doou = 'Não doou';

-- ---------------------------------------------------------------------
-- 2) Tabelas novas
-- ---------------------------------------------------------------------
create table if not exists public.pessoas (
  id             bigint generated always as identity primary key,
  nome           text not null,
  valor_previsto numeric(12,2),
  observacao     text default '',
  ordem          integer not null default 0,
  criado_em      timestamptz not null default now()
);

create unique index if not exists pessoas_nome_uniq
  on public.pessoas (lower(btrim(nome)));
create index if not exists pessoas_ordem_idx
  on public.pessoas (ordem asc, nome asc);

create table if not exists public.pagamentos (
  id         bigint generated always as identity primary key,
  pessoa_id  bigint not null references public.pessoas(id) on delete cascade,
  data       date    not null default current_date,
  valor      numeric(12,2) not null check (valor >= 0),
  forma      text    not null check (forma in ('pix','dinheiro')),
  observacao text    default '',
  criado_em  timestamptz not null default now()
);

create index if not exists pagamentos_pessoa_idx on public.pagamentos (pessoa_id);
create index if not exists pagamentos_data_idx   on public.pagamentos (data desc, id desc);

-- ---------------------------------------------------------------------
-- 3) Migrar os dados antigos (só se a tabela antiga existir)
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.arrecadacao') is null then
    raise notice 'Tabela arrecadacao nao existe — nada a migrar.';
    return;
  end if;

  -- 3a) cria uma pessoa para cada nome distinto que ainda não exista
  insert into public.pessoas (nome, ordem)
  select distinct on (lower(btrim(a.nome))) btrim(a.nome), 0
  from public.arrecadacao a
  where btrim(coalesce(a.nome, '')) <> ''
    and not exists (
      select 1 from public.pessoas p
      where lower(btrim(p.nome)) = lower(btrim(a.nome))
    )
  order by lower(btrim(a.nome)), a.id;

  -- 3b) transfere os lançamentos, evitando duplicar se rodar de novo
  insert into public.pagamentos (pessoa_id, data, valor, forma, observacao, criado_em)
  select p.id, a.data, a.valor, a.forma, coalesce(a.observacao, ''), a.criado_em
  from public.arrecadacao a
  join public.pessoas p on lower(btrim(p.nome)) = lower(btrim(a.nome))
  where not exists (
    select 1 from public.pagamentos pg
    where pg.pessoa_id = p.id
      and pg.data      = a.data
      and pg.valor     = a.valor
      and pg.forma     = a.forma
  );

  raise notice 'Migracao concluida. A tabela arrecadacao foi mantida como backup.';
end $$;

-- ---------------------------------------------------------------------
-- 4) View de conferência
-- ---------------------------------------------------------------------
create or replace view public.pessoas_resumo as
select
  p.id,
  p.nome,
  coalesce(p.valor_previsto, c.valor_por_pessoa) as previsto,
  coalesce(sum(pg.valor), 0)                     as pago,
  greatest(coalesce(p.valor_previsto, c.valor_por_pessoa) - coalesce(sum(pg.valor), 0), 0) as restante,
  count(pg.id)                                   as qtd_pagamentos,
  case
    when coalesce(sum(pg.valor), 0) <= 0 then 'nao_doou'
    when coalesce(p.valor_previsto, c.valor_por_pessoa) <= 0 then 'total'
    when coalesce(sum(pg.valor), 0) >  coalesce(p.valor_previsto, c.valor_por_pessoa) then 'especial'
    when coalesce(sum(pg.valor), 0) >= coalesce(p.valor_previsto, c.valor_por_pessoa) then 'total'
    else 'parcial'
  end as status
from public.pessoas p
cross join (select valor_por_pessoa from public.config where id = 1) c
left join public.pagamentos pg on pg.pessoa_id = p.id
group by p.id, p.nome, p.valor_previsto, c.valor_por_pessoa;

-- ---------------------------------------------------------------------
-- 5) RLS das tabelas novas
-- ---------------------------------------------------------------------
alter table public.pessoas    enable row level security;
alter table public.pagamentos enable row level security;

drop policy if exists "pessoas leitura publica"    on public.pessoas;
drop policy if exists "pessoas escrita painel"     on public.pessoas;
drop policy if exists "pagamentos leitura publica" on public.pagamentos;
drop policy if exists "pagamentos escrita painel"  on public.pagamentos;

create policy "pessoas leitura publica"    on public.pessoas    for select using (true);
create policy "pessoas escrita painel"     on public.pessoas    for all    using (true) with check (true);
create policy "pagamentos leitura publica" on public.pagamentos for select using (true);
create policy "pagamentos escrita painel"  on public.pagamentos for all    using (true) with check (true);

commit;

-- ---------------------------------------------------------------------
-- Confira o resultado:
--   select * from public.pessoas_resumo order by nome;
--
-- Quando tiver certeza de que está tudo certo, você pode apagar o backup:
--   drop table public.arrecadacao;
-- ---------------------------------------------------------------------
