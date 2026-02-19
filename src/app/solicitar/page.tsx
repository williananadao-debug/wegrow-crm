"use client";
import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Send, CheckCircle2, Mic2, Briefcase, Building2, User, Phone, AlignLeft } from 'lucide-react';
import { Toast } from '@/components/Toast';

export default function SolicitarServico() {
  const [loading, setLoading] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);

  // Estados do formulário
  const [formData, setFormData] = useState({
    empresa: '',
    contato: '',
    telefone: '',
    descricao: '',
    unidade: 'DEMAIS FM 101,1' // Unidade padrão (ajuste conforme necessário)
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Cria um Lead no Funil de Vendas (Coluna 0: Novo Lead)
      const { error } = await supabase.from('leads').insert([{
        empresa: formData.empresa,
        telefone: formData.telefone,
        tipo: 'Anunciante', // Padrão
        valor_total: 0, // Valor será definido pelo comercial depois
        etapa: 0, // Cai na primeira coluna do Kanban
        status: 'aberto',
        unidade: formData.unidade,
        // Salvamos o que o cliente pediu no "checkin" provisoriamente ou no histórico depois
        checkin: `SOLICITAÇÃO VIA PORTAL: ${formData.descricao}` 
      }]);

      if (error) throw error;

      // 2. Mostra tela de sucesso
      setSucesso(true);
      setToastMessage('Solicitação enviada com sucesso!');
      setShowToast(true);

    } catch (error) {
      console.error("Erro ao enviar:", error);
      setToastMessage('Ocorreu um erro. Tente novamente ou nos chame no WhatsApp.');
      setShowToast(true);
    } finally {
      setLoading(false);
    }
  };

  if (sucesso) {
    return (
      <div className="min-h-screen bg-[#020617] text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#0F172A] border border-white/10 rounded-3xl p-8 text-center animate-in zoom-in-95 duration-500">
          <div className="w-20 h-20 bg-[#22C55E]/10 text-[#22C55E] rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={40} />
          </div>
          <h2 className="text-2xl font-black uppercase italic tracking-tighter mb-2">Pedido Recebido!</h2>
          <p className="text-slate-400 text-sm mb-8">Nossa equipe comercial já foi notificada e entrará em contato pelo WhatsApp em breve.</p>
          <button 
            onClick={() => window.location.reload()} 
            className="w-full bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-xl transition-colors uppercase text-xs tracking-widest"
          >
            Fazer outro pedido
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-white flex flex-col items-center py-12 px-4">
      
      {/* Header Público */}
      <div className="max-w-xl w-full text-center mb-10">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-600/20">
          <Mic2 size={32} className="text-white" />
        </div>
        <h1 className="text-3xl font-black uppercase italic tracking-tighter mb-2">Solicitar Produção</h1>
        <p className="text-slate-400 text-sm">Preencha os dados abaixo para iniciar um novo projeto com a nossa equipe.</p>
      </div>

      {/* Formulário */}
      <div className="max-w-xl w-full bg-[#0F172A] border border-white/5 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
        
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 to-[#22C55E]"></div>

        <form onSubmit={handleSubmit} className="space-y-5">
          
          <div>
            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1 mb-1"><Building2 size={12}/> Nome da Empresa</label>
            <input 
              type="text" 
              required
              className="w-full bg-[#020617] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-blue-500 outline-none transition-colors"
              placeholder="Sua empresa..."
              value={formData.empresa}
              onChange={(e) => setFormData({...formData, empresa: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1 mb-1"><User size={12}/> Seu Nome</label>
              <input 
                type="text" 
                required
                className="w-full bg-[#020617] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-blue-500 outline-none transition-colors"
                placeholder="Como quer ser chamado"
                value={formData.contato}
                onChange={(e) => setFormData({...formData, contato: e.target.value})}
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1 mb-1"><Phone size={12}/> WhatsApp</label>
              <input 
                type="tel" 
                required
                className="w-full bg-[#020617] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-blue-500 outline-none transition-colors"
                placeholder="(00) 00000-0000"
                value={formData.telefone}
                onChange={(e) => setFormData({...formData, telefone: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1 mb-1"><Briefcase size={12}/> Unidade de Atendimento</label>
            <select 
              className="w-full bg-[#020617] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-blue-500 outline-none transition-colors appearance-none cursor-pointer"
              value={formData.unidade}
              onChange={(e) => setFormData({...formData, unidade: e.target.value})}
            >
              <option value="DEMAIS FM 101,1">DEMAIS FM 101,1</option>
              {/* Adicione outras unidades aqui se precisar */}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex items-center gap-1 mb-1"><AlignLeft size={12}/> O que você precisa?</label>
            <textarea 
              required
              rows={4}
              className="w-full bg-[#020617] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-blue-500 outline-none transition-colors resize-none"
              placeholder="Descreva o serviço (Ex: Gravação de Spot de 30s, Blitz Promocional...)"
              value={formData.descricao}
              onChange={(e) => setFormData({...formData, descricao: e.target.value})}
            ></textarea>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 mt-4"
          >
            {loading ? 'Enviando...' : <><Send size={16} /> Enviar Solicitação</>}
          </button>

        </form>
      </div>
      
      <Toast message={toastMessage} isVisible={showToast} onClose={() => setShowToast(false)} />
    </div>
  );
}