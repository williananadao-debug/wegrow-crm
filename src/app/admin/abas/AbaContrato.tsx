"use client";
import { useState, useEffect } from 'react';
import { Loader2, PenLine, CheckCircle2, Clock, ExternalLink } from 'lucide-react';
import { AbaProps, headersAuth, fmtData } from './types';

export default function AbaContrato({ empresa, token, onAtualizado }: AbaProps) {
  const [signerNome, setSignerNome] = useState(empresa.billing?.contrato_signer_nome ?? empresa.billing?.contato ?? '');
  const [signerEmail, setSignerEmail] = useState(empresa.billing?.contrato_signer_email ?? '');
  const [form, setForm] = useState({
    razao_social: empresa.billing?.razao_social ?? empresa.nome ?? '',
    cnpj: empresa.billing?.cnpj ?? '',
    endereco: empresa.billing?.endereco ?? '',
    dia_vencimento: empresa.billing?.proximo_vencimento ? String(new Date(empresa.billing.proximo_vencimento + 'T00:00:00').getDate()) : '10',
    data_inicio: new Date().toISOString().substring(0, 10),
  });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setSignerNome(empresa.billing?.contrato_signer_nome ?? empresa.billing?.contato ?? '');
    setSignerEmail(empresa.billing?.contrato_signer_email ?? '');
    setForm({
      razao_social: empresa.billing?.razao_social ?? empresa.nome ?? '',
      cnpj: empresa.billing?.cnpj ?? '',
      endereco: empresa.billing?.endereco ?? '',
      dia_vencimento: empresa.billing?.proximo_vencimento ? String(new Date(empresa.billing.proximo_vencimento + 'T00:00:00').getDate()) : '10',
      data_inicio: new Date().toISOString().substring(0, 10),
    });
    setErro(null);
  }, [empresa.id]);

  const gerarEEnviar = async () => {
    if (!signerNome.trim() || !signerEmail.trim()) return;
    if (!form.razao_social.trim() || !form.cnpj.trim() || !form.endereco.trim()) return;
    setEnviando(true); setErro(null);
    const res = await fetch('/api/admin/contrato', {
      method: 'POST',
      headers: headersAuth(token),
      body: JSON.stringify({
        empresa_id: empresa.id,
        cliente_razao: form.razao_social.trim(),
        cliente_cnpj: form.cnpj.trim(),
        cliente_endereco: form.endereco.trim(),
        valor_mensal: empresa.billing?.valor_mensal || 0,
        dia_vencimento: form.dia_vencimento,
        data_inicio: form.data_inicio,
        signer_nome: signerNome.trim(),
        signer_email: signerEmail.trim(),
      }),
    });
    const json = await res.json().catch(() => ({}));
    setEnviando(false);
    if (!res.ok) { setErro(json.erro || 'Erro ao gerar/enviar contrato.'); return; }
    onAtualizado();
  };

  return (
    <div className="space-y-4">
      <p className="text-slate-400 text-xs">Contrato de serviço WeGrow ↔ cliente (não é o contrato de veiculação publicitária — esse já tem fluxo próprio no Kanban de Deals).</p>

      {erro && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
          <p className="text-red-400 text-xs font-bold">{erro}</p>
        </div>
      )}

      {empresa.billing?.contrato_status === 'assinado' ? (
        <div className="bg-[#22C55E]/10 border border-[#22C55E]/20 rounded-2xl p-4 flex items-start gap-3">
          <CheckCircle2 size={16} className="text-[#22C55E] shrink-0 mt-0.5"/>
          <div>
            <p className="text-[#22C55E] font-black text-xs uppercase tracking-widest mb-1">Assinado</p>
            <p className="text-slate-400 text-xs">{empresa.billing?.contrato_assinado_em ? fmtData(empresa.billing.contrato_assinado_em.substring(0, 10)) : ''} · confira o documento assinado direto no painel do Docuseal.</p>
          </div>
        </div>
      ) : empresa.billing?.contrato_status === 'enviado' ? (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4">
          <p className="text-yellow-400 font-black text-xs uppercase tracking-widest mb-2 flex items-center gap-2"><Clock size={13}/> Aguardando assinatura</p>
          <p className="text-slate-400 text-xs mb-1">Enviado pra {empresa.billing?.contrato_signer_nome} ({empresa.billing?.contrato_signer_email}){empresa.billing?.contrato_enviado_em ? ' em ' + fmtData(empresa.billing.contrato_enviado_em.substring(0, 10)) : ''}.</p>
          {empresa.billing?.contrato_sign_url && (
            <a href={empresa.billing.contrato_sign_url} target="_blank" rel="noopener noreferrer" className="text-[#22C55E] text-xs font-bold flex items-center gap-1 mt-2 hover:underline"><ExternalLink size={12}/> Ver link de assinatura</a>
          )}
        </div>
      ) : (
        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 space-y-3">
          <p className="text-slate-300 text-xs font-bold">Dados do cliente (pra gerar o contrato)</p>
          <input value={form.razao_social} onChange={e => setForm({ ...form, razao_social: e.target.value })} placeholder="Razão social" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
          <div className="grid grid-cols-2 gap-2">
            <input value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} placeholder="CNPJ" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
            <input value={form.dia_vencimento} onChange={e => setForm({ ...form, dia_vencimento: e.target.value })} placeholder="Dia vencimento (ex: 10)" type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
          </div>
          <input value={form.endereco} onChange={e => setForm({ ...form, endereco: e.target.value })} placeholder="Endereço completo" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
          <input value={form.data_inicio} onChange={e => setForm({ ...form, data_inicio: e.target.value })} type="date" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#22C55E] transition-colors"/>

          <p className="text-slate-300 text-xs font-bold pt-2 border-t border-white/5">Quem vai assinar pelo cliente</p>
          <div className="grid grid-cols-2 gap-2">
            <input value={signerNome} onChange={e => setSignerNome(e.target.value)} placeholder="Nome do responsável" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
            <input value={signerEmail} onChange={e => setSignerEmail(e.target.value)} placeholder="e-mail@cliente.com" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
          </div>

          <button
            onClick={gerarEEnviar}
            disabled={enviando || !signerNome.trim() || !signerEmail.trim() || !form.razao_social.trim() || !form.cnpj.trim() || !form.endereco.trim()}
            className="w-full bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E] py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {enviando ? <Loader2 size={13} className="animate-spin"/> : <PenLine size={13}/>}
            Gerar e enviar contrato
          </button>
          <p className="text-slate-600 text-[10px]">O PDF é gerado automaticamente com esses dados e os módulos contratados — sem precisar subir arquivo nem posicionar campo de assinatura na mão.</p>
        </div>
      )}
    </div>
  );
}
