"use client";
import { useEffect, useState } from 'react';
import { Loader2, FileText, FileSignature, ExternalLink } from 'lucide-react';

type Cobranca = { id: number; tipo: string; valor: number; vencimento: string | null; pago_em: string | null; status: string; forma: string | null; invoice_url: string | null; nf_url: string | null };
type Conta = {
  plano: { mensalidade: number; dia: number; forma: string; automatica: boolean } | null;
  cobrancas: Cobranca[];
  contrato: { status: string; assinarUrl: string | null; pdfUrl: string | null; data: string } | null;
};

const PAGOS = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];
const moeda = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');
const FORMA: Record<string, string> = { BOLETO: 'boleto', PIX: 'Pix', CREDIT_CARD: 'cartão de crédito', UNDEFINED: 'boleto, Pix ou cartão' };

// "Minha conta" do app: mensalidade, faturas (pagar/2ª via/NF) e contrato.
export default function ContaApp({ cor }: { cor: string }) {
  const [c, setC] = useState<Conta | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    fetch('/api/rastreio/app/conta', { cache: 'no-store' }).then(async r => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErro(j.error || 'Não deu para carregar.'); else setC(j);
    }).catch(() => setErro('Sem conexão.'));
  }, []);

  if (erro) return <p className="text-center text-sm text-slate-400 py-10">{erro}</p>;
  if (!c) return <Loader2 size={20} className="animate-spin text-slate-500 mx-auto mt-10" />;
  const abertas = c.cobrancas.filter(x => ['PENDING', 'OVERDUE'].includes(x.status));
  const outras = c.cobrancas.filter(x => !['PENDING', 'OVERDUE'].includes(x.status));

  return (
    <div className="space-y-3">
      {c.plano && (
        <section className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Meu plano</p>
          <p className="text-2xl font-black mt-1">{moeda(c.plano.mensalidade)}<span className="text-sm text-slate-400 font-bold">/mês</span></p>
          <p className="text-sm text-slate-400">Vence todo dia {c.plano.dia} · {FORMA[c.plano.forma] || FORMA.UNDEFINED}{c.plano.forma === 'CREDIT_CARD' && c.plano.automatica ? ' (cobrado automaticamente no cartão)' : ''}</p>
        </section>
      )}

      {c.contrato && (
        <section className={`rounded-2xl border p-4 ${c.contrato.status === 'enviado' ? 'border-amber-500/40 bg-amber-500/10' : 'border-white/10 bg-[#0F172A]'}`}>
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><FileSignature size={13} /> Contrato</p>
          {c.contrato.status === 'enviado' ? (
            <>
              <p className="text-sm text-amber-100 mt-1">Seu contrato está esperando a sua assinatura.</p>
              {c.contrato.assinarUrl && <a href={c.contrato.assinarUrl} target="_blank" rel="noreferrer" className="mt-3 min-h-12 rounded-xl font-black uppercase text-sm text-[#0B1120] flex items-center justify-center" style={{ background: cor }}>Assinar pelo celular</a>}
            </>
          ) : (
            <>
              <p className="text-sm text-slate-300 mt-1">Assinado em {dataBR(c.contrato.data)}.</p>
              {c.contrato.pdfUrl && <a href={c.contrato.pdfUrl} target="_blank" rel="noreferrer" className="mt-3 min-h-11 rounded-xl border border-white/15 bg-white/5 text-sm font-bold flex items-center justify-center gap-2"><FileText size={16} /> Ver contrato</a>}
            </>
          )}
        </section>
      )}

      <section aria-label="Faturas em aberto" className="space-y-2">
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 px-1">Em aberto</p>
        {abertas.length === 0 ? <p className="text-sm text-slate-400 px-1">Nada em aberto. Tudo em dia!</p> : abertas.map(x => (
          <article key={x.id} className={`rounded-2xl border p-4 ${x.status === 'OVERDUE' ? 'border-red-500/40 bg-red-500/10' : 'border-white/10 bg-[#0F172A]'}`}>
            <div className="flex justify-between gap-2">
              <div>
                <p className="font-black">{x.tipo}</p>
                <p className={`text-xs ${x.status === 'OVERDUE' ? 'text-red-300' : 'text-slate-400'}`}>{x.status === 'OVERDUE' ? 'Venceu em' : 'Vence em'} {dataBR(x.vencimento)}</p>
              </div>
              <p className="font-black text-lg">{moeda(x.valor)}</p>
            </div>
            {x.invoice_url && (
              <a href={x.invoice_url} target="_blank" rel="noreferrer" className="mt-3 min-h-12 rounded-xl font-black uppercase text-sm text-[#0B1120] flex items-center justify-center gap-2" style={{ background: cor }}>
                Pagar (Pix, boleto ou cartão) <ExternalLink size={14} />
              </a>
            )}
          </article>
        ))}
      </section>

      {outras.length > 0 && (
        <section aria-label="Histórico" className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Histórico</p>
          <ul className="divide-y divide-white/5 text-sm">
            {outras.map(x => (
              <li key={x.id} className="py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate">{x.tipo}</p>
                  <p className="text-xs text-slate-400">{PAGOS.includes(x.status) ? `Paga em ${dataBR(x.pago_em)}` : x.status === 'REFUNDED' ? 'Estornada' : x.status}</p>
                </div>
                <span className="font-bold">{moeda(x.valor)}</span>
                {x.invoice_url && <a href={x.invoice_url} target="_blank" rel="noreferrer" aria-label="Comprovante" className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-slate-300"><ExternalLink size={14} /></a>}
                {x.nf_url && <a href={x.nf_url} target="_blank" rel="noreferrer" aria-label="Nota fiscal" className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-sky-300"><FileText size={14} /></a>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
