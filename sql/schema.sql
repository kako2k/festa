-- =====================================================================
--  FESTA DE FIM DE ANO — Arrecadação de Fundos
--  Schema completo para Supabase (PostgreSQL)
--  Execute este arquivo inteiro no SQL Editor do Supabase.
-- =====================================================================

-- Necessário para hash de senha (crypt / gen_salt)
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1) CONFIGURAÇÕES DO EVENTO  (linha única, id = 1)
-- ---------------------------------------------------------------------
create table if not exists public.config (
  id             smallint primary key default 1,
  evento_nome    text    not null default 'Festa de Fim de Ano',
  evento_subtitulo text  default 'Prestação de contas da arrecadação',
  logo_url       text    default 'img/logo.png',
  meta_valor     numeric(12,2) not null default 0,
  mostrar_nomes  boolean not null default true,
  mensagem       text    default '',
  chave_pix      text    default '',
  atualizado_em  timestamptz not null default now(),
  constraint config_linha_unica check (id = 1)
);

insert into public.config (id) values (1)
  on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2) ARRECADAÇÃO  (entradas de dinheiro)
-- ---------------------------------------------------------------------
create table if not exists public.arrecadacao (
  id          bigint generated always as identity primary key,
  data        date    not null default current_date,
  nome        text    not null,
  valor       numeric(12,2) not null check (valor > 0),
  forma       text    not null check (forma in ('pix','dinheiro')),
  observacao  text    default '',
  criado_em   timestamptz not null default now()
);

create index if not exists arrecadacao_data_idx on public.arrecadacao (data desc, id desc);

-- ---------------------------------------------------------------------
-- 3) UTILIZAÇÃO DE FUNDOS  (para onde o dinheiro vai)
--    valor_restante é calculado automaticamente pelo banco.
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
-- 4) ADMINISTRADORES  (login simples usuário + senha)
--    A senha nunca é lida pelo front-end: a validação acontece
--    dentro da função admin_login (SECURITY DEFINER).
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  id         bigint generated always as identity primary key,
  usuario    text not null unique,
  senha_hash text not null,
  nome       text default '',
  criado_em  timestamptz not null default now()
);

-- Função para criar/atualizar admin com senha em texto puro (só via SQL Editor)
create or replace function public.set_admin(p_usuario text, p_senha text, p_nome text default '')
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into public.admins (usuario, senha_hash, nome)
  values (lower(trim(p_usuario)), crypt(p_senha, gen_salt('bf', 10)), p_nome)
  on conflict (usuario) do update
    set senha_hash = crypt(p_senha, gen_salt('bf', 10)),
        nome       = excluded.nome;
end;
$$;

-- Função de login: devolve os dados do admin ou NULL
create or replace function public.admin_login(p_usuario text, p_senha text)
returns table (usuario text, nome text)
language plpgsql
security definer
set search_path = public, extensions
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
-- 5) VIEW DE RESUMO (opcional, usada para conferência rápida)
-- ---------------------------------------------------------------------
create or replace view public.resumo as
select
  (select coalesce(sum(valor), 0)      from public.arrecadacao) as total_arrecadado,
  (select coalesce(sum(valor_pago), 0) from public.utilizacao)  as total_utilizado,
  (select coalesce(sum(valor), 0)      from public.utilizacao)  as total_previsto,
  (select meta_valor                   from public.config where id = 1) as meta_valor;

-- ---------------------------------------------------------------------
-- 6) RLS — Row Level Security
--    Leitura pública (a página pública usa a chave anon).
--    Escrita liberada para anon porque o painel usa login próprio
--    (grupo fechado). Veja o README para endurecer isso depois.
-- ---------------------------------------------------------------------
alter table public.config      enable row level security;
alter table public.arrecadacao enable row level security;
alter table public.utilizacao  enable row level security;
alter table public.admins      enable row level security;
-- admins: nenhuma policy = ninguém lê direto. Só via admin_login().

drop policy if exists "config leitura publica"      on public.config;
drop policy if exists "config escrita painel"       on public.config;
drop policy if exists "arrecadacao leitura publica" on public.arrecadacao;
drop policy if exists "arrecadacao escrita painel"  on public.arrecadacao;
drop policy if exists "utilizacao leitura publica"  on public.utilizacao;
drop policy if exists "utilizacao escrita painel"   on public.utilizacao;

create policy "config leitura publica"      on public.config      for select using (true);
create policy "config escrita painel"       on public.config      for all    using (true) with check (true);

create policy "arrecadacao leitura publica" on public.arrecadacao for select using (true);
create policy "arrecadacao escrita painel"  on public.arrecadacao for all    using (true) with check (true);

create policy "utilizacao leitura publica"  on public.utilizacao  for select using (true);
create policy "utilizacao escrita painel"   on public.utilizacao  for all    using (true) with check (true);

-- ---------------------------------------------------------------------
-- 7) DADOS DE EXEMPLO (opcional — apague se não quiser)
-- ---------------------------------------------------------------------
-- update public.config set evento_nome = 'Confra 2026', meta_valor = 5000 where id = 1;
-- insert into public.arrecadacao (data, nome, valor, forma) values
--   ('2026-09-01', 'João Silva',   250.00, 'pix'),
--   ('2026-09-02', 'Maria Souza',  300.00, 'dinheiro'),
--   ('2026-09-03', 'Carlos Lima',  150.00, 'pix');
-- insert into public.utilizacao (titulo, descricao, valor, valor_pago, ordem) values
--   ('Buffet',      'Comida e bebida para 60 pessoas', 3000.00, 1500.00, 1),
--   ('Espaço',      'Aluguel do salão',                1200.00, 1200.00, 2),
--   ('Decoração',   'Balões, mesa e iluminação',        500.00,    0.00, 3);
