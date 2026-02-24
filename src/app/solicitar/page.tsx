"use client";
import React, { useState } from 'react';
import Image from 'next/image'; // 👈 Importação do motor de imagem do Next.js
import { supabase } from '@/lib/supabase';
import { Send, CheckCircle2, Mic2, Briefcase, Sparkles, Building2 } from 'lucide-react';

export default function PortalCliente() {
  const [loading, setLoading] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  // Estados do formulário
  const [empresa, setEmpresa] = useState('');
  const [contato, setContato] = useState('');
  const [unidade, setUnidade] = useState('');
  const [titulo, setTitulo] = useState('');
  const [briefing, setBriefing] = useState('');

  const enviarPedido = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const descricaoFormatada = `📍 Unidade/Região: ${unidade || 'Não informada'}\n\n📝 O que precisa:\n${briefing}`;

      const { error } = await supabase.from('leads').insert([{
        empresa: empresa,
        telefone: contato, 
        titulo: titulo, 
        descricao: descricaoFormatada, 
        status: 'novo', 
        origem: 'Portal Web', 
        valor_total: 0 
      }]);

      if (error) throw error;
      
      setSucesso(true);
    } catch (error: any) {
      alert(`ERRO DO BANCO: ${error.message || JSON.stringify(error)}`);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (sucesso) {
    return (
      <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-4">
        <div className="bg-[#0F172A] border border-white/10 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl animate-in zoom-in-95 duration-500">
          <div className="w-20 h-20 bg-orange-500/20 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={40} />
          </div>
          <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter mb-2">Solicitação Recebida!</h2>
          <p className="text-slate-400 text-sm mb-8">
            Nossa equipe comercial já recebeu os seus dados e entrará em contato em breve com uma proposta exclusiva.
          </p>
          <button 
            onClick={() => { setSucesso(false); setTitulo(''); setBriefing(''); }}
            className="w-full bg-white/5 hover:bg-white/10 text-white py-4 rounded-xl font-bold uppercase tracking-widest transition-colors text-xs"
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
        
        {/* 👇 O LOGO IMPECÁVEL AQUI 👇 */}
        <div className="relative h-24 md:h-28 w-64 md:w-80 flex items-center justify-center drop-shadow-[0_0_20px_rgba(249,115,22,0.4)]">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1 mb-1"><Briefcase size={12}/> Sua Empresa</label>
                  <input required placeholder="Nome da marca..." className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm font-semibold outline-none focus:border-orange-500 transition-colors placeholder:text-slate-600" value={empresa} onChange={e => setEmpresa(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1 mb-1"><Building2 size={12}/> Cidade / Região</label>
                  <input placeholder="Opcional" className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm font-semibold outline-none focus:border-orange-500 transition-colors placeholder:text-slate-600 uppercase" value={unidade} onChange={e => setUnidade(e.target.value)} />
                </div>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">WhatsApp para Retorno</label>
              <input required type="tel" placeholder="(00) 00000-0000" className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm font-semibold outline-none focus:border-orange-500 transition-colors placeholder:text-slate-600" value={contato} onChange={e => setContato(e.target.value)} />
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
               <Sparkles size={10}/> Powered by WeGrow CRM
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}