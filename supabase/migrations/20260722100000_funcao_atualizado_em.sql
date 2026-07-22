-- Função compartilhada de trigger: mantém a coluna atualizado_em em dia em
-- todo UPDATE. Cada tabela cria seu próprio trigger apontando pra cá.
create or replace function public.definir_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;
