-- 0055: faixa informativa do topo do painel (hora de Brasília no navegador, dólar e manchetes do setor).
-- Coleta dentro do banco, no mesmo padrão dos jobs do Bling: pg_cron a cada minuto dispara pedidos HTTP (pg_net) e lê as respostas.
-- Dólar: PTAX do Banco Central (oficial) e AwesomeAPI (opcional, mais atual; pode recusar por cota). Notícias: RSS de portais e buscas do
-- Google Notícias, filtradas por (1) veículos confiáveis, (2) palavras do segmento e (3) palavras bloqueadas, todas editáveis por empresa.
-- Só título, veículo e link são gravados (sem texto da matéria, sem imagem). Desligável pela empresa (tela Faixa informativa) e por cada usuário.
-- Reversão: select cron.unschedule('faixa-ciclo'); drop schema faixa cascade; drop function api.faixa_*; delete da tela 'faixa'.

create schema if not exists faixa;
revoke all on schema faixa from public, anon, authenticated;

-- ---------------------------------------------------------------- utilitários de texto
create function faixa._norm(p text) returns text language sql immutable parallel safe set search_path = '' as $$
  select btrim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p, ''))), '[^a-z0-9]+', ' ', 'g')) $$;

create function faixa._txt(p xml[]) returns text language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(replace(regexp_replace(replace(replace(coalesce(p[1]::text, ''), '&lt;', '<'), '&gt;', '>'), '<[^>]*>', '', 'g'), '&amp;', '&'), '\s+', ' ', 'g')) $$;

create function faixa._data(p text) returns timestamptz language plpgsql stable set search_path = '' as $$
declare t text := btrim(coalesce(p, ''));
begin
  if t = '' then return null; end if;
  if t ~ '^\d{4}-\d{2}-\d{2}[T ][0-9:.]+$' then return t::timestamp at time zone 'America/Sao_Paulo'; end if;
  return t::timestamptz;
exception when others then return null;
end $$;

-- entrada terminada em * casa por prefixo da palavra; sem * casa a palavra (ou frase) inteira; tudo sem acento e em minúsculas
create function faixa._bate(p_tn text, p_lista text[]) returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from unnest(p_lista) e
     where faixa._norm(e) <> ''
       and case when right(btrim(e), 1) = '*' then (' ' || p_tn) like '% ' || faixa._norm(left(btrim(e), -1)) || '%'
                else (' ' || p_tn || ' ') like '% ' || faixa._norm(e) || ' %' end) $$;

create function faixa._lista(p jsonb) returns text[] language sql immutable set search_path = '' as $$
  select case when p is null or jsonb_typeof(p) <> 'array' then null
         else coalesce((select array_agg(q.x) from (select btrim(x) as x from jsonb_array_elements_text(p) x where btrim(x) <> '' and length(btrim(x)) <= 80 limit 80) q), '{}'::text[]) end $$;

-- ---------------------------------------------------------------- listas padrão (a empresa edita na tela)
create function faixa._padrao_chaves() returns text[] language sql immutable set search_path = '' as $$
  select array['moda','brecho*','vestuario','roupa*','confecc*','textil','texteis','calcado*','sapato*','bolsa*','outlet*','jeans','grife*',
               'blusinha*','shein','segunda mao','varejo de moda','varejista de moda','tendencia*','desfile*','colecao','colecoes',
               'riachuelo','renner','farm rio','zara','c a moda'] $$;
create function faixa._padrao_bloqueio() returns text[] language sql immutable set search_path = '' as $$
  select array['futebol','formula 1','f1','bbb','a fazenda','novela*','horoscopo','bolsa de valores','ibovespa','bolsa familia','receitas','ceia',
               'suspeito*','policia*','preso*','assalto*','foragido*','homicidio*','candidato*','deputado*','solidario*','beneficente*','leucemia','golpe*'] $$;
create function faixa._padrao_veiculos() returns text[] language sql immutable set search_path = '' as $$
  select array['Exame','Bloomberg Línea Brasil','Bloomberg Línea','Mercado&Consumo','Pequenas Empresas & Grandes Negócios','FashionNetwork Brasil','FFW',
               'Veja','G1','Globo','CNN Brasil','Valor Econômico','InfoMoney','InvestNews','NeoFeed','Forbes Brasil','E-Commerce Brasil','Consumidor Moderno',
               'Meio & Mensagem','Metrópoles','Correio Braziliense','UOL','Terra','Folha de S.Paulo','Estadão','O Estado de S. Paulo','Jornal do Commercio',
               'Diário do Comércio','Diário do Nordeste','Monitor Mercantil','Poder360','Sebrae','ABVTEX','Abit','Guia Jeans Wear','ELLE Brasil','Vogue Brasil',
               'Marie Claire','Glamour','Agência Brasil','Money Times','Época Negócios','IstoÉ Dinheiro'] $$;

-- ---------------------------------------------------------------- tabelas
create table faixa.cfg_empresa (
  empresa_id uuid primary key references crm.cad_empresa(id) on delete cascade,
  ativa boolean not null default true,
  mostrar_hora boolean not null default true,
  mostrar_dolar boolean not null default true,
  mostrar_noticias boolean not null default true,
  segundos_por_item int not null default 8 check (segundos_por_item between 4 and 30),
  idade_max_dias int not null default 10 check (idade_max_dias between 1 and 60),
  palavras_chave text[] not null default faixa._padrao_chaves(),
  palavras_bloqueio text[] not null default faixa._padrao_bloqueio(),
  veiculos_permitidos text[] not null default faixa._padrao_veiculos(),
  atualizado_em timestamptz,
  atualizado_por uuid
);
create table faixa.cfg_fonte (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id) on delete cascade,
  nome text not null check (length(nome) between 1 and 80),
  url text not null check (url ~ '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(/[^[:space:]]*)?$' and length(url) <= 600),
  ativa boolean not null default true,
  filtrar_veiculo boolean not null default false,
  exigir_palavra boolean not null default true,
  intervalo_min int not null default 60 check (intervalo_min between 15 and 1440),
  ultima_busca_em timestamptz,
  ultimo_ok_em timestamptz,
  ultimo_erro text,
  itens_lidos int not null default 0,
  itens_aceitos int not null default 0,
  req_id bigint,
  req_em timestamptz,
  criado_em timestamptz not null default now()
);
create index cfg_fonte_empresa_idx on faixa.cfg_fonte (empresa_id);
create table faixa.mov_noticia (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references crm.cad_empresa(id) on delete cascade,
  fonte_id uuid not null references faixa.cfg_fonte(id) on delete cascade,
  titulo text not null,
  titulo_norm text not null,
  link text not null check (link ~ '^https?://'),
  veiculo text not null,
  publicado_em timestamptz not null,
  oculta boolean not null default false,
  criado_em timestamptz not null default now(),
  unique (empresa_id, titulo_norm)
);
create index mov_noticia_empresa_idx on faixa.mov_noticia (empresa_id, publicado_em desc);
create table faixa.mov_cotacao (
  par text primary key,
  valor numeric(12,4),
  variacao_pct numeric(8,2),
  referencia_em timestamptz,
  origem text check (origem in ('ptax','awesomeapi')),
  ok_em timestamptz,
  erro text,
  ultima_busca_em timestamptz,
  ptax_req bigint, ptax_req_em timestamptz,
  awesome_req bigint, awesome_req_em timestamptz
);
insert into faixa.mov_cotacao (par) values ('USD-BRL');

alter table faixa.cfg_empresa enable row level security;
alter table faixa.cfg_fonte enable row level security;
alter table faixa.mov_noticia enable row level security;
alter table faixa.mov_cotacao enable row level security;
revoke all on all tables in schema faixa from public, anon, authenticated;
create trigger auditoria after insert or update or delete on faixa.cfg_empresa for each row execute function audit.registrar();
create trigger auditoria after insert or update or delete on faixa.cfg_fonte for each row execute function audit.registrar();

-- ---------------------------------------------------------------- semeadura por empresa (fontes iniciais só na primeira vez)
create function faixa._semear(p_empresa uuid) returns void language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into faixa.cfg_empresa (empresa_id) values (p_empresa) on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then return; end if;
  insert into faixa.cfg_fonte (empresa_id, nome, url, filtrar_veiculo, exigir_palavra, intervalo_min) values
   (p_empresa, 'Google Notícias: brechó e moda circular', 'https://news.google.com/rss/search?q=brech%C3%B3+OR+%22moda+circular%22+OR+%22roupas+usadas%22+when%3A14d&hl=pt-BR&gl=BR&ceid=BR%3Apt-419', true, true, 60),
   (p_empresa, 'Google Notícias: varejo de moda e indústria têxtil', 'https://news.google.com/rss/search?q=%22varejo+de+moda%22+OR+vestu%C3%A1rio+OR+confec%C3%A7%C3%A3o+OR+%22ind%C3%BAstria+t%C3%AAxtil%22+when%3A7d&hl=pt-BR&gl=BR&ceid=BR%3Apt-419', true, true, 60),
   (p_empresa, 'Google Notícias: calçados, bolsas e moda', 'https://news.google.com/rss/search?q=%28cal%C3%A7ados+OR+sapatos+OR+bolsas%29+moda+when%3A7d&hl=pt-BR&gl=BR&ceid=BR%3Apt-419', true, true, 60),
   (p_empresa, 'Google Notícias: outlet, importados e blusinhas', 'https://news.google.com/rss/search?q=%28outlet+OR+%22taxa+das+blusinhas%22+OR+Shein%29+moda+when%3A14d&hl=pt-BR&gl=BR&ceid=BR%3Apt-419', true, true, 60),
   (p_empresa, 'ELLE Brasil', 'https://elle.com.br/feed', false, true, 120),
   (p_empresa, 'NeoFeed', 'https://neofeed.com.br/feed/', false, true, 120),
   (p_empresa, 'Exame', 'https://exame.com/feed/', false, true, 120),
   (p_empresa, 'ABVTEX', 'https://www.abvtex.org.br/feed/', false, false, 360);
end $$;
select faixa._semear(id) from crm.cad_empresa;

-- ---------------------------------------------------------------- leitura do dólar
create function faixa._aplicar(p_origem text, p_valor numeric, p_pct numeric, p_ref timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update faixa.mov_cotacao set valor = p_valor, variacao_pct = p_pct, referencia_em = p_ref, origem = p_origem, ok_em = now(), erro = null
   where par = 'USD-BRL' and (referencia_em is null or p_ref > referencia_em or origem = p_origem);
  if not found then update faixa.mov_cotacao set ok_em = now(), erro = null where par = 'USD-BRL'; end if;
end $$;

create function faixa._ler_ptax(p_status int, p_content text, p_err text) returns void
language plpgsql security definer set search_path = '' as $$
declare a jsonb; v_val numeric; v_ref timestamp; v_prev numeric; v_pct numeric;
begin
  if coalesce(p_status, 0) <> 200 then
    update faixa.mov_cotacao set erro = left('ptax: ' || coalesce(p_status::text, p_err, 'sem resposta'), 200) where par = 'USD-BRL'; return; end if;
  a := (p_content::jsonb)->'value';
  if jsonb_typeof(a) <> 'array' or jsonb_array_length(a) = 0 then
    update faixa.mov_cotacao set erro = 'ptax: sem cotação no período' where par = 'USD-BRL'; return; end if;
  v_val := (a->0->>'cotacaoVenda')::numeric;
  v_ref := (a->0->>'dataHoraCotacao')::timestamp;
  select (e->>'cotacaoVenda')::numeric into v_prev from jsonb_array_elements(a) e
   where ((e->>'dataHoraCotacao')::timestamp)::date < v_ref::date order by (e->>'dataHoraCotacao')::timestamp desc limit 1;
  v_pct := case when v_prev > 0 then round((v_val - v_prev) / v_prev * 100, 2) end;
  perform faixa._aplicar('ptax', v_val, v_pct, v_ref at time zone 'America/Sao_Paulo');
exception when others then
  update faixa.mov_cotacao set erro = left('ptax: ' || sqlerrm, 200) where par = 'USD-BRL';
end $$;

create function faixa._ler_awesome(p_status int, p_content text) returns void
language plpgsql security definer set search_path = '' as $$
declare j jsonb;
begin
  if coalesce(p_status, 0) <> 200 then return; end if;   -- opcional: a cota gratuita costuma recusar (429); o PTAX cobre
  j := (p_content::jsonb)->'USDBRL';
  perform faixa._aplicar('awesomeapi', (j->>'bid')::numeric, round((j->>'pctChange')::numeric, 2), to_timestamp((j->>'timestamp')::bigint));
exception when others then null;
end $$;

-- ---------------------------------------------------------------- leitura de um feed RSS
create function faixa._ler_fonte(p_fonte uuid, p_status int, p_content text, p_err text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  f faixa.cfg_fonte%rowtype; cfg faixa.cfg_empresa%rowtype; v_x xml; it record;
  v_t text; v_l text; v_s text; v_v text; v_tn text; v_pub timestamptz; v_lidos int := 0; v_ok int := 0; n int;
begin
  select * into f from faixa.cfg_fonte where id = p_fonte;
  if not found then return; end if;
  update faixa.cfg_fonte set req_id = null where id = p_fonte;
  if coalesce(p_status, 0) <> 200 then
    update faixa.cfg_fonte set ultimo_erro = left('HTTP ' || coalesce(p_status::text, p_err, 'sem resposta'), 200) where id = p_fonte; return; end if;
  select * into cfg from faixa.cfg_empresa where empresa_id = f.empresa_id;
  v_x := btrim(regexp_replace(replace(coalesce(p_content, ''), E'﻿', ''), '</rss>.*$', '</rss>'))::xml;
  for it in select item from unnest(xpath('//item', v_x)) as t(item) limit 60 loop
    v_lidos := v_lidos + 1;
    v_t := faixa._txt(xpath('string(/item/title)', it.item));
    v_l := faixa._txt(xpath('string(/item/link)', it.item));
    v_s := faixa._txt(xpath('string(/item/source)', it.item));
    v_pub := faixa._data(coalesce(nullif(faixa._txt(xpath('string(/item/pubDate)', it.item)), ''),
                                  faixa._txt(xpath('string(/item/*[local-name()=''date''])', it.item))));
    continue when v_t = '' or v_l !~ '^https?://' or length(v_l) > 1000;
    v_v := coalesce(nullif(v_s, ''), f.nome);
    if v_s <> '' and v_t like '% - ' || v_s then v_t := left(v_t, length(v_t) - length(v_s) - 3); end if;
    v_tn := left(faixa._norm(v_t), 200);
    continue when v_tn = '';
    if v_pub is null or v_pub > now() + interval '1 day' then v_pub := now(); end if;
    continue when v_pub < now() - make_interval(days => cfg.idade_max_dias);
    if f.filtrar_veiculo then
      continue when not exists (select 1 from unnest(cfg.veiculos_permitidos) vp where faixa._norm(vp) = faixa._norm(v_v)); end if;
    continue when faixa._bate(v_tn, cfg.palavras_bloqueio);
    if f.exigir_palavra then continue when not faixa._bate(v_tn, cfg.palavras_chave); end if;
    insert into faixa.mov_noticia (empresa_id, fonte_id, titulo, titulo_norm, link, veiculo, publicado_em)
    values (f.empresa_id, f.id, left(v_t, 300), v_tn, left(v_l, 1000), left(v_v, 80), v_pub)
    on conflict (empresa_id, titulo_norm) do nothing;
    get diagnostics n = row_count; v_ok := v_ok + n;
    exit when v_ok >= 40;
  end loop;
  update faixa.cfg_fonte set ultimo_ok_em = now(), ultimo_erro = null, itens_lidos = v_lidos, itens_aceitos = v_ok where id = p_fonte;
exception when others then
  update faixa.cfg_fonte set req_id = null, ultimo_erro = left(sqlerrm, 200) where id = p_fonte;
end $$;

-- ---------------------------------------------------------------- ciclo (pg_cron, a cada minuto): lê respostas, dispara pedidos vencidos, limpa
create function faixa.job_ciclo() returns void language plpgsql security definer set search_path = '' as $$
declare
  c faixa.mov_cotacao%rowtype; r net._http_response%rowtype; f faixa.cfg_fonte%rowtype;
  v_h jsonb := jsonb_build_object('User-Agent', 'Mozilla/5.0 (compatible; AneCRM-Faixa/1.0)');
  v_req bigint; v_ini text; v_fim text;
begin
  perform faixa._semear(e.id) from crm.cad_empresa e where not exists (select 1 from faixa.cfg_empresa x where x.empresa_id = e.id);
  select * into c from faixa.mov_cotacao where par = 'USD-BRL' for update;

  if c.ptax_req is not null then
    select * into r from net._http_response where id = c.ptax_req;
    if found then perform faixa._ler_ptax(r.status_code, r.content, r.error_msg); update faixa.mov_cotacao set ptax_req = null where par = 'USD-BRL';
    elsif c.ptax_req_em < now() - interval '5 minutes' then update faixa.mov_cotacao set ptax_req = null, erro = 'ptax: sem resposta' where par = 'USD-BRL'; end if;
  end if;
  if c.awesome_req is not null then
    select * into r from net._http_response where id = c.awesome_req;
    if found then perform faixa._ler_awesome(r.status_code, r.content); update faixa.mov_cotacao set awesome_req = null where par = 'USD-BRL';
    elsif c.awesome_req_em < now() - interval '5 minutes' then update faixa.mov_cotacao set awesome_req = null where par = 'USD-BRL'; end if;
  end if;

  for f in select * from faixa.cfg_fonte where req_id is not null loop
    select * into r from net._http_response where id = f.req_id;
    if found then perform faixa._ler_fonte(f.id, r.status_code, r.content, r.error_msg);
    elsif f.req_em < now() - interval '5 minutes' then update faixa.cfg_fonte set req_id = null, ultimo_erro = 'sem resposta' where id = f.id; end if;
  end loop;

  if exists (select 1 from faixa.cfg_empresa where ativa and mostrar_dolar)
     and (c.ultima_busca_em is null or c.ultima_busca_em < now() - interval '15 minutes') then
    v_ini := to_char((now() at time zone 'America/Sao_Paulo')::date - 14, 'MM-DD-YYYY');
    v_fim := to_char((now() at time zone 'America/Sao_Paulo')::date, 'MM-DD-YYYY');
    v_req := net.http_get(url := 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@dataInicial=''' || v_ini || '''&@dataFinalCotacao=''' || v_fim || '''&$orderby=dataHoraCotacao%20desc&$top=20&$format=json',
                          headers := v_h, timeout_milliseconds := 20000);
    update faixa.mov_cotacao set ptax_req = v_req, ptax_req_em = now(), ultima_busca_em = now() where par = 'USD-BRL';
    v_req := net.http_get(url := 'https://economia.awesomeapi.com.br/json/last/USD-BRL', headers := v_h, timeout_milliseconds := 20000);
    update faixa.mov_cotacao set awesome_req = v_req, awesome_req_em = now() where par = 'USD-BRL';
  end if;

  for f in select s.* from faixa.cfg_fonte s join faixa.cfg_empresa e on e.empresa_id = s.empresa_id
            where s.ativa and e.ativa and e.mostrar_noticias and s.req_id is null
              and (s.ultima_busca_em is null or s.ultima_busca_em < now() - make_interval(mins => s.intervalo_min)) loop
    v_req := net.http_get(url := f.url, headers := v_h, timeout_milliseconds := 20000);
    update faixa.cfg_fonte set req_id = v_req, req_em = now(), ultima_busca_em = now() where id = f.id;
  end loop;

  delete from faixa.mov_noticia where publicado_em < now() - interval '45 days';
end $$;

-- ---------------------------------------------------------------- permissões
create function faixa._membro(p_empresa uuid) returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_empresa is null or not ((select api.e_superadmin())
     or exists (select 1 from crm.rel_usuario_empresa r where r.usuario_id = (select auth.uid()) and r.empresa_id = p_empresa and r.ativo)) then
    raise exception 'sem acesso a esta empresa' using errcode = '42501'; end if;
end $$;
create function faixa._exigir(p_empresa uuid, p_nivel text) returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select api.pode_tela(p_empresa, 'faixa', p_nivel)) then raise exception 'sem permissão' using errcode = '42501'; end if;
end $$;

-- ---------------------------------------------------------------- painel: leitura para qualquer membro (alimenta a faixa)
create function api.faixa_obter(p_empresa uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c faixa.cfg_empresa%rowtype;
begin
  perform faixa._membro(p_empresa);
  select * into c from faixa.cfg_empresa where empresa_id = p_empresa;
  if not found then return jsonb_build_object('ativa', false); end if;
  return jsonb_build_object(
    'ativa', c.ativa, 'mostrar_hora', c.mostrar_hora, 'mostrar_dolar', c.mostrar_dolar, 'mostrar_noticias', c.mostrar_noticias, 'segundos', c.segundos_por_item,
    'cotacao', case when c.ativa and c.mostrar_dolar then
       (select jsonb_build_object('valor', m.valor, 'variacao_pct', m.variacao_pct, 'referencia_em', m.referencia_em, 'origem', m.origem, 'ok_em', m.ok_em)
          from faixa.mov_cotacao m where m.par = 'USD-BRL' and m.valor is not null) end,
    'noticias', case when c.ativa and c.mostrar_noticias then coalesce((
       select jsonb_agg(jsonb_build_object('id', n.id, 'titulo', n.titulo, 'link', n.link, 'veiculo', n.veiculo, 'publicado_em', n.publicado_em) order by n.publicado_em desc)
         from (select x.* from faixa.mov_noticia x where x.empresa_id = p_empresa and not x.oculta
                  and x.publicado_em > now() - make_interval(days => c.idade_max_dias) order by x.publicado_em desc limit 14) n), '[]'::jsonb)
       else '[]'::jsonb end);
end $$;

-- ---------------------------------------------------------------- painel: configuração (tela 'faixa')
create function api.faixa_config_obter(p_empresa uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c faixa.cfg_empresa%rowtype;
begin
  perform faixa._exigir(p_empresa, 'ver');
  select * into c from faixa.cfg_empresa where empresa_id = p_empresa;
  if not found then raise exception 'configuração ainda não criada (aguarde um minuto e abra de novo)' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'config', jsonb_build_object('ativa', c.ativa, 'mostrar_hora', c.mostrar_hora, 'mostrar_dolar', c.mostrar_dolar, 'mostrar_noticias', c.mostrar_noticias,
        'segundos', c.segundos_por_item, 'idade_max_dias', c.idade_max_dias, 'palavras_chave', c.palavras_chave,
        'palavras_bloqueio', c.palavras_bloqueio, 'veiculos_permitidos', c.veiculos_permitidos),
    'cotacao', (select jsonb_build_object('valor', m.valor, 'variacao_pct', m.variacao_pct, 'referencia_em', m.referencia_em, 'origem', m.origem, 'ok_em', m.ok_em, 'erro', m.erro)
                  from faixa.mov_cotacao m where m.par = 'USD-BRL'),
    'fontes', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome, 'url', s.url, 'ativa', s.ativa, 'filtrar_veiculo', s.filtrar_veiculo,
        'exigir_palavra', s.exigir_palavra, 'intervalo_min', s.intervalo_min, 'ultimo_ok_em', s.ultimo_ok_em, 'ultimo_erro', s.ultimo_erro,
        'itens_lidos', s.itens_lidos, 'itens_aceitos', s.itens_aceitos) order by s.criado_em, s.nome)
        from faixa.cfg_fonte s where s.empresa_id = p_empresa), '[]'::jsonb),
    'noticias', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'titulo', n.titulo, 'link', n.link, 'veiculo', n.veiculo, 'publicado_em', n.publicado_em, 'oculta', n.oculta)
        order by n.publicado_em desc) from (select x.* from faixa.mov_noticia x where x.empresa_id = p_empresa order by x.publicado_em desc limit 60) n), '[]'::jsonb));
end $$;

create function api.faixa_config_salvar(p_empresa uuid, p_dados jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare v_seg int := (p_dados->>'segundos')::int; v_idade int := (p_dados->>'idade_max_dias')::int;
begin
  perform faixa._exigir(p_empresa, 'editar');
  if v_seg is not null and v_seg not between 4 and 30 then raise exception 'o tempo por item deve ficar entre 4 e 30 segundos' using errcode = '22023'; end if;
  if v_idade is not null and v_idade not between 1 and 60 then raise exception 'a idade máxima das manchetes deve ficar entre 1 e 60 dias' using errcode = '22023'; end if;
  update faixa.cfg_empresa set
    ativa = coalesce((p_dados->>'ativa')::boolean, ativa), mostrar_hora = coalesce((p_dados->>'mostrar_hora')::boolean, mostrar_hora),
    mostrar_dolar = coalesce((p_dados->>'mostrar_dolar')::boolean, mostrar_dolar), mostrar_noticias = coalesce((p_dados->>'mostrar_noticias')::boolean, mostrar_noticias),
    segundos_por_item = coalesce(v_seg, segundos_por_item), idade_max_dias = coalesce(v_idade, idade_max_dias),
    palavras_chave = coalesce(faixa._lista(p_dados->'palavras_chave'), palavras_chave),
    palavras_bloqueio = coalesce(faixa._lista(p_dados->'palavras_bloqueio'), palavras_bloqueio),
    veiculos_permitidos = coalesce(faixa._lista(p_dados->'veiculos_permitidos'), veiculos_permitidos),
    atualizado_em = now(), atualizado_por = (select auth.uid())
  where empresa_id = p_empresa;
  if not found then raise exception 'configuração não encontrada' using errcode = 'P0002'; end if;
end $$;

create function api.faixa_restaurar_listas(p_empresa uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform faixa._exigir(p_empresa, 'editar');
  update faixa.cfg_empresa set palavras_chave = faixa._padrao_chaves(), palavras_bloqueio = faixa._padrao_bloqueio(),
         veiculos_permitidos = faixa._padrao_veiculos(), atualizado_em = now(), atualizado_por = (select auth.uid()) where empresa_id = p_empresa;
end $$;

create function api.faixa_fonte_salvar(p_empresa uuid, p_id uuid, p_nome text, p_url text, p_ativa boolean, p_filtrar_veiculo boolean, p_exigir_palavra boolean, p_intervalo_min int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform faixa._exigir(p_empresa, 'editar');
  p_nome := btrim(coalesce(p_nome, '')); p_url := btrim(coalesce(p_url, ''));
  if length(p_nome) not between 1 and 80 then raise exception 'nome inválido (1 a 80 caracteres)' using errcode = '22023'; end if;
  if p_url !~ '^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(/[^[:space:]]*)?$' or length(p_url) > 600 then
    raise exception 'endereço inválido: use https://, sem porta nem usuário' using errcode = '22023'; end if;
  if coalesce(p_intervalo_min, 60) not between 15 and 1440 then raise exception 'o intervalo deve ficar entre 15 e 1440 minutos' using errcode = '22023'; end if;
  if p_id is null then
    if (select count(*) from faixa.cfg_fonte where empresa_id = p_empresa) >= 20 then raise exception 'limite de 20 fontes por empresa' using errcode = '22023'; end if;
    insert into faixa.cfg_fonte (empresa_id, nome, url, ativa, filtrar_veiculo, exigir_palavra, intervalo_min)
    values (p_empresa, p_nome, p_url, coalesce(p_ativa, true), coalesce(p_filtrar_veiculo, false), coalesce(p_exigir_palavra, true), coalesce(p_intervalo_min, 60)) returning id into v_id;
  else
    update faixa.cfg_fonte set nome = p_nome, url = p_url, ativa = coalesce(p_ativa, ativa), filtrar_veiculo = coalesce(p_filtrar_veiculo, filtrar_veiculo),
           exigir_palavra = coalesce(p_exigir_palavra, exigir_palavra), intervalo_min = coalesce(p_intervalo_min, intervalo_min),
           ultima_busca_em = case when url is distinct from p_url then null else ultima_busca_em end
     where id = p_id and empresa_id = p_empresa returning id into v_id;
    if v_id is null then raise exception 'fonte não encontrada' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

create function api.faixa_fonte_excluir(p_empresa uuid, p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform faixa._exigir(p_empresa, 'editar');
  delete from faixa.cfg_fonte where id = p_id and empresa_id = p_empresa;
  if not found then raise exception 'fonte não encontrada' using errcode = 'P0002'; end if;
end $$;

create function api.faixa_noticia_ocultar(p_empresa uuid, p_id uuid, p_oculta boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform faixa._exigir(p_empresa, 'editar');
  update faixa.mov_noticia set oculta = coalesce(p_oculta, true) where id = p_id and empresa_id = p_empresa;
  if not found then raise exception 'manchete não encontrada' using errcode = 'P0002'; end if;
end $$;

-- pede busca imediata: o ciclo do minuto seguinte dispara os pedidos e o seguinte lê as respostas
create function api.faixa_atualizar_agora(p_empresa uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform faixa._exigir(p_empresa, 'editar');
  update faixa.cfg_fonte set ultima_busca_em = null where empresa_id = p_empresa and req_id is null;
  update faixa.mov_cotacao set ultima_busca_em = null where par = 'USD-BRL';
end $$;

-- ---------------------------------------------------------------- tela, permissões, agendamento, privilégios
insert into crm.cad_tela (tela, grupo, ordem, rotulo, situacao, aplicacao, descricao, nivel_max)
values ('faixa', 'Configuração', 280, 'Faixa informativa', 'ativa', 'tela_e_banco',
        'Faixa do topo com hora, dólar e manchetes do setor: ligar ou desligar, fontes, veículos confiáveis e palavras do segmento', 'editar')
on conflict (tela) do nothing;
insert into crm.cfg_permissao_tela (empresa_id, tela, papel, nivel)
select e.id, 'faixa', 'gestor', 'editar' from crm.cad_empresa e on conflict do nothing;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'faixa-ciclo') then perform cron.unschedule('faixa-ciclo'); end if;
  perform cron.schedule('faixa-ciclo', '* * * * *', 'select faixa.job_ciclo()');
end $$;

revoke all on function faixa._norm(text), faixa._txt(xml[]), faixa._data(text), faixa._bate(text, text[]), faixa._lista(jsonb),
  faixa._padrao_chaves(), faixa._padrao_bloqueio(), faixa._padrao_veiculos(), faixa._semear(uuid), faixa._aplicar(text, numeric, numeric, timestamptz),
  faixa._ler_ptax(int, text, text), faixa._ler_awesome(int, text), faixa._ler_fonte(uuid, int, text, text), faixa.job_ciclo(),
  faixa._membro(uuid), faixa._exigir(uuid, text) from public, anon, authenticated, service_role;
revoke all on function api.faixa_obter(uuid), api.faixa_config_obter(uuid), api.faixa_config_salvar(uuid, jsonb), api.faixa_restaurar_listas(uuid),
  api.faixa_fonte_salvar(uuid, uuid, text, text, boolean, boolean, boolean, int), api.faixa_fonte_excluir(uuid, uuid),
  api.faixa_noticia_ocultar(uuid, uuid, boolean), api.faixa_atualizar_agora(uuid) from public, anon, authenticated, service_role;
grant execute on function api.faixa_obter(uuid), api.faixa_config_obter(uuid), api.faixa_config_salvar(uuid, jsonb), api.faixa_restaurar_listas(uuid),
  api.faixa_fonte_salvar(uuid, uuid, text, text, boolean, boolean, boolean, int), api.faixa_fonte_excluir(uuid, uuid),
  api.faixa_noticia_ocultar(uuid, uuid, boolean), api.faixa_atualizar_agora(uuid) to authenticated;
