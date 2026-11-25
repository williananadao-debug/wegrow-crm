-- NFS-e da WeGrow: quando emitir.
--   'pagamento' → emite quando o cliente paga (webhook / botão "Pagamento recebido") — como era.
--   'fim_mes'   → no último dia do mês emite a nota da competência SEGUINTE (a mensalidade que
--                 vence no mês que começa) e manda um e-mail só, por cliente, com a(s) nota(s) e
--                 os dados do Pix (link, copia e cola, valor e vencimento).
alter table public.wegrow_nfse_config
  add column if not exists emitir_em text not null default 'pagamento';

do $$ begin
  alter table public.wegrow_nfse_config
    add constraint wegrow_nfse_config_emitir_em_chk check (emitir_em in ('pagamento', 'fim_mes'));
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
