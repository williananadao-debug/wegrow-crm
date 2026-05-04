"use client";
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Send, CheckCircle2, Search, Loader2, Mail, Building2,
  User, Phone, Tag, Award, FileText, ChevronDown, ArrowRight, AlertCircle
} from 'lucide-react';

type PortalConfig = {
  slug: string;
  nome_portal: string;
  descricao: string | null;
  cor_primaria: string;
  logo_texto: string;
  tipos_cadastro: { nome: string; desc: string; valor: number }[];
  segmentos: string[];
  texto_boas_vindas: string | null;
  whatsapp: string | null;
};

function maskCnpj(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}
function maskPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

export default function PortalGenerico() {
  const { slug } = useParams() as { slug: string };
  const [config, setConfig] = useState<PortalConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [cnpj, setCnpj] = useState('');
  const [loadingCnpj, setLoadingCnpj] = useState(false);
  const [empresa, setEmpresa] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [segmento, setSegmento] = useState('');
  const [tipoCadastro, setTipoCadastro] = useState('');
  const [observacao, setObservacao] = useState('');
  const [loading, setLoading] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [leadId, setLeadId] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/portal/${slug}`)
      .then(r => { if (!r.ok) { setNotFound(true); return null; } return r.json(); })
      .then(d => { if (d) setConfig(d); })
      .finally(() => setLoadingConfig(false));
  }, [slug]);

  const cor = config?.cor_primaria || '#22C55E';
  const logo = config?.logo_texto || 'W';

  const handleCnpj = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const m = maskCnpj(e.target.value);
    setCnpj(m);
    if (m.replace(/\D/g, '').length === 14) {
      setLoadingCnpj(true);
      try {
        const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${m.replace(/\D/g, '')}`);
        if (r.ok) {
          const d = await r.json();
          setEmpresa(d.nome_fantasia || d.razao_social || '');
          if (d.ddd_telefone_1) {
            const t = d.ddd_telefone_1.replace(/\D/g, '');
            if (t.length >= 10) setTelefone(maskPhone(t));
          }
        }
      } catch {}
      setLoadingCnpj(false);
    }
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await fetch(`/api/portal/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa, responsavel, telefone, email: email || undefined, cnpj, segmento, tipoCadastro, observacao: observacao || undefined }),
      });
      if (!r.ok) throw new Error();
      const j = await r.json();
      setLeadId(j.id ?? null);
      setSucesso(true);
    } catch {
      alert('Não foi possível enviar seu cadastro. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (loadingConfig) return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
      <Loader2 size={32} className="animate-spin text-slate-500" />
    </div>
  );

  if (notFound || !config) return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-6">
      <div className="text-center">
        <AlertCircle size={48} className="text-slate-600 mx-auto mb-4" />
        <h1 className="text-2xl font-black text-white uppercase italic mb-2">Portal não encontrado</h1>
        <p className="text-slate-500 text-sm">O endereço acessado não existe ou está inativo.</p>
      </div>
    </div>
  );

  if (sucesso) return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-4">
      <div className="bg-[#0F172A] border border-white/10 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl animate-in zoom-in-95 duration-500">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: `${cor}20` }}>
          <CheckCircle2 size={40} style={{ color: cor }} />
        </div>
        <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter mb-2">Cadastro Enviado!</h2>
        <p className="text-slate-400 text-sm mb-6">
          {config.texto_boas_vindas || 'Nossa equipe entrará em contato em breve para dar continuidade ao seu cadastro.'}
        </p>
        {leadId && (
          <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-4 mb-6">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Número do Protocolo</p>
            <p className="font-black text-2xl" style={{ color: cor }}>#{String(leadId).padStart(6, '0')}</p>
          </div>
        )}
        {email && (
          <p className="text-[11px] text-slate-500 mb-6 flex items-center gap-1 justify-center">
            <Mail size={11} /> Confirmação enviada para <span className="text-slate-300">{email}</span>
          </p>
        )}
        {leadId && (
          <Link
            href={`/p/${slug}/status?id=${leadId}`}
            className="w-full py-3.5 rounded-xl font-black uppercase tracking-widest transition-colors text-xs flex items-center justify-center gap-2 mb-3"
            style={{ background: cor, color: '#0B1120' }}
          >
            <ArrowRight size={14} /> Acompanhar Status
          </Link>
        )}
        <button
          onClick={() => { setSucesso(false); setLeadId(null); setCnpj(''); setEmpresa(''); setResponsavel(''); setTelefone(''); setEmail(''); setSegmento(''); setTipoCadastro(''); setObservacao(''); }}
          className="w-full bg-white/5 hover:bg-white/10 text-white py-3 rounded-xl font-bold uppercase tracking-widest transition-colors text-xs"
        >
          Novo cadastro
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-96 pointer-events-none" style={{ background: `linear-gradient(to bottom, ${cor}08, transparent)` }} />
      <div className="absolute top-[-10%] right-[-5%] w-96 h-96 blur-[120px] rounded-full pointer-events-none" style={{ background: `${cor}08` }} />

      {/* Header */}
      <div className="w-full max-w-3xl mx-auto pt-14 px-6 relative z-10 flex flex-col items-center gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center font-black text-[#0B1120] text-xl shadow-lg" style={{ background: cor }}>
            {logo}
          </div>
          <div>
            <h1 className="text-2xl font-black text-white uppercase italic tracking-tighter leading-none">{config.nome_portal}</h1>
            {config.descricao && <p className="text-[11px] font-bold uppercase tracking-widest mt-1" style={{ color: cor }}>{config.descricao}</p>}
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 w-full max-w-2xl mx-auto px-4 pb-16 relative z-10">
        <div className="bg-[#0F172A] border border-white/10 rounded-[40px] p-6 md:p-10 shadow-2xl">
          <div className="mb-8 text-center border-b border-white/5 pb-8">
            <h2 className="text-xl font-black text-white uppercase italic tracking-tight mb-2">Pré-cadastro</h2>
            <p className="text-slate-400 text-sm">Preencha seus dados e nossa equipe entrará em contato.</p>
          </div>

          <form onSubmit={enviar} className="space-y-5">
            {/* CNPJ */}
            <div className="p-5 rounded-3xl border relative" style={{ background: `${cor}08`, borderColor: `${cor}30` }}>
              <label className="text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-2" style={{ color: cor }}>
                <Search size={12} /> CNPJ (preenchimento automático)
              </label>
              <div className="relative">
                <input
                  type="text" inputMode="numeric" placeholder="00.000.000/0001-00"
                  className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-white font-mono text-lg outline-none placeholder:text-slate-600 transition-colors"
                  style={{ '--focus-color': cor } as any}
                  onFocus={e => e.target.style.borderColor = cor}
                  onBlur={e => e.target.style.borderColor = ''}
                  value={cnpj} onChange={handleCnpj}
                />
                {loadingCnpj && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-xs font-bold uppercase" style={{ color: cor }}>
                    <Loader2 size={16} className="animate-spin" /> Consultando...
                  </div>
                )}
              </div>
            </div>

            {/* Empresa + Responsável */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1 mb-1"><Building2 size={12} /> Nome da Empresa *</label>
                <input required placeholder="Nome da empresa..." className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm font-semibold outline-none transition-colors placeholder:text-slate-600 uppercase" value={empresa} onChange={e => setEmpresa(e.target.value)} onFocus={e => (e.target.style.borderColor = cor)} onBlur={e => (e.target.style.borderColor = '')} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1 mb-1"><User size={12} /> Responsável *</label>
                <input required placeholder="Seu nome completo..." className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm font-semibold outline-none transition-colors placeholder:text-slate-600" value={responsavel} onChange={e => setResponsavel(e.target.value)} onFocus={e => (e.target.style.borderColor = cor)} onBlur={e => (e.target.style.borderColor = '')} />
              </div>
            </div>

            {/* Telefone + E-mail */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 flex items-center gap-1"><Phone size={10} /> WhatsApp *</label>
                <input required type="tel" placeholder="(00) 00000-0000" className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm font-semibold outline-none transition-colors placeholder:text-slate-600" value={telefone} onChange={e => setTelefone(maskPhone(e.target.value))} onFocus={e => (e.target.style.borderColor = cor)} onBlur={e => (e.target.style.borderColor = '')} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 flex items-center gap-1"><Mail size={10} /> E-mail (opcional)</label>
                <input type="email" placeholder="seu@email.com" className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm font-semibold outline-none transition-colors placeholder:text-slate-600" value={email} onChange={e => setEmail(e.target.value)} onFocus={e => (e.target.style.borderColor = cor)} onBlur={e => (e.target.style.borderColor = '')} />
              </div>
            </div>

            {/* Segmento (se configurado) */}
            {config.segmentos.length > 0 && (
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 flex items-center gap-1"><Tag size={10} /> Segmento *</label>
                <div className="relative">
                  <select required className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm font-semibold outline-none cursor-pointer appearance-none" value={segmento} onChange={e => setSegmento(e.target.value)} onFocus={e => (e.target.style.borderColor = cor)} onBlur={e => (e.target.style.borderColor = '')}>
                    <option value="" className="bg-[#0B1120]">Selecione...</option>
                    {config.segmentos.map(s => <option key={s} value={s} className="bg-[#0B1120]">{s}</option>)}
                  </select>
                  <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                </div>
              </div>
            )}

            {/* Tipo de cadastro (se mais de um) */}
            {config.tipos_cadastro.length > 1 && (
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-3 flex items-center gap-1"><Award size={10} /> Tipo de Cadastro *</label>
                <div className="grid grid-cols-1 gap-3">
                  {config.tipos_cadastro.map(tipo => (
                    <label
                      key={tipo.nome}
                      className="flex items-center gap-4 p-4 rounded-2xl border cursor-pointer transition-all"
                      style={tipoCadastro === tipo.nome ? { background: `${cor}15`, borderColor: `${cor}60`, color: cor } : { background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.1)', color: '#cbd5e1' }}
                    >
                      <input type="radio" name="tipoCadastro" value={tipo.nome} required className="sr-only" onChange={() => setTipoCadastro(tipo.nome)} />
                      <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all" style={tipoCadastro === tipo.nome ? { borderColor: cor, background: cor } : { borderColor: '#475569' }}>
                        {tipoCadastro === tipo.nome && <div className="w-2 h-2 bg-[#0B1120] rounded-full" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-black uppercase tracking-wide">{tipo.nome}</p>
                        {tipo.desc && <p className="text-[11px] text-slate-500 mt-0.5">{tipo.desc}</p>}
                      </div>
                      {tipo.valor > 0 && (
                        <p className="text-sm font-black flex-shrink-0" style={{ color: cor }}>
                          R$ {tipo.valor.toLocaleString('pt-BR')}
                        </p>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Observação */}
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 flex items-center gap-1"><FileText size={10} /> Observação (opcional)</label>
              <textarea
                placeholder="Dúvidas ou informações adicionais..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm font-medium outline-none transition-colors placeholder:text-slate-600 min-h-[90px] resize-none"
                value={observacao} onChange={e => setObservacao(e.target.value)}
                onFocus={e => (e.target.style.borderColor = cor)} onBlur={e => (e.target.style.borderColor = '')}
              />
            </div>

            <button
              disabled={loading}
              type="submit"
              className="w-full disabled:opacity-50 py-5 rounded-2xl font-black uppercase text-sm tracking-widest transition-all mt-2 flex items-center justify-center gap-2 hover:scale-[1.02]"
              style={{ background: cor, color: '#0B1120', boxShadow: `0 10px 30px ${cor}30` }}
            >
              {loading ? <><Loader2 size={18} className="animate-spin" /> Enviando...</> : <><Send size={18} /> Enviar Cadastro</>}
            </button>

            <p className="text-center text-slate-600 text-[9px] uppercase font-bold tracking-widest mt-4">
              {config.nome_portal} · wegrow.app.br
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
