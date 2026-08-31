-- Cor de marca por tenant — extraída automaticamente da logo no upload (canvas no
-- navegador, sem API paga) e confirmada pelo diretor antes de salvar. Aplicada via
-- CSS custom property (--cor-primaria) injetada no <html> pelo AuthContext, com
-- fallback pro verde padrão (#22C55E) quando a empresa não tiver definido a própria.
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS cor_primaria text;
