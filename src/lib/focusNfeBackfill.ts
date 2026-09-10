// Núcleo do backfill de NFe recebidas — puxa o histórico completo contra o CNPJ da
// empresa, cria fiscal_notas pra nota nova, e tenta capturar os itens do XML de toda
// nota que ainda está 'sem_itens' (nova ou de uma rodada anterior que não deu tempo).
//
// Compartilhado entre duas portas de entrada:
//   - /api/pulse/fiscal/backfill (POST, autenticado) — diretor/gerente aciona na hora
//   - /api/cron/fiscal-backfill-itens (GET, diário) — tenta de novo sozinho, sem
//     precisar ninguém lembrar de clicar; SEFAZ libera o XML completo de forma
//     assíncrona, às vezes só depois de dias, então uma rodada manual não é garantia de
//     pegar tudo de primeira.
import type { SupabaseClient } from '@supabase/supabase-js';
import { listarNfesRecebidas, manifestarCiencia, capturarItensDaNota, aguardar, FocusNfeAmbiente } from '@/lib/focusNfe';

// Focus NFe libera ~100 chamadas/min — cada nota pendente de item usa até 2 (manifestar
// + baixar XML). Sem esperar entre chamadas, um histórico de centenas de notas estoura o
// rate limit em segundos e a maioria falha silenciosamente (voltando 429). 650ms entre
// CADA chamada HTTP ao Focus NFe mantém uns 90/min, com folga.
export const ESPERA_ENTRE_CHAMADAS_MS = 650;

export type ResultadoBackfillEmpresa = {
  totalNoHistorico: number; notasNovas: number; notasComItens: number;
  notasSemItensRetentadas: number; falhas: number; rateLimitado: boolean;
  parcial: boolean; restantesEstimado: number;
};

// Processa uma empresa até `tempoLimiteMs` (relativo a `inicio`) ou até esgotar o
// histórico, o que vier primeiro. Idempotente: nota que já existe (por chave) não
// duplica, nota que ficou sem item é tentada de novo em qualquer chamada futura.
export async function processarBackfillEmpresa(params: {
  db: SupabaseClient; empresaId: string; cnpj: string;
  token: string; ambiente: FocusNfeAmbiente;
  inicio: number; tempoLimiteMs: number;
}): Promise<ResultadoBackfillEmpresa> {
  const { db, empresaId, cnpj, token, ambiente, inicio, tempoLimiteMs } = params;

  const notasHistorico = await listarNfesRecebidas(token, ambiente, cnpj);

  // Notas que já temos registradas (por chave) — evita duplicar, e identifica quais
  // ficaram sem item pra tentar de novo.
  const { data: existentes } = await db.from('fiscal_notas')
    .select('id, chave_acesso, itens_status')
    .eq('empresa_id', empresaId)
    .not('chave_acesso', 'is', null);
  const porChave = new Map((existentes || []).map((n: { chave_acesso: string; id: number; itens_status: string }) => [n.chave_acesso, n]));

  let notasNovas = 0, notasComItens = 0, notasSemItensRetentadas = 0, falhas = 0, rateLimitado = false;
  let processadas = 0;

  for (const notaHistorico of notasHistorico) {
    const chave = notaHistorico.chave_nfe;
    if (!chave) continue;
    if (Date.now() - inicio > tempoLimiteMs) break; // fica pra próxima rodada — evita a função ser matada no meio sem responder nada

    try {
      let notaId: number;
      const jaExiste = porChave.get(chave);

      if (jaExiste) {
        if (jaExiste.itens_status !== 'sem_itens') continue; // já tem item ou já foi processada, nada a fazer
        notaId = jaExiste.id;
        notasSemItensRetentadas++;
      } else {
        const status = notaHistorico.situacao === 'cancelada' ? 'cancelada' : notaHistorico.situacao === 'autorizada' ? 'autorizada' : 'pendente';
        const { data: criada } = await db.from('fiscal_notas').insert([{
          empresa_id: empresaId,
          tipo: 'entrada',
          chave_acesso: chave,
          cnpj_participante: notaHistorico.documento_emitente,
          nome_participante: notaHistorico.nome_emitente,
          valor_total: notaHistorico.valor_total ? Number(notaHistorico.valor_total) : null,
          status,
          origem: 'manifestacao_focus_nfe',
          data_emissao: notaHistorico.data_emissao ? notaHistorico.data_emissao.slice(0, 10) : null,
          observacao: 'Capturada no backfill de histórico (nota anterior à ativação do webhook).',
        }]).select('id').single();
        if (!criada) { falhas++; continue; }
        notaId = criada.id;
        porChave.set(chave, { id: notaId, chave_acesso: chave, itens_status: 'sem_itens' });
        notasNovas++;
      }

      // nfe_completa=false: SEFAZ ainda não liberou o XML — nem tenta, só volta vazio.
      // Fica 'sem_itens' e a próxima rodada (manual ou cron) tenta de novo.
      if (notaHistorico.nfe_completa === false) continue;

      await manifestarCiencia(token, ambiente, chave);
      await aguardar(ESPERA_ENTRE_CHAMADAS_MS);
      const resultado = await capturarItensDaNota(db, notaId, empresaId, token, ambiente, chave);
      if (resultado.rateLimited) { rateLimitado = true; break; } // Focus NFe já tá recusando — parar agora, o resto fica pra próxima rodada
      if (resultado.itensGravados > 0) notasComItens++;
      processadas++;
      await aguardar(ESPERA_ENTRE_CHAMADAS_MS);
    } catch (err) {
      console.error('[focusNfeBackfill] falha numa nota do histórico:', chave, err);
      falhas++;
    }
  }

  const restantes = notasHistorico.filter(n => {
    const existente = porChave.get(n.chave_nfe);
    return !existente || existente.itens_status === 'sem_itens';
  }).length - processadas;

  return {
    totalNoHistorico: notasHistorico.length,
    notasNovas, notasComItens, notasSemItensRetentadas, falhas, rateLimitado,
    parcial: rateLimitado || restantes > 0,
    restantesEstimado: Math.max(0, restantes),
  };
}
