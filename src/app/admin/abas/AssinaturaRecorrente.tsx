"use client";
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Repeat, RefreshCw, XCircle, ExternalLink, Handshake, Unlock, AlertTriangle } from 'lucide-react';
import { Empresa, headersAuth, fmtData } from './types';

type Pagamento = {
  asaas_payment_id: string; vencimento: string | null; valor: number; status: string; pago_em: string | null;
  forma: string | null; invoice_url: string | null; split_valor: number | null; split_status: string | null;
};
type Parceiro = { id: string; nome: string; comissao_pct: number; asaas_wallet_id?: string | null; split_base?: string; ativo?: boolean };

const FORMAS = [
  { valor: 'UNDEFINED', label: 'Cliente escolhe (boleto, Pix ou cartão)' },
  { valor: 'BOLETO', label: 'Boleto' },
  { valor: 'PIX', label: 'Pix' },
  { valor: 'CREDIT_CARD', label: 'Cartão de crédito' },
];

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'A vencer', cls: 'text-slate-300 bg-white/5 border-white/10' },
  OVERDUE: { label: 'Em atraso', cls: 'text-red-300 bg-red-500/10 border-red-500/20' },
  RECEIVED: { label: 'Pago', cls: 'text-[#4ADE80] bg-[#22C55E]/10 border-[#22C55E]/20' },
  CONFIRMED: { label: 'Confirmado', cls: 'text-[#4ADE80] bg-[#22C55E]/10 border-[#22C55E]/20' },
  RECEIVED_IN_CASH: { label: 'Pago (fora)', cls: 'text-[#4ADE80] bg-[#22C55E]/10 border-[#22C55E]/20' },
  REFUNDED: { label: 'Estornado', cls: 'text-amber-300 bg-amber-500/10 border-amber-500/20' },
  DELETED: { label: 'Removido', cls: 'text-slate-500 bg-white/5 border-white/10' },
};

const brl = (v: number | null | undefined) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Assinatura mensal no Asaas da WeGrow: o boleto/Pix sai sozinho todo mês e, se a empresa é da
// carteira de um parceiro com carteira Asaas, a comissão dele é separada no ato do pagamento.
export default function AssinaturaRecorrente({ empresa, token, parceiros, onAtualizado }: { empresa: Empresa; token: string; parceiros: Parceiro[]; onAtualizado: () => void }) {
  const b = empresa.billing;
  const ativa = b?.assinatura_status === 'ativa' && !!b?.asaas_subscription_id;
  const [forma, setForma] = useState(b?.forma_pagamento || 'UNDEFINED');
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [acao, setAcao] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const parceiro = parceiros.find(p => p.id === empresa.parceiro_id) || null;
  const valor = Number(b?.valor_mensal || 0);
  const comissao = parceiro ? (parceiro.split_base === 'liquido' ? null : Math.round(valor * Number(parceiro.comissao_pct)) / 100) : null;

  const carregar = useCallback(() => {
    fetch(`/api/admin/cobranca?empresa_id=${empresa.id}`, { headers: headersAuth(token) })
      .then(r => r.ok ? r.json() : { pagamentos: [] })
      .then(j => setPagamentos(j.pagamentos || []))
      .catch(() => setPagamentos([]));
  }, [empresa.id, token]);

  useEffect(() => { carregar(); setForma(empresa.billing?.forma_pagamento || 'UNDEFINED'); setMsg(null); }, [empresa.id, carregar, empresa.billing?.forma_pagamento]);

  const executar = async (nome: string, corpo: Record<string, any>, sucesso: string) => {
    setAcao(nome); setMsg(null);
    try {
      const res = await fetch('/api/admin/cobranca', { method: 'POST', headers: headersAuth(token), body: JSON.stringify({ empresa_id: empresa.id, ...corpo }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ ok: false, texto: j.erro || 'Erro na cobrança.' }); return; }
      let texto = sucesso;
      if (j.split?.semCarteira) texto += ` Atenção: ${j.split.nome} ainda não tem carteira Asaas — a comissão não está sendo separada.`;
      setMsg({ ok: true, texto });
      carregar();
      onAtualizado();
    } finally { setAcao(null); }
  };

  const cancelar = () => {
    if (!confirm(`Cancelar a assinatura de ${empresa.nome}? As mensalidades futuras deixam de ser geradas no Asaas.`)) return;
    executar('cancelar', { acao: 'cancelar_assinatura' }, 'Assinatura cancelada.');
  };

  const emAtraso = pagamentos.filter(p => p.status === 'OVERDUE');

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${ativa ? 'bg-[#22C55E]/15 text-[#22C55E]' : 'bg-white/5 text-slate-500'}`}><Repeat size={15} /></div>
          <div>
            <p className="text-sm font-semibold text-white">Assinatura recorrente</p>
            <p className="text-xs text-slate-500">{ativa ? `Ativa · ${FORMAS.find(f => f.valor === b?.forma_pagamento)?.label || 'Cliente escolhe'} · próximo vencimento ${fmtData(b?.proximo_vencimento)}` : b?.assinatura_status === 'cancelada' ? 'Cancelada' : 'Boleto/Pix gerado sozinho todo mês pelo Asaas'}</p>
          </div>
        </div>
        {ativa && (
          <button onClick={() => executar('sync', { acao: 'sincronizar' }, 'Pagamentos atualizados.')} disabled={!!acao} title="Puxar do Asaas" className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-400 hover:text-white disabled:opacity-50">
            {acao === 'sync' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          </button>
        )}
      </div>

      {empresa.bloqueio_cobranca_em && (
        <div className="flex items-center justify-between gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
          <p className="text-xs text-red-300 flex items-center gap-2"><AlertTriangle size={13} /> Acesso suspenso por pendência desde {fmtData(empresa.bloqueio_cobranca_em.substring(0, 10))}. Volta sozinho quando o pagamento entra.</p>
          <button onClick={() => executar('liberar', { acao: 'liberar_acesso' }, 'Acesso liberado.')} disabled={!!acao} className="shrink-0 flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50">
            {acao === 'liberar' ? <Loader2 size={11} className="animate-spin" /> : <Unlock size={11} />} Liberar
          </button>
        </div>
      )}
      {!empresa.bloqueio_cobranca_em && emAtraso.length > 0 && (
        <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">{emAtraso.length === 1 ? '1 mensalidade em atraso' : `${emAtraso.length} mensalidades em atraso`} — a régua de cobrança está avisando o cliente.</p>
      )}

      {parceiro && (
        <div className="flex items-center gap-2 text-xs text-slate-400 bg-black/20 border border-white/5 rounded-xl px-3 py-2.5">
          <Handshake size={13} className="text-[#22C55E] shrink-0" />
          {parceiro.asaas_wallet_id && parceiro.ativo !== false
            ? <span>Split: <b className="text-slate-200">{parceiro.comissao_pct}% para {parceiro.nome}</b>{comissao != null ? ` (${brl(comissao)} por mensalidade, sobre o valor cheio)` : ' (sobre o valor após a tarifa do Asaas)'} — cai na carteira dele no pagamento.</span>
            : <span>{parceiro.nome} ainda não tem carteira Asaas — cadastre em God Mode → Parceiros pra comissão ser separada sozinha.</span>}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-medium text-slate-400 ml-1 mb-1 block">Forma de pagamento</label>
          <select value={forma} onChange={e => setForma(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm font-medium outline-none focus:border-[#22C55E]">
            {FORMAS.map(f => <option key={f.valor} value={f.valor} className="bg-[#0B1120]">{f.label}</option>)}
          </select>
        </div>
        <button onClick={() => executar('salvar', { acao: 'assinatura', forma }, ativa ? 'Assinatura atualizada (vale também para as mensalidades em aberto).' : 'Assinatura criada — o Asaas gera a cobrança de cada mês sozinho.')}
          disabled={!!acao || !valor} className="flex items-center gap-1.5 bg-[#22C55E] text-[#0B1120] px-3.5 py-2.5 rounded-lg text-xs font-semibold disabled:opacity-50">
          {acao === 'salvar' ? <Loader2 size={12} className="animate-spin" /> : <Repeat size={12} />} {ativa ? 'Atualizar assinatura' : 'Ativar assinatura'}
        </button>
        {ativa && (
          <button onClick={cancelar} disabled={!!acao} className="flex items-center gap-1.5 bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 text-slate-400 hover:text-red-300 px-3 py-2.5 rounded-lg text-xs font-semibold disabled:opacity-50">
            {acao === 'cancelar' ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />} Cancelar
          </button>
        )}
      </div>
      {!valor && <p className="text-[11px] text-slate-500 ml-1">Preencha e salve o valor mensal e o próximo vencimento abaixo antes de ativar.</p>}
      {msg && <p className={`text-xs rounded-xl px-3 py-2.5 ${msg.ok ? 'bg-[#22C55E]/10 border border-[#22C55E]/20 text-[#4ADE80]' : 'bg-red-500/10 border border-red-500/20 text-red-300'}`}>{msg.texto}</p>}

      {pagamentos.length > 0 && (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 text-left">
                <th className="font-medium px-1 py-1.5">Vencimento</th>
                <th className="font-medium px-1 py-1.5 text-right">Valor</th>
                <th className="font-medium px-1 py-1.5">Situação</th>
                <th className="font-medium px-1 py-1.5">Pago em</th>
                {parceiro && <th className="font-medium px-1 py-1.5 text-right">Parceiro</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {pagamentos.map(p => {
                const st = STATUS[p.status] || { label: p.status, cls: 'text-slate-400 bg-white/5 border-white/10' };
                return (
                  <tr key={p.asaas_payment_id} className="border-t border-white/[0.05]">
                    <td className="px-1 py-2 text-slate-300 tabular-nums">{fmtData(p.vencimento)}</td>
                    <td className="px-1 py-2 text-right text-white tabular-nums">{brl(p.valor)}</td>
                    <td className="px-1 py-2"><span className={`inline-block border rounded-md px-1.5 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span></td>
                    <td className="px-1 py-2 text-slate-400 tabular-nums">{p.pago_em ? fmtData(p.pago_em) : '—'}</td>
                    {parceiro && <td className="px-1 py-2 text-right text-slate-300 tabular-nums">{p.split_valor != null ? brl(p.split_valor) : '—'}</td>}
                    <td className="px-1 py-2 text-right">{p.invoice_url && <a href={p.invoice_url} target="_blank" rel="noopener noreferrer" className="inline-flex p-1.5 text-slate-500 hover:text-white" title="Abrir fatura"><ExternalLink size={12} /></a>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
