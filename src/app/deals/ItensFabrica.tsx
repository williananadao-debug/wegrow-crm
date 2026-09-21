"use client";
import { useMemo, useState } from 'react';
import { Search, Trash2, Plus, Package } from 'lucide-react';

// Montagem de proposta pra empresa FÁBRICA (Pulse + CRM): catálogo com foto do equipamento,
// preço editável por linha, capacidade e opcionais (IHM/supervisório, moega extra, frete e
// montagem "chave na mão" etc.). A linha guarda precoBase + configuracoes e mantém
// precoUnitario = precoBase + soma dos opcionais, então o subtotal do modal (que só olha
// precoUnitario × quantidade) continua certo sem mudar nada no resto do funil.

export type ConfigOpcional = { chave: string; descricao: string; valor: number };
export type ItemFabrica = {
  servico: string; quantidade: number; precoUnitario: number;
  precoBase?: number; capacidade?: string; observacao?: string; imagemUrl?: string | null;
  configuracoes?: ConfigOpcional[];
  [k: string]: any;
};
type ServicoCatalogo = { id: number; nome: string; preco: number; tipo?: string | null; imagem_url?: string | null; descricao?: string | null };

// Opcionais recorrentes dessa operação (transcrição Heitor/Biomaq): automação, moega,
// refratário e as duas modalidades de logística. Valor sempre editável na linha.
const OPCIONAIS_PADRAO = [
  'Automação com IHM (painel)',
  'Automação com supervisório (computador)',
  'Moega de recepção adicional',
  'Refratário com mais alumínio',
  'Refratário com menos alumínio',
  'Frete (chave na mão)',
  'Montagem, hospedagem e alimentação da equipe (chave na mão)',
  'Start-up e operação assistida',
];

const somaOpcionais = (i: ItemFabrica) => (i.configuracoes || []).reduce((s, c) => s + (Number(c.valor) || 0), 0);
const recalcula = (i: ItemFabrica): ItemFabrica => ({ ...i, precoUnitario: (Number(i.precoBase) || 0) + somaOpcionais(i) });

export function novoItemFabrica(s: ServicoCatalogo): ItemFabrica {
  return { servico: s.nome, quantidade: 1, precoBase: s.preco || 0, precoUnitario: s.preco || 0, imagemUrl: s.imagem_url || null, configuracoes: [], capacidade: '', observacao: '' };
}

export default function ItensFabrica({ servicos, itens, onChange }: {
  servicos: ServicoCatalogo[]; itens: ItemFabrica[]; onChange: (novos: ItemFabrica[]) => void;
}) {
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState<string>('todos');

  const tipos = useMemo(() => Array.from(new Set(servicos.map(s => s.tipo || 'Outros'))), [servicos]);
  const visiveis = servicos.filter(s =>
    (tipo === 'todos' || (s.tipo || 'Outros') === tipo) &&
    (!busca.trim() || s.nome.toLowerCase().includes(busca.toLowerCase())));

  const atualiza = (idx: number, patch: Partial<ItemFabrica>) => onChange(itens.map((it, i) => i === idx ? recalcula({ ...it, ...patch }) : it));
  const adicionaOpcional = (idx: number, descricao: string) => {
    if (!descricao.trim()) return;
    const it = itens[idx];
    atualiza(idx, { configuracoes: [...(it.configuracoes || []), { chave: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, descricao: descricao.trim(), valor: 0 }] });
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Catálogo de equipamentos</p>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 flex-1 min-w-[160px]">
            <Search size={12} className="text-slate-500" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar produto..." className="bg-transparent outline-none text-xs text-white w-full" />
          </div>
          {['todos', ...tipos].map(t => (
            <button key={t} type="button" onClick={() => setTipo(t)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${tipo === t ? 'bg-white text-[#0B1120] border-white' : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'}`}>
              {t === 'todos' ? 'Todos' : t}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[280px] overflow-y-auto custom-scrollbar pr-1">
          {visiveis.map(s => (
            <button key={s.id} type="button" onClick={() => onChange([...itens, novoItemFabrica(s)])}
              className="text-left bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[var(--cor-primaria)]/50 rounded-xl overflow-hidden transition-all group">
              <div className="aspect-[4/3] bg-white flex items-center justify-center overflow-hidden">
                {s.imagem_url ? <img src={s.imagem_url} alt={s.nome} className="w-full h-full object-contain" /> : <Package size={28} className="text-slate-400" />}
              </div>
              <div className="p-2.5">
                <p className="text-[10px] text-slate-200 font-bold uppercase leading-tight line-clamp-2">{s.nome}</p>
                <p className="text-[10px] font-black text-[var(--cor-primaria)] mt-1">{s.preco > 0 ? `Ref. R$ ${s.preco.toLocaleString('pt-BR')}` : 'Valor na proposta'}</p>
              </div>
            </button>
          ))}
          {visiveis.length === 0 && <p className="col-span-full text-center text-slate-600 text-xs py-6">Nenhum produto encontrado.</p>}
        </div>
      </div>

      {itens.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-white/5">
          {itens.map((item, i) => (
            <div key={i} className="bg-[#0F172A] border border-white/5 rounded-xl p-3 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-16 h-16 bg-white rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                  {item.imagemUrl ? <img src={item.imagemUrl} alt="" className="w-full h-full object-contain" /> : <Package size={20} className="text-slate-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-white uppercase leading-tight">{item.servico}</p>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <label className="block">
                      <span className="text-[8px] font-bold uppercase text-slate-500">Qtd</span>
                      <input type="number" min="1" value={item.quantidade} onChange={e => atualiza(i, { quantidade: Math.max(1, Number(e.target.value) || 1) })}
                        className="w-full bg-black/50 border border-white/10 rounded px-2 py-1.5 text-xs text-white font-bold outline-none focus:border-[var(--cor-primaria)]" />
                    </label>
                    <label className="block col-span-2">
                      <span className="text-[8px] font-bold uppercase text-slate-500">Valor do equipamento (R$)</span>
                      <input type="number" min="0" step="0.01" value={item.precoBase ?? ''} onChange={e => atualiza(i, { precoBase: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-black/50 border border-white/10 rounded px-2 py-1.5 text-xs text-white font-bold outline-none focus:border-[var(--cor-primaria)]" />
                    </label>
                  </div>
                </div>
                <button type="button" onClick={() => onChange(itens.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-white p-1.5 bg-red-500/10 hover:bg-red-500 rounded transition-colors shrink-0"><Trash2 size={12} /></button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[8px] font-bold uppercase text-slate-500">Capacidade / tamanho (ex: 400.000 kcal/h, economizador 25)</span>
                  <input value={item.capacidade || ''} onChange={e => atualiza(i, { capacidade: e.target.value })}
                    className="w-full bg-black/50 border border-white/10 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-[var(--cor-primaria)]" />
                </label>
                <label className="block">
                  <span className="text-[8px] font-bold uppercase text-slate-500">Observação (combustível, layout, etc.)</span>
                  <input value={item.observacao || ''} onChange={e => atualiza(i, { observacao: e.target.value })}
                    className="w-full bg-black/50 border border-white/10 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-[var(--cor-primaria)]" />
                </label>
              </div>

              <div>
                <span className="text-[8px] font-bold uppercase text-slate-500">Opcionais / adicionais desta máquina</span>
                <div className="space-y-1.5 mt-1">
                  {(item.configuracoes || []).map((c, ci) => (
                    <div key={c.chave} className="flex items-center gap-2">
                      <input value={c.descricao} onChange={e => atualiza(i, { configuracoes: (item.configuracoes || []).map((x, xi) => xi === ci ? { ...x, descricao: e.target.value } : x) })}
                        className="flex-1 min-w-0 bg-black/50 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white outline-none" />
                      <input type="number" step="0.01" value={c.valor || ''} placeholder="R$" onChange={e => atualiza(i, { configuracoes: (item.configuracoes || []).map((x, xi) => xi === ci ? { ...x, valor: parseFloat(e.target.value) || 0 } : x) })}
                        className="w-28 bg-black/50 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white text-right outline-none" />
                      <button type="button" onClick={() => atualiza(i, { configuracoes: (item.configuracoes || []).filter((_, xi) => xi !== ci) })} className="text-slate-500 hover:text-red-400 p-1"><Trash2 size={12} /></button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <select value="" onChange={e => { adicionaOpcional(i, e.target.value); }}
                      className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1.5 text-[11px] text-slate-300 outline-none">
                      <option value="">+ Adicionar opcional…</option>
                      {OPCIONAIS_PADRAO.filter(o => !(item.configuracoes || []).some(c => c.descricao === o)).map(o => <option key={o} value={o} className="bg-[#0F172A]">{o}</option>)}
                    </select>
                    <button type="button" onClick={() => adicionaOpcional(i, 'Outro opcional')} className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-400 hover:text-white bg-white/5 border border-white/10 rounded px-2 py-1.5"><Plus size={10} /> Outro</button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[11px]">
                <span className="text-slate-500 font-bold">{item.quantidade} × R$ {item.precoUnitario.toLocaleString('pt-BR')}{somaOpcionais(item) !== 0 && ` (inclui R$ ${somaOpcionais(item).toLocaleString('pt-BR')} de opcionais)`}</span>
                <span className="font-black text-[var(--cor-primaria)]">R$ {(item.quantidade * item.precoUnitario).toLocaleString('pt-BR')}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
