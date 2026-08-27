"use client";
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, Car, Search, Plus, X } from 'lucide-react';
import ArgusTopNav from '../ArgusTopNav';
import { fmtMoeda, fmtData } from '../shared';

type LeadVeiculo = {
  id: number;
  empresa: string;
  valor_total: number;
  status: string;
  etapa: number;
  veiculo_referencia: string | null;
  veiculo_placa?: string | null;
  veiculo_fipe_valor?: number | null;
  veiculo_valor_compra?: number | null;
  veiculo_data_compra?: string | null;
  veiculo_data_venda?: string | null;
  vendedor_nome: string | null;
  cidade: string | null;
  telefone: string | null;
  created_at: string;
};

const ETAPA_LABEL: Record<number, string> = { 0: 'Novo', 1: 'Contato', 2: 'Proposta', 3: 'Negociação' };

const FORM_VAZIO = {
  empresa: '', telefone: '', cidade: '', vendedor_nome: '',
  veiculo_referencia: '', veiculo_placa: '', valor_total: '',
  veiculo_fipe_valor: '', veiculo_valor_compra: '', veiculo_data_compra: '',
};

export default function ArgusVendasVeiculosPage() {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;

  const [leads, setLeads] = useState<LeadVeiculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'aberto' | 'ganho' | 'perdido'>('todos');
  const [busca, setBusca] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = () => {
    if (!perfil?.empresa_id) return;
    setLoading(true);
    supabase.from('leads')
      .select('id, empresa, valor_total, status, etapa, veiculo_referencia, veiculo_placa, veiculo_fipe_valor, veiculo_valor_compra, veiculo_data_compra, veiculo_data_venda, vendedor_nome, cidade, telefone, created_at')
      .eq('empresa_id', perfil.empresa_id)
      .not('veiculo_placa', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }) => { setLeads((data as LeadVeiculo[]) || []); setLoading(false); });
  };

  useEffect(() => { carregar(); }, [perfil?.empresa_id]);

  const criarVenda = async () => {
    if (!perfil?.empresa_id) return;
    if (!form.empresa.trim() || !form.valor_total || !form.veiculo_placa.trim()) { setErro('Cliente, placa e valor são obrigatórios.'); return; }
    setSalvando(true);
    setErro('');
    const { error } = await supabase.from('leads').insert([{
      empresa_id: perfil.empresa_id,
      empresa: form.empresa.trim(),
      telefone: form.telefone.trim() || null,
      cidade: form.cidade.trim() || null,
      vendedor_nome: form.vendedor_nome.trim() || null,
      veiculo_referencia: form.veiculo_referencia.trim() || null,
      veiculo_placa: form.veiculo_placa.trim().toUpperCase() || null,
      valor_total: Number(form.valor_total),
      veiculo_fipe_valor: form.veiculo_fipe_valor ? Number(form.veiculo_fipe_valor) : null,
      veiculo_valor_compra: form.veiculo_valor_compra ? Number(form.veiculo_valor_compra) : null,
      veiculo_data_compra: form.veiculo_data_compra || null,
      status: 'aberto',
      etapa: 0,
    }]);
    setSalvando(false);
    if (error) { setErro(error.message); return; }
    setModalAberto(false);
    setForm(FORM_VAZIO);
    carregar();
  };

  const filtrados = leads.filter(l => {
    if (filtroStatus !== 'todos' && l.status !== filtroStatus) return false;
    if (busca.trim()) {
      const alvo = busca.toLowerCase();
      if (!l.empresa?.toLowerCase().includes(alvo) && !l.veiculo_referencia?.toLowerCase().includes(alvo) && !l.vendedor_nome?.toLowerCase().includes(alvo)) return false;
    }
    return true;
  });

  const abertos = leads.filter(l => l.status === 'aberto').length;
  const ganhos = leads.filter(l => l.status === 'ganho').length;
  const perdidos = leads.filter(l => l.status === 'perdido').length;
  const valorGanho = leads.filter(l => l.status === 'ganho').reduce((acc, l) => acc + Number(l.valor_total || 0), 0);

  const valorEtapa = (l: LeadVeiculo) => l.status === 'ganho' ? 'ganho' : l.status === 'perdido' ? 'perdido' : `aberto-${l.etapa}`;

  const moverLead = async (lead: LeadVeiculo, opcao: string) => {
    const patch: Partial<LeadVeiculo> & { status: string } =
      opcao === 'ganho' ? { status: 'ganho', veiculo_data_venda: lead.veiculo_data_venda || new Date().toISOString().slice(0, 10) } :
      opcao === 'perdido' ? { status: 'perdido' } :
      { status: 'aberto', etapa: Number(opcao.split('-')[1]) };
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, ...patch } : l));
    await supabase.from('leads').update(patch).eq('id', lead.id);
  };

  return (
    <div>
      <ArgusTopNav nomeEmpresa={empresa?.nome} />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[#171717] flex items-center gap-2" style={{ fontFamily: 'var(--font-argus-serif)' }}>
            <Car size={22} className="text-[#171717]" /> Vendas
          </h1>
          <button onClick={() => setModalAberto(true)} className="flex items-center gap-2 bg-[#171717] hover:bg-black text-white px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest">
            <Plus size={14} /> Nova Venda
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-[#e0e0e0] rounded-2xl p-4">
            <p className="text-[11px] font-bold text-[#8a8a8a] uppercase tracking-wide mb-1">No funil</p>
            <p className="text-xl font-bold text-[#1d6fd9]">{abertos}</p>
          </div>
          <div className="bg-white border border-[#e0e0e0] rounded-2xl p-4">
            <p className="text-[11px] font-bold text-[#8a8a8a] uppercase tracking-wide mb-1">Ganhos</p>
            <p className="text-xl font-bold text-[#1fa85a]">{ganhos}</p>
          </div>
          <div className="bg-white border border-[#e0e0e0] rounded-2xl p-4">
            <p className="text-[11px] font-bold text-[#8a8a8a] uppercase tracking-wide mb-1">Perdidos</p>
            <p className="text-xl font-bold text-red-600">{perdidos}</p>
          </div>
          <div className="bg-white border border-[#e0e0e0] rounded-2xl p-4">
            <p className="text-[11px] font-bold text-[#8a8a8a] uppercase tracking-wide mb-1">Valor vendido</p>
            <p className="text-xl font-bold text-[#171717]">{fmtMoeda(valorGanho)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center bg-white border border-[#e0e0e0] rounded-xl px-3 py-2 gap-2 flex-1 min-w-[200px]">
            <Search size={14} className="text-[#8a8a8a]" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente, veículo ou vendedor..." className="flex-1 outline-none text-sm text-[#171717] bg-transparent" />
          </div>
          {(['todos', 'aberto', 'ganho', 'perdido'] as const).map(s => (
            <button key={s} onClick={() => setFiltroStatus(s)} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border transition-all ${filtroStatus === s ? 'bg-[#171717] text-white border-[#171717]' : 'bg-white text-[#5c5c5c] border-[#e0e0e0] hover:border-[#171717]/40'}`}>
              {s === 'todos' ? 'Todos' : s === 'aberto' ? 'Aberto' : s === 'ganho' ? 'Ganho' : 'Perdido'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="p-8 flex justify-center"><Loader2 size={22} className="animate-spin text-[#171717]" /></div>
        ) : filtrados.length === 0 ? (
          <div className="bg-white border border-[#e0e0e0] rounded-2xl p-10 text-center">
            <p className="text-[#5c5c5c] font-semibold text-sm">Nenhum lead encontrado.</p>
          </div>
        ) : (
          <div className="bg-white border border-[#e0e0e0] rounded-2xl overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e0e0e0] bg-[#f5f5f5]">
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-[#8a8a8a] uppercase">Cliente</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-[#8a8a8a] uppercase">Veículo</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-[#8a8a8a] uppercase">Vendedor</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-[#8a8a8a] uppercase">Etapa</th>
                  <th className="text-right px-4 py-3 text-[11px] font-bold text-[#8a8a8a] uppercase">Valor</th>
                  <th className="text-right px-4 py-3 text-[11px] font-bold text-[#8a8a8a] uppercase">Data</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(l => (
                  <tr key={l.id} className="border-b border-[#f0f0f0] last:border-0 hover:bg-[#fafafa]">
                    <td className="px-4 py-3 font-bold text-[#171717]">{l.empresa}</td>
                    <td className="px-4 py-3 text-[#5c5c5c]">{l.veiculo_referencia || '—'}</td>
                    <td className="px-4 py-3 text-[#5c5c5c]">{l.vendedor_nome || '—'}</td>
                    <td className="px-4 py-3">
                      <select
                        value={valorEtapa(l)}
                        onChange={e => moverLead(l, e.target.value)}
                        className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full border outline-none cursor-pointer ${l.status === 'ganho' ? 'text-[#1fa85a] bg-[#d9f2e3] border-[#1fa85a]/20' : l.status === 'perdido' ? 'text-red-600 bg-red-50 border-red-200' : 'text-[#1d6fd9] bg-[#e8f0fd] border-[#1d6fd9]/20'}`}
                      >
                        <option value="aberto-0">Novo</option>
                        <option value="aberto-1">Contato</option>
                        <option value="aberto-2">Proposta</option>
                        <option value="aberto-3">Negociação</option>
                        <option value="ganho">Ganho</option>
                        <option value="perdido">Perdido</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-[#171717]">{fmtMoeda(l.valor_total)}</td>
                    <td className="px-4 py-3 text-right text-[#8a8a8a] text-[12px]">{fmtData(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {modalAberto && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e0e0e0]">
              <p className="text-lg font-bold text-[#171717]" style={{ fontFamily: 'var(--font-argus-serif)' }}>Nova Venda</p>
              <button onClick={() => { setModalAberto(false); setErro(''); }} className="text-[#8a8a8a] hover:text-[#171717]"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-[#8a8a8a] uppercase block mb-1">Cliente *</label>
                <input value={form.empresa} onChange={e => setForm({ ...form, empresa: e.target.value })} placeholder="Nome do cliente" className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-xl px-3 py-2.5 text-sm text-[#171717] outline-none focus:border-[#171717]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-[#8a8a8a] uppercase block mb-1">Telefone</label>
                  <input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-xl px-3 py-2.5 text-sm text-[#171717] outline-none focus:border-[#171717]" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#8a8a8a] uppercase block mb-1">Cidade</label>
                  <input value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-xl px-3 py-2.5 text-sm text-[#171717] outline-none focus:border-[#171717]" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#8a8a8a] uppercase block mb-1">Vendedor</label>
                <input value={form.vendedor_nome} onChange={e => setForm({ ...form, vendedor_nome: e.target.value })} placeholder="Quem está atendendo" className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-xl px-3 py-2.5 text-sm text-[#171717] outline-none focus:border-[#171717]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-[#8a8a8a] uppercase block mb-1">Veículo</label>
                  <input value={form.veiculo_referencia} onChange={e => setForm({ ...form, veiculo_referencia: e.target.value })} placeholder="Ex: HB20 2022 Sense" className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-xl px-3 py-2.5 text-sm text-[#171717] outline-none focus:border-[#171717]" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#8a8a8a] uppercase block mb-1">Placa *</label>
                  <input value={form.veiculo_placa} onChange={e => setForm({ ...form, veiculo_placa: e.target.value })} className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-xl px-3 py-2.5 text-sm text-[#171717] outline-none focus:border-[#171717] uppercase" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#8a8a8a] uppercase block mb-1">Valor da proposta *</label>
                <input type="number" value={form.valor_total} onChange={e => setForm({ ...form, valor_total: e.target.value })} placeholder="0,00" className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-xl px-3 py-2.5 text-sm text-[#171717] outline-none focus:border-[#171717]" />
              </div>
              <p className="text-[11px] font-bold text-[#8a8a8a] uppercase tracking-wide pt-2 border-t border-[#f0f0f0]">Dados de compra (opcional, alimenta a Gestão Financeira)</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-[#8a8a8a] uppercase block mb-1">FIPE</label>
                  <input type="number" value={form.veiculo_fipe_valor} onChange={e => setForm({ ...form, veiculo_fipe_valor: e.target.value })} className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-xl px-3 py-2.5 text-sm text-[#171717] outline-none focus:border-[#171717]" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#8a8a8a] uppercase block mb-1">Valor de compra</label>
                  <input type="number" value={form.veiculo_valor_compra} onChange={e => setForm({ ...form, veiculo_valor_compra: e.target.value })} className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-xl px-3 py-2.5 text-sm text-[#171717] outline-none focus:border-[#171717]" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#8a8a8a] uppercase block mb-1">Data de compra</label>
                  <input type="date" value={form.veiculo_data_compra} onChange={e => setForm({ ...form, veiculo_data_compra: e.target.value })} className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-xl px-3 py-2.5 text-sm text-[#171717] outline-none focus:border-[#171717]" />
                </div>
              </div>
              {erro && <p className="text-xs font-bold text-red-600">{erro}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#e0e0e0]">
              <button onClick={() => { setModalAberto(false); setErro(''); }} className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest text-[#5c5c5c]">Cancelar</button>
              <button onClick={criarVenda} disabled={salvando} className="flex items-center gap-2 bg-[#171717] hover:bg-black disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest">
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Criar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
