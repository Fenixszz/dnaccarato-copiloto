-- Migration: tabela chat_mensagens — histórico do chat do widget por usuário.
--
-- Cada linha é uma mensagem (do usuário ou do atendimento/copiloto), amarrada
-- ao usuário AUTENTICADO (auth.users). O histórico da "sessão" é o conjunto de
-- mensagens do usuário, em ordem cronológica.
--
-- Append-only → só criado_em. Dado de conversa → RLS habilitado.

create table if not exists public.chat_mensagens (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  autor      text not null check (autor in ('usuario', 'assistente')),
  texto      text not null,
  criado_em  timestamptz not null default now()
);

comment on table public.chat_mensagens is
  'Histórico do chat do widget, por usuário autenticado. autor: usuario | assistente.';

create index if not exists idx_chat_mensagens_usuario_criado
  on public.chat_mensagens (usuario_id, criado_em);

-- RLS: service_role faz tudo (o servidor grava/lê filtrando por usuario_id);
-- o usuário autenticado só LÊ as PRÓPRIAS mensagens; anon negado.
alter table public.chat_mensagens enable row level security;

drop policy if exists chat_mensagens_service_role_all on public.chat_mensagens;
create policy chat_mensagens_service_role_all on public.chat_mensagens
  as permissive for all to service_role using (true) with check (true);

drop policy if exists chat_mensagens_select_own on public.chat_mensagens;
create policy chat_mensagens_select_own on public.chat_mensagens
  as permissive for select to authenticated using (usuario_id = auth.uid());
