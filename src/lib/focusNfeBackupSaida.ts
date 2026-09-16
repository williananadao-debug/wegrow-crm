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
  mesesEncontrados: number; mesesProcessados: number; xmlsLidos: number;
  xmlsDeSaidaEncontrados: number; notasNovas: number; falhas: number;
};

export async function processarBackfillSaida(params: {
  db: SupabaseClient; empresaId: string; cnpjEmpresa: string;
  token: string; ambiente: FocusNfeAmbiente;
}): Promise<ResultadoBackfillSaida> {
  const { db, empresaId, cnpjEmpresa, token, ambiente } = params;
  const cnpjEmpresaDigitos = soDigitos(cnpjEmpresa);

  const backups = await listarBackupsMensais(token, ambiente, cnpjEmpresa);
  console.log(`[focusNfeBackupSaida] ${backups.length} mês(es) de backup encontrado(s) pro CNPJ ${cnpjEmpresaDigitos} (ambiente ${ambiente}):`, backups.map(b => ({ mes: b.mes, temXml: !!b.xmls })));

  const { data: existentes } = await db.from('fiscal_notas')
    .select('chave_acesso').eq('empresa_id', empresaId).not('chave_acesso', 'is', null);
  const chavesConhecidas = new Set((existentes || []).map((n: { chave_acesso: string }) => n.chave_acesso));

  let mesesProcessados = 0, xmlsLidos = 0, xmlsDeSaidaEncontrados = 0, notasNovas = 0, falhas = 0;
  const emitentesVistos = new Set<string>();

  for (const mes of backups) {
    if (!mes.xmls) continue;
    try {
      const zipRes = await fetch(mes.xmls, { headers: headerAuth(token) });
      if (!zipRes.ok) { console.error(`[focusNfeBackupSaida] falha ao baixar zip do mês ${mes.mes}: status ${zipRes.status}`); falhas++; continue; }
      const zip = await JSZip.loadAsync(await zipRes.arrayBuffer());
      const nomesXml = Object.keys(zip.files).filter(n => !zip.files[n].dir && n.toLowerCase().endsWith('.xml'));
      console.log(`[focusNfeBackupSaida] mês ${mes.mes}: ${nomesXml.length} XML(s) no zip`);

      const linhasNovas: Record<string, unknown>[] = [];
      for (const nomeArquivo of nomesXml) {
        xmlsLidos++;
        const xml = await zip.files[nomeArquivo].async('text');
        const cab = extrairCabecalhoXmlNfe(xml);
        if (cab.cnpjEmitente) emitentesVistos.add(soDigitos(cab.cnpjEmitente));
        if (!cab.chaveAcesso || chavesConhecidas.has(cab.chaveAcesso)) continue;
        // Só saída: XML onde o emitente é a própria empresa. Entrada (fornecedor emitiu
        // contra a empresa) já é coberta pelo backfill de recebidas — ignora aqui pra não duplicar.
        if (soDigitos(cab.cnpjEmitente) !== cnpjEmpresaDigitos) continue;
        xmlsDeSaidaEncontrados++;

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
        if (error) { console.error(`[focusNfeBackupSaida] falha ao gravar notas do mês ${mes.mes}:`, error.message); falhas += linhasNovas.length; } else { notasNovas += linhasNovas.length; }
      }
      mesesProcessados++;
    } catch (err) {
      console.error('[focusNfeBackupSaida] falha no mês', mes.mes, err);
      falhas++;
    }
  }

  console.log(`[focusNfeBackupSaida] CNPJs emitentes vistos nos XMLs (esperado: incluir ${cnpjEmpresaDigitos}):`, [...emitentesVistos]);

  return { mesesEncontrados: backups.length, mesesProcessados, xmlsLidos, xmlsDeSaidaEncontrados, notasNovas, falhas };
}
