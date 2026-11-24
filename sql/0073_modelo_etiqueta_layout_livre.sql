-- 0073: modelo de etiqueta com layout livre (editor visual). PROPOSTA: ainda não aplicada.
-- O layout fica em impressao.cad_modelo.opcoes -> 'layout' (jsonb), então api.listar/salvar_modelo_etiqueta e os dois pontos que
-- chamam impressao._gerar_zpl (impressão e teste) continuam como estão. Sem 'layout' em opcoes, o desenho padrão de hoje é mantido.
-- Formato: { "versao": 1, "elementos": [ { id, tipo, x, y, w, h, rot, ... } ] }, medidas em mm.
--   tipo texto:   valor (com {numero_curto} {nome_peca} {tamanho} {preco} {codigo_unidade}), fonte ('0','A'..'H'), tam_pt, negrito, alinh (L|C|R), linhas
--   tipo barras:  valor, mostrar_texto (Code 128; h = altura em mm)
--   tipo qr:      valor (w = lado em mm)
--   tipo imagem:  b203 e b300 = { w, h, d } (bitmap 1 bit por pixel em base64, 1 = preto), escolhido pelo dpi da impressora
--   tipo linha / retangulo: espessura (mm)
-- Só ZPL (Zebra e compatíveis). EPL2 e TSPL usam o mesmo layout, mas ainda precisam de gerador próprio e do agente.

alter table impressao.cad_modelo
  add constraint modelo_opcoes_tamanho check (octet_length(opcoes::text) <= 900000);

create function impressao._zpl_valor(p_modelo text, p_codigo text, p_numero int, p_nome text, p_tamanho text, p_preco numeric, p_max int default 120) returns text
language sql immutable set search_path = '' as $$
  select impressao._zpl_texto(
    replace(replace(replace(replace(replace(coalesce(p_modelo, ''),
      '{numero_curto}', coalesce(p_numero::text, '')),
      '{nome_peca}', coalesce(p_nome, '')),
      '{tamanho}', coalesce(p_tamanho, '')),
      '{preco}', case when p_preco is null then '' else replace(to_char(p_preco, 'FM999990.00'), '.', ',') end),
      '{codigo_unidade}', coalesce(p_codigo, '')), p_max) $$;

create function impressao._zpl_layout(p_layout jsonb, p_codigo text, p_numero int, p_nome text, p_tamanho text, p_preco numeric,
                                      p_largura_mm numeric, p_altura_mm numeric, p_dpi int, p_ajuste_x_mm numeric, p_ajuste_y_mm numeric) returns text
language plpgsql immutable set search_path = '' as $$
declare
  k numeric := p_dpi / 25.4;
  z text;
  e jsonb; tipo text; x int; y int; ew int; eh int; rot text; v text; fonte text; alt int; lin int; esp int; mod int; bmp jsonb; hex text; bpr int; tot int;
begin
  z := format(E'^XA\n^PW%s\n^LL%s\n^LH%s,%s\n', round(p_largura_mm * k), round(p_altura_mm * k),
              greatest(round(p_ajuste_x_mm * k), 0), greatest(round(p_ajuste_y_mm * k), 0));
  for e in select value from jsonb_array_elements(p_layout -> 'elementos') loop
    tipo := e ->> 'tipo';
    x := greatest(round(coalesce((e ->> 'x')::numeric, 0) * k), 0);
    y := greatest(round(coalesce((e ->> 'y')::numeric, 0) * k), 0);
    ew := greatest(round(coalesce((e ->> 'w')::numeric, 0) * k), 0);
    eh := greatest(round(coalesce((e ->> 'h')::numeric, 0) * k), 0);
    rot := case coalesce((e ->> 'rot')::int, 0) when 90 then 'R' when 180 then 'I' when 270 then 'B' else 'N' end;
    v := impressao._zpl_valor(e ->> 'valor', p_codigo, p_numero, p_nome, p_tamanho, p_preco);

    if tipo = 'texto' then
      if v = '' then continue; end if;
      fonte := case when coalesce(e ->> 'fonte', '0') ~ '^[0A-H]$' then coalesce(e ->> 'fonte', '0') else '0' end;
      alt := greatest(round(coalesce((e ->> 'tam_pt')::numeric, 10) * p_dpi / 72.0), 9);
      lin := greatest(least(coalesce((e ->> 'linhas')::int, 1), 10), 1);
      for i in 0 .. (case when coalesce((e ->> 'negrito')::boolean, false) then 1 else 0 end) loop
        z := z || format(E'^FO%s,%s%s^A%s%s,%s,%s^FD%s^FS\n', x + i, y,
                         case when ew > 0 then format('^FB%s,%s,0,%s,0', ew, lin, case e ->> 'alinh' when 'C' then 'C' when 'R' then 'R' else 'L' end) else '' end,
                         fonte, rot, alt, alt, v);
      end loop;
    elsif tipo = 'barras' then
      if v = '' then continue; end if;
      mod := greatest(1, least(round(coalesce((e ->> 'modulo')::numeric, 2) * p_dpi / 203.0), 10));
      z := z || format(E'^BY%s,3,%s\n^FO%s,%s^BC%s,%s,%s,N,N^FD%s^FS\n', mod, greatest(eh, 8), x, y, rot, greatest(eh, 8),
                       case when coalesce((e ->> 'mostrar_texto')::boolean, true) then 'Y' else 'N' end, v);
    elsif tipo = 'qr' then
      if v = '' then continue; end if;
      z := z || format(E'^FO%s,%s^BQ%s,2,%s^FDMA,%s^FS\n', x, y, 'N', greatest(2, least(10, round(ew / 29.0))), v);
    elsif tipo = 'imagem' then
      bmp := case when p_dpi >= 300 then coalesce(e -> 'b300', e -> 'b203') else coalesce(e -> 'b203', e -> 'b300') end;
      if bmp is null or coalesce(bmp ->> 'd', '') = '' then continue; end if;
      hex := encode(decode(bmp ->> 'd', 'base64'), 'hex');
      bpr := (((bmp ->> 'w')::int) + 7) / 8;
      tot := length(hex) / 2;
      if tot > 0 and tot = bpr * ((bmp ->> 'h')::int) then
        z := z || format(E'^FO%s,%s^GFA,%s,%s,%s,%s^FS\n', x, y, tot, tot, bpr, upper(hex));
      end if;
    elsif tipo in ('linha', 'retangulo') then
      esp := greatest(round(coalesce((e ->> 'espessura')::numeric, 0.3) * k), 1);
      if tipo = 'linha' then
        z := z || format(E'^FO%s,%s^GB%s,%s,%s^FS\n', x, y, greatest(ew, esp), greatest(eh, esp), esp);
      else
        z := z || format(E'^FO%s,%s^GB%s,%s,%s^FS\n', x, y, greatest(ew, esp), greatest(eh, esp), esp);
      end if;
    end if;
  end loop;
  return z || E'^XZ\n';
end $$;

-- Mesma assinatura de antes: se o modelo tem layout livre em opcoes, usa-o; senão o desenho padrão de sempre.
create or replace function impressao._gerar_zpl(p_codigo text, p_numero int, p_nome text, p_tamanho text, p_preco numeric,
                                     p_largura_mm numeric, p_altura_mm numeric, p_dpi int,
                                     p_ajuste_x_mm numeric, p_ajuste_y_mm numeric, p_opcoes jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare
  w int := round(p_largura_mm * p_dpi / 25.4);
  h int := round(p_altura_mm * p_dpi / 25.4);
  s numeric := least(w / 480.0, h / 320.0);
  ax int := round(p_ajuste_x_mm * p_dpi / 25.4) + ((w - round(480 * least(w / 480.0, h / 320.0)::numeric)::int) / 2);
  ay int := round(p_ajuste_y_mm * p_dpi / 25.4);
  m int := round(16 * s);
  z text;
begin
  if p_opcoes ? 'layout' and jsonb_typeof(p_opcoes -> 'layout' -> 'elementos') = 'array' then
    return impressao._zpl_layout(p_opcoes -> 'layout', p_codigo, p_numero, p_nome, p_tamanho, p_preco, p_largura_mm, p_altura_mm, p_dpi, p_ajuste_x_mm, p_ajuste_y_mm);
  end if;
  z := format(E'^XA\n^PW%s\n^LL%s\n^LH%s,%s\n', w, h, greatest(ax, 0), greatest(ay, 0));
  z := z || format(E'^FO%s,%s^BQN,2,%s^FDMA,%s^FS\n', m, m, greatest(2, round(5 * s)), impressao._zpl_texto(p_codigo, 40));
  z := z || format(E'^FO%s,%s^FB%s,1,0,C,0^A0N,%s,%s^FD%s^FS\n', round(190 * s), m, round(274 * s), round(110 * s), round(64 * s), p_numero);
  if coalesce(p_opcoes ->> 'mostrar_tamanho', 'true') <> 'false' and nullif(btrim(p_tamanho), '') is not null then
    z := z || format(E'^FO%s,%s^FB%s,1,0,C,0^A0N,%s,%s^FDTAM %s^FS\n', round(190 * s), round(128 * s), round(274 * s), round(34 * s), round(26 * s), impressao._zpl_texto(p_tamanho, 8));
  end if;
  if coalesce(p_opcoes ->> 'mostrar_preco', 'true') <> 'false' and p_preco is not null then
    z := z || format(E'^FO%s,%s^FB%s,1,0,C,0^A0N,%s,%s^FDR$ %s^FS\n', round(190 * s), round(164 * s), round(274 * s), round(34 * s), round(26 * s), replace(to_char(p_preco, 'FM999990.00'), '.', ','));
  end if;
  z := z || format(E'^FO%s,%s^FB%s,2,0,L,0^A0N,%s,%s^FD%s^FS\n', m, round(204 * s), round(448 * s), round(26 * s), round(20 * s), impressao._zpl_texto(p_nome, 70));
  if coalesce(p_opcoes ->> 'mostrar_barras', 'true') <> 'false' then
    z := z || format(E'^BY%s,3,%s\n^FO%s,%s^BCN,%s,Y,N,N^FD%s^FS\n', greatest(1, round(2 * s)), round(32 * s), m, round(264 * s), round(32 * s), impressao._zpl_texto(p_codigo, 40));
  end if;
  return z || E'^XZ\n';
end $$;

revoke all on function impressao._zpl_valor(text, text, int, text, text, numeric, int),
  impressao._zpl_layout(jsonb, text, int, text, text, numeric, numeric, numeric, int, numeric, numeric) from public, anon, authenticated;
