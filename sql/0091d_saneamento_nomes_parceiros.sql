-- 0091d (pedido 047): saneamento em lote dos nomes vindos do Bling (só no CRM; nada é gravado no Bling).
-- Pessoa física: tira @, barras e "INATIVO" e passa de MAIÚSCULAS/minúsculas para Nome Próprio.
-- Pessoa jurídica: só tira @ e "INATIVO" (razão social mantém a caixa). Nome que ficaria vazio (só @) não muda.
with alvo as (
  select p.id, p.empresa_id, p.nome antes,
         case when p.tipo_pessoa = 'J'
              then nullif(btrim(regexp_replace(regexp_replace(regexp_replace(p.nome, '@[A-Za-z0-9._]+', ' ', 'g'), '\s*-?\s*\m(INATIV[OA]S?)\M\s*$', '', 'i'), '\s+', ' ', 'g')), '')
              else crm.nome_civil_limpo(p.nome) end depois
    from crm.cad_parceiro p
), mudou as (
  select * from alvo where depois is not null and depois is distinct from antes
), log as (
  insert into crm.log_parceiro_nome (empresa_id, parceiro_id, nome_antes, nome_depois, motivo)
  select empresa_id, id, antes, depois, 'saneamento em lote 0091d' from mudou returning parceiro_id
)
update crm.cad_parceiro p set nome = m.depois, atualizado_em = now() from mudou m where m.id = p.id;

-- Reconciliação futura do Bling cria parceiro novo já com nome limpo
do $m$
declare d text := pg_get_functiondef('bling.reconciliar_parceiros'::regproc); n text;
begin
  n := replace(d, 'values (p_empresa, regexp_replace(r.nome_padrao, ''\s*-?\s*INATIV[OA]?\s*$'', ''''), case r.documento_tipo',
                  'values (p_empresa, coalesce(crm.nome_civil_limpo(r.nome_padrao), regexp_replace(r.nome_padrao, ''\s*-?\s*INATIV[OA]?\s*$'', '''')), case r.documento_tipo');
  if n <> d then execute n; else raise notice 'reconciliar_parceiros: trecho do nome não encontrado (mantido)'; end if;
end $m$;
