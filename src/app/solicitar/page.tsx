"use client";
import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Send, CheckCircle2, Mic2, Briefcase, Sparkles, Building2, Radio } from 'lucide-react';

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
      const tituloFormatado = `[CLIENTE] ${empresa} - ${titulo}`;
      const briefingFormatado = `📞 Contato: ${contato}\n\n📝 Detalhes do Pedido:\n${briefing}`;

      const { error } = await supabase.from('jobs').insert([{
        titulo: tituloFormatado,
        briefing: briefingFormatado,
        unidade: unidade || 'Portal Web',
        stage: 'roteiro',
        prioridade: 'media',
        deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
      }]);

      if (error) throw error;
      
      setSucesso(true);
    } catch (error) {
      alert("Houve um erro ao enviar. Tente novamente.");
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
          <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter mb-2">Pedido Recebido!</h2>
          <p className="text-slate-400 text-sm mb-8">
            Nossa equipe de estúdio já recebeu o seu briefing e em breve entrará em contato.
          </p>
          <button 
            onClick={() => { setSucesso(false); setTitulo(''); setBriefing(''); }}
            className="w-full bg-white/5 hover:bg-white/10 text-white py-4 rounded-xl font-bold uppercase tracking-widest transition-colors text-xs"
          >
            Enviar outro pedido
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-orange-600/10 to-transparent pointer-events-none"></div>
      <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-red-500/10 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="w-full max-w-3xl mx-auto pt-16 px-6 relative z-10 flex flex-col items-center justify-center gap-4 mb-10">
        <div className="w-24 h-24 bg-gradient-to-br from-orange-500 to-red-600 rounded-[32px] flex items-center justify-center shadow-[0_10px_40px_rgba(249,115,22,0.3)] border border-white/20">
          <Radio size={48} className="text-white" />
        </div>
        <div className="text-center">
            <h1 className="text-4xl font-black italic text-white tracking-tighter leading-none mb-1">DEMAIS FM</h1>
            <span className="text-xs font-black text-orange-500 uppercase tracking-[0.3em]">Portal do Anunciante</span>
        </div>
      </div>

      <div className="flex-1 w-full max-w-2xl mx-auto px-4 pb-12 relative z-10">
        <div className="bg-[#0F172A] border border-white/10 rounded-[40px] p-6 md:p-10 shadow-2xl">
          
          <div className="mb-8 text-center border-b border-white/5 pb-8">
            <h2 className="text-xl font-black text-white uppercase italic tracking-tight mb-2">Solicitar Produção</h2>
            <p className="text-slate-400 text-sm">Preencha o briefing abaixo para enviar seu material direto para nossos estúdios.</p>
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
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1 mb-2"><Mic2 size={12}/> O que precisamos produzir?</label>
                <input required placeholder="Ex: Spot 30s Promoção de Inverno" className="w-full bg-[#0B1120] border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm font-semibold outline-none focus:border-orange-500 transition-colors placeholder:text-slate-600 mb-3" value={titulo} onChange={e => setTitulo(e.target.value)} />
                
                <textarea required placeholder="Descreva o locutor desejado, o texto, a trilha de fundo ou os detalhes da promoção..." className="w-full bg-[#0B1120] border border-white/10 rounded-2xl px-4 py-4 text-white text-sm font-medium outline-none focus:border-orange-500 transition-colors placeholder:text-slate-600 min-h-[160px] resize-none custom-scrollbar" value={briefing} onChange={e => setBriefing(e.target.value)} />
            </div>

            <button disabled={loading} type="submit" className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:scale-[1.02] disabled:opacity-50 text-white py-5 rounded-2xl font-black uppercase text-sm tracking-widest transition-all shadow-[0_10px_30px_rgba(249,115,22,0.3)] mt-6 flex items-center justify-center gap-2">
              {loading ? 'Enviando...' : <><Send size={18}/> Enviar para o Estúdio</>}
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