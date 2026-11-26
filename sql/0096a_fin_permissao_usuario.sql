-- Pedido 052: Movimentação Financeira (receita e despesa na mesma tela) com permissão por usuário.
-- Ações: ver_receita, ver_despesa, lancar, editar, baixar, estornar, renegociar, cancelar, conciliar.
-- Admin (e superadmin) tem todas. Os demais precisam da ação concedida ao usuário.

create table financeiro.cfg_permissao_usuario (
  empresa_id uuid not null references crm.cad_empresa(id),
  usuario_id uuid not null references crm.cad_usuario(id),
  acao text not null check (acao in ('ver_receita','ver_despesa','lancar','editar','baixar','estornar','renegociar','cancelar','conciliar')),
  concedido_por uuid references crm.cad_usuario(id),
  concedido_em timestamptz not null default now(),
  primary key (empresa_id, usuario_id, acao)
);
alter table financeiro.cfg_permissao_usuario enable row level security;
create trigger auditoria after insert or delete or update on financeiro.cfg_permissao_usuario for each row execute function audit.registrar();

create function financeiro._pode(p_empresa uuid, p_acao text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select api.tem_papel(p_empresa, array['admin']))
      or exists (select 1 from financeiro.cfg_permissao_usuario where empresa_id = p_empresa and usuario_id = (select auth.uid()) and acao = p_acao)
$$;

create function financeiro._exigir_acesso(p_empresa uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  -- papel do financeiro ou qualquer ação concedida ao usuário (precisa ser membro ativo da empresa)
  if (select api.tem_papel(p_empresa, api._fin_papeis())) then return; end if;
  if exists (select 1 from financeiro.cfg_permissao_usuario a join crm.vw_papel_efetivo r on r.usuario_id = a.usuario_id and r.empresa_id = a.empresa_id
              where a.empresa_id = p_empresa and a.usuario_id = (select auth.uid())) then return; end if;
  raise exception 'sem permissão' using errcode = '42501';
end $$;

create function financeiro._exigir_acao(p_empresa uuid, p_acao text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not financeiro._pode(p_empresa, p_acao) then
    raise exception 'sem permissão para %', case p_acao when 'lancar' then 'lançar títulos' when 'editar' then 'editar títulos' when 'baixar' then 'baixar títulos'
      when 'estornar' then 'estornar' when 'renegociar' then 'renegociar' when 'cancelar' then 'cancelar' when 'conciliar' then 'conciliar o extrato' else p_acao end
      using errcode = '42501';
  end if;
end $$;

create function financeiro._ve_tipo(p_empresa uuid, p_tipo text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_tipo when 'R' then financeiro._pode(p_empresa, 'ver_receita') when 'D' then financeiro._pode(p_empresa, 'ver_despesa') else true end
$$;

create function financeiro._exigir_tipo(p_empresa uuid, p_tipo text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_tipo is not null and not financeiro._ve_tipo(p_empresa, p_tipo) then
    raise exception 'sem permissão para %', case p_tipo when 'R' then 'receitas' else 'despesas' end using errcode = '42501';
  end if;
end $$;

revoke all on function financeiro._pode(uuid, text), financeiro._exigir_acesso(uuid), financeiro._exigir_acao(uuid, text),
  financeiro._ve_tipo(uuid, text), financeiro._exigir_tipo(uuid, text) from public, anon, authenticated;

-- Aplica as regras nas funções existentes, trocando a guarda de papel pela de acesso + ação
do $$
declare
  marca constant text := 'perform api._exigir(p_empresa, api._fin_papeis());';
  r record; d text; extra text;
begin
  for r in select * from (values
    ('fin_cadastros', null, null),
    ('fin_conta_salvar', null, null), ('fin_tipo_titulo_salvar', null, null), ('fin_projeto_salvar', null, null),
    ('fin_saldos', null, null), ('fin_movimentos', null, null), ('fin_conciliacao', null, null),
    ('fin_titulos_listar', null, null),
    ('fin_titulo_obter', null, 'perform financeiro._exigir_tipo(p_empresa, (select tipo from financeiro.mov_titulo where id = p_titulo));'),
    ('fin_titulo_criar', 'lancar', 'perform financeiro._exigir_tipo(p_empresa, p_dados ->> ''tipo'');'),
    ('fin_titulo_salvar', 'editar', 'perform financeiro._exigir_tipo(p_empresa, (select tipo from financeiro.mov_titulo where id = p_titulo));'),
    ('fin_titulo_cancelar', 'cancelar', 'perform financeiro._exigir_tipo(p_empresa, (select tipo from financeiro.mov_titulo where id = p_titulo));'),
    ('fin_titulo_duplicar', 'lancar', 'perform financeiro._exigir_tipo(p_empresa, (select tipo from financeiro.mov_titulo where id = p_titulo));'),
    ('fin_provisao_efetivar', 'editar', 'perform financeiro._exigir_tipo(p_empresa, (select tipo from financeiro.mov_titulo where id = p_titulo));'),
    ('fin_baixar', 'baixar', 'if exists (select 1 from jsonb_array_elements(coalesce(p_dados -> ''itens'', ''[]'')) x join financeiro.mov_titulo q on q.id = (x ->> ''titulo_id'')::uuid where not financeiro._ve_tipo(p_empresa, q.tipo)) then raise exception ''sem permissão para baixar títulos deste tipo'' using errcode = ''42501''; end if;'),
    ('fin_baixa_estornar', 'estornar', 'perform financeiro._exigir_tipo(p_empresa, (select q.tipo from financeiro.mov_baixa b join financeiro.mov_titulo q on q.id = b.titulo_id where b.id = p_baixa));'),
    ('fin_renegociar', 'renegociar', 'if exists (select 1 from jsonb_array_elements_text(coalesce(p_dados -> ''titulos'', ''[]'')) x join financeiro.mov_titulo q on q.id = x::uuid where not financeiro._ve_tipo(p_empresa, q.tipo)) then raise exception ''sem permissão para renegociar títulos deste tipo'' using errcode = ''42501''; end if;'),
    ('fin_renegociacao_desfazer', 'renegociar', null),
    ('fin_adiantamento_criar', 'lancar', 'perform financeiro._exigir_tipo(p_empresa, case p_dados ->> ''tipo'' when ''cliente'' then ''R'' when ''fornecedor'' then ''D'' end);'),
    ('fin_adiantamento_cancelar', 'cancelar', null),
    ('fin_transferir', 'baixar', null), ('fin_transferencia_estornar', 'estornar', null),
    ('fin_extrato_importar', 'conciliar', null), ('fin_conciliar', 'conciliar', null), ('fin_desconciliar', 'conciliar', null),
    ('fin_extrato_ignorar', 'conciliar', null), ('fin_extrato_criar_titulo', 'conciliar', null),
    ('fin_gerar_titulos_entrada', 'lancar', null)
  ) v(fn, acao, extra) loop
    select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'api' and p.proname = r.fn;
    if d is null or position(marca in d) = 0 then raise exception 'guarda não encontrada em api.%', r.fn; end if;
    extra := 'perform financeiro._exigir_acesso(p_empresa);'
      || case when r.acao is not null then E'\n  perform financeiro._exigir_acao(p_empresa, ''' || r.acao || ''');' else '' end
      || case when r.extra is not null then E'\n  ' || r.extra else '' end;
    d := replace(d, marca, extra);
    if r.fn = 'fin_titulos_listar' then
      if position('where t.empresa_id = p_empresa' in d) = 0 then raise exception 'filtro não encontrado em fin_titulos_listar'; end if;
      d := replace(d, 'where t.empresa_id = p_empresa', 'where t.empresa_id = p_empresa and financeiro._ve_tipo(p_empresa, t.tipo)');
    end if;
    execute d;
  end loop;
end $$;

-- Ações do usuário logado (o painel mostra só o que ele pode fazer)
create function api.fin_minhas_acoes(p_empresa uuid) returns text[]
language plpgsql stable security definer set search_path = '' as $$
begin
  perform financeiro._exigir_acesso(p_empresa);
  if (select api.tem_papel(p_empresa, array['admin'])) then
    return array['ver_receita','ver_despesa','lancar','editar','baixar','estornar','renegociar','cancelar','conciliar'];
  end if;
  return coalesce((select array_agg(acao order by acao) from financeiro.cfg_permissao_usuario where empresa_id = p_empresa and usuario_id = (select auth.uid())), '{}');
end $$;

-- Matriz usuário × ação (só admin)
create function api.fin_permissoes_listar(p_empresa uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, array['admin']);
  return coalesce((select jsonb_agg(jsonb_build_object('usuario_id', u.id, 'nome', u.nome, 'email', u.email, 'papeis', x.papeis,
            'admin', 'admin' = any (x.papeis) or u.is_superadmin,
            'acoes', coalesce((select jsonb_agg(a.acao order by a.acao) from financeiro.cfg_permissao_usuario a where a.empresa_id = p_empresa and a.usuario_id = u.id), '[]'))
          order by u.nome)
     from (select usuario_id, array_agg(distinct papel order by papel) papeis from crm.vw_papel_efetivo where empresa_id = p_empresa group by usuario_id) x
     join crm.cad_usuario u on u.id = x.usuario_id), '[]');
end $$;

create function api.fin_permissoes_salvar(p_empresa uuid, p_usuario uuid, p_acoes text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform api._exigir(p_empresa, array['admin']);
  if not exists (select 1 from crm.vw_papel_efetivo where empresa_id = p_empresa and usuario_id = p_usuario) then
    raise exception 'usuário sem acesso a esta empresa' using errcode = '22023';
  end if;
  delete from financeiro.cfg_permissao_usuario where empresa_id = p_empresa and usuario_id = p_usuario and not (acao = any (coalesce(p_acoes, '{}')));
  insert into financeiro.cfg_permissao_usuario (empresa_id, usuario_id, acao, concedido_por)
  select p_empresa, p_usuario, a, (select auth.uid()) from unnest(coalesce(p_acoes, '{}')) a
  on conflict do nothing;
end $$;

revoke all on function api.fin_minhas_acoes(uuid), api.fin_permissoes_listar(uuid), api.fin_permissoes_salvar(uuid, uuid, text[]) from public, anon;
grant execute on function api.fin_minhas_acoes(uuid), api.fin_permissoes_listar(uuid), api.fin_permissoes_salvar(uuid, uuid, text[]) to authenticated;

-- Ponto de partida: quem tem papel financeiro recebe todas as ações; gestor só consulta receitas e despesas
insert into financeiro.cfg_permissao_usuario (empresa_id, usuario_id, acao)
select distinct r.empresa_id, r.usuario_id, a
  from crm.vw_papel_efetivo r
 cross join unnest(case r.papel when 'financeiro' then array['ver_receita','ver_despesa','lancar','editar','baixar','estornar','renegociar','cancelar','conciliar']
                                when 'gestor' then array['ver_receita','ver_despesa'] end) a
 where r.papel in ('financeiro','gestor')
on conflict do nothing;

-- Tela única no lugar de Contas a receber / Contas a pagar
insert into crm.cad_tela (tela, rotulo, grupo, ordem, situacao, nivel_max, aplicacao, descricao) values
  ('movimentacao_financeira', 'Movimentação financeira', 'Financeiro', 140, 'ativa', 'editar', 'tela_e_banco',
   'Receitas e despesas na mesma tela; o acesso é por usuário (Cadastros financeiros › Permissões por usuário)')
on conflict (tela) do nothing;
delete from crm.cfg_permissao_tela where tela in ('contas_receber','contas_pagar');
delete from crm.cad_tela where tela in ('contas_receber','contas_pagar');

-- A tela aparece para quem tem ver_receita ou ver_despesa (a matriz por papel não se aplica a ela)
create or replace function api.nivel_tela(p_empresa uuid, p_tela text)
 returns text language sql stable security definer set search_path to '' as $function$
  select case
    when (select api.tem_papel(p_empresa, array['admin'])) then 'editar'
    when p_tela = 'movimentacao_financeira' then
      case when exists (select 1 from financeiro.cfg_permissao_usuario a where a.empresa_id = p_empresa and a.usuario_id = (select auth.uid()) and a.acao not in ('ver_receita','ver_despesa'))
                and exists (select 1 from financeiro.cfg_permissao_usuario a where a.empresa_id = p_empresa and a.usuario_id = (select auth.uid()) and a.acao in ('ver_receita','ver_despesa')) then 'editar'
           when exists (select 1 from financeiro.cfg_permissao_usuario a where a.empresa_id = p_empresa and a.usuario_id = (select auth.uid()) and a.acao in ('ver_receita','ver_despesa')) then 'ver'
           else 'nenhum' end
    else coalesce((
      select case max(crm._rank_nivel(p.nivel)) when 2 then 'editar' when 1 then 'ver' else 'nenhum' end
        from crm.cfg_permissao_tela p
        join crm.vw_papel_efetivo r on r.empresa_id = p.empresa_id and r.papel = p.papel
       where p.empresa_id = p_empresa and p.tela = p_tela and r.usuario_id = (select auth.uid())), 'nenhum')
  end $function$;
