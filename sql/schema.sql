-- =====================================================================
--  FESTA DE FIM DE ANO — Arrecadação de Fundos
--  Schema completo para Supabase (PostgreSQL)
--
--  INSTALAÇÃO NOVA: execute este arquivo inteiro no SQL Editor.
--  JÁ TEM DADOS DA VERSÃO ANTIGA: use sql/migracao-pessoas.sql.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1) CONFIGURAÇÕES DO EVENTO  (linha única, id = 1)
-- ---------------------------------------------------------------------
create table if not exists public.config (
  id               smallint primary key default 1,
  evento_nome      text    not null default 'Festa de Fim de Ano',
  evento_subtitulo text    default 'Prestação de contas da arrecadação',
  logo_url         text    default 'img/logo.png',
  meta_valor       numeric(12,2) not null default 0,
  mostrar_nomes    boolean not null default true,
  mensagem         text    default '',
  chave_pix        text    default '',

  -- Quanto se espera de cada pessoa
  valor_por_pessoa numeric(12,2) not null default 3000,

  -- Cores dos quatro status (hex)
  cor_nao_doou     text not null default '#f87171',
  cor_parcial      text not null default '#f0b429',
  cor_total        text not null default '#34d399',
  cor_especial     text not null default '#60a5fa',

  -- Rótulos dos quatro status
  rotulo_nao_doou  text not null default 'Não contribuiu',
  rotulo_parcial   text not null default 'Parcial',
  rotulo_total     text not null default 'Completo',
  rotulo_especial  text not null default 'Especial',

  atualizado_em    timestamptz not null default now(),
  constraint config_linha_unica check (id = 1)
);

insert into public.config (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2) PESSOAS  (um cadastro por contribuinte)
--    Cadastre todo mundo de uma vez; quem ainda não pagou fica em 0,00.
-- ---------------------------------------------------------------------
create table if not exists public.pessoas (
  id             bigint generated always as identity primary key,
  nome           text not null,
  -- null = usa config.valor_por_pessoa; preencha só para exceções
  valor_previsto numeric(12,2),
  observacao     text default '',
  ordem          integer not null default 0,
  criado_em      timestamptz not null default now()
);

create unique index if not exists pessoas_nome_uniq
  on public.pessoas (lower(btrim(nome)));
create index if not exists pessoas_ordem_idx
  on public.pessoas (ordem asc, nome asc);

-- ---------------------------------------------------------------------
-- 3) PAGAMENTOS  (cada contribuição de uma pessoa)
-- ---------------------------------------------------------------------
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
-- 4) UTILIZAÇÃO DE FUNDOS
-- ---------------------------------------------------------------------
create table if not exists public.utilizacao (
  id             bigint generated always as identity primary key,
  titulo         text    not null,
  descricao      text    default '',
  valor          numeric(12,2) not null default 0 check (valor >= 0),
  valor_pago     numeric(12,2) not null default 0 check (valor_pago >= 0),
  valor_restante numeric(12,2) generated always as (greatest(valor - valor_pago, 0)) stored,
  ordem          integer not null default 0,
  criado_em      timestamptz not null default now()
);

create index if not exists utilizacao_ordem_idx on public.utilizacao (ordem asc, id asc);

-- ---------------------------------------------------------------------
-- 5) ADMINISTRADORES
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  id         bigint generated always as identity primary key,
  usuario    text not null unique,
  senha_hash text not null,
  nome       text default '',
  criado_em  timestamptz not null default now()
);

create or replace function public.set_admin(p_usuario text, p_senha text, p_nome text default '')
returns void
language plpgsql security definer set search_path = public, extensions
as $$
begin
  insert into public.admins (usuario, senha_hash, nome)
  values (lower(trim(p_usuario)), crypt(p_senha, gen_salt('bf', 10)), p_nome)
  on conflict (usuario) do update
    set senha_hash = crypt(p_senha, gen_salt('bf', 10)),
        nome       = excluded.nome;
end;
$$;

create or replace function public.admin_login(p_usuario text, p_senha text)
returns table (usuario text, nome text)
language plpgsql security definer set search_path = public, extensions
as $$
begin
  return query
  select a.usuario, a.nome
  from public.admins a
  where a.usuario = lower(trim(p_usuario))
    and a.senha_hash = crypt(p_senha, a.senha_hash);
end;
$$;

revoke all on function public.set_admin(text, text, text) from anon, authenticated;
grant execute on function public.admin_login(text, text) to anon, authenticated;

-- >>> TROQUE A SENHA ABAIXO ANTES DE USAR <<<
select public.set_admin('admin', 'troque-esta-senha', 'Administrador');

-- ---------------------------------------------------------------------
-- 6) VIEW DE CONFERÊNCIA — total e status de cada pessoa
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
-- 7) RLS
--    Leitura pública; escrita liberada para anon (o painel tem login
--    próprio). Veja o README para endurecer isso depois.
-- ---------------------------------------------------------------------
alter table public.config     enable row level security;
alter table public.pessoas    enable row level security;
alter table public.pagamentos enable row level security;
alter table public.utilizacao enable row level security;
alter table public.admins     enable row level security;
-- admins: sem policy = ninguém lê direto. Só via admin_login().

drop policy if exists "config leitura publica"     on public.config;
drop policy if exists "config escrita painel"      on public.config;
drop policy if exists "pessoas leitura publica"    on public.pessoas;
drop policy if exists "pessoas escrita painel"     on public.pessoas;
drop policy if exists "pagamentos leitura publica" on public.pagamentos;
drop policy if exists "pagamentos escrita painel"  on public.pagamentos;
drop policy if exists "utilizacao leitura publica" on public.utilizacao;
drop policy if exists "utilizacao escrita painel"  on public.utilizacao;

create policy "config leitura publica"     on public.config     for select using (true);
create policy "config escrita painel"      on public.config     for all    using (true) with check (true);
create policy "pessoas leitura publica"    on public.pessoas    for select using (true);
create policy "pessoas escrita painel"     on public.pessoas    for all    using (true) with check (true);
create policy "pagamentos leitura publica" on public.pagamentos for select using (true);
create policy "pagamentos escrita painel"  on public.pagamentos for all    using (true) with check (true);
create policy "utilizacao leitura publica" on public.utilizacao for select using (true);
create policy "utilizacao escrita painel"  on public.utilizacao for all    using (true) with check (true);

-- ---------------------------------------------------------------------
-- 8) DADOS DE EXEMPLO (opcional — apague se não quiser)
-- ---------------------------------------------------------------------
-- update public.config set evento_nome = 'Confra 2026', meta_valor = 30000,
--        valor_por_pessoa = 3000 where id = 1;
--
-- insert into public.pessoas (nome, ordem) values
--   ('João Silva', 1), ('Maria de Souza', 2), ('Carlos Lima', 3), ('Ana Paula', 4);
--
-- insert into public.pagamentos (pessoa_id, data, valor, forma)
-- select id, current_date, 3000, 'pix' from public.pessoas where nome = 'João Silva';
