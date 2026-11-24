import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import type { DadosCnpj } from '@/lib/consultaCnpj';

export const dynamic = 'force-dynamic';

// Consulta de CNPJ do CRM (lupa do cliente e do lead).
//   GET  ?c=<cnpj>  → cache de 30 dias → CNPJá (CNPJA_API_KEY) → 204 (sem fonte paga: o navegador
//                     usa as APIs gratuitas e depois manda o resultado no POST para o cache)
//   POST {cnpj, dados, fonte} → guarda no cache o que o navegador achou nas gratuitas
// Toda consulta vai para cnpj_consultas (custo real por empresa).

const CACHE_DIAS = 30;
const dig = (s: unknown) => String(s ?? '').replace(/\D/g, '');
const txt = (v: unknown) => (v == null ? '' : String(v).trim());

async function quem(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const db = supabaseAdmin();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return null;
  const { data: perfil } = await db.from('profiles').select('empresa_id').eq('id', user.id).maybeSingle();
  return { db, userId: user.id, empresaId: (perfil?.empresa_id as string) || null };
}

type Office = {
  company?: { name?: string; equity?: number };
  alias?: string | null; founded?: string;
  address?: { street?: string; number?: string; district?: string; city?: string; state?: string; zip?: string; details?: string | null };
  registrations?: { number?: string; state?: string; enabled?: boolean }[];
};

// CNPJá: Receita + inscrição estadual (CCC). strategy=CACHE_IF_FRESH usa o cache da própria CNPJá
// quando o dado tem até 30 dias (mais barato que forçar consulta online).
async function consultarCnpja(cnpj: string, chave: string): Promise<{ dados: DadosCnpj; creditos: number } | null> {
  const url = `https://api.cnpja.com/office/${cnpj}?registrations=BR&strategy=CACHE_IF_FRESH&maxAge=${CACHE_DIAS}`;
  const r = await fetch(url, { headers: { Authorization: chave }, signal: AbortSignal.timeout(12000) });
  if (r.status === 404) throw new Error('CNPJ não encontrado na Receita.');
  if (!r.ok) return null;
  const o = (await r.json()) as Office;
  const a = o.address || {};
  const ie = (o.registrations || []).find(x => x.enabled && (!a.state || x.state === a.state)) || (o.registrations || []).find(x => x.enabled);
  const dados: DadosCnpj = {
    razao_social: txt(o.company?.name), nome_fantasia: txt(o.alias),
    cep: txt(a.zip), logradouro: txt(a.street), numero: txt(a.number), bairro: txt(a.district),
    cidade: txt(a.city), estado: txt(a.state),
    inscricao_estadual: ie?.number ? txt(ie.number) : 'ISENTO',
    capital_social: o.company?.equity ?? null, data_inicio_atividade: o.founded ?? null,
    enderecoOculto: !a.street && !a.zip,
  };
  return { dados, creditos: 2 }; // escritório (1) + inscrições estaduais (1)
}

async function registrar(db: ReturnType<typeof supabaseAdmin>, p: { empresaId: string | null; userId: string; cnpj: string; origem: string; creditos?: number }) {
  await db.from('cnpj_consultas').insert({ empresa_id: p.empresaId, user_id: p.userId, cnpj: p.cnpj, origem: p.origem, creditos: p.creditos || 0 });
}

export async function GET(req: NextRequest) {
  const u = await quem(req);
  if (!u) return NextResponse.json({ error: 'Faça login.' }, { status: 401 });
  const cnpj = dig(req.nextUrl.searchParams.get('c'));
  if (cnpj.length !== 14) return NextResponse.json({ error: 'Digite os 14 números do CNPJ.' }, { status: 400 });

  const limite = new Date(Date.now() - CACHE_DIAS * 86400_000).toISOString();
  const { data: c } = await u.db.from('cnpj_cache').select('dados, fonte, empresa_id').eq('cnpj', cnpj).gte('atualizado_em', limite).maybeSingle();
  // O que veio do navegador (gratuitas) só vale para a própria empresa; o da CNPJá vale para todos
  if (c?.dados && (!c.empresa_id || c.empresa_id === u.empresaId)) {
    await registrar(u.db, { ...u, cnpj, origem: 'cache' });
    return NextResponse.json({ dados: c.dados, fonte: c.fonte, cache: true });
  }

  const chave = process.env.CNPJA_API_KEY;
  if (chave) {
    try {
      const r = await consultarCnpja(cnpj, chave);
      if (r) {
        await u.db.from('cnpj_cache').upsert({ cnpj, dados: r.dados, fonte: 'cnpja', empresa_id: null, atualizado_em: new Date().toISOString() });
        await registrar(u.db, { ...u, cnpj, origem: 'cnpja', creditos: r.creditos });
        return NextResponse.json({ dados: r.dados, fonte: 'cnpja' });
      }
    } catch (e) {
      await registrar(u.db, { ...u, cnpj, origem: 'erro' });
      return NextResponse.json({ error: (e as Error).message }, { status: 404 });
    }
  }
  // Sem fonte paga (ou ela falhou): o navegador consulta as gratuitas
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  const u = await quem(req);
  if (!u) return NextResponse.json({ error: 'Faça login.' }, { status: 401 });
  const corpo = await req.json().catch(() => ({}));
  const cnpj = dig(corpo.cnpj);
  const d = corpo.dados as DadosCnpj | undefined;
  if (cnpj.length !== 14 || !d || typeof d.razao_social !== 'string' || !d.razao_social) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  const fonte = ['cnpj.ws', 'brasilapi'].includes(corpo.fonte) ? corpo.fonte : 'gratuita';
  // Só campos conhecidos e texto curto (vem do navegador)
  const limpo: DadosCnpj = {
    razao_social: txt(d.razao_social).slice(0, 200), nome_fantasia: txt(d.nome_fantasia).slice(0, 200), cep: txt(d.cep).slice(0, 12),
    logradouro: txt(d.logradouro).slice(0, 200), numero: txt(d.numero).slice(0, 20), bairro: txt(d.bairro).slice(0, 100),
    cidade: txt(d.cidade).slice(0, 100), estado: txt(d.estado).slice(0, 2),
    inscricao_estadual: d.inscricao_estadual == null ? null : txt(d.inscricao_estadual).slice(0, 30),
    capital_social: null, data_inicio_atividade: d.data_inicio_atividade ? txt(d.data_inicio_atividade).slice(0, 10) : null,
    enderecoOculto: Boolean(d.enderecoOculto),
  };
  // Não sobrescreve dado da CNPJá (fonte confiável) com o que veio do navegador
  const { data: atual } = await u.db.from('cnpj_cache').select('fonte').eq('cnpj', cnpj).maybeSingle();
  if (atual?.fonte !== 'cnpja') {
    await u.db.from('cnpj_cache').upsert({ cnpj, dados: limpo, fonte, empresa_id: u.empresaId, atualizado_em: new Date().toISOString() });
  }
  await registrar(u.db, { ...u, cnpj, origem: 'gratuita' });
  return NextResponse.json({ ok: true });
}
