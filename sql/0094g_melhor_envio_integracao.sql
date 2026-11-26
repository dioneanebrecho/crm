-- 0094g (pedido 049): lugar para configurar o Melhor Envio em Integrações → Fretes.
-- Só o cadastro das credenciais; a cotação e a compra de etiqueta (0094b/0094c) vêm depois.
-- Sem base_url configurável de propósito: o ambiente decide a URL (sandbox ou produção),
-- que é o que a documentação do Melhor Envio define, e evita endereço digitado errado.

alter table engine.cfg_integracao drop constraint cfg_integracao_integracao_check;
alter table engine.cfg_integracao add constraint cfg_integracao_integracao_check
  check (integracao in ('meta_dm','meta_live','bling','gateway','whatsapp','nfe','facebook','ia_chat','ia_embedding','melhor_envio','correios'));

alter table engine.mov_outbox drop constraint mov_outbox_integracao_check;
alter table engine.mov_outbox add constraint mov_outbox_integracao_check
  check (integracao in ('bling','meta_dm','gateway','whatsapp','melhor_envio','correios'));

create or replace function engine._chaves_param(p_integracao text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_integracao
    when 'bling'        then array['client_id','empresa_id_bling']
    when 'meta_live'    then array['app_id','instagram_user_id','api_version']
    when 'meta_dm'      then array['app_id','instagram_user_id','api_version']
    when 'facebook'     then array['app_id','page_id','api_version']
    when 'whatsapp'     then array['waba_id','phone_number_id','api_version']
    when 'gateway'      then array['provedor','ambiente','client_id','seller_id','base_url','link_path','merchant_id']
    when 'melhor_envio' then array['ambiente','client_id','user_agent']
    when 'ia_chat'      then array['provedor','modelo','base_url']
    when 'ia_embedding' then array['provedor','modelo','base_url']
    else '{}'::text[] end $$;

create or replace function engine._segredos_painel(p_integracao text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_integracao
    when 'bling'        then array['client_secret']
    when 'meta_live'    then array['app_secret','access_token','verify_token']
    when 'meta_dm'      then array['app_secret','access_token','verify_token']
    when 'facebook'     then array['app_secret','page_token','verify_token']
    when 'whatsapp'     then array['access_token','app_secret','verify_token']
    when 'gateway'      then array['client_secret','webhook_secret','api_key']
    when 'melhor_envio' then array['client_secret']
    when 'ia_chat'      then array['api_key']
    when 'ia_embedding' then array['api_key']
    else '{}'::text[] end $$;

insert into engine.cfg_integracao (empresa_id, integracao, modo, status)
select id, 'melhor_envio', 'desligado', 'nao_configurada' from crm.cad_empresa
on conflict (empresa_id, integracao) do nothing;
