-- 0084b · api.parceiro_salvar_dados não apaga número/complemento/IBGE quando o CEP é o mesmo (25/11) — STATUS: aplicada. Já está embutida na 0084 deste repositório.
-- Reversão: reaplicar a função da 0084 original (apagava o número numa segunda importação sem número).
create or replace function api.parceiro_salvar_dados(p_empresa uuid, p_parceiro uuid, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_doc text := regexp_replace(coalesce(p_dados ->> 'documento', ''), '\D', '', 'g'); v_tipo text; v_origem text := coalesce(nullif(p_dados ->> 'origem', ''), 'xml');
  e jsonb := coalesce(p_dados -> 'endereco', '{}'::jsonb); pad jsonb; old crm.cad_parceiro_dados; v_manter boolean := false; v_tem_end boolean; v_existe boolean;
begin
  perform api._exigir(p_empresa, array['admin','gestor','rentabilidade']);
  if v_origem not in ('xml','manual') then raise exception 'origem inválida' using errcode = '22023'; end if;
  if not exists (select 1 from crm.cad_parceiro where id = p_parceiro and empresa_id = p_empresa) then raise exception 'parceiro não encontrado' using errcode = 'P0002'; end if;
  if v_doc <> '' then
    if length(v_doc) = 14 and bling.fn_cnpj_valido(v_doc) then v_tipo := 'cnpj';
    elsif length(v_doc) = 11 and bling.fn_cpf_valido(v_doc) then v_tipo := 'cpf';
    else raise exception 'documento inválido' using errcode = '22023'; end if;
    if exists (select 1 from crm.cad_parceiro_identificador i where i.parceiro_id = p_parceiro and i.tipo in ('cnpj','cpf')) then
      if not exists (select 1 from crm.cad_parceiro_identificador i where i.parceiro_id = p_parceiro and i.valor_hash = bling.fn_hash_doc(v_doc)) then
        raise exception 'o documento não confere com o cadastro deste parceiro' using errcode = '22023';
      end if;
    elsif not exists (select 1 from crm.cad_parceiro_identificador i where i.empresa_id = p_empresa and i.valor_hash = bling.fn_hash_doc(v_doc)) then
      insert into crm.cad_parceiro_identificador (empresa_id, parceiro_id, tipo, valor_hash, ultimos_digitos) values (p_empresa, p_parceiro, v_tipo, bling.fn_hash_doc(v_doc), right(v_doc, 4));
    else
      raise exception 'este documento já pertence a outro parceiro' using errcode = '23505';
    end if;
  end if;
  v_tem_end := nullif(btrim(e ->> 'cep'), '') is not null or nullif(btrim(e ->> 'logradouro'), '') is not null;
  pad := crm._endereco_padrao(e ->> 'cep', e ->> 'logradouro', e ->> 'bairro', e ->> 'municipio', e ->> 'uf');
  select * into old from crm.cad_parceiro_dados where parceiro_id = p_parceiro;
  v_existe := found;
  v_manter := v_existe and old.endereco_origem = 'manual' and v_origem <> 'manual';
  if not v_existe then
    insert into crm.cad_parceiro_dados (parceiro_id, empresa_id, origem) values (p_parceiro, p_empresa, v_origem);
  end if;
  update crm.cad_parceiro_dados d set
    documento = coalesce(nullif(v_doc, ''), d.documento),
    razao_social = coalesce(nullif(btrim(p_dados ->> 'razao_social'), ''), d.razao_social),
    nome_fantasia = coalesce(nullif(btrim(p_dados ->> 'nome_fantasia'), ''), d.nome_fantasia),
    ie = coalesce(nullif(btrim(p_dados ->> 'ie'), ''), d.ie), im = coalesce(nullif(btrim(p_dados ->> 'im'), ''), d.im),
    cnae = coalesce(nullif(btrim(p_dados ->> 'cnae'), ''), d.cnae), crt = coalesce(nullif(btrim(p_dados ->> 'crt'), ''), d.crt),
    telefone = coalesce(nullif(regexp_replace(coalesce(p_dados ->> 'telefone', ''), '\D', '', 'g'), ''), d.telefone),
    email = coalesce(nullif(lower(btrim(p_dados ->> 'email')), ''), d.email),
    origem = case when d.origem = 'manual' then 'manual' else v_origem end,
    atualizado_em = now()
   where d.parceiro_id = p_parceiro;
  if v_tem_end and not v_manter then
    -- número, complemento e código do município só são herdados do endereço anterior quando o CEP é o mesmo (0084b)
    update crm.cad_parceiro_dados d set
      numero = coalesce(nullif(btrim(e ->> 'numero'), ''), case when d.cep is not distinct from (pad ->> 'cep') then d.numero end),
      complemento = coalesce(nullif(btrim(e ->> 'complemento'), ''), case when d.cep is not distinct from (pad ->> 'cep') then d.complemento end),
      codigo_municipio = coalesce(nullif(btrim(e ->> 'cod_municipio'), ''), case when d.cep is not distinct from (pad ->> 'cep') then d.codigo_municipio end),
      cep = pad ->> 'cep', logradouro = pad ->> 'logradouro', bairro = pad ->> 'bairro', municipio = pad ->> 'municipio', uf = pad ->> 'uf',
      pais = coalesce(nullif(btrim(e ->> 'pais'), ''), d.pais, 'Brasil'),
      endereco_origem = case when v_origem = 'manual' and (pad ->> 'origem') = 'xml' then 'manual' else pad ->> 'origem' end,
      cep_situacao = pad ->> 'situacao', endereco_xml = e
     where d.parceiro_id = p_parceiro;
  end if;
  update crm.cad_parceiro set tipo_pessoa = coalesce(tipo_pessoa, case v_tipo when 'cnpj' then 'J' when 'cpf' then 'F' end), atualizado_em = now() where id = p_parceiro;
  return jsonb_build_object('situacao', pad ->> 'situacao', 'origem', pad ->> 'origem', 'confiavel', (pad -> 'confiavel'), 'endereco_mantido', v_manter);
end $$;
revoke all on function api.parceiro_salvar_dados(uuid, uuid, jsonb) from public, anon;
grant execute on function api.parceiro_salvar_dados(uuid, uuid, jsonb) to authenticated;
