"use client";
import React, { useState } from 'react';
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
      // Formata o título para a produção saber que veio do portal
      const tituloFormatado = `[CLIENTE] ${empresa} - ${titulo}`;
      
      // Formata o briefing juntando os dados de contato do cliente
      const briefingFormatado = `📞 Contato: ${contato}\n\n📝 Detalhes do Pedido:\n${briefing}`;

      // Joga direto na tabela de Jobs (Esteira de Produção) na primeira etapa
      const { error } = await supabase.from('jobs').insert([{
        titulo: tituloFormatado,
        briefing: briefingFormatado,
        unidade: unidade || 'Portal Web',
        stage: 'roteiro', // Cai direto na primeira coluna da produção
        prioridade: 'media', // Prioridade padrão
        deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() // Prazo automático de 3 dias
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
          <div className="w-20 h-20 bg-[#22C55E]/20 text-[#22C55E] rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={40} />
          </div>
          <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter mb-2">Pedido Recebido!</h2>
          <p className="text-slate-400 text-sm mb-8">
            Nossa equipe de produção já recebeu o seu briefing e em breve entrará em contato.
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
      {/* Decoração de Fundo */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-blue-600/20 to-transparent pointer-events-none"></div>
      <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-[#22C55E]/10 blur-[120px] rounded-full pointer-events-none"></div>

      {/* Cabeçalho do Portal */}
      <div className="w-full max-w-3xl mx-auto pt-12 px-6 relative z-10 flex items-center justify-center gap-3 mb-8">
        <div className="w-12 h-12 bg-[#22C55E] rounded-2xl flex items-center justify-center font-black text-[#0F172A] text-2xl shadow-lg">W</div>
        <div className="flex flex-col">
            <span className="text-2xl font-black italic text-white tracking-tighter leading-none">WEGROW</span>
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Portal do Cliente</span>
        </div>
      </div>

      {/* Formulário */}
      <div className="flex-1 w-full max-w-2xl mx-auto px-4 pb-12 relative z-10">
        <div className="bg-[#0F172A] border border-white/10 rounded-[40px] p-6 md:p-10 shadow-2xl">
          
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-black text-white uppercase italic tracking-tight mb-2">Solicitar Produção</h1>
            <p className="text-slate-400 text-sm">Preencha o briefing abaixo para enviar seu material direto para nossos estúdios.</p>
          </div>

          <form onSubmit={enviarPedido} className="space-y-5">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1 mb-1"><Briefcase size={12}/> Sua Empresa</label>
                  <input required placeholder="Nome da marca/empresa..." className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm font-semibold outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600" value={empresa} onChange={e => setEmpresa(e.target.value)} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1 mb-1"><Building2 size={12}/> Unidade / Emissora</label>
                  <input placeholder="Ex: DEMAIS FM 104,7 (Opcional)" className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm font-semibold outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600 uppercase" value={unidade} onChange={e => setUnidade(e.target.value)} />
                </div>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">WhatsApp para Retorno</label>
              <input required type="tel" placeholder="(00) 00000-0000" className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm font-semibold outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600" value={contato} onChange={e => setContato(e.target.value)} />
            </div>

            <div className="border-t border-white/10 pt-5 mt-5">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1 mb-1"><Mic2 size={12}/> O que precisamos produzir?</label>
                <input required placeholder="Ex: Spot 30s Promoção de Inverno" className="w-full bg-[#0B1120] border border-white/10 rounded-2xl px-4 py-3.5 text-white text-sm font-semibold outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600 mb-3" value={titulo} onChange={e => setTitulo(e.target.value)} />
                
                <textarea required placeholder="Descreva o locutor desejado, o texto, a trilha de fundo ou os detalhes da promoção..." className="w-full bg-[#0B1120] border border-white/10 rounded-2xl px-4 py-4 text-white text-sm font-medium outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600 min-h-[160px] resize-none custom-scrollbar" value={briefing} onChange={e => setBriefing(e.target.value)} />
            </div>

            <button disabled={loading} type="submit" className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white py-5 rounded-2xl font-black uppercase text-sm tracking-widest hover:scale-[1.02] transition-all shadow-[0_10px_30px_rgba(37,99,235,0.3)] mt-4 flex items-center justify-center gap-2">
              {loading ? 'Processando...' : <><Send size={18}/> Enviar para Produção</>}
            </button>
            <p className="text-center text-slate-600 text-[9px] uppercase font-bold tracking-widest mt-4 flex items-center justify-center gap-1">
               <Sparkles size={10}/> Powered by WeGrow
            </p>

          </form>
        </div>
      </div>
    </div>
  );
}