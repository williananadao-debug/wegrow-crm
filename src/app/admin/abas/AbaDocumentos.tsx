"use client";
import { useState, useEffect, useRef } from 'react';
import { Loader2, PenLine, CheckCircle2, Clock, ExternalLink, Download, Upload, FileText, CalendarClock, Save } from 'lucide-react';
import { AbaProps, headersAuth, fmtData } from './types';
import { supabase } from '@/lib/supabase';

type Tipo = 'contrato' | 'cronograma';

const STATUS_CFG: Record<string, { label: string; cor: string; icon: React.ReactNode }> = {
  gerado:   { label: 'No Docuseal — falta posicionar assinatura e enviar', cor: 'text-blue-400 border-blue-500/20 bg-blue-500/10', icon: <FileText size={13}/> },
  enviado:  { label: 'Aguardando assinatura',                cor: 'text-yellow-400 border-yellow-500/20 bg-yellow-500/10', icon: <Clock size={13}/> },
  assinado: { label: 'Assinado',                              cor: 'text-[#22C55E] border-[#22C55E]/20 bg-[#22C55E]/10',   icon: <CheckCircle2 size={13}/> },
};

function arquivoParaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const resultado = reader.result as string;
      resolve(resultado.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AbaDocumentos({ empresa, token, onAtualizado }: AbaProps) {
  return (
    <div className="space-y-6">
      <p className="text-slate-400 text-xs">Documentos do cliente pra assinatura digital — não é o contrato de veiculação publicitária (esse já tem fluxo próprio no Kanban de Deals).</p>
      <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-3">
        <p className="text-slate-400 text-[11px]"><strong className="text-slate-300">Contrato</strong> é gerado e enviado pra assinatura automaticamente. <strong className="text-slate-300">Cronograma</strong> (PDF avulso, sem coordenada conhecida de assinatura) sobe pro Docuseal e abre o editor pra você arrastar os campos e mandar direto por lá — depois cola o link de assinatura de volta aqui. Painel do Docuseal: <a href={process.env.NEXT_PUBLIC_DOCUSEAL_URL || '#'} target="_blank" rel="noopener noreferrer" className="text-[#22C55E] underline">{process.env.NEXT_PUBLIC_DOCUSEAL_URL || 'console.docuseal.com'}</a>.</p>
      </div>

      <ContratoBloco empresa={empresa} token={token} onAtualizado={onAtualizado}/>
      <div className="border-t border-white/5"/>
      <CronogramaBloco empresa={empresa} token={token} onAtualizado={onAtualizado}/>
    </div>
  );
}

// ── Bloco compartilhado de status + link de assinatura (comum aos dois documentos) ──
function StatusEAssinatura({ empresa, token, tipo, onAtualizado }: AbaProps & { tipo: Tipo }) {
  const status = (empresa.billing as any)?.[`${tipo}_status`] as string | null;
  const signUrl = (empresa.billing as any)?.[`${tipo}_sign_url`] as string | null;
  const enviadoEm = (empresa.billing as any)?.[`${tipo}_enviado_em`] as string | null;
  const assinadoEm = (empresa.billing as any)?.[`${tipo}_assinado_em`] as string | null;

  const [linkRascunho, setLinkRascunho] = useState(signUrl || '');
  const [salvando, setSalvando] = useState(false);
  const [baixando, setBaixando] = useState(false);

  useEffect(() => { setLinkRascunho(signUrl || ''); }, [signUrl]);

  const baixarPdf = async () => {
    setBaixando(true);
    try {
      const res = await fetch(`/api/admin/documentos?empresa_id=${empresa.id}&tipo=${tipo}`, { headers: headersAuth(token) });
      const json = await res.json();
      if (res.ok && json.download_url) window.open(json.download_url, '_blank');
      else alert(json.erro || 'Erro ao gerar link de download.');
    } finally {
      setBaixando(false);
    }
  };

  const marcarEnviado = async () => {
    if (!linkRascunho.trim()) return;
    setSalvando(true);
    await supabase.from('clientes_wegrow').upsert({
      empresa_id: empresa.id,
      [`${tipo}_sign_url`]: linkRascunho.trim(),
      [`${tipo}_status`]: 'enviado',
      [`${tipo}_enviado_em`]: new Date().toISOString(),
    }, { onConflict: 'empresa_id' });
    setSalvando(false);
    onAtualizado();
  };

  const marcarAssinado = async () => {
    setSalvando(true);
    await supabase.from('clientes_wegrow').upsert({
      empresa_id: empresa.id,
      [`${tipo}_status`]: 'assinado',
      [`${tipo}_assinado_em`]: new Date().toISOString(),
    }, { onConflict: 'empresa_id' });
    setSalvando(false);
    onAtualizado();
  };

  if (!status) return null;
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.gerado;

  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-black uppercase tracking-widest ${cfg.cor}`}>
        {cfg.icon} {cfg.label}
      </div>

      <button onClick={baixarPdf} disabled={baixando} className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50">
        {baixando ? <Loader2 size={13} className="animate-spin"/> : <Download size={13}/>} Baixar PDF
      </button>

      {status !== 'assinado' && (
        <div className="flex items-center gap-2">
          <input value={linkRascunho} onChange={e => setLinkRascunho(e.target.value)} placeholder="Cola aqui o link de assinatura gerado no Docuseal"
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
          <button onClick={marcarEnviado} disabled={salvando || !linkRascunho.trim()} className="shrink-0 flex items-center gap-1.5 bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E] px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50">
            {salvando ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Salvar
          </button>
        </div>
      )}

      {signUrl && (
        <a href={signUrl} target="_blank" rel="noopener noreferrer" className="text-[#22C55E] text-xs font-bold flex items-center gap-1 hover:underline"><ExternalLink size={12}/> Abrir link de assinatura</a>
      )}

      {enviadoEm && <p className="text-slate-600 text-[10px] flex items-center gap-1"><CalendarClock size={10}/> Enviado em {fmtData(enviadoEm.substring(0, 10))}</p>}

      {status === 'enviado' && (
        <button onClick={marcarAssinado} disabled={salvando} className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50">
          {salvando ? <Loader2 size={13} className="animate-spin"/> : <CheckCircle2 size={13}/>} Marcar como assinado
        </button>
      )}

      {status === 'assinado' && assinadoEm && (
        <p className="text-[#22C55E] text-[11px] font-bold">Assinado em {fmtData(assinadoEm.substring(0, 10))}</p>
      )}
    </div>
  );
}

// ── Contrato ─────────────────────────────────────────────────────────────────────
function ContratoBloco({ empresa, token, onAtualizado }: AbaProps) {
  const [form, setForm] = useState({
    razao_social: empresa.billing?.razao_social ?? empresa.nome ?? '',
    cnpj: empresa.billing?.cnpj ?? '',
    endereco: empresa.billing?.endereco ?? '',
    dia_vencimento: empresa.billing?.proximo_vencimento ? String(new Date(empresa.billing.proximo_vencimento + 'T00:00:00').getDate()) : '10',
    data_inicio: new Date().toISOString().substring(0, 10),
    fidelidade_meses: String(empresa.billing?.contrato_fidelidade_meses ?? 12),
  });
  const [signerNome, setSignerNome] = useState(empresa.billing?.contrato_signer_nome ?? empresa.billing?.contato ?? '');
  const [signerEmail, setSignerEmail] = useState(empresa.billing?.contrato_signer_email ?? '');
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);

  const status = empresa.billing?.contrato_status;
  const mostrarForm = !status || status === 'rascunho' || editando;

  const gerar = async () => {
    if (!signerNome.trim() || !signerEmail.trim() || !form.razao_social.trim() || !form.cnpj.trim() || !form.endereco.trim()) return;
    setGerando(true); setErro(null);
    const res = await fetch('/api/admin/contrato', {
      method: 'POST',
      headers: headersAuth(token),
      body: JSON.stringify({
        empresa_id: empresa.id,
        cliente_razao: form.razao_social.trim(),
        cliente_cnpj: form.cnpj.trim(),
        cliente_endereco: form.endereco.trim(),
        valor_mensal: empresa.billing?.valor_mensal || 0,
        fidelidade_meses: form.fidelidade_meses,
        dia_vencimento: form.dia_vencimento,
        data_inicio: form.data_inicio,
        signer_nome: signerNome.trim(),
        signer_email: signerEmail.trim(),
      }),
    });
    const json = await res.json().catch(() => ({}));
    setGerando(false);
    if (!res.ok) { setErro(json.erro || 'Erro ao gerar contrato.'); return; }
    setEditando(false);
    onAtualizado();
    // A ordem de assinatura no Docuseal é WeGrow primeiro, cliente depois — mas isso só
    // acontece de verdade se alguém assinar como Contratada. Abre o link da WeGrow na
    // hora, senão ninguém clica nele e o contrato fica esperando a assinatura da WeGrow
    // pra sempre enquanto o cliente já está com o link dele.
    if (json.sign_url_contratada) window.open(json.sign_url_contratada, '_blank');
  };

  return (
    <div className="space-y-3">
      <p className="text-white font-black text-xs uppercase tracking-widest flex items-center gap-2"><PenLine size={13} className="text-[#22C55E]"/> Contrato de prestação de serviço</p>

      {erro && <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-red-400 text-xs font-bold">{erro}</div>}

      {mostrarForm ? (
        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 space-y-3">
          {editando && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
              <p className="text-amber-300 text-[11px]">Isso cria um contrato <strong>novo</strong> no Docuseal (não dá pra editar o que já foi enviado) — as assinaturas do link antigo deixam de valer. Se alguém já assinou pela versão anterior, ele vai precisar assinar de novo.</p>
            </div>
          )}
          <input value={form.razao_social} onChange={e => setForm({ ...form, razao_social: e.target.value })} placeholder="Razão social" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
          <div className="grid grid-cols-2 gap-2">
            <input value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} placeholder="CNPJ" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
            <input value={form.dia_vencimento} onChange={e => setForm({ ...form, dia_vencimento: e.target.value })} placeholder="Dia vencimento (ex: 10)" type="number" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
          </div>
          <input value={form.endereco} onChange={e => setForm({ ...form, endereco: e.target.value })} placeholder="Endereço completo" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
          <div className="grid grid-cols-2 gap-2">
            <input value={form.data_inicio} onChange={e => setForm({ ...form, data_inicio: e.target.value })} type="date" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#22C55E] transition-colors"/>
            <select value={form.fidelidade_meses} onChange={e => setForm({ ...form, fidelidade_meses: e.target.value })} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#22C55E] transition-colors">
              <option value="0" className="bg-[#0B1120]">Sem fidelidade</option>
              <option value="6" className="bg-[#0B1120]">Fidelidade 6 meses</option>
              <option value="12" className="bg-[#0B1120]">Fidelidade 12 meses</option>
              <option value="18" className="bg-[#0B1120]">Fidelidade 18 meses</option>
              <option value="24" className="bg-[#0B1120]">Fidelidade 24 meses</option>
            </select>
          </div>
          {Number(form.fidelidade_meses) > 0 && (
            <p className="text-slate-500 text-[10px]">Cancelamento antes do fim da fidelidade gera multa de 50% do saldo das mensalidades restantes.</p>
          )}

          <p className="text-slate-300 text-xs font-bold pt-2 border-t border-white/5">Quem vai assinar pelo cliente</p>
          <div className="grid grid-cols-2 gap-2">
            <input value={signerNome} onChange={e => setSignerNome(e.target.value)} placeholder="Nome do responsável" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
            <input value={signerEmail} onChange={e => setSignerEmail(e.target.value)} placeholder="e-mail@cliente.com" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
          </div>

          <div className="flex gap-2">
            {editando && (
              <button onClick={() => setEditando(false)} className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-white/5 text-slate-400 hover:bg-white/10 transition-colors">
                Cancelar
              </button>
            )}
            <button
              onClick={gerar}
              disabled={gerando || !signerNome.trim() || !signerEmail.trim() || !form.razao_social.trim() || !form.cnpj.trim() || !form.endereco.trim()}
              className="flex-1 bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E] py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {gerando ? <Loader2 size={13} className="animate-spin"/> : <PenLine size={13}/>}
              {editando ? 'Gerar contrato atualizado' : 'Gerar contrato (PDF)'}
            </button>
          </div>
          <p className="text-slate-600 text-[10px]">Já inclui a cláusula de pagamento (Pix/CNPJ/banco da WeGrow) e os módulos contratados dessa empresa.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <StatusEAssinatura empresa={empresa} token={token} tipo="contrato" onAtualizado={onAtualizado}/>
          <button onClick={() => setEditando(true)} className="text-slate-500 hover:text-white text-[11px] font-bold underline transition-colors">
            Editar dados e gerar contrato atualizado
          </button>
        </div>
      )}
    </div>
  );
}

// ── Cronograma ───────────────────────────────────────────────────────────────────
function CronogramaBloco({ empresa, token, onAtualizado }: AbaProps) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const status = empresa.billing?.cronograma_status;

  const enviarArquivo = async (file: File) => {
    if (file.type !== 'application/pdf') { setErro('Só PDF.'); return; }
    setEnviando(true); setErro(null);
    try {
      const base64 = await arquivoParaBase64(file);
      const res = await fetch('/api/admin/documentos', {
        method: 'POST',
        headers: headersAuth(token),
        body: JSON.stringify({ empresa_id: empresa.id, tipo: 'cronograma', arquivo_base64: base64, nome_empresa: empresa.nome }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(json.erro || 'Erro ao subir o PDF.'); return; }
      onAtualizado();
      // template já existe no Docuseal, só falta posicionar os campos de assinatura
      // visualmente (não dá pra saber a coordenada certa de um PDF que não foi gerado
      // por aqui) — abre direto no editor pra não precisar caçar o link depois.
      if (json.template_edit_url) window.open(json.template_edit_url, '_blank');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-white font-black text-xs uppercase tracking-widest flex items-center gap-2"><CalendarClock size={13} className="text-[#22C55E]"/> Cronograma de implantação</p>

      {erro && <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-red-400 text-xs font-bold">{erro}</div>}

      {(!status || status === 'rascunho') ? (
        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 space-y-3">
          <p className="text-slate-400 text-xs">Sobe o PDF do cronograma já pronto (esse não é gerado automaticamente pelo sistema, é o documento que você já preparou com o cliente).</p>
          <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) enviarArquivo(f); }}/>
          <button onClick={() => inputRef.current?.click()} disabled={enviando}
            className="w-full bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E] py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {enviando ? <Loader2 size={13} className="animate-spin"/> : <Upload size={13}/>}
            {enviando ? 'Enviando...' : 'Subir PDF do cronograma'}
          </button>
        </div>
      ) : (
        <StatusEAssinatura empresa={empresa} token={token} tipo="cronograma" onAtualizado={onAtualizado}/>
      )}
    </div>
  );
}
