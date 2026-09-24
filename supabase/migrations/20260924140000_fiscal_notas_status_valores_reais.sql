-- Mesmo problema da migration anterior (fiscal_notas_origem_check), agora na constraint de
-- status: só permitia 4 valores, mas emitir-nf1/emitir-nf2 (emissão de NF pelo Pulse) usam
-- 'processando' (nota criada, aguardando a SEFAZ autorizar) e 'erro_autorizacao' (SEFAZ
-- rejeitou/deu erro) — nenhum dos dois estava na lista. Bug pré-existente, não é regressão
-- de hoje; só apareceu agora porque ninguém tinha testado "Emitir NF" numa venda Pulse antes.
ALTER TABLE public.fiscal_notas DROP CONSTRAINT IF EXISTS fiscal_notas_status_check;
ALTER TABLE public.fiscal_notas ADD CONSTRAINT fiscal_notas_status_check
  CHECK (status IN (
    'pendente', 'autorizada', 'cancelada', 'rejeitada',
    'processando', 'erro_autorizacao'
  ));
