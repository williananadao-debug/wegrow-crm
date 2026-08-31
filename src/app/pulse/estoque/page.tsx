"use client";
import { useState, useEffect } from 'react';
import { Loader2, Activity, Boxes, Package, Minus, Plus, ScanLine, History, X, Wallet, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePulseAccess } from '../usePulseAccess';
import { ServicoConfig, alertarEstoqueBaixoSeCruzou } from '../shared';
import NotaFiscalModal from '@/components/NotaFiscalModal';

type Movimentacao = {
  id: number; quantidade: number; valor_unitario: number | null; fornecedor: string | null;
  nf_numero: string | null; nf_chave_acesso: string | null; created_at: string;
  tipo: string; observacao: string | null;
};

const TIPO_LABEL: Record<string, { label: string; cor: string }> = {
  entrada_nf: { label: 'Nota Fiscal', cor: 'text-purple-400 bg-purple-500/10' },
  ajuste: { label: 'Ajuste manual', cor: 'text-blue-400 bg-blue-500/10' },
  venda: { label: 'Venda', cor: 'text-[var(--cor-primaria)] bg-[rgb(var(--cor-primaria-rgb)/10%)]' },
  estorno: { label: 'Estorno', cor: 'text-red-400 bg-red-500/10' },
};

export default function PulseEstoquePage() {
  const { authLoading, temPulse, user, perfil } = usePulseAccess();

  const [servicos, setServicos] = useState<ServicoConfig[]>([]);
  const [loadingServicos, setLoadingServicos] = useState(true);
  const [notaModalAberto, setNotaModalAberto] = useState(false);

  const [historicoServico, setHistoricoServico] = useState<ServicoConfig | null>(null);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);

  const fetchServicos = async () => {
    setLoadingServicos(true);
    const { data } = await supabase.from('servicos').select('*').order('nome', { ascending: true });
    if (data) setServicos(data as ServicoConfig[]);
    setLoadingServicos(false);
  };

  useEffect(() => { fetchServicos(); }, []);

  const produtosComEstoque = servicos.filter(s => s.estoque !== null && s.estoque !== undefined);
  const valorTotalEstoque = produtosComEstoque.reduce((acc, s) => acc + (s.preco || 0) * (s.estoque || 0), 0);
  const produtosBaixo = produtosComEstoque.filter(s => (s.estoque as number) <= (s.estoque_minimo ?? 5));

  // Separado por tipo — matéria-prima e produto acabado misturados na mesma lista
  // confundia (ex: fábrica de trailer via chapa de aço junto com o trailer pronto).
  const materiaPrima = produtosComEstoque.filter(s => s.tipo === 'Matéria-prima');
  const produtosFinais = produtosComEstoque.filter(s => s.tipo !== 'Matéria-prima');

  const ajustarEstoque = async (s: ServicoConfig, delta: number) => {
    const atual = s.estoque || 0;
    const novo = Math.max(0, atual + delta);
    const deltaReal = novo - atual;
    setServicos(prev => prev.map(x => x.id === s.id ? { ...x, estoque: novo } : x));
    await supabase.from('servicos').update({ estoque: novo }).eq('id', s.id);
    if (deltaReal !== 0) {
      await supabase.from('estoque_movimentacoes').insert([{
        empresa_id: perfil?.empresa_id, servico_id: s.id, quantidade: deltaReal,
        tipo: 'ajuste', user_id: user?.id,
      }]);
      alertarEstoqueBaixoSeCruzou(s.id, atual, novo, s.estoque_minimo ?? 5);
    }
  };

  const abrirHistorico = async (s: ServicoConfig) => {
    setHistoricoServico(s);
    setCarregandoHistorico(true);
    const { data } = await supabase.from('estoque_movimentacoes').select('*').eq('servico_id', s.id).order('created_at', { ascending: false });
    setMovimentacoes((data || []) as Movimentacao[]);
    setCarregandoHistorico(false);
  };

  const renderLinhaEstoque = (s: ServicoConfig) => {
    const baixo = (s.estoque as number) <= (s.estoque_minimo ?? 5);
    const valorEmEstoque = (s.preco || 0) * (s.estoque || 0);
    return (
      <div key={s.id} className="flex items-center gap-3 p-4">
        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center overflow-hidden flex-shrink-0">
          {s.imagem_url ? <img src={s.imagem_url} alt="" className="w-full h-full object-cover" /> : <Package size={16} className="text-slate-600" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm truncate">{s.nome}</p>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            <p className="text-slate-500 text-[10px]">R$ {s.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}{s.unidade ? ` /${s.unidade}` : ''}</p>
            {s.tipo && <span className="text-[8px] font-black bg-white/5 text-slate-500 px-1.5 py-0.5 rounded uppercase">{s.tipo}</span>}
            <span className="text-[9px] text-slate-600">· R$ {valorEmEstoque.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} em estoque</span>
          </div>
        </div>
        <button onClick={() => abrirHistorico(s)} title="Histórico de entradas" className="w-7 h-7 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-purple-400 flex-shrink-0"><History size={13} /></button>
        <button onClick={() => ajustarEstoque(s, -1)} className="w-7 h-7 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-slate-300"><Minus size={13} /></button>
        <span className={`text-sm font-black w-10 text-center ${baixo ? 'text-red-400' : 'text-white'}`}>{s.estoque}</span>
        <button onClick={() => ajustarEstoque(s, 1)} className="w-7 h-7 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg text-slate-300"><Plus size={13} /></button>
        {baixo && <span className="text-[9px] font-black text-red-400 uppercase ml-1">baixo</span>}
      </div>
    );
  };

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;

  if (!temPulse) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Activity size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">O módulo Pulse não está ativo pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tighter uppercase italic text-[var(--cor-primaria)] flex items-center gap-3">
            <Boxes size={32} /> Estoque
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Ajuste rápido — salva na hora</p>
        </div>
        <button onClick={() => setNotaModalAberto(true)} className="inline-flex items-center gap-2 bg-purple-500 hover:bg-purple-600 text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all self-start md:self-auto">
          <ScanLine size={14} /> Dar entrada por Nota Fiscal
        </button>
      </header>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><Package size={10} /> Produtos</p>
          <p className="text-2xl font-black text-white mt-1">{produtosComEstoque.length}</p>
        </div>
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><Wallet size={10} /> Valor em estoque</p>
          <p className="text-2xl font-black text-[var(--cor-primaria)] mt-1">R$ {valorTotalEstoque.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
        </div>
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><AlertTriangle size={10} /> Estoque baixo</p>
          <p className={`text-2xl font-black mt-1 ${produtosBaixo.length > 0 ? 'text-red-400' : 'text-white'}`}>{produtosBaixo.length}</p>
        </div>
      </div>

      <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden mb-4">
        <div className="p-5 border-b border-white/5">
          <h3 className="font-black uppercase text-sm text-slate-300">Produtos acabados ({produtosFinais.length})</h3>
          <p className="text-slate-500 text-[10px] font-bold uppercase mt-1">O que é vendido/entregue ao cliente — sobe via Produção ou ajuste manual</p>
        </div>
        {loadingServicos ? (
          <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
        ) : produtosFinais.length === 0 ? (
          <div className="p-10 text-center">
            <Boxes size={28} className="text-slate-600 mx-auto mb-2" />
            <p className="text-slate-500 text-sm font-bold">Nenhum produto acabado com estoque controlado ainda.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {[...produtosFinais].sort((a, b) => (a.estoque as number) - (b.estoque as number)).map(renderLinhaEstoque)}
          </div>
        )}
      </div>

      <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden">
        <div className="p-5 border-b border-white/5">
          <h3 className="font-black uppercase text-sm text-slate-300">Matéria-prima ({materiaPrima.length})</h3>
          <p className="text-slate-500 text-[10px] font-bold uppercase mt-1">Insumos consumidos na Produção — pra cadastrar novo item, vai em Configurações → Catálogo</p>
        </div>
        {loadingServicos ? (
          <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
        ) : materiaPrima.length === 0 ? (
          <div className="p-10 text-center">
            <Boxes size={28} className="text-slate-600 mx-auto mb-2" />
            <p className="text-slate-500 text-sm font-bold">Nenhuma matéria-prima cadastrada ainda.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {[...materiaPrima].sort((a, b) => (a.estoque as number) - (b.estoque as number)).map(renderLinhaEstoque)}
          </div>
        )}
      </div>

      {historicoServico && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setHistoricoServico(null)}>
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-black text-white uppercase italic text-lg flex items-center gap-2"><History size={18} className="text-purple-400" /> Histórico de entradas</h3>
                <p className="text-slate-500 text-xs font-bold truncate">{historicoServico.nome}</p>
              </div>
              <button onClick={() => setHistoricoServico(null)} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
            </div>
            {carregandoHistorico ? (
              <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
            ) : movimentacoes.length === 0 ? (
              <p className="text-slate-500 text-sm font-bold text-center py-10">Nenhuma movimentação registrada ainda pra esse produto.</p>
            ) : (
              <div className="space-y-2">
                {movimentacoes.map(m => {
                  const info = TIPO_LABEL[m.tipo] || { label: m.tipo, cor: 'text-slate-400 bg-white/5' };
                  const positivo = m.quantidade >= 0;
                  return (
                    <div key={m.id} className="bg-black/30 border border-white/5 rounded-2xl p-3">
                      <div className="flex items-center justify-between">
                        <span className={`font-black text-sm ${positivo ? 'text-[var(--cor-primaria)]' : 'text-red-400'}`}>{positivo ? '+' : ''}{m.quantidade}</span>
                        <span className="text-slate-500 text-[10px]">{new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${info.cor}`}>{info.label}</span>
                        {m.fornecedor && <span className="text-slate-300 text-xs font-bold">{m.fornecedor}</span>}
                        {m.nf_numero && <span title={m.nf_chave_acesso || ''} className="text-[9px] font-black bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded uppercase">NF {m.nf_numero}</span>}
                        {m.observacao && <span className="text-slate-500 text-[10px]">{m.observacao}</span>}
                        {m.valor_unitario != null && <span className="text-slate-600 text-[10px]">R$ {m.valor_unitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/un</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <NotaFiscalModal
        aberto={notaModalAberto}
        onFechar={() => setNotaModalAberto(false)}
        servicos={servicos}
        empresaId={perfil?.empresa_id}
        userId={user?.id}
        onConcluido={() => fetchServicos()}
      />
    </div>
  );
}
