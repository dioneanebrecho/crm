-- 0086: liga a expiração automática das reservas (pendência do pedido 020, item 3). Autorizado por Dione em 25/11/2026 ("pode executar os migrations"). APLICADA 25/11 23h08.
-- live.expirar_reservas encerra as reservas vencidas (aplica a tolerância do Pix uma vez) e live.encerrar_reserva
-- já promove a próxima da fila (nova reserva com prazo cheio). Roda a cada 30 s; no máximo 200 por rodada.
select cron.schedule('vitrine-expirar-reservas', '30 seconds', $$select live.expirar_reservas(200)$$);

-- Conferência:  select jobname, schedule, active from cron.job where jobname = 'vitrine-expirar-reservas';
-- Reversão:     select cron.unschedule('vitrine-expirar-reservas');
