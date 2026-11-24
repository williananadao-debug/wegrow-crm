// Consulta de CNPJ na Receita — a "lupa" do cadastro de cliente e do lead.
// 1º o nosso servidor (/api/cnpj): cache de 30 dias + CNPJá paga (CNPJA_API_KEY), com registro de uso.
// Se o servidor não tiver fonte paga ou falhar: gratuitas direto do navegador (publica.cnpj.ws, com IE;
// depois BrasilAPI, sem IE) e o resultado volta para o cache do servidor.
import { supabase } from '@/lib/supabase';

export type DadosCnpj = {
  razao_social: string;
  nome_fantasia: string;
  cep: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
  // null = a fonte não informa (BrasilAPI); 'ISENTO' = cnpj.ws sem IE cadastrada.
  inscricao_estadual: string | null;
  capital_social: unknown;
  data_inicio_atividade: unknown;
  // Receita esconde endereço de MEI (LGPD) — quem chama avisa pra preencher à mão.
  enderecoOculto: boolean;
};

async function fetchComTimeout(url: string, ms = 6000, init: RequestInit = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(id); }
}

const txt = (v: unknown) => (v == null ? '' : String(v).trim());

/** Retorna os dados do CNPJ ou lança erro com mensagem pronta pra mostrar ao usuário. */
export async function consultarCnpj(cnpjDigitado: string): Promise<DadosCnpj> {
  const cnpj = cnpjDigitado.replace(/\D/g, '');
  if (cnpj.length !== 14) throw new Error('Digite os 14 números do CNPJ.');

  const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  const auth = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : null;
  if (auth) {
    try {
      const r = await fetchComTimeout(`/api/cnpj?c=${cnpj}`, 15000, { headers: auth });
      if (r.ok) return (await r.json()).dados as DadosCnpj;
      if (r.status === 404) throw new Error((await r.json().catch(() => ({}))).error || 'CNPJ não encontrado na Receita.');
    } catch (e) {
      if ((e as Error).message?.includes('não encontrado')) throw e;
      /* servidor fora: segue para as gratuitas */
    }
  }
  const d = await consultarGratuitas(cnpj);
  if (auth) {
    fetch('/api/cnpj', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ cnpj, dados: d.dados, fonte: d.fonte }) }).catch(() => null);
  }
  return d.dados;
}

async function consultarGratuitas(cnpj: string): Promise<{ dados: DadosCnpj; fonte: string }> {

  try {
    const r = await fetchComTimeout(`https://publica.cnpj.ws/cnpj/${cnpj}`);
    if (r.ok) {
      const data = await r.json();
      const est = data.estabelecimento || {};
      const dados: DadosCnpj = {
        razao_social: txt(data.razao_social),
        nome_fantasia: txt(est.nome_fantasia),
        cep: txt(est.cep),
        logradouro: `${txt(est.tipo_logradouro)} ${txt(est.logradouro)}`.trim(),
        numero: txt(est.numero),
        bairro: txt(est.bairro),
        cidade: txt(est.cidade?.nome),
        estado: txt(est.estado?.sigla),
        inscricao_estadual: est.inscricoes_estaduais?.length ? txt(est.inscricoes_estaduais[0].inscricao_estadual) : 'ISENTO',
        capital_social: data.capital_social,
        data_inicio_atividade: est.data_inicio_atividade,
        enderecoOculto: !est.logradouro && !est.cep,
      };
      return { dados, fonte: 'cnpj.ws' };
    }
  } catch { /* timeout/rede: tenta o plano B */ }

  try {
    const r = await fetchComTimeout(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    if (r.ok) {
      const d = await r.json();
      return { fonte: 'brasilapi', dados: {
        razao_social: txt(d.razao_social),
        nome_fantasia: txt(d.nome_fantasia),
        cep: txt(d.cep),
        logradouro: txt(d.logradouro),
        numero: txt(d.numero),
        bairro: txt(d.bairro),
        cidade: txt(d.municipio),
        estado: txt(d.uf),
        inscricao_estadual: null,
        capital_social: d.capital_social,
        data_inicio_atividade: d.data_inicio_atividade,
        enderecoOculto: !d.logradouro && !d.cep,
      } };
    }
  } catch { /* cai no erro abaixo */ }

  throw new Error('Não foi possível buscar os dados do CNPJ. Tente novamente ou preencha manualmente.');
}

/** "Rua X, 123 - Bairro" — formato do campo Endereço do lead/contrato. */
export function enderecoEmLinha(d: Pick<DadosCnpj, 'logradouro' | 'numero' | 'bairro'>) {
  const rua = [d.logradouro, d.numero].filter(Boolean).join(', ');
  return [rua, d.bairro].filter(Boolean).join(' - ');
}
