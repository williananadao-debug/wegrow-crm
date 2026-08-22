"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, Save, MessageCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { AbaProps, headersAuth, fmtData, proximoMes, BILLING_VAZIO } from './types';

const CANAIS_ORIGEM = [
  { valor: '', label: 'Não definido' },
  { valor: 'ialto', label: 'IAlto' },
  { valor: 'nilton', label: 'Nilton' },
  { valor: 'organico', label: 'Orgânico' },
  { valor: 'indicacao', label: 'Indicação' },
  { valor: 'direto', label: 'Direto' },
];

export default function AbaFaturamento({ empresa, token, onAtualizado }: AbaProps) {
  const [form, setForm] = useState({
    valor_mensal: String(empresa.billing?.valor_mensal ?? ''),
    proximo_vencimento: empresa.billing?.proximo_vencimento ?? '',
    whatsapp: empresa.billing?.whatsapp ?? '',
    contato: empresa.billing?.contato ?? '',
    observacao: empresa.billing?.observacao ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvandoChurn, setSalvandoChurn] = useState(false);
  const [registrandoPgto, setRegistrandoPgto] = useState(false);

  useEffect(() => {
    setForm({
      valor_mensal: String(empresa.billing?.valor_mensal ?? ''),
      proximo_vencimento: empresa.billing?.proximo_vencimento ?? '',
      whatsapp: empresa.billing?.whatsapp ?? '',
      contato: empresa.billing?.contato ?? '',
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

  const registrarPagamento = async () => {
    setRegistrandoPgto(true);
    const atual = empresa.billing?.proximo_vencimento ?? new Date().toISOString().substring(0, 10);
    await supabase.from('clientes_wegrow').upsert(
      { ...BILLING_VAZIO(empresa.id), ...(empresa.billing ?? {}), empresa_id: empresa.id, proximo_vencimento: proximoMes(atual) },
      { onConflict: 'empresa_id' }
    );
    setRegistrandoPgto(false);
    onAtualizado();
  };

  return (
    <div className="space-y-4">
      {erro && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
          <p className="text-red-400 font-black text-xs uppercase tracking-widest mb-2">Erro ao salvar — execute no Supabase:</p>
          <pre className="text-[10px] text-green-400 font-mono bg-black/40 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap">{`alter table clientes_wegrow disable row level security;`}</pre>
          <p className="text-slate-500 text-[10px] mt-2 font-mono">{erro}</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button onClick={registrarPagamento} disabled={registrandoPgto} className="flex items-center gap-1.5 bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E] px-3 py-2 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all disabled:opacity-50">
          {registrandoPgto ? <Loader2 size={11} className="animate-spin"/> : <CheckCircle2 size={11}/>} Pgto recebido
        </button>
        {empresa.billing?.whatsapp && (
          <a href={`https://wa.me/55${empresa.billing.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá${empresa.billing.contato ? ' ' + empresa.billing.contato : ''}! Segue o Pix para renovação da assinatura WeGrow — R$ ${(empresa.billing.valor_mensal ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês. Vencimento: ${fmtData(empresa.billing.proximo_vencimento)}.`)}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white px-3 py-2 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all">
            <MessageCircle size={11}/> Cobrar
          </a>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Valor mensal (R$)</label>
          <input type="number" value={form.valor_mensal} onChange={e => setForm(f => ({ ...f, valor_mensal: e.target.value }))} placeholder="497" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
        </div>
        <div>
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Próx. vencimento</label>
          <input type="date" value={form.proximo_vencimento} onChange={e => setForm(f => ({ ...f, proximo_vencimento: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors"/>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Contato</label>
          <input value={form.contato} onChange={e => setForm(f => ({ ...f, contato: e.target.value }))} placeholder="Nome" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
        </div>
        <div>
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">WhatsApp</label>
          <input value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="(47) 99999-9999" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
        </div>
      </div>
      <div>
        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Observação</label>
        <textarea value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} rows={2} placeholder="Notas internas..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-medium outline-none focus:border-[#22C55E] transition-colors resize-none placeholder:text-slate-600"/>
      </div>

      <button onClick={salvar} disabled={saving} className="bg-[#22C55E] text-[#0B1120] px-4 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2">
        {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Salvar
      </button>

      <div className="pt-3 border-t border-white/5 grid grid-cols-2 gap-3">
        <div>
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Canal de origem</label>
          <select
            value={empresa.canal_origem || ''}
            onChange={e => atualizarCanalOrigem(e.target.value)}
            disabled={salvandoChurn}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors disabled:opacity-50"
          >
            {CANAIS_ORIGEM.map(c => <option key={c.valor} value={c.valor} className="bg-[#0B1120]">{c.label}</option>)}
          </select>
          <p className="text-[9px] text-slate-600 mt-1 ml-1">Alimenta conversão e CAC por canal em Indicadores.</p>
        </div>
        <div>
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Status de churn</label>
          {empresa.cancelado_em ? (
            <div className="flex items-center gap-2">
              <span className="flex-1 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-4 py-3 text-xs font-bold">Cancelado em {fmtData(empresa.cancelado_em.substring(0, 10))}</span>
              <button onClick={() => marcarCancelado(false)} disabled={salvandoChurn} className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-colors disabled:opacity-50" title="Desfazer cancelamento">
                <RefreshCw size={14}/>
              </button>
            </div>
          ) : (
            <button onClick={() => marcarCancelado(true)} disabled={salvandoChurn} className="w-full bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 text-slate-400 hover:text-red-400 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50">
              Marcar como cancelado
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
