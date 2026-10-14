'use client';

// Escolha do tipo da NF de venda antes de emitir: entrega futura (NF1 5922 agora + NF2 5116
// na entrega, disparada pela Produção) ou venda normal (uma NF só, 5101/5102, entrega na hora).
export type ModalidadeNfVenda = 'venda' | 'entrega_futura';
export type OrigemNfVenda = 'producao' | 'revenda';
export type FreteNf = 0 | 1 | 9;
export type EscolhaNfVenda = { modalidade: ModalidadeNfVenda; origem: OrigemNfVenda; modalidadeFrete: FreteNf };

export const ESCOLHA_NF_PADRAO: EscolhaNfVenda = { modalidade: 'venda', origem: 'producao', modalidadeFrete: 9 };

export const OPCOES_FRETE: { valor: FreteNf; texto: string }[] = [
  { valor: 9, texto: 'Sem frete / cliente retira ou entrega própria' },
  { valor: 0, texto: 'Por conta do emitente (a empresa paga)' },
  { valor: 1, texto: 'Por conta do destinatário (o cliente paga)' },
];

export function SeletorFrete({ valor, onChange }: { valor: FreteNf; onChange: (v: FreteNf) => void }) {
  return (
    <div>
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 mt-1 block">Frete</label>
      <select
        value={valor} onChange={e => onChange(Number(e.target.value) as FreteNf)}
        className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-blue-400/60"
      >
        {OPCOES_FRETE.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
      </select>
    </div>
  );
}

const OPCOES: { valor: ModalidadeNfVenda; titulo: string; texto: string }[] = [
  { valor: 'venda', titulo: 'Venda normal', texto: 'Cliente leva/recebe agora. Uma NF só (CFOP 5101/5102).' },
  { valor: 'entrega_futura', titulo: 'Entrega futura', texto: 'Fatura agora e entrega depois. A NF de remessa sai quando a Produção marcar "Entregue" (lá escolhe o frete).' },
];

export default function SeletorTipoNf({ valor, onChange }: { valor: EscolhaNfVenda; onChange: (v: EscolhaNfVenda) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Tipo da nota</label>
      {OPCOES.map(o => (
        <button
          key={o.valor} type="button" onClick={() => onChange({ ...valor, modalidade: o.valor })}
          className={`w-full text-left rounded-xl border px-3 py-2.5 transition-all ${valor.modalidade === o.valor ? 'border-blue-400/60 bg-blue-500/10' : 'border-white/10 bg-black/30 hover:border-white/20'}`}
        >
          <span className={`block text-xs font-black uppercase ${valor.modalidade === o.valor ? 'text-blue-300' : 'text-white'}`}>{o.titulo}</span>
          <span className="block text-[11px] text-slate-400 leading-snug mt-0.5">{o.texto}</span>
        </button>
      ))}
      {valor.modalidade === 'venda' && (
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 mt-1 block">Origem do produto</label>
          <select
            value={valor.origem} onChange={e => onChange({ ...valor, origem: e.target.value as OrigemNfVenda })}
            className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 text-white text-sm outline-none focus:border-blue-400/60"
          >
            <option value="producao">Fabricado pela empresa (5101)</option>
            <option value="revenda">Revenda: comprado pronto (5102)</option>
          </select>
          <SeletorFrete valor={valor.modalidadeFrete} onChange={f => onChange({ ...valor, modalidadeFrete: f })} />
        </div>
      )}
    </div>
  );
}
