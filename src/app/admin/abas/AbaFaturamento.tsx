"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, Save, MessageCircle, CheckCircle2, RefreshCw, Receipt, QrCode, ExternalLink, Copy } from 'lucide-react';
import { AbaProps, headersAuth, fmtData, proximoMes, BILLING_VAZIO, emitirNfMensalidade } from './types';

const CANAIS_ORIGEM = [
  { valor: '', label: 'Não definido' },
  { valor: 'ialto', label: 'IAlto' },
  { valor: 'nilton', label: 'Nilton' },
  { valor: 'organico', label: 'Orgânico' },
  { valor: 'indicacao', label: 'Indicação' },
  { valor: 'parceiro', label: 'Parceiro (revenda)' },
  { valor: 'direto', label: 'Direto' },
];

export default function AbaFaturamento({ empresa, token, onAtualizado }: AbaProps) {
  const [form, setForm] = useState({
    valor_mensal: String(empresa.billing?.valor_mensal ?? ''),
    proximo_vencimento: empresa.billing?.proximo_vencimento ?? '',
    whatsapp: empresa.billing?.whatsapp ?? '',
    contato: empresa.billing?.contato ?? '',
    email_financeiro: empresa.billing?.email_financeiro ?? '',
    observacao: empresa.billing?.observacao ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvandoChurn, setSalvandoChurn] = useState(false);
  const [registrandoPgto, setRegistrandoPgto] = useState(false);
  const [gerandoCobranca, setGerandoCobranca] = useState<'BOLETO' | 'PIX' | null>(null);
  const [erroCobranca, setErroCobranca] = useState<string | null>(null);
  const [linkCopiado, setLinkCopiado] = useState(false);
  const [nf, setNf] = useState<{ ok: boolean; msg: string } | null>(null);
  const [emitindoNf, setEmitindoNf] = useState(false);
  const [parceiros, setParceiros] = useState<{ id: string; nome: string; comissao_pct: number }[]>([]);

  useEffect(() => {
    fetch('/api/admin/parceiros', { headers: headersAuth(token) })
      .then(r => r.ok ? r.json() : [])
      .then(setParceiros)
      .catch(() => setParceiros([]));
  }, [token]);

  useEffect(() => {
    setForm({
      valor_mensal: String(empresa.billing?.valor_mensal ?? ''),
      proximo_vencimento: empresa.billing?.proximo_vencimento ?? '',
      whatsapp: empresa.billing?.whatsapp ?? '',
      contato: empresa.billing?.contato ?? '',
      email_financeiro: empresa.billing?.email_financeiro ?? '',
      observacao: empresa.billing?.observacao ?? '',
    });
    setErro(null);
  }, [empresa.id]);

  const salvar = async () => {
    setSaving(true); setErro(null);
    const payload = {
      empresa_id: empresa.id,
      valor_mensal: parseFloat(form.valor_mensal) || 0,
      proximo_vencimento: form.proximo_vencimento || null,
      whatsapp: form.whatsapp || null,
      contato: form.contato || null,
      email_financeiro: form.email_financeiro.trim().toLowerCase() || null,
      observacao: form.observacao || null,
    };
    const { error } = await supabase.from('clientes_wegrow').upsert(payload, { onConflict: 'empresa_id' });
    setSaving(false);
    if (error) { setErro(error.message); return; }
    onAtualizado();
  };

  const atualizarCanalOrigem = async (canal: string) => {
    setSalvandoChurn(true);
    await fetch('/api/admin/empresas', {
      method: 'PATCH',
      headers: headersAuth(token),
      body: JSON.stringify({ id: empresa.id, canal_origem: canal || null }),
    });
    setSalvandoChurn(false);
    onAtualizado();
  };

  // Parceiro (revenda) dono da carteira — a rádio aparece no Portal do Parceiro dele e conta na comissão.
  const atualizarParceiro = async (parceiroId: string) => {
    setSalvandoChurn(true);
    const res = await fetch('/api/admin/empresas', {
      method: 'PATCH',
      headers: headersAuth(token),
      body: JSON.stringify({ id: empresa.id, parceiro_id: parceiroId || null, ...(parceiroId && !empresa.canal_origem ? { canal_origem: 'parceiro' } : {}) }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.erro || 'Erro ao salvar o parceiro.'); }
    setSalvandoChurn(false);
    onAtualizado();
  };

  const marcarCancelado = async (cancelar: boolean) => {
    if (cancelar && !confirm(`Marcar ${empresa.nome} como cancelado hoje? Isso conta pro cálculo de churn.`)) return;
    setSalvandoChurn(true);
    await fetch('/api/admin/empresas', {
      method: 'PATCH',
      headers: headersAuth(token),
      body: JSON.stringify({ id: empresa.id, cancelado_em: cancelar ? new Date().toISOString() : null }),
    });
    setSalvandoChurn(false);
    onAtualizado();
  };

  const gerarCobranca = async (tipo: 'BOLETO' | 'PIX') => {
    setGerandoCobranca(tipo); setErroCobranca(null);
    try {
      const res = await fetch('/api/admin/cobranca', {
        method: 'POST',
        headers: headersAuth(token),
        body: JSON.stringify({ empresa_id: empresa.id, tipo }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErroCobranca(json.erro || 'Erro ao gerar cobrança.'); return; }
      onAtualizado();
      if (json.url) window.open(json.url, '_blank');
    } finally {
      setGerandoCobranca(null);
    }
  };

  const registrarPagamento = async () => {
    setRegistrandoPgto(true);
    const atual = empresa.billing?.proximo_vencimento ?? new Date().toISOString().substring(0, 10);
    await supabase.from('clientes_wegrow').upsert(
      { ...BILLING_VAZIO(empresa.id), ...(empresa.billing ?? {}), empresa_id: empresa.id, proximo_vencimento: proximoMes(atual) },
      { onConflict: 'empresa_id' }
    );
    // Mensalidade paga → NFS-e da competência que acabou de ser quitada (se a automação estiver ligada).
    const r = await emitirNfMensalidade(token, empresa.id, atual.substring(0, 7), 'pagamento_recebido');
    setNf(r.ok || !r.msg.includes('desligada') ? r : null);
    setRegistrandoPgto(false);
    onAtualizado();
  };

  const emitirNf = async () => {
    const alvo = prompt('Competência da nota (AAAA-MM):', new Date().toISOString().substring(0, 7)) || '';
    if (!/^\d{4}-\d{2}$/.test(alvo)) { if (alvo) alert('Use o formato AAAA-MM.'); return; }
    setEmitindoNf(true);
    setNf(await emitirNfMensalidade(token, empresa.id, alvo, 'manual'));
    setEmitindoNf(false);
  };

  return (
    <div className="space-y-4">
      {erro && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
          <p className="text-red-400 font-black text-xs uppercase mb-2">Erro ao salvar — execute no Supabase:</p>
          <pre className="text-[10px] text-green-400 font-mono bg-black/40 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap">{`alter table clientes_wegrow disable row level security;`}</pre>
          <p className="text-slate-500 text-[10px] mt-2 font-mono">{erro}</p>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={registrarPagamento} disabled={registrandoPgto} className="flex items-center gap-1.5 bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E] px-3 py-2 rounded-xl font-semibold text-xs transition-all disabled:opacity-50">
          {registrandoPgto ? <Loader2 size={11} className="animate-spin"/> : <CheckCircle2 size={11}/>} Pgto recebido
        </button>
        <button onClick={() => gerarCobranca('BOLETO')} disabled={gerandoCobranca !== null} className="flex items-center gap-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 px-3 py-2 rounded-xl font-semibold text-xs transition-all disabled:opacity-50">
          {gerandoCobranca === 'BOLETO' ? <Loader2 size={11} className="animate-spin"/> : <Receipt size={11}/>} Gerar boleto
        </button>
        <button onClick={() => gerarCobranca('PIX')} disabled={gerandoCobranca !== null} className="flex items-center gap-1.5 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-400 px-3 py-2 rounded-xl font-semibold text-xs transition-all disabled:opacity-50">
          {gerandoCobranca === 'PIX' ? <Loader2 size={11} className="animate-spin"/> : <QrCode size={11}/>} Gerar Pix
        </button>
        {empresa.billing?.whatsapp && (
          <a href={`https://wa.me/55${empresa.billing.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá${empresa.billing.contato ? ' ' + empresa.billing.contato : ''}!${empresa.billing?.ultima_cobranca_url ? ` Segue o link pra pagar a assinatura WeGrow: ${empresa.billing.ultima_cobranca_url}` : ` Segue o Pix para renovação da assinatura WeGrow — R$ ${(empresa.billing.valor_mensal ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês.`} Vencimento: ${fmtData(empresa.billing.proximo_vencimento)}.`)}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white px-3 py-2 rounded-xl font-semibold text-xs transition-all">
            <MessageCircle size={11}/> Cobrar
          </a>
        )}
        <button onClick={emitirNf} disabled={emitindoNf} className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white px-3 py-2 rounded-xl font-semibold text-xs transition-all disabled:opacity-50">
          {emitindoNf ? <Loader2 size={11} className="animate-spin"/> : <Receipt size={11}/>} Emitir NF
        </button>
      </div>

      {nf && (
        <div className={`rounded-xl p-3 text-xs flex items-start justify-between gap-3 ${nf.ok ? 'bg-[#22C55E]/10 border border-[#22C55E]/20 text-[#4ADE80]' : 'bg-red-500/10 border border-red-500/20 text-red-300'}`}>
          <span>{nf.msg}</span>
          <a href="/admin/notas-fiscais" className="shrink-0 underline opacity-80 hover:opacity-100">Notas fiscais</a>
        </div>
      )}

      {erroCobranca && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-3">
          <p className="text-red-400 text-xs font-bold">{erroCobranca}</p>
        </div>
      )}

      {empresa.billing?.ultima_cobranca_url && (
        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-400">Última cobrança gerada ({empresa.billing.ultima_cobranca_tipo})</p>
            <p className="text-slate-400 text-[10px] truncate">{empresa.billing.ultima_cobranca_em ? fmtData(empresa.billing.ultima_cobranca_em.substring(0, 10)) : ''} · status: {empresa.billing.ultima_cobranca_status || '—'}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => { navigator.clipboard.writeText(empresa.billing!.ultima_cobranca_url!); setLinkCopiado(true); setTimeout(() => setLinkCopiado(false), 2000); }} className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-400 hover:text-white transition-colors" title="Copiar link">
              <Copy size={13}/>
            </button>
            <a href={empresa.billing.ultima_cobranca_url} target="_blank" rel="noopener noreferrer" className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-400 hover:text-white transition-colors" title="Abrir">
              <ExternalLink size={13}/>
            </a>
          </div>
          {linkCopiado && <span className="text-[#22C55E] text-[10px] font-bold">Copiado!</span>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-400 ml-1 mb-1 block">Valor mensal (R$)</label>
          <input type="number" value={form.valor_mensal} onChange={e => setForm(f => ({ ...f, valor_mensal: e.target.value }))} placeholder="497" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm font-medium outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-400 ml-1 mb-1 block">Próx. vencimento</label>
          <input type="date" value={form.proximo_vencimento} onChange={e => setForm(f => ({ ...f, proximo_vencimento: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm font-medium outline-none focus:border-[#22C55E] transition-colors"/>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-400 ml-1 mb-1 block">Contato</label>
          <input value={form.contato} onChange={e => setForm(f => ({ ...f, contato: e.target.value }))} placeholder="Nome" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm font-medium outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-400 ml-1 mb-1 block">WhatsApp</label>
          <input value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="(47) 99999-9999" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm font-medium outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-slate-400 ml-1 mb-1 block">E-mail financeiro (recebe a nota fiscal)</label>
        <input type="email" value={form.email_financeiro} onChange={e => setForm(f => ({ ...f, email_financeiro: e.target.value }))} placeholder={empresa.billing?.contrato_signer_email || 'financeiro@cliente.com.br'} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm font-medium outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
        {!form.email_financeiro && empresa.billing?.contrato_signer_email && <p className="text-[11px] text-slate-500 mt-1 ml-1">Vazio = vai para quem assinou o contrato ({empresa.billing.contrato_signer_email}).</p>}
      </div>
      <div>
        <label className="text-xs font-medium text-slate-400 ml-1 mb-1 block">Observação</label>
        <textarea value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} rows={2} placeholder="Notas internas..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-medium outline-none focus:border-[#22C55E] transition-colors resize-none placeholder:text-slate-600"/>
      </div>

      <button onClick={salvar} disabled={saving} className="bg-[#22C55E] text-[#0B1120] px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2">
        {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Salvar
      </button>

      <div className="pt-3 border-t border-white/5">
        <label className="text-xs font-medium text-slate-400 ml-1 mb-1 block">Parceiro (carteira)</label>
        <select
          value={empresa.parceiro_id || ''}
          onChange={e => atualizarParceiro(e.target.value)}
          disabled={salvandoChurn}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm font-medium outline-none focus:border-[#22C55E] transition-colors disabled:opacity-50"
        >
          <option value="" className="bg-[#0B1120]">Venda direta WeGrow (sem parceiro)</option>
          {parceiros.map(p => <option key={p.id} value={p.id} className="bg-[#0B1120]">{p.nome} · {p.comissao_pct}% de comissão</option>)}
        </select>
        <p className="text-[9px] text-slate-600 mt-1 ml-1">A rádio aparece no Portal do Parceiro dele (suporte, senha, comissão). Gerencie em God Mode → Parceiros.</p>
      </div>

      <div className="pt-3 border-t border-white/5 grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-400 ml-1 mb-1 block">Canal de origem</label>
          <select
            value={empresa.canal_origem || ''}
            onChange={e => atualizarCanalOrigem(e.target.value)}
            disabled={salvandoChurn}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm font-medium outline-none focus:border-[#22C55E] transition-colors disabled:opacity-50"
          >
            {CANAIS_ORIGEM.map(c => <option key={c.valor} value={c.valor} className="bg-[#0B1120]">{c.label}</option>)}
          </select>
          <p className="text-[9px] text-slate-600 mt-1 ml-1">Alimenta conversão e CAC por canal em Indicadores.</p>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-400 ml-1 mb-1 block">Status de churn</label>
          {empresa.cancelado_em ? (
            <div className="flex items-center gap-2">
              <span className="flex-1 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-xs font-bold">Cancelado em {fmtData(empresa.cancelado_em.substring(0, 10))}</span>
              <button onClick={() => marcarCancelado(false)} disabled={salvandoChurn} className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-colors disabled:opacity-50" title="Desfazer cancelamento">
                <RefreshCw size={14}/>
              </button>
            </div>
          ) : (
            <button onClick={() => marcarCancelado(true)} disabled={salvandoChurn} className="w-full bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 text-slate-400 hover:text-red-400 rounded-xl px-4 py-3 text-xs font-semibold transition-all disabled:opacity-50">
              Marcar como cancelado
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
