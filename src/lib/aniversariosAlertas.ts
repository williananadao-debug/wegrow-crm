// Alertas de aniversário de município (Demais FM Comercial) — lógica única usada pelo cron
// diário e pelo botão "Verificar / Enviar alertas" da aba Aniversários. Devolve um
// diagnóstico completo: antes, qualquer falha (busca que dava erro, vendedor sem cluster e
// sem praça na unidade...) era pulada em silêncio e o alerta simplesmente não chegava.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CidadeAniversario, PerfilCluster, VinculoCluster, DIAS_ALERTA_PADRAO,
  cidadesDoPerfil, diasAte, faixaDeAlerta, anoDaOcorrencia, idadeNaOcorrencia, textoPrazo, pracasDoTexto,
} from '@/lib/aniversariosCluster';

export type DiagnosticoAlertas = {
  empresaId: string;
  limites: number[];
  cidadesAtivas: number;
  perfisConsiderados: number;
  // Cidades que estão dentro de alguma faixa de alerta hoje, e quem recebe cada uma.
  cidadesNoPrazo: { municipio: string; data: string; dias: number; faixa: number; destinatarios: string[] }[];
  // Perfis que nunca recebem alerta (vendedor/gerente sem cidades no cluster e sem praça na unidade).
  semCobertura: { nome: string; cargo: string | null; unidade: string | null }[];
  notificacoesNovas: number;   // inseridas agora (ou que seriam, na simulação)
  jaAvisadas: number;          // faixa já avisada antes (dedup pela chave)
  erros: string[];
};

type Empresa = { id: string; modulos?: Record<string, unknown> | null };

export async function processarAlertasAniversario(db: SupabaseClient, empresa: Empresa, opts: { simular: boolean; hoje?: Date }): Promise<DiagnosticoAlertas> {
  const hoje = opts.hoje || new Date();
  const cfg = empresa.modulos?.midia_aniversario_alerta_dias;
  const limites: number[] = Array.isArray(cfg) && cfg.length > 0
    ? cfg.map(Number).filter(n => Number.isFinite(n) && n >= 0)
    : DIAS_ALERTA_PADRAO;
  const diag: DiagnosticoAlertas = {
    empresaId: empresa.id, limites, cidadesAtivas: 0, perfisConsiderados: 0,
    cidadesNoPrazo: [], semCobertura: [], notificacoesNovas: 0, jaAvisadas: 0, erros: [],
  };

  const [rCidades, rVinculos, rPerfis] = await Promise.all([
    db.from('midia_aniversarios_municipios').select('id, municipio, praca, dia, mes, ano_emancipacao').eq('empresa_id', empresa.id).eq('ativo', true),
    db.from('midia_cluster_vendedor_cidades').select('vendedor_id, aniversario_id').eq('empresa_id', empresa.id),
    db.from('profiles').select('id, nome, cargo, unidade').eq('empresa_id', empresa.id).in('cargo', ['diretor', 'gerente', 'vendedor']),
  ]);
  if (rCidades.error) diag.erros.push(`Erro ao buscar cidades: ${rCidades.error.message}`);
  if (rVinculos.error) diag.erros.push(`Erro ao buscar clusters: ${rVinculos.error.message}`);
  if (rPerfis.error) diag.erros.push(`Erro ao buscar usuários: ${rPerfis.error.message}`);

  const cidades = (rCidades.data || []) as CidadeAniversario[];
  const vinculos = (rVinculos.data || []) as VinculoCluster[];
  const perfis = (rPerfis.data || []) as PerfilCluster[];
  diag.cidadesAtivas = cidades.length;
  diag.perfisConsiderados = perfis.length;
  if (cidades.length === 0 && !rCidades.error) diag.erros.push('Nenhuma cidade ativa cadastrada em Aniversários.');
  if (perfis.length === 0 && !rPerfis.error) diag.erros.push('Nenhum usuário com cargo diretor/gerente/vendedor nesta empresa.');

  for (const p of perfis) {
    if (p.cargo === 'diretor') continue;
    const temCluster = vinculos.some(v => v.vendedor_id === p.id);
    if (!temCluster && pracasDoTexto(p.unidade).length === 0) {
      diag.semCobertura.push({ nome: p.nome || '—', cargo: p.cargo || null, unidade: p.unidade || null });
    }
  }

  const registros: { user_id: string; titulo: string; mensagem: string; lida: boolean; chave: string }[] = [];
  for (const c of cidades) {
    const dias = diasAte(c.dia, c.mes, hoje);
    const faixa = faixaDeAlerta(dias, limites);
    if (faixa === null) continue;
    const ano = anoDaOcorrencia(c.dia, c.mes, hoje);
    const idade = idadeNaOcorrencia(c.ano_emancipacao, ano);
    const dataTxt = `${String(c.dia).padStart(2, '0')}/${String(c.mes).padStart(2, '0')}`;
    const destinatarios: string[] = [];
    for (const p of perfis) {
      if (!cidadesDoPerfil(p, [c], vinculos).length) continue;
      destinatarios.push(p.nome || p.id);
      registros.push({
        user_id: p.id,
        titulo: `🎂 Aniversário de ${c.municipio} ${textoPrazo(dias)}`,
        mensagem: `${c.municipio} ${idade ? `completa ${idade} anos` : 'faz aniversário'} em ${dataTxt}${c.praca ? ` (praça ${c.praca})` : ''}. Hora de oferecer o pacote de aniversário aos anunciantes da cidade.`,
        lida: false,
        chave: `aniv:${c.id}:${ano}:${faixa}`,
      });
    }
    diag.cidadesNoPrazo.push({ municipio: c.municipio, data: dataTxt, dias, faixa, destinatarios });
  }
  diag.cidadesNoPrazo.sort((a, b) => a.dias - b.dias);
  if (registros.length === 0) return diag;

  // Quais já foram avisadas (mesma chave) — conta à parte, pra simulação mostrar o que é novo.
  const { data: existentes, error: erroExist } = await db.from('notifications')
    .select('user_id, chave').in('chave', [...new Set(registros.map(r => r.chave))]);
  if (erroExist) diag.erros.push(`Erro ao consultar notificações já enviadas: ${erroExist.message}`);
  const ja = new Set((existentes || []).map(e => `${e.user_id}|${e.chave}`));
  const novos = registros.filter(r => !ja.has(`${r.user_id}|${r.chave}`));
  diag.jaAvisadas = registros.length - novos.length;

  if (opts.simular) { diag.notificacoesNovas = novos.length; return diag; }
  if (novos.length === 0) return diag;

  const { data: inseridas, error } = await db.from('notifications')
    .upsert(novos, { onConflict: 'user_id,chave', ignoreDuplicates: true }).select('id');
  if (error) diag.erros.push(`Erro ao gravar notificações: ${error.message}`);
  else diag.notificacoesNovas = inseridas?.length || 0;
  return diag;
}
