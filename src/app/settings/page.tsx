"use client";
import { useState, useEffect } from 'react';
import { Save, Trash2, Plus, Zap, Mic2, Radio, Info, Loader2, Package, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';

type ServicoConfig = {
  id: string; // String para gerenciar IDs temporários e do banco
  nome: string;
  preco: number;
  tipo: string;
};

export default function SettingsPage() {
  const { user } = useAuth();
  const [servicos, setServicos] = useState<ServicoConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

  // 1. CARREGA DO SUPABASE
  useEffect(() => {
    if(user) carregarDados();
  }, [user]);

  const carregarDados = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('servicos').select('*').order('id', { ascending: true });
    
    if (error) console.error("Erro ao carregar:", error);

    if (data && data.length > 0) {
      // Normaliza os dados (converte ID numérico para string para compatibilidade)
      const formatados = data.map((item: any) => ({
        id: item.id.toString(),
        nome: item.nome,
        preco: item.preco, 
        tipo: item.tipo || 'Zap'
      }));
      setServicos(formatados);
    } else {
      setServicos([]);
    }
    setLoading(false);
  };

  // 2. SALVAR NO SUPABASE (OTIMIZADO COM PROMISE.ALL)
  const salvarConfiguracoes = async () => {
    setSaving(true);
    setFeedback(null);

    try {
        const novos = servicos.filter(s => s.id.startsWith('temp-'));
        const existentes = servicos.filter(s => !s.id.startsWith('temp-'));

        const promises = [];

        // A) Inserir Novos (Batch Insert é mais rápido)
        if (novos.length > 0) {
            const payload = novos.map(s => ({
                nome: s.nome,
                preco: s.preco,
                tipo: s.tipo
            }));
            promises.push(supabase.from('servicos').insert(payload));
        }

        // B) Atualizar Existentes (Paralelo)
        existentes.forEach(s => {
            // Só manda update se tiver ID válido
            promises.push(
                supabase.from('servicos').update({
                    nome: s.nome,
                    preco: s.preco,
                    tipo: s.tipo
                }).eq('id', parseInt(s.id))
            );
        });

        // Executa tudo de uma vez
        const results = await Promise.all(promises);
        
        // Verifica erros
        const errors = results.filter(r => r.error);
        if (errors.length > 0) throw new Error("Falha ao salvar alguns itens.");

        await carregarDados(); 
        setFeedback({ type: 'success', msg: 'Configurações salvas com sucesso!' });
    } catch (err: any) {
        console.error(err);
        setFeedback({ type: 'error', msg: 'Erro ao salvar: ' + (err.message || 'Verifique o console') });
    } finally {
        setSaving(false);
        setTimeout(() => setFeedback(null), 4000);
    }
  };

  const adicionarServico = () => {
    const novo: ServicoConfig = {
      id: `temp-${Date.now()}`,
      nome: 'Novo Serviço',
      preco: 0,
      tipo: 'Zap'
    };
    setServicos([...servicos, novo]);
  };

  const removerServico = async (id: string) => {
    if (!id.startsWith('temp-')) {
        // Remove do banco imediatamente para não ficar "pendente" visualmente
        const { error } = await supabase.from('servicos').delete().eq('id', parseInt(id));
        if (error) return alert("Erro ao excluir do banco.");
    }
    setServicos(servicos.filter(s => s.id !== id));
  };

  const atualizarServico = (id: string, campo: keyof ServicoConfig, valor: any) => {
    setServicos(prev => prev.map(s => s.id === id ? { ...s, [campo]: valor } : s));
  };

  // --- VISUAL ---
  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-4 md:p-8 pb-20 animate-in fade-in duration-500">
      
      <header className="mb-8">
        <h1 className="text-4xl font-black tracking-tighter text-white uppercase italic flex items-center gap-3">
            <Package size={32} className="text-[#22C55E]"/> Configurações
        </h1>
        <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mt-1">Gerencie seus produtos e tabela de preços</p>
      </header>

      <div className="max-w-4xl bg-[#0B1120] border border-white/10 rounded-[40px] p-6 md:p-8 shadow-2xl relative">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-white/5 pb-6 mb-6 gap-4">
          <div className="flex items-center gap-3 text-slate-300">
            <Info size={18} className="text-blue-500" />
            <h2 className="font-bold text-sm uppercase tracking-wide">Catálogo de Serviços</h2>
          </div>
          <button onClick={adicionarServico} className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg shadow-blue-900/20">
            <Plus size={14} strokeWidth={3} /> Adicionar Item
          </button>
        </div>

        {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Loader2 className="animate-spin mb-2" size={32}/>
                <span className="text-xs font-bold uppercase">Carregando catálogo...</span>
            </div>
        ) : (
            <div className="space-y-3">
            {servicos.length === 0 && (
                <div className="text-center py-10 border border-dashed border-white/10 rounded-2xl">
                    <p className="text-slate-500 text-sm font-medium">Nenhum serviço cadastrado.</p>
                </div>
            )}
            
            {servicos.map((servico) => (
                <div key={servico.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center bg-white/[0.02] p-3 rounded-2xl border border-white/5 group hover:border-white/10 transition-all hover:bg-white/[0.04]">
                    
                    {/* ÍCONE */}
                    <div className="col-span-1 flex justify-center md:justify-start pl-0 md:pl-2">
                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                            {servico.tipo === 'Zap' && <Zap className="text-yellow-400" size={16} />}
                            {servico.tipo === 'Mic2' && <Mic2 className="text-blue-400" size={16} />}
                            {servico.tipo === 'Radio' && <Radio className="text-purple-400" size={16} />}
                        </div>
                    </div>
                    
                    {/* NOME */}
                    <div className="col-span-12 md:col-span-5">
                        <input 
                            value={servico.nome} 
                            onChange={(e) => atualizarServico(servico.id, 'nome', e.target.value)}
                            className="w-full bg-transparent border-b border-transparent focus:border-white/20 text-white font-bold text-sm focus:ring-0 outline-none placeholder:text-slate-600 py-1 transition-colors"
                            placeholder="Nome do Serviço (Ex: Spot 30s)"
                        />
                    </div>

                    {/* PREÇO */}
                    <div className="col-span-6 md:col-span-3 flex items-center gap-2 bg-[#0F172A] rounded-lg px-3 py-2 border border-white/5 focus-within:border-[#22C55E] transition-colors">
                        <span className="text-[10px] font-black text-slate-500">R$</span>
                        <input 
                            type="number"
                            value={servico.preco} 
                            onChange={(e) => atualizarServico(servico.id, 'preco', Number(e.target.value))}
                            className="w-full bg-transparent text-white font-bold outline-none text-sm"
                            placeholder="0.00"
                        />
                    </div>

                    {/* TIPO */}
                    <div className="col-span-5 md:col-span-2 relative">
                        <select 
                            value={servico.tipo}
                            onChange={(e) => atualizarServico(servico.id, 'tipo', e.target.value)}
                            className="w-full bg-white/5 text-slate-300 text-[10px] font-bold uppercase outline-none cursor-pointer rounded-lg px-2 py-2 appearance-none border border-white/5 focus:border-white/20"
                        >
                            <option value="Zap" className="bg-[#0B1120]">⚡ Rápido</option>
                            <option value="Mic2" className="bg-[#0B1120]">🎙️ Gravação</option>
                            <option value="Radio" className="bg-[#0B1120]">📻 Rádio</option>
                        </select>
                    </div>

                    {/* AÇÕES */}
                    <div className="col-span-1 flex justify-end">
                        <button onClick={() => removerServico(servico.id)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-500 transition-all">
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>
            ))}
            </div>
        )}

        <div className="mt-8 pt-6 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="h-6">
            {feedback && (
                <div className={`flex items-center gap-2 text-xs font-bold uppercase animate-in slide-in-from-left-2 ${feedback.type === 'success' ? 'text-[#22C55E]' : 'text-red-500'}`}>
                    {feedback.type === 'success' ? <CheckCircle2 size={14}/> : <AlertCircle size={14}/>}
                    {feedback.msg}
                </div>
            )}
          </div>

          <button 
            onClick={salvarConfiguracoes}
            disabled={saving}
            className="w-full md:w-auto bg-[#22C55E] hover:bg-[#1ea850] text-[#0F172A] px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:shadow-[0_0_30px_rgba(34,197,94,0.5)] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="animate-spin" size={16}/> : <Save size={16} />} 
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}