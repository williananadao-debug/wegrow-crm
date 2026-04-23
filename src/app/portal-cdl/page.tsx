"use client";
import React, { useState } from 'react';
import Link from 'next/link';
import { CDL } from '@/lib/cdl-config';
import {
  Send, CheckCircle2, Search, Loader2, Mail, ExternalLink,
  Building2, User, Phone, Tag, Award, FileText, ChevronDown, Store, ArrowRight
} from 'lucide-react';

const SEGMENTOS = [
  'Varejo / Comércio Geral',
  'Alimentação e Bebidas',
  'Moda e Vestuário',
  'Saúde e Bem-estar',
  'Serviços Profissionais',
  'Construção e Materiais',
  'Tecnologia e Informática',
  'Educação e Cursos',
  'Automotivo',
  'Outros',
];

const TIPOS_ASSOCIACAO = [
  { value: 'Associado Simples', label: 'Associado Simples', desc: 'Acesso aos benefícios essenciais da CDL' },
  { value: 'Associado Plus', label: 'Associado Plus', desc: 'Benefícios ampliados + consultoria jurídica' },
  { value: 'Associado Premium', label: 'Associado Premium', desc: 'Acesso completo + representação institucional' },
];

function maskCnpj(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

function maskPhone(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  return value;
}

export default function PortalCDL() {
  const [loading, setLoading] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [leadId, setLeadId] = useState<number | null>(null);

  const [cnpj, setCnpj] = useState('');
  const [loadingCnpj, setLoadingCnpj] = useState(false);
  const [empresa, setEmpresa] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [segmento, setSegmento] = useState('');
  const [tipoAssociacao, setTipoAssociacao] = useState('');
  const [descricao, setDescricao] = useState('');

  const handleCnpjChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = maskCnpj(e.target.value);
    setCnpj(masked);
    const digits = masked.replace(/\D/g, '');
    if (digits.length === 14) {
      setLoadingCnpj(true);
      try {
        const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
        if (res.ok) {
          const data = await res.json();
          setEmpresa(data.nome_fantasia || data.razao_social || '');
          if (data.ddd_telefone_1) {
            const tel = data.ddd_telefone_1.replace(/\D/g, '');
            if (tel.length >= 10) setTelefone(maskPhone(tel));
          }
        }
      } catch {
        // silent
      }
      setLoadingCnpj(false);
    }
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/portal-cdl/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa, responsavel, telefone, email: email || undefined, cnpj, segmento, tipoAssociacao, descricao: descricao || undefined }),
      });
      if (!res.ok) throw new Error('api_error');
      const json = await res.json();
      setLeadId(json.id ?? null);
      setSucesso(true);
    } catch {
      alert('Não foi possível enviar seu cadastro. Tente novamente em instantes.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSucesso(false); setLeadId(null); setCnpj(''); setEmpresa(''); setResponsavel('');
    setTelefone(''); setEmail(''); setSegmento(''); setTipoAssociacao(''); setDescricao('');
  };

  if (sucesso) {
    return (
      <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-4">
        <div className="bg-[#0F172A] border border-white/10 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl animate-in zoom-in-95 duration-500">
          <div className="w-20 h-20 bg-[#22C55E]/20 text-[#22C55E] rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={40} />
          </div>
          <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter mb-2">Pré-cadastro Enviado!</h2>
          <p className="text-slate-400 text-sm mb-6">
            Nossa equipe da {CDL.nome} entrará em contato em breve para dar continuidade ao seu processo de filiação.
          </p>

          {leadId && (
            <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-4 mb-6">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Número do Protocolo</p>
              <p className="text-[#22C55E] font-black text-2xl">#{String(leadId).padStart(6, '0')}</p>
            </div>
          )}

          {email && (
            <p className="text-[11px] text-slate-500 mb-6 flex items-center gap-1 justify-center">
              <Mail size={11}/> Confirmação enviada para <span className="text-slate-300">{email}</span>
            </p>
          )}

          {leadId && (
            <Link
              href={`/portal-cdl/status?id=${leadId}`}
              className="w-full bg-[#22C55E] hover:bg-[#16A34A] text-[#0B1120] py-3.5 rounded-xl font-black uppercase tracking-widest transition-colors text-xs flex items-center justify-center gap-2 mb-3"
            >
              <ArrowRight size={14} /> Acompanhar Status
            </Link>
          )}
          <button
            onClick={resetForm}
            className="w-full bg-white/5 hover:bg-white/10 text-white py-3 rounded-xl font-bold uppercase tracking-widest transition-colors text-xs"
          >
            Fazer novo cadastro
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-[#22C55E]/8 to-transparent pointer-events-none" />
      <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-[#22C55E]/5 blur-[120px] rounded-full pointer-events-none" />

      {/* Header */}
      <div className="w-full max-w-3xl mx-auto pt-14 px-6 relative z-10 flex flex-col items-center gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-[#22C55E] rounded-2xl flex items-center justify-center font-black text-[#0B1120] text-2xl shadow-[0_0_30px_rgba(34,197,94,0.3)]">
            CDL
          </div>
          <div>
            <h1 className="text-2xl font-black text-white uppercase italic tracking-tighter leading-none">{CDL.nome}</h1>
            <p className="text-[11px] font-black text-[#22C55E] uppercase tracking-[0.25em] mt-1">{CDL.sub}</p>
          </div>
        </div>
        <div className="text-center mt-2">
          <p className="text-slate-400 text-sm max-w-md">
            Associe-se e faça parte da maior rede de lojistas do {CDL.regiao}.
            Preencha o formulário e nossa equipe entrará em contato.
          </p>
        </div>
      </div>

      {/* Form card */}
      <div className="flex-1 w-full max-w-2xl mx-auto px-4 pb-16 relative z-10">
        <div className="bg-[#0F172A] border border-white/10 rounded-[40px] p-6 md:p-10 shadow-2xl">

          <div className="mb-8 text-center border-b border-white/5 pb-8">
            <h2 className="text-xl font-black text-white uppercase italic tracking-tight mb-2">Pré-cadastro de Filiação</h2>
            <p className="text-slate-400 text-sm">Preencha seus dados e receba todas as informações sobre os benefícios de ser um associado CDL.</p>
          </div>

          <form onSubmit={enviar} className="space-y-5">

            {/* CNPJ */}
            <div className="bg-[#22C55E]/5 border border-[#22C55E]/20 p-5 rounded-3xl relative">
              <label className="text-[10px] font-black uppercase text-[#22C55E] tracking-widest mb-2 flex items-center gap-2">
                <Search size={12}/> Digite seu CNPJ (Preenchimento Automático)
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-white font-mono text-lg outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"
                  placeholder="00.000.000/0001-00"
                  value={cnpj}
                  onChange={handleCnpjChange}
                  required
                />
                {loadingCnpj && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-[#22C55E] text-xs font-bold uppercase">
                    <Loader2 size={16} className="animate-spin"/> Consultando...
                  </div>
                )}
              </div>
            </div>

            {/* Empresa + Responsável */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1 mb-1"><Store size={12}/> Nome da Empresa *</label>
                <input required placeholder="Nome da empresa..." className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm font-semibold outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600 uppercase" value={empresa} onChange={e => setEmpresa(e.target.value)} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1 mb-1"><User size={12}/> Nome do Responsável *</label>
                <input required placeholder="Seu nome completo..." className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm font-semibold outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600" value={responsavel} onChange={e => setResponsavel(e.target.value)} />
              </div>
            </div>

            {/* Telefone + E-mail */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 flex items-center gap-1"><Phone size={10}/> WhatsApp *</label>
                <input required type="tel" placeholder="(00) 00000-0000" className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm font-semibold outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600" value={telefone} onChange={e => setTelefone(maskPhone(e.target.value))} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 flex items-center gap-1"><Mail size={10}/> E-mail (confirmação)</label>
                <input type="email" placeholder="seu@email.com" className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm font-semibold outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
            </div>

            {/* Segmento */}
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 flex items-center gap-1"><Tag size={10}/> Segmento Comercial *</label>
              <div className="relative">
                <select
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm font-semibold outline-none focus:border-[#22C55E] transition-colors cursor-pointer appearance-none"
                  value={segmento}
                  onChange={e => setSegmento(e.target.value)}
                >
                  <option value="" className="bg-[#0B1120]">Selecione seu segmento...</option>
                  {SEGMENTOS.map(s => <option key={s} value={s} className="bg-[#0B1120]">{s}</option>)}
                </select>
                <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              </div>
            </div>

            {/* Tipo de Associação */}
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-3 flex items-center gap-1"><Award size={10}/> Tipo de Associação *</label>
              <div className="grid grid-cols-1 gap-3">
                {TIPOS_ASSOCIACAO.map(tipo => (
                  <label
                    key={tipo.value}
                    className={`flex items-center gap-4 p-4 rounded-2xl border cursor-pointer transition-all ${tipoAssociacao === tipo.value ? 'bg-[#22C55E]/10 border-[#22C55E]/50 text-[#22C55E]' : 'bg-white/[0.02] border-white/10 hover:border-white/20 text-slate-300'}`}
                  >
                    <input
                      type="radio"
                      name="tipoAssociacao"
                      value={tipo.value}
                      required
                      className="sr-only"
                      onChange={() => setTipoAssociacao(tipo.value)}
                    />
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${tipoAssociacao === tipo.value ? 'border-[#22C55E] bg-[#22C55E]' : 'border-slate-600'}`}>
                      {tipoAssociacao === tipo.value && <div className="w-2 h-2 bg-[#0B1120] rounded-full" />}
                    </div>
                    <div>
                      <p className="text-sm font-black uppercase tracking-wide">{tipo.label}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{tipo.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Observação */}
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 flex items-center gap-1"><FileText size={10}/> Observação (opcional)</label>
              <textarea
                placeholder="Dúvidas, informações adicionais ou mensagem para a equipe CDL..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm font-medium outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600 min-h-[100px] resize-none custom-scrollbar"
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
              />
            </div>

            <button
              disabled={loading}
              type="submit"
              className="w-full bg-gradient-to-r from-[#22C55E] to-[#16A34A] hover:scale-[1.02] disabled:opacity-50 text-[#0B1120] py-5 rounded-2xl font-black uppercase text-sm tracking-widest transition-all shadow-[0_10px_30px_rgba(34,197,94,0.25)] mt-2 flex items-center justify-center gap-2"
            >
              {loading ? <><Loader2 size={18} className="animate-spin"/> Enviando...</> : <><Send size={18}/> Quero me Associar</>}
            </button>

            <p className="text-center text-slate-600 text-[9px] uppercase font-bold tracking-widest mt-4">
              {CDL.nome} · {CDL.sub} do {CDL.regiao}
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
