"use client";
import { useMemo, useState } from 'react';
import { Scissors, X, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { valorVenda } from '@/lib/vendasAjustes';

// Encurtar um contrato já ganho (ex.: fechou 6 meses e o cliente pediu só 3). A venda passa a
// ter o contrato novo (itens, valor, parcelas, fim) — OPEC, contrato e portal leem dela —, o mês
// em que foi ganha continua contando o valor original (leads.valor_fechado) e a diferença entra
// como ajuste negativo no mês de hoje, no nome do vendedor da venda (vendas_ajustes, lib/vendasAjustes).
// Só diretoria e gerência. As parcelas em aberto do financeiro ligadas à venda são reduzidas a partir da última.

type Item = { quantidade: number; precoUnitario: number; [k: string]: unknown };
export type LeadEncurtar = {
  id: number; empresa: string; empresa_id?: string; valor_total: number; valor_fechado?: number | null; desconto?: number;
  itens: Item[]; parcelas?: string; vencimento?: string; contrato_inicio?: string; contrato_fim?: string; vencimentos_datas?: string[];
  fechado_em?: string | null; user_id?: string; fechado_por?: string | null; vendedor_nome?: string; unidade?: string;
  notas?: { id: number; texto: string; created_at: string }[];
};

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (iso?: string | null) => iso ? iso.substring(0, 10).split('-').reverse().join('/') : '—';
const mesAno = (d: Date) => d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
const r2 = (v: number) => Math.round(v * 100) / 100;
// Último dia do contrato com n meses a partir do início (início + n meses − 1 dia)
function fimComMeses(inicio: string, n: number) {
  const [a, m, d] = inicio.substring(0, 10).split('-').map(Number);
  const f = new Date(a, m - 1 + n, d - 1);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

export default function EncurtarContrato({ lead, empresaId, autorNome, onFechar, onSalvo }: {
  lead: LeadEncurtar; empresaId: string; autorNome: string;
  onFechar: () => void; onSalvo: (campos: Partial<LeadEncurtar>, aviso: string) => void;
}) {
  const mesesAntes = Number(lead.parcelas) > 0 ? Number(lead.parcelas) : 0;
  const valorAntes = Number(lead.valor_total) || 0;
  // Parcelas com data: as salvas na venda ou, sem elas, mês a mês a partir do 1º vencimento.
  // Com datas, a pessoa marca quais parcelas a vencer saem; sem datas, informa o novo nº de meses.
  const hojeISO = new Date().toLocaleDateString('sv-SE');
  const datasParcelas = useMemo(() => {
    if (Array.isArray(lead.vencimentos_datas) && lead.vencimentos_datas.length === mesesAntes) return lead.vencimentos_datas.map(d => d.substring(0, 10));
    if (lead.vencimento && mesesAntes > 0) {
      const [a, m, d] = lead.vencimento.substring(0, 10).split('-').map(Number);
      return Array.from({ length: mesesAntes }, (_, i) => {
        const ultimoDia = new Date(a, m + i, 0).getDate(); // dia 31 vira o último dia do mês curto
        const f = new Date(a, m - 1 + i, Math.min(d, ultimoDia));
        return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
      });
    }
    return [] as string[];
  }, [lead.vencimentos_datas, lead.vencimento, mesesAntes]);
  const comLista = datasParcelas.length > 1;
  const [excluidas, setExcluidas] = useState<Set<number>>(new Set());
  const alternar = (i: number) => setExcluidas(prev => { const s = new Set(prev); if (s.has(i)) s.delete(i); else s.add(i); return s; });
  const aVencer = datasParcelas.map((d, i) => ({ d, i })).filter(x => x.d >= hojeISO).map(x => x.i);
  const [meses, setMeses] = useState(mesesAntes > 1 ? String(mesesAntes - 1) : '');
  const n = comLista ? mesesAntes - excluidas.size : Number(meses);
  const valorProporcional = mesesAntes > 0 && n > 0 ? r2(valorAntes * n / mesesAntes) : 0;
  const [valorDigitado, setValorDigitado] = useState<string | null>(null);
  const valorDepois = valorDigitado !== null ? Number(valorDigitado.replace(/\./g, '').replace(',', '.')) || 0 : valorProporcional;
  const fimSugerido = lead.contrato_inicio && n > 0 ? fimComMeses(lead.contrato_inicio, n) : (lead.contrato_fim?.substring(0, 10) || '');
  const [fimDigitado, setFimDigitado] = useState<string | null>(null);
  const fimDepois = fimDigitado ?? fimSugerido;
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const diferenca = r2(valorDepois - valorAntes);
  const vendedorNome = lead.vendedor_nome || 'o vendedor da venda';
  const mesVenda = lead.fechado_em ? mesAno(new Date(lead.fechado_em)) : 'o mês da venda';
  const valorOriginal = valorVenda(lead);
  const invalido = (comLista && excluidas.size === 0) || !(n > 0) || (mesesAntes > 0 && n >= mesesAntes) || !(valorDepois > 0) || valorDepois >= valorAntes || motivo.trim().length < 3;

  const itensNovos = useMemo(() => {
    const fator = mesesAntes > 0 && n > 0 ? n / mesesAntes : valorAntes ? valorDepois / valorAntes : 1;
    return (lead.itens || []).map(i => ({ ...i, quantidade: Math.max(1, Math.round((Number(i.quantidade) || 0) * fator)) }));
  }, [lead.itens, mesesAntes, n, valorAntes, valorDepois]);

  async function confirmar() {
    if (invalido || salvando) return;
    setSalvando(true); setErro('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const vendedorId = lead.fechado_por || lead.user_id || null;
      const { error: eAjuste } = await supabase.from('vendas_ajustes').insert({
        empresa_id: empresaId, lead_id: lead.id, tipo: 'reducao', valor: diferenca,
        valor_antes: valorAntes, valor_depois: valorDepois,
        parcelas_antes: lead.parcelas || null, parcelas_depois: String(n),
        contrato_fim_antes: lead.contrato_fim?.substring(0, 10) || null, contrato_fim_depois: fimDepois || null,
        itens_antes: lead.itens || [], motivo: motivo.trim(),
        vendedor_id: vendedorId, vendedor_nome: lead.vendedor_nome || null, unidade: lead.unidade || null, user_id: user?.id || null,
      });
      if (eAjuste) throw new Error(eAjuste.message.includes('row-level security') ? 'Só a diretoria e a gerência podem encurtar contrato.' : eAjuste.message);

      const nota = {
        id: Date.now(), created_at: new Date().toISOString(),
        texto: `✂️ Contrato encurtado por ${autorNome}: ${mesesAntes || '?'} → ${n} ${n === 1 ? 'parcela' : 'parcelas'}${comLista ? ` (excluídas: ${[...excluidas].sort((a, b) => a - b).map(i => `${i + 1}ª de ${dataBR(datasParcelas[i])}`).join(', ')})` : ''}, ${brl(valorAntes)} → ${brl(valorDepois)} (${brl(diferenca)}). Fim: ${dataBR(fimDepois)}. Motivo: ${motivo.trim()}`,
      };
      const campos: Partial<LeadEncurtar> = {
        itens: itensNovos, valor_total: valorDepois, parcelas: String(n),
        desconto: lead.desconto ? r2(lead.desconto * valorDepois / valorAntes) : lead.desconto,
        valor_fechado: lead.valor_fechado ?? valorAntes,
        notas: [nota, ...(Array.isArray(lead.notas) ? lead.notas : [])],
        ...(fimDepois ? { contrato_fim: fimDepois } : {}),
        ...(comLista
          ? { vencimentos_datas: datasParcelas.filter((_, i) => !excluidas.has(i)) }
          : Array.isArray(lead.vencimentos_datas) && lead.vencimentos_datas.length > n ? { vencimentos_datas: lead.vencimentos_datas.slice(0, n) } : {}),
      };
      const { error: eLead } = await supabase.from('leads').update(campos).eq('id', lead.id);
      if (eLead) throw new Error(eLead.message);

      // Financeiro: tira a diferença das parcelas em aberto, da última para a primeira
      let resta = -diferenca;
      const { data: abertos } = await supabase.from('lancamentos').select('id, valor')
        .eq('lead_id', lead.id).eq('status', 'pendente').order('data_vencimento', { ascending: false });
      for (const p of abertos || []) {
        if (resta <= 0.009) break;
        const v = Number(p.valor) || 0;
        if (v <= resta + 0.009) { await supabase.from('lancamentos').delete().eq('id', p.id); resta = r2(resta - v); }
        else { await supabase.from('lancamentos').update({ valor: r2(v - resta) }).eq('id', p.id); resta = 0; }
      }
      const aviso = (abertos || []).length && resta > 0.009
        ? `Contrato encurtado. Faltaram ${brl(resta)} para descontar: já estava pago — combine a devolução ou crédito com o cliente.`
        : 'Contrato encurtado. A diferença entra na meta e na comissão deste mês.';
      onSalvo(campos, aviso);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível encurtar o contrato.');
    } finally {
      setSalvando(false);
    }
  }

  const campo = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-amber-400/50 [color-scheme:dark]';
  const rotulo = 'text-[10px] font-black uppercase text-slate-500 tracking-widest';

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
      <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-md max-h-[92vh] overflow-y-auto custom-scrollbar">
        <div className="flex justify-between items-start mb-4 gap-3">
          <div>
            <h3 className="font-black uppercase text-sm flex items-center gap-2"><Scissors size={14} className="text-amber-400"/> Encurtar contrato</h3>
            <p className="text-slate-400 text-xs mt-1">{lead.empresa}</p>
          </div>
          <button onClick={onFechar} className="text-slate-500 hover:text-white"><X size={16}/></button>
        </div>

        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-3 text-xs text-slate-300 mb-4">
          Contrato atual: <b>{mesesAntes || '—'} {mesesAntes === 1 ? 'parcela' : 'parcelas'}</b> · <b>{brl(valorAntes)}</b> · fim {dataBR(lead.contrato_fim)}
        </div>

        <div className="space-y-3">
          {comLista ? (
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className={rotulo}>Parcelas a excluir</span>
                {aVencer.length > 0 && (
                  <button type="button" onClick={() => { setExcluidas(new Set(aVencer)); setValorDigitado(null); setFimDigitado(null); }}
                    className="text-[10px] font-black uppercase tracking-widest text-amber-300 hover:text-amber-200">Marcar todas a vencer</button>
                )}
              </div>
              <div className="mt-1 grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto custom-scrollbar">
                {datasParcelas.map((d, i) => {
                  const vencida = d < hojeISO;
                  const marcada = excluidas.has(i);
                  return (
                    <button key={i} type="button" disabled={vencida} onClick={() => { alternar(i); setValorDigitado(null); setFimDigitado(null); }}
                      title={vencida ? 'Parcela já vencida: não pode ser excluída aqui' : marcada ? 'Manter esta parcela' : 'Excluir esta parcela'}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition-colors disabled:cursor-not-allowed ${marcada ? 'border-red-500/50 bg-red-500/10 text-red-300 line-through' : vencida ? 'border-white/5 bg-white/[0.02] text-slate-600' : 'border-white/10 bg-white/5 text-slate-200 hover:border-amber-400/50'}`}>
                      <span>Parc. {i + 1}</span><span>{dataBR(d)}{vencida ? ' · vencida' : ''}</span>
                    </button>
                  );
                })}
              </div>
              <span className="text-[10px] text-slate-600">Toque nas parcelas a vencer que o cliente não vai mais pagar. Ficam {n} de {mesesAntes}.</span>
            </div>
          ) : (
            <label className="block"><span className={rotulo}>Novo nº de meses / parcelas</span>
              <input type="number" min={1} max={mesesAntes > 0 ? mesesAntes - 1 : undefined} value={meses}
                onChange={e => { setMeses(e.target.value); setValorDigitado(null); setFimDigitado(null); }} className={`mt-1 ${campo}`}/>
            </label>
          )}
          <label className="block"><span className={rotulo}>Novo valor total (R$)</span>
            <input inputMode="decimal" value={valorDigitado ?? (valorProporcional ? valorProporcional.toFixed(2).replace('.', ',') : '')}
              onChange={e => setValorDigitado(e.target.value)} className={`mt-1 ${campo}`}/>
            <span className="text-[10px] text-slate-600">Sugerido na proporção das parcelas que ficam. Pode ajustar.</span>
          </label>
          <label className="block"><span className={rotulo}>Nova data de fim</span>
            <input type="date" value={fimDepois} onChange={e => setFimDigitado(e.target.value)} className={`mt-1 ${campo}`}/>
          </label>
          <label className="block"><span className={rotulo}>Motivo *</span>
            <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} placeholder="Ex.: cliente pediu para ficar só 3 meses"
              className={`mt-1 ${campo} font-medium text-xs resize-none`}/>
          </label>
        </div>

        {n > 0 && valorDepois > 0 && valorDepois < valorAntes && (
          <div className="mt-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 text-xs text-amber-200 space-y-1">
            <p>Diferença: <b>{brl(diferenca)}</b>, descontada da meta e da comissão de <b>{vendedorNome}</b> em <b>{mesAno(new Date())}</b>.</p>
            <p className="text-amber-200/70">{mesVenda[0].toUpperCase() + mesVenda.slice(1)} continua com {brl(valorOriginal)}, porque a comissão daquele mês já foi calculada.</p>
            <p className="text-amber-200/70">As parcelas em aberto desta venda no financeiro são reduzidas a partir da última. O contrato assinado não muda: se precisar, faça um termo de alteração com o cliente.</p>
          </div>
        )}
        {mesesAntes > 0 && n >= mesesAntes && <p className="mt-3 text-xs text-red-400 flex items-center gap-1.5"><AlertTriangle size={12}/> O novo prazo precisa ser menor que {mesesAntes} meses.</p>}
        {erro && <p className="mt-3 text-xs text-red-400">{erro}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={onFechar} className="flex-1 py-3 rounded-xl text-xs font-black uppercase text-slate-400 hover:text-white bg-white/5">Cancelar</button>
          <button onClick={confirmar} disabled={invalido || salvando}
            className="flex-1 py-3 rounded-xl text-xs font-black uppercase bg-amber-500 hover:bg-amber-600 text-[#0B1120] disabled:opacity-40 flex items-center justify-center gap-2">
            {salvando ? <Loader2 size={13} className="animate-spin"/> : <Scissors size={13}/>} Encurtar
          </button>
        </div>
      </div>
    </div>
  );
}
