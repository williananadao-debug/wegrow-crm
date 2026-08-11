"use client";
import { useState, useEffect } from 'react';
import { Loader2, Activity, Boxes, Package, Minus, Plus, ScanLine, History, X, Wallet, AlertTriangle, Car, Plus as PlusIcon, Gauge, Fuel, Palette } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePulseAccess } from '../usePulseAccess';
import { ServicoConfig, alertarEstoqueBaixoSeCruzou } from '../shared';
import NotaFiscalModal from '@/components/NotaFiscalModal';

type Movimentacao = {
  id: number; quantidade: number; valor_unitario: number | null; fornecedor: string | null;
  nf_numero: string | null; nf_chave_acesso: string | null; created_at: string;
  tipo: string; observacao: string | null;
};

type Veiculo = {
  id: number; servico_id: number; marca?: string | null; modelo?: string | null;
  ano_fabricacao?: number | null; ano_modelo?: number | null; km?: number | null;
  cor?: string | null; combustivel?: string | null; cambio?: string | null;
  fotos?: string[] | null; status: 'disponivel' | 'reservado' | 'vendido';
  servicos: ServicoConfig;
};

const STATUS_VEICULO: Record<string, { label: string; cor: string }> = {
  disponivel: { label: 'Disponível', cor: 'text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/30' },
  reservado: { label: 'Reservado', cor: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' },
  vendido: { label: 'Vendido', cor: 'text-slate-400 bg-white/5 border-white/10' },
};

const TIPO_LABEL: Record<string, { label: string; cor: string }> = {
  entrada_nf: { label: 'Nota Fiscal', cor: 'text-purple-400 bg-purple-500/10' },
  ajuste: { label: 'Ajuste manual', cor: 'text-blue-400 bg-blue-500/10' },
  venda: { label: 'Venda', cor: 'text-[#22C55E] bg-[#22C55E]/10' },
  estorno: { label: 'Estorno', cor: 'text-red-400 bg-red-500/10' },
};

const VEICULO_VAZIO = {
  marca: '', modelo: '', ano_fabricacao: '', ano_modelo: '', km: '',
  cor: '', combustivel: '', cambio: '', preco: '', fotoUrl: '',
};

export default function PulseEstoquePage() {
  const { authLoading, temPulse, user, perfil, empresa } = usePulseAccess();
  const isVeiculos = empresa?.modulos?.pulse_vertical === 'veiculos';

  const [servicos, setServicos] = useState<ServicoConfig[]>([]);
  const [loadingServicos, setLoadingServicos] = useState(true);
  const [notaModalAberto, setNotaModalAberto] = useState(false);

  const [historicoServico, setHistoricoServico] = useState<ServicoConfig | null>(null);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);

  // Estoque de veículos (loja de carros) — cada carro é um servicos.tipo='veiculo' (estoque
  // sempre 1, vira 0 na venda) com os campos automotivos numa tabela companion 1:1.
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [loadingVeiculos, setLoadingVeiculos] = useState(true);
  const [veiculoDetalhe, setVeiculoDetalhe] = useState<Veiculo | null>(null);
  const [veiculoFormAberto, setVeiculoFormAberto] = useState(false);
  const [salvandoVeiculo, setSalvandoVeiculo] = useState(false);
  const [novoVeiculo, setNovoVeiculo] = useState(VEICULO_VAZIO);

  const fetchServicos = async () => {
    setLoadingServicos(true);
    const { data } = await supabase.from('servicos').select('*').order('nome', { ascending: true });
    if (data) setServicos(data as ServicoConfig[]);
    setLoadingServicos(false);
  };

  const fetchVeiculos = async () => {
    setLoadingVeiculos(true);
    const { data } = await supabase.from('veiculos').select('*, servicos(*)').order('created_at', { ascending: false });
    if (data) setVeiculos(data as any);
    setLoadingVeiculos(false);
  };

  useEffect(() => {
    if (isVeiculos) fetchVeiculos();
    else fetchServicos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVeiculos]);

  const salvarNovoVeiculo = async () => {
    if (!novoVeiculo.marca.trim() || !novoVeiculo.modelo.trim() || !novoVeiculo.preco) {
      alert('Preencha marca, modelo e preço.');
      return;
    }
    setSalvandoVeiculo(true);
    try {
      const nome = `${novoVeiculo.marca} ${novoVeiculo.modelo}${novoVeiculo.ano_modelo ? ' ' + novoVeiculo.ano_modelo : ''}`.trim();
      const { data: servico, error: servErr } = await supabase.from('servicos')
        .insert([{ nome, preco: Number(novoVeiculo.preco), tipo: 'veiculo', estoque: 1, empresa_id: perfil?.empresa_id, imagem_url: novoVeiculo.fotoUrl.trim() || null }])
        .select().single();
      if (servErr) throw servErr;

      const { error: veicErr } = await supabase.from('veiculos').insert([{
        servico_id: servico.id, empresa_id: perfil?.empresa_id,
        marca: novoVeiculo.marca.trim(), modelo: novoVeiculo.modelo.trim(),
        ano_fabricacao: novoVeiculo.ano_fabricacao ? Number(novoVeiculo.ano_fabricacao) : null,
        ano_modelo: novoVeiculo.ano_modelo ? Number(novoVeiculo.ano_modelo) : null,
        km: novoVeiculo.km ? Number(novoVeiculo.km) : null,
        cor: novoVeiculo.cor.trim() || null,
        combustivel: novoVeiculo.combustivel.trim() || null,
        cambio: novoVeiculo.cambio.trim() || null,
        fotos: novoVeiculo.fotoUrl.trim() ? [novoVeiculo.fotoUrl.trim()] : [],
        status: 'disponivel',
      }]);
      if (veicErr) throw veicErr;

      setVeiculoFormAberto(false);
      setNovoVeiculo(VEICULO_VAZIO);
      fetchVeiculos();
    } catch (err: any) {
      alert('Erro ao cadastrar veículo: ' + (err?.message || 'tente novamente'));
    } finally {
      setSalvandoVeiculo(false);
    }
  };

  const alterarStatusVeiculo = async (v: Veiculo, status: Veiculo['status']) => {
    setVeiculos(prev => prev.map(x => x.id === v.id ? { ...x, status } : x));
    setVeiculoDetalhe(prev => prev && prev.id === v.id ? { ...prev, status } : prev);
    await supabase.from('veiculos').update({ status }).eq('id', v.id);
  };

  const produtosComEstoque = servicos.filter(s => s.estoque !== null && s.estoque !== undefined);
  const valorTotalEstoque = produtosComEstoque.reduce((acc, s) => acc + (s.preco || 0) * (s.estoque || 0), 0);
  const produtosBaixo = produtosComEstoque.filter(s => (s.estoque as number) <= (s.estoque_minimo ?? 5));

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

  if (isVeiculos) {
    const disponiveis = veiculos.filter(v => v.status === 'disponivel');
    const reservados = veiculos.filter(v => v.status === 'reservado');
    const vendidos = veiculos.filter(v => v.status === 'vendido');
    const valorEstoqueVeiculos = disponiveis.reduce((acc, v) => acc + (v.servicos?.preco || 0), 0);

    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tighter uppercase italic text-[#22C55E] flex items-center gap-3">
              <Car size={32} /> Estoque de Veículos
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Vitrine interna — cadastro, disponibilidade e baixa na venda</p>
          </div>
          <button onClick={() => setVeiculoFormAberto(true)} className="inline-flex items-center gap-2 bg-[#22C55E] hover:bg-[#1ea34e] text-[#0B1120] px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all self-start md:self-auto">
            <PlusIcon size={14} /> Cadastrar veículo
          </button>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><Car size={10} /> Total</p>
            <p className="text-2xl font-black text-white mt-1">{veiculos.length}</p>
          </div>
          <div className="bg-[#0F172A] border border-[#22C55E]/20 rounded-2xl p-4">
            <p className="text-[9px] font-black text-[#22C55E]/70 uppercase tracking-widest">Disponíveis</p>
            <p className="text-2xl font-black text-[#22C55E] mt-1">{disponiveis.length}</p>
          </div>
          <div className="bg-[#0F172A] border border-yellow-500/20 rounded-2xl p-4">
            <p className="text-[9px] font-black text-yellow-500/70 uppercase tracking-widest">Reservados</p>
            <p className="text-2xl font-black text-yellow-400 mt-1">{reservados.length}</p>
          </div>
          <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><Wallet size={10} /> Valor disponível</p>
            <p className="text-lg font-black text-white mt-1">R$ {valorEstoqueVeiculos.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
          </div>
        </div>

        {loadingVeiculos ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-slate-600" /></div>
        ) : veiculos.length === 0 ? (
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
            <Car size={28} className="text-slate-600 mx-auto mb-2" />
            <p className="text-slate-500 text-sm font-bold">Nenhum veículo cadastrado ainda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {veiculos.map(v => {
              const statusInfo = STATUS_VEICULO[v.status] || STATUS_VEICULO.disponivel;
              const capa = v.servicos?.imagem_url || v.fotos?.[0];
              return (
                <div key={v.id} onClick={() => setVeiculoDetalhe(v)} className="bg-[#0F172A] border border-white/10 rounded-2xl overflow-hidden cursor-pointer hover:border-[#22C55E]/40 transition-colors">
                  <div className="h-40 bg-black/30 flex items-center justify-center overflow-hidden">
                    {capa ? <img src={capa} alt="" className="w-full h-full object-cover" /> : <Car size={32} className="text-slate-700" />}
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-white font-black text-sm leading-tight">{v.servicos?.nome}</p>
                      <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full border shrink-0 ${statusInfo.cor}`}>{statusInfo.label}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-[10px] text-slate-500 font-bold mt-1.5">
                      {v.km != null && <span className="flex items-center gap-1"><Gauge size={10} /> {v.km.toLocaleString('pt-BR')} km</span>}
                      {v.combustivel && <span className="flex items-center gap-1"><Fuel size={10} /> {v.combustivel}</span>}
                      {v.cor && <span className="flex items-center gap-1"><Palette size={10} /> {v.cor}</span>}
                    </div>
                    <p className="text-[#22C55E] font-black text-lg mt-2">
                      {v.servicos?.preco ? `R$ ${v.servicos.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Sob consulta'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {veiculoFormAberto && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setVeiculoFormAberto(false)}>
            <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-black text-white uppercase italic text-lg flex items-center gap-2"><Car size={18} className="text-[#22C55E]" /> Cadastrar veículo</h3>
                <button onClick={() => setVeiculoFormAberto(false)} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Marca *</label>
                  <input className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#22C55E]" value={novoVeiculo.marca} onChange={e => setNovoVeiculo(v => ({ ...v, marca: e.target.value }))} placeholder="Ex: Honda" />
                </div>
                <div className="col-span-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Modelo *</label>
                  <input className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#22C55E]" value={novoVeiculo.modelo} onChange={e => setNovoVeiculo(v => ({ ...v, modelo: e.target.value }))} placeholder="Ex: Civic EXL 2.0" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Ano fabricação</label>
                  <input type="number" className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#22C55E]" value={novoVeiculo.ano_fabricacao} onChange={e => setNovoVeiculo(v => ({ ...v, ano_fabricacao: e.target.value }))} placeholder="2022" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Ano modelo</label>
                  <input type="number" className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#22C55E]" value={novoVeiculo.ano_modelo} onChange={e => setNovoVeiculo(v => ({ ...v, ano_modelo: e.target.value }))} placeholder="2023" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">KM</label>
                  <input type="number" className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#22C55E]" value={novoVeiculo.km} onChange={e => setNovoVeiculo(v => ({ ...v, km: e.target.value }))} placeholder="0" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Cor</label>
                  <input className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#22C55E]" value={novoVeiculo.cor} onChange={e => setNovoVeiculo(v => ({ ...v, cor: e.target.value }))} placeholder="Prata" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Combustível</label>
                  <input className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#22C55E]" value={novoVeiculo.combustivel} onChange={e => setNovoVeiculo(v => ({ ...v, combustivel: e.target.value }))} placeholder="Flex" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Câmbio</label>
                  <input className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#22C55E]" value={novoVeiculo.cambio} onChange={e => setNovoVeiculo(v => ({ ...v, cambio: e.target.value }))} placeholder="Automático" />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Preço *</label>
                  <input type="number" className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#22C55E]" value={novoVeiculo.preco} onChange={e => setNovoVeiculo(v => ({ ...v, preco: e.target.value }))} placeholder="0,00" />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">URL da foto de capa</label>
                  <input className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[#22C55E]" value={novoVeiculo.fotoUrl} onChange={e => setNovoVeiculo(v => ({ ...v, fotoUrl: e.target.value }))} placeholder="https://..." />
                </div>
              </div>
              <button onClick={salvarNovoVeiculo} disabled={salvandoVeiculo} className="w-full mt-5 bg-[#22C55E] hover:bg-[#1ea34e] disabled:opacity-50 text-[#0B1120] font-black uppercase text-xs py-3 rounded-xl transition-all flex items-center justify-center gap-2">
                {salvandoVeiculo ? <Loader2 size={14} className="animate-spin" /> : <PlusIcon size={14} />} {salvandoVeiculo ? 'Salvando...' : 'Cadastrar'}
              </button>
            </div>
          </div>
        )}

        {veiculoDetalhe && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setVeiculoDetalhe(null)}>
            <div className="bg-[#0F172A] border border-white/10 rounded-3xl w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              {(veiculoDetalhe.servicos?.imagem_url || veiculoDetalhe.fotos?.[0]) && (
                <img src={veiculoDetalhe.servicos?.imagem_url || veiculoDetalhe.fotos?.[0]} alt="" className="w-full h-56 object-cover" />
              )}
              <div className="p-6">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <h3 className="font-black text-white text-lg leading-tight">{veiculoDetalhe.servicos?.nome}</h3>
                  <button onClick={() => setVeiculoDetalhe(null)} className="text-slate-500 hover:text-white p-1 shrink-0"><X size={18} /></button>
                </div>
                <p className="text-[#22C55E] font-black text-2xl mt-1">
                  {veiculoDetalhe.servicos?.preco ? `R$ ${veiculoDetalhe.servicos.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Sob consulta'}
                </p>

                <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                  {veiculoDetalhe.km != null && <div className="text-slate-400"><Gauge size={11} className="inline mr-1.5 text-slate-500" />{veiculoDetalhe.km.toLocaleString('pt-BR')} km</div>}
                  {veiculoDetalhe.combustivel && <div className="text-slate-400"><Fuel size={11} className="inline mr-1.5 text-slate-500" />{veiculoDetalhe.combustivel}</div>}
                  {veiculoDetalhe.cor && <div className="text-slate-400"><Palette size={11} className="inline mr-1.5 text-slate-500" />{veiculoDetalhe.cor}</div>}
                  {veiculoDetalhe.cambio && <div className="text-slate-400">Câmbio: {veiculoDetalhe.cambio}</div>}
                </div>

                <div className="flex gap-2 mt-5">
                  {(['disponivel', 'reservado', 'vendido'] as const).map(st => (
                    <button
                      key={st}
                      onClick={() => alterarStatusVeiculo(veiculoDetalhe, st)}
                      className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${veiculoDetalhe.status === st ? STATUS_VEICULO[st].cor : 'text-slate-500 border-white/10 hover:border-white/20'}`}
                    >
                      {STATUS_VEICULO[st].label}
                    </button>
                  ))}
                </div>

                <button onClick={() => abrirHistorico(veiculoDetalhe.servicos)} className="w-full mt-3 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-black uppercase py-2.5 rounded-xl transition-all">
                  <History size={13} /> Ver histórico
                </button>
              </div>
            </div>
          </div>
        )}

        {historicoServico && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setHistoricoServico(null)}>
            <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="font-black text-white uppercase italic text-lg flex items-center gap-2"><History size={18} className="text-purple-400" /> Histórico</h3>
                  <p className="text-slate-500 text-xs font-bold truncate">{historicoServico.nome}</p>
                </div>
                <button onClick={() => setHistoricoServico(null)} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
              </div>
              {carregandoHistorico ? (
                <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
              ) : movimentacoes.length === 0 ? (
                <p className="text-slate-500 text-sm font-bold text-center py-10">Nenhuma movimentação registrada ainda.</p>
              ) : (
                <div className="space-y-2">
                  {movimentacoes.map(m => {
                    const info = TIPO_LABEL[m.tipo] || { label: m.tipo, cor: 'text-slate-400 bg-white/5' };
                    const positivo = m.quantidade >= 0;
                    return (
                      <div key={m.id} className="bg-black/30 border border-white/5 rounded-2xl p-3">
                        <div className="flex items-center justify-between">
                          <span className={`font-black text-sm ${positivo ? 'text-[#22C55E]' : 'text-red-400'}`}>{positivo ? '+' : ''}{m.quantidade}</span>
                          <span className="text-slate-500 text-[10px]">{new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${info.cor}`}>{info.label}</span>
                          {m.observacao && <span className="text-slate-500 text-[10px]">{m.observacao}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tighter uppercase italic text-[#22C55E] flex items-center gap-3">
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
          <p className="text-2xl font-black text-[#22C55E] mt-1">R$ {valorTotalEstoque.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
        </div>
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><AlertTriangle size={10} /> Estoque baixo</p>
          <p className={`text-2xl font-black mt-1 ${produtosBaixo.length > 0 ? 'text-red-400' : 'text-white'}`}>{produtosBaixo.length}</p>
        </div>
      </div>

      <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden">
        <div className="p-5 border-b border-white/5">
          <h3 className="font-black uppercase text-sm text-slate-300">Produtos com controle de estoque ({produtosComEstoque.length})</h3>
          <p className="text-slate-500 text-[10px] font-bold uppercase mt-1">Pra cadastrar foto/preço ou ligar o controle num produto novo, vai em Configurações → Catálogo</p>
        </div>
        {loadingServicos ? (
          <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
        ) : produtosComEstoque.length === 0 ? (
          <div className="p-10 text-center">
            <Boxes size={28} className="text-slate-600 mx-auto mb-2" />
            <p className="text-slate-500 text-sm font-bold">Nenhum produto com estoque controlado ainda.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {[...produtosComEstoque].sort((a, b) => (a.estoque as number) - (b.estoque as number)).map(s => {
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
            })}
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
                        <span className={`font-black text-sm ${positivo ? 'text-[#22C55E]' : 'text-red-400'}`}>{positivo ? '+' : ''}{m.quantidade}</span>
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
