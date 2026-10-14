"use client";
import { useState } from 'react';
import { Loader2, Plus, Search, Trash2, Wrench, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// NF-e avulsa de remessa para conserto (inclusive envio em garantia ao fabricante).
// CFOP 5915/6915 e CSOSN 400 ficam por conta do servidor (/api/pulse/fiscal/emitir-remessa-conserto).

type Item = { descricao: string; ncm: string; quantidade: string; valor: string };
const ITEM_VAZIO: Item = { descricao: '', ncm: '', quantidade: '1', valor: '' };

const numeroBr = (v: string) => Number(v.replace(/\./g, '').replace(',', '.'));
const brl = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function RemessaConsertoModal({ onFechar, onEmitida }: { onFechar: () => void; onEmitida: () => void }) {
  const [dest, setDest] = useState({ cnpj: '', nome: '', ie: '', endereco: '', numero: '', bairro: '', cep: '', municipio: '', uf: '', telefone: '', email: '' });
  const [itens, setItens] = useState<Item[]>([{ ...ITEM_VAZIO }]);
  const [chave, setChave] = useState('');
  const [observacao, setObservacao] = useState('');
  const [frete, setFrete] = useState<'0' | '1' | '9'>('9');
  const [buscando, setBuscando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const campo = (k: keyof typeof dest) => ({
    value: dest[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDest(d => ({ ...d, [k]: e.target.value })),
  });

  // Mesmas fontes da tela de Clientes: cnpj.ws traz a inscrição estadual; BrasilAPI é o plano B.
  const buscarCnpj = async () => {
    const cnpj = dest.cnpj.replace(/\D/g, '');
    if (cnpj.length !== 14) { setErro('Digite os 14 números do CNPJ.'); return; }
    setBuscando(true); setErro(null); setAviso(null);
    try {
      const r1 = await fetch(`https://publica.cnpj.ws/cnpj/${cnpj}`, { signal: AbortSignal.timeout(10000) }).catch(() => null);
      if (r1?.ok) {
        const j = await r1.json(); const e = j.estabelecimento || {};
        const ieSc = (e.inscricoes_estaduais || []).find((i: any) => i.ativo !== false && i.estado?.sigla === e.estado?.sigla) || e.inscricoes_estaduais?.[0];
        setDest(d => ({
          ...d, nome: j.razao_social || d.nome, ie: ieSc?.inscricao_estadual || 'ISENTO',
          endereco: `${e.tipo_logradouro || ''} ${e.logradouro || ''}`.trim() || d.endereco, numero: e.numero || d.numero,
          bairro: e.bairro || d.bairro, cep: e.cep || d.cep, municipio: e.cidade?.nome || d.municipio, uf: e.estado?.sigla || d.uf,
          telefone: e.ddd1 && e.telefone1 ? `${e.ddd1}${e.telefone1}` : d.telefone, email: e.email || d.email,
        }));
        return;
      }
      const r2 = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { signal: AbortSignal.timeout(10000) }).catch(() => null);
      if (r2?.ok) {
        const j = await r2.json();
        setDest(d => ({
          ...d, nome: j.razao_social || d.nome, endereco: j.logradouro || d.endereco, numero: j.numero || d.numero,
          bairro: j.bairro || d.bairro, cep: j.cep || d.cep, municipio: j.municipio || d.municipio, uf: j.uf || d.uf,
        }));
        setAviso('Endereço preenchido, mas a inscrição estadual não veio — digite a IE do destinatário.');
        return;
      }
      setErro('Não achei esse CNPJ — preencha os dados à mão.');
    } finally { setBuscando(false); }
  };

  const mudarItem = (idx: number, k: keyof Item, v: string) => setItens(l => l.map((it, i) => i === idx ? { ...it, [k]: v } : it));
  const total = itens.reduce((s, i) => s + (numeroBr(i.quantidade) || 0) * (numeroBr(i.valor) || 0), 0);

  // Sugere o texto de garantia com o número da NF de compra tirado da chave (posições 26–34).
  const chaveDigitos = chave.replace(/\D/g, '');
  const numeroNfCompra = chaveDigitos.length === 44 ? String(parseInt(chaveDigitos.slice(25, 34), 10)) : null;

  const podeEmitir = dest.cnpj.replace(/\D/g, '').length >= 11 && dest.nome && dest.endereco && dest.municipio && dest.uf.length === 2
    && itens.every(i => i.descricao.trim() && i.ncm.replace(/\D/g, '').length === 8 && numeroBr(i.quantidade) > 0 && numeroBr(i.valor) > 0)
    && (!chaveDigitos || chaveDigitos.length === 44);

  const emitir = async () => {
    setEnviando(true); setErro(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/pulse/fiscal/emitir-remessa-conserto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          destinatario: dest,
          itens: itens.map(i => ({ descricao: i.descricao, ncm: i.ncm, quantidade: numeroBr(i.quantidade), valorUnitario: numeroBr(i.valor) })),
          chaveReferenciada: chaveDigitos || null, observacao, modalidadeFrete: Number(frete),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(j.error || `Erro ${res.status}`); return; }
      onEmitida();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao emitir.');
    } finally { setEnviando(false); }
  };

  const input = 'w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-amber-500';
  const rotulo = 'text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !enviando && onFechar()}>
      <div className="bg-[#0F172A] border border-amber-500/30 rounded-3xl p-6 w-full max-w-2xl shadow-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-black text-white uppercase italic text-lg flex items-center gap-2"><Wrench size={18} className="text-amber-400" /> Remessa para conserto</h3>
            <p className="text-slate-500 text-xs font-bold">Envio para conserto ou garantia · CFOP 5915 (SC) / 6915 (outro estado)</p>
          </div>
          <button onClick={onFechar} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3 text-amber-200 text-xs font-bold leading-relaxed mb-4">
          Nota de saída <b>sem venda</b>: o item sai para conserto e volta com a nota de <b>retorno</b> emitida por quem consertou (CFOP 5916/6916). Use o mesmo valor da nota de compra do item.
        </div>

        <p className="text-xs font-black text-white uppercase mb-2">Destinatário (quem vai consertar)</p>
        <div className="flex gap-2 mb-2">
          <input {...campo('cnpj')} placeholder="CNPJ" inputMode="numeric" className={input} />
          <button onClick={buscarCnpj} disabled={buscando} className="shrink-0 inline-flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 px-3 rounded-xl text-xs font-black uppercase">
            {buscando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Buscar
          </button>
        </div>
        <div className="grid grid-cols-6 gap-2 mb-4">
          <div className="col-span-6 sm:col-span-4"><label className={rotulo}>Razão social</label><input {...campo('nome')} className={input} /></div>
          <div className="col-span-6 sm:col-span-2"><label className={rotulo}>Inscrição estadual</label><input {...campo('ie')} placeholder="ou ISENTO" className={input} /></div>
          <div className="col-span-4"><label className={rotulo}>Endereço</label><input {...campo('endereco')} className={input} /></div>
          <div className="col-span-2"><label className={rotulo}>Número</label><input {...campo('numero')} className={input} /></div>
          <div className="col-span-3 sm:col-span-2"><label className={rotulo}>Bairro</label><input {...campo('bairro')} className={input} /></div>
          <div className="col-span-3 sm:col-span-2"><label className={rotulo}>CEP</label><input {...campo('cep')} inputMode="numeric" className={input} /></div>
          <div className="col-span-4 sm:col-span-1"><label className={rotulo}>Município</label><input {...campo('municipio')} className={input} /></div>
          <div className="col-span-2 sm:col-span-1"><label className={rotulo}>UF</label><input {...campo('uf')} maxLength={2} className={`${input} uppercase`} /></div>
        </div>

        <p className="text-xs font-black text-white uppercase mb-2">Itens</p>
        <div className="space-y-2 mb-2">
          {itens.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-end bg-white/[0.02] border border-white/5 rounded-xl p-2">
              <div className="col-span-12 sm:col-span-5"><label className={rotulo}>Descrição (com nº de série)</label><input value={it.descricao} onChange={e => mudarItem(idx, 'descricao', e.target.value.slice(0, 120))} className={input} /></div>
              <div className="col-span-4 sm:col-span-2"><label className={rotulo}>NCM</label><input value={it.ncm} onChange={e => mudarItem(idx, 'ncm', e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" className={input} /></div>
              <div className="col-span-3 sm:col-span-1"><label className={rotulo}>Qtd</label><input value={it.quantidade} onChange={e => mudarItem(idx, 'quantidade', e.target.value.replace(/[^\d,]/g, ''))} inputMode="decimal" className={input} /></div>
              <div className="col-span-4 sm:col-span-3"><label className={rotulo}>Valor unit. (R$)</label><input value={it.valor} onChange={e => mudarItem(idx, 'valor', e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" placeholder="0,00" className={input} /></div>
              <div className="col-span-1 flex justify-end pb-2">
                {itens.length > 1 && <button onClick={() => setItens(l => l.filter((_, i) => i !== idx))} className="text-slate-500 hover:text-red-400" aria-label="Remover item"><Trash2 size={16} /></button>}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setItens(l => [...l, { ...ITEM_VAZIO }])} className="text-xs font-black uppercase text-amber-300 hover:text-amber-200 inline-flex items-center gap-1"><Plus size={12} /> Adicionar item</button>
          <span className="text-sm font-black text-white">Total: R$ {brl(total)}</span>
        </div>

        <div className="grid sm:grid-cols-3 gap-2 mb-2">
          <div className="sm:col-span-2">
            <label className={rotulo}>Chave da nota de compra do item (opcional)</label>
            <input value={chave} onChange={e => setChave(e.target.value.replace(/[^\d ]/g, '').slice(0, 60))} placeholder="44 dígitos — sai referenciada na remessa" inputMode="numeric" className={input} />
          </div>
          <div>
            <label className={rotulo}>Frete</label>
            <select value={frete} onChange={e => setFrete(e.target.value as '0' | '1' | '9')} className={input}>
              <option value="9">Sem frete / entrega própria</option>
              <option value="0">Por conta do emitente</option>
              <option value="1">Por conta do destinatário</option>
            </select>
          </div>
        </div>
        <label className={rotulo}>Informações complementares</label>
        <textarea value={observacao} onChange={e => setObservacao(e.target.value.slice(0, 500))} rows={3}
          placeholder="Ex: Remessa para conserto em garantia, ref. NF-e nº ... (texto legal da suspensão do ICMS conforme a contabilidade)"
          className={`${input} resize-none mb-1`} />
        {numeroNfCompra && !observacao && (
          <button onClick={() => setObservacao(`Remessa para conserto em garantia, referente à NF-e nº ${numeroNfCompra} de aquisição da mercadoria.`)}
            className="text-[11px] font-bold text-amber-300 hover:text-amber-200 mb-3">Usar texto sugerido (ref. NF {numeroNfCompra})</button>
        )}

        {aviso && <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-bold p-3 rounded-xl my-3">{aviso}</div>}
        {erro && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl my-3">{erro}</div>}
        <button onClick={emitir} disabled={enviando || !podeEmitir} className="w-full mt-3 bg-amber-500 hover:bg-amber-600 text-black font-black uppercase text-xs tracking-widest py-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-40">
          {enviando ? <Loader2 size={16} className="animate-spin" /> : <Wrench size={16} />} {enviando ? 'Enviando pra SEFAZ...' : `Emitir remessa · R$ ${brl(total)}`}
        </button>
      </div>
    </div>
  );
}
