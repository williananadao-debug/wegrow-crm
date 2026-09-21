import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  CidadeAniversario, PerfilCluster, VinculoCluster, DIAS_ALERTA_PADRAO,
  cidadesDoPerfil, diasAte, faixaDeAlerta, anoDaOcorrencia, idadeNaOcorrencia, textoPrazo,
} from '@/lib/aniversariosCluster';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// GET — cron diário (ver vercel.json). Pra cada empresa com o módulo Demais FM Comercial,
// avisa (sino de notificações) quem atende cada cidade que o aniversário do município está
// chegando, respeitando o CLUSTER de cada vendedor (ver lib/aniversariosCluster). Cada faixa
// de antecedência (padrão 30/15/7 dias e no dia) dispara UMA vez por cidade e por ano —
// deduplicado pela chave da notificação, então rodar o cron de novo não repete aviso.
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const supabase = db();
  const { data: empresas } = await supabase.from('empresas').select('id, modulos');
  const comMidia = (empresas || []).filter((e: any) => e.modulos?.midia);
  const hoje = new Date();
  let criadas = 0;

  for (const empresa of comMidia) {
    const limites: number[] = Array.isArray(empresa.modulos?.midia_aniversario_alerta_dias) && empresa.modulos.midia_aniversario_alerta_dias.length > 0
      ? empresa.modulos.midia_aniversario_alerta_dias.map(Number).filter((n: number) => Number.isFinite(n) && n >= 0)
      : DIAS_ALERTA_PADRAO;

    const [{ data: cidades }, { data: vinculos }, { data: perfis }] = await Promise.all([
      supabase.from('midia_aniversarios_municipios').select('id, municipio, praca, dia, mes, ano_emancipacao').eq('empresa_id', empresa.id).eq('ativo', true),
      supabase.from('midia_cluster_vendedor_cidades').select('vendedor_id, aniversario_id').eq('empresa_id', empresa.id),
      supabase.from('profiles').select('id, nome, cargo, unidade').eq('empresa_id', empresa.id).in('cargo', ['diretor', 'gerente', 'vendedor']),
    ]);
    if (!cidades?.length || !perfis?.length) continue;

    const registros: { user_id: string; titulo: string; mensagem: string; lida: boolean; chave: string }[] = [];
    for (const c of cidades as CidadeAniversario[]) {
      const dias = diasAte(c.dia, c.mes, hoje);
      const faixa = faixaDeAlerta(dias, limites);
      if (faixa === null) continue;
      const ano = anoDaOcorrencia(c.dia, c.mes, hoje);
      const idade = idadeNaOcorrencia(c.ano_emancipacao, ano);
      const dataTxt = `${String(c.dia).padStart(2, '0')}/${String(c.mes).padStart(2, '0')}`;

      for (const p of perfis as PerfilCluster[]) {
        if (!cidadesDoPerfil(p, [c], (vinculos || []) as VinculoCluster[]).length) continue;
        registros.push({
          user_id: p.id,
          titulo: `🎂 Aniversário de ${c.municipio} ${textoPrazo(dias)}`,
          mensagem: `${c.municipio} ${idade ? `completa ${idade} anos` : 'faz aniversário'} em ${dataTxt}${c.praca ? ` (praça ${c.praca})` : ''}. Hora de oferecer o pacote de aniversário aos anunciantes da cidade.`,
          lida: false,
          chave: `aniv:${c.id}:${ano}:${faixa}`,
        });
      }
    }
    if (registros.length === 0) continue;

    // ignoreDuplicates: índice único (user_id, chave) — faixa já avisada não entra de novo
    const { data: inseridas, error } = await supabase.from('notifications')
      .upsert(registros, { onConflict: 'user_id,chave', ignoreDuplicates: true }).select('id');
    if (error) console.error('[cron/aniversarios-municipios]', empresa.id, error.message);
    else criadas += inseridas?.length || 0;
  }

  return NextResponse.json({ ok: true, empresas: comMidia.length, notificacoesCriadas: criadas });
}
