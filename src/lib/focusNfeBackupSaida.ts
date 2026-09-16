// Backfill de NF-e de SAÍDA (emitidas pela própria empresa) — diferente do backfill de
// entrada (focusNfeBackfill.ts), que usa o endpoint de histórico de recebidas. Pra saída
// não existe endpoint de listagem (Focus NFe só deixa consultar nota por "ref" conhecido,
// e não tem como listar "toda nota que essa empresa já emitiu"). O único jeito de pegar
// histórico é pelo backup mensal (GET /v2/backups/{cnpj}.json) — arquivo ZIP com os XMLs
// do mês inteiro (entrada E saída misturados); filtra aqui pelo CNPJ emitente == CNPJ da
// própria empresa pra ficar só com saída (entrada já vem por outro caminho, não duplica).
import type { SupabaseClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import { baseUrl, headerAuth, type FocusNfeAmbiente } from '@/lib/focusNfe';
import { extrairCabecalhoXmlNfe } from '@/lib/nfeXmlParser';

type BackupMensal = { mes: string; danfes: string | null; xmls: string | null };

const soDigitos = (v: string | null | undefined) => (v || '').replace(/\D/g, '');

export async function listarBackupsMensais(token: string, ambiente: FocusNfeAmbiente, cnpj: string): Promise<BackupMensal[]> {
  const res = await fetch(`${baseUrl(ambiente)}/v2/backups/${soDigitos(cnpj)}.json`, { headers: headerAuth(token) });
  if (!res.ok) throw new Error(`Falha ao listar backups (status ${res.status}).`);
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

export type ResultadoBackfillSaida = {
  mesesProcessados: number; xmlsLidos: number; notasNovas: number; falhas: number;
};

export async function processarBackfillSaida(params: {
  db: SupabaseClient; empresaId: string; cnpjEmpresa: string;
  token: string; ambiente: FocusNfeAmbiente;
}): Promise<ResultadoBackfillSaida> {
  const { db, empresaId, cnpjEmpresa, token, ambiente } = params;
  const cnpjEmpresaDigitos = soDigitos(cnpjEmpresa);

  const backups = await listarBackupsMensais(token, ambiente, cnpjEmpresa);

  const { data: existentes } = await db.from('fiscal_notas')
    .select('chave_acesso').eq('empresa_id', empresaId).not('chave_acesso', 'is', null);
  const chavesConhecidas = new Set((existentes || []).map((n: { chave_acesso: string }) => n.chave_acesso));

  let mesesProcessados = 0, xmlsLidos = 0, notasNovas = 0, falhas = 0;

  for (const mes of backups) {
    if (!mes.xmls) continue;
    try {
      const zipRes = await fetch(mes.xmls, { headers: headerAuth(token) });
      if (!zipRes.ok) { falhas++; continue; }
      const zip = await JSZip.loadAsync(await zipRes.arrayBuffer());

      const linhasNovas: Record<string, unknown>[] = [];
      for (const nomeArquivo of Object.keys(zip.files)) {
        const arquivo = zip.files[nomeArquivo];
        if (arquivo.dir || !nomeArquivo.toLowerCase().endsWith('.xml')) continue;
        xmlsLidos++;
        const xml = await arquivo.async('text');
        const cab = extrairCabecalhoXmlNfe(xml);
        if (!cab.chaveAcesso || chavesConhecidas.has(cab.chaveAcesso)) continue;
        // Só saída: XML onde o emitente é a própria empresa. Entrada (fornecedor emitiu
        // contra a empresa) já é coberta pelo backfill de recebidas — ignora aqui pra não duplicar.
        if (soDigitos(cab.cnpjEmitente) !== cnpjEmpresaDigitos) continue;

        chavesConhecidas.add(cab.chaveAcesso);
        linhasNovas.push({
          empresa_id: empresaId, tipo: 'saida', chave_acesso: cab.chaveAcesso,
          numero: cab.numero, serie: cab.serie,
          cnpj_participante: cab.cnpjDestinatario, nome_participante: cab.nomeDestinatario,
          valor_total: cab.valorTotal, status: 'autorizada', origem: 'backup_focus_nfe',
          data_emissao: cab.dataEmissao, itens_status: 'processado',
          observacao: 'Capturada no backfill de histórico via backup mensal do Focus NFe (nota anterior à ativação do webhook).',
        });
      }

      if (linhasNovas.length > 0) {
        const { error } = await db.from('fiscal_notas').insert(linhasNovas);
        if (error) { falhas += linhasNovas.length; } else { notasNovas += linhasNovas.length; }
      }
      mesesProcessados++;
    } catch (err) {
      console.error('[focusNfeBackupSaida] falha no mês', mes.mes, err);
      falhas++;
    }
  }

  return { mesesProcessados, xmlsLidos, notasNovas, falhas };
}
