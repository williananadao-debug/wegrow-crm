"use client";
import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Send, CheckCircle2, Mic2, Briefcase, Sparkles, Building2, Search, Loader2, Mail, ExternalLink } from 'lucide-react';

export default function PortalCliente() {
  const [loading, setLoading] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [leadId, setLeadId] = useState<number | null>(null);

  // Estados do formulário
  const [cnpj, setCnpj] = useState('');
  const [loadingCnpj, setLoadingCnpj] = useState(false);
  
  const [empresa, setEmpresa] = useState('');
  const [contato, setContato] = useState('');
  const [email, setEmail] = useState('');
  const [unidade, setUnidade] = useState('');
  const [titulo, setTitulo] = useState('');
  const [briefing, setBriefing] = useState('');

  // 👇 MÁSCARA E BUSCA INTELIGENTE DO CNPJ 👇
  const handleCnpjChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    
    // Aplica a máscara: 00.000.000/0001-00
    let formatted = value;
    if (value.length > 2) formatted = value.replace(/^(\d{2})(\d)/, '$1.$2');
    if (value.length > 5) formatted = formatted.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
    if (value.length > 8) formatted = formatted.replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4');
    if (value.length > 12) formatted = formatted.replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
    
    setCnpj(formatted.slice(0, 18));

    // Se bater 14 números, faz a mágica acontecer!
    if (value.length === 14) {
        setLoadingCnpj(true);
        try {
            const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${value}`);
            if (response.ok) {
                const data = await response.json();
                setEmpresa(data.nome_fantasia || data.razao_social || '');
                setUnidade(data.municipio ? `${data.municipio} - ${data.uf}` : '');
                
                // Puxa e formata o telefone automaticamente
                if (data.ddd_telefone_1) {
                    const telLimpo = data.ddd_telefone_1.replace(/\D/g, '');
                    if (telLimpo.length >= 10) {
                        const telFormatado = `(${telLimpo.slice(0,2)}) ${telLimpo.slice(2,7)}-${telLimpo.slice(7,11)}`;
                        setContato(telFormatado);
                    }
                }
            }
        } catch (error) {
            console.error("Erro ao buscar CNPJ", error);
        }
        setLoadingCnpj(false);
    }
  };

  // MÁSCARA PARA O WHATSAPP
  const handleContatoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 2) value = value.replace(/^(\d{2})(\d)/g, '($1) $2');
    if (value.length > 9) value = value.replace(/(\d{5})(\d)/, '$1-$2');
    setContato(value.slice(0, 15));
  };

  const enviarPedido = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/portal/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa,
          telefone: contato,
          email: email || undefined,
          cnpj,
          unidade,
          cidade: unidade,
          descricao: `Precisa de: ${titulo}\n\nMensagem: ${briefing}`,
        }),
      });

      if (!res.ok) throw new Error('api_error');

      const json = await res.json();
      setLeadId(json.id ?? null);
      setSucesso(true);
    } catch {
      alert('Não foi possível enviar sua solicitação. Tente novamente em instantes.');
    } finally {
      setLoading(false);
    }
  };

  if (sucesso) {
    return (
      <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-4">
        <div className="bg-[#0F172A] border border-white/10 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl animate-in zoom-in-95 duration-500">
          <div className="w-20 h-20 bg-[#22C55E]/20 text-[#22C55E] rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={40} />
          </div>
          <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter mb-2">Solicitação Recebida!</h2>
          <p className="text-slate-400 text-sm mb-4">
            Nossa equipe comercial já recebeu os seus dados e entrará em contato em breve com uma proposta exclusiva.
          </p>

          {leadId && (
            <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-4 mb-4">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Número do Protocolo</p>
              <p className="text-[#22C55E] font-black text-2xl">#{String(leadId).padStart(6, '0')}</p>
            </div>
          )}

          {email && (
            <p className="text-[11px] text-slate-500 mb-4 flex items-center gap-1 justify-center">
              <Mail size={11}/> Confirmação enviada para <span className="text-slate-300">{email}</span>
            </p>
          )}

          {leadId && (
            <Link
              href={`/solicitar/status?id=${leadId}`}
              className="w-full flex items-center justify-center gap-2 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 text-orange-400 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-colors mb-3"
            >
              <ExternalLink size={14}/> Acompanhar Status
            </Link>
          )}

          <button
            onClick={() => {
              setSucesso(false);
              setLeadId(null);
              setCnpj('');
              setEmpresa('');
              setContato('');
              setEmail('');
              setUnidade('');
              setTitulo('');
              setBriefing('');
            }}
            className="w-full bg-white/5 hover:bg-white/10 text-white py-3 rounded-xl font-bold uppercase tracking-widest transition-colors text-xs"
          >
            Fazer nova solicitação
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-orange-600/10 to-transparent pointer-events-none"></div>
      <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-red-500/10 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="w-full max-w-3xl mx-auto pt-16 px-6 relative z-10 flex flex-col items-center justify-center gap-4 mb-8">
        
        <div className="relative h-24 md:h-28 w-64 md:w-80 flex items-center justify-center drop-shadow-[0_0_20px_rgba(249,115,22,0.4)]">
            {/* Mantive o seu logo da Demais FM! */}
            <Image 
              src="/logo-demais.png" 
              alt="Demais FM" 
              fill
              className="object-contain"
              priority
            />
        </div>

        <div className="text-center mt-2">
            <span className="text-xs font-black text-orange-500 uppercase tracking-[0.3em]">Portal do Anunciante</span>
        </div>
      </div>

      <div className="flex-1 w-full max-w-2xl mx-auto px-4 pb-12 relative z-10">
        <div className="bg-[#0F172A] border border-white/10 rounded-[40px] p-6 md:p-10 shadow-2xl">
          
          <div className="mb-8 text-center border-b border-white/5 pb-8">
            <h2 className="text-xl font-black text-white uppercase italic tracking-tight mb-2">Solicitar Orçamento</h2>
            <p className="text-slate-400 text-sm">Preencha os dados abaixo e nossa equipe montará a melhor estratégia para sua marca.</p>
          </div>

          <form onSubmit={enviarPedido} className="space-y-5">
            
            {/* 👇 O GATILHO MÁGICO DO CNPJ COM A IDENTIDADE VISUAL LARANJA 👇 */}
            <div className="bg-orange-500/10 border border-orange-500/20 p-5 rounded-3xl relative mb-2">
                <label className="text-[10px] font-black uppercase text-orange-500 tracking-widest mb-2 block flex items-center gap-2">
                    <Search size={14}/> Digite seu CNPJ (Busca Automática)
                </label>
                <div className="relative">
                    <input 
                        type="text" 
                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-white font-mono text-lg outline-none focus:border-orange-500 transition-colors placeholder:text-slate-600"
                        placeholder="00.000.000/0001-00"
                        value={cnpj}
                        onChange={handleCnpjChange}
                        required
                    />
                    {loadingCnpj && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-orange-500 text-xs font-bold uppercase">
                            <Loader2 size={16} className="animate-spin"/> Consultando...
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1 mb-1"><Briefcase size={12}/> Sua Empresa</label>
                  <input required placeholder="Nome da marca..." className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm font-semibold outline-none focus:border-orange-500 transition-colors placeholder:text-slate-600 uppercase" value={empresa} onChange={e => setEmpresa(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1 mb-1"><Building2 size={12}/> Cidade / Região</label>
                  <input required placeholder="Ex: Itajaí, Balneário..." className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm font-semibold outline-none focus:border-orange-500 transition-colors placeholder:text-slate-600 uppercase" value={unidade} onChange={e => setUnidade(e.target.value)} />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">WhatsApp para Retorno</label>
                <input required type="tel" placeholder="(00) 00000-0000" className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm font-semibold outline-none focus:border-orange-500 transition-colors placeholder:text-slate-600" value={contato} onChange={handleContatoChange} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block flex items-center gap-1"><Mail size={10}/> E-mail (receber confirmação)</label>
                <input type="email" placeholder="seu@email.com" className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm font-semibold outline-none focus:border-orange-500 transition-colors placeholder:text-slate-600" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
            </div>

            <div className="border-t border-white/5 pt-6 mt-6">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1 mb-2"><Mic2 size={12}/> O que você precisa?</label>
                <input required placeholder="Ex: Spot 30s, Entrevista, Patrocínio..." className="w-full bg-[#0B1120] border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm font-semibold outline-none focus:border-orange-500 transition-colors placeholder:text-slate-600 mb-3" value={titulo} onChange={e => setTitulo(e.target.value)} />
                
                <textarea required placeholder="Descreva os objetivos da sua campanha, público-alvo ou dúvidas..." className="w-full bg-[#0B1120] border border-white/10 rounded-2xl px-4 py-4 text-white text-sm font-medium outline-none focus:border-orange-500 transition-colors placeholder:text-slate-600 min-h-[160px] resize-none custom-scrollbar" value={briefing} onChange={e => setBriefing(e.target.value)} />
            </div>

            <button disabled={loading} type="submit" className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:scale-[1.02] disabled:opacity-50 text-white py-5 rounded-2xl font-black uppercase text-sm tracking-widest transition-all shadow-[0_10px_30px_rgba(249,115,22,0.3)] mt-6 flex items-center justify-center gap-2">
              {loading ? 'Enviando...' : <><Send size={18}/> Solicitar Proposta</>}
            </button>
            <p className="text-center text-slate-600 text-[9px] uppercase font-bold tracking-widest mt-6 flex items-center justify-center gap-1">
               <Sparkles size={10}/> Powered by WeGrow
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}