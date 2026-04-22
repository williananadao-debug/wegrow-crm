"use client";
import { useState, useEffect, useCallback } from 'react';
import {
  MapPin, Plus, X, CheckCircle2, Clock, Zap, Filter,
  ExternalLink, User, ChevronDown, ArrowLeft, Loader2,
  Navigation, NavigationOff, Building2, Phone, FileText,
  Calendar, Search
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Toast } from '@/components/Toast';

type Visita = {
  id: number;
  empresa: string;
  telefone?: string;
  observacao?: string;
  user_id?: string;
  empresa_id?: string;
  unidade?: string;
  latitude?: number;
  longitude?: number;
  localizacao_url?: string;
  lead_id?: number | null;
  created_at: string;
};

type Perfil = {
  id: string;
  nome: string;
  cargo?: string;
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function VisitasPage() {
  const auth = useAuth() || {};
  const user = auth.user;
  const perfil = auth.perfil as any;
  const router = useRouter();

  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [vendedores, setVendedores] = useState<Perfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);

  // Filtros
  const [busca, setBusca] = useState('');
  const [filtroVendedor, setFiltroVendedor] = useState('todos');
  const [filtroLead, setFiltroLead] = useState<'todos' | 'com_lead' | 'sem_lead'>('todos');

  // Modal de nova visita
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [empresa, setEmpresa] = useState('');
  const [telefone, setTelefone] = useState('');
  const [observacao, setObservacao] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'ok' | 'denied'>('idle');
  const [saving, setSaving] = useState(false);

  // Modal criar lead a partir de visita
  const [criarLeadVisita, setCriarLeadVisita] = useState<Visita | null>(null);
  const [criandoLead, setCriandoLead] = useState(false);

  const isLideranca = perfil?.cargo === 'diretor' || perfil?.cargo === 'gerente';

  const toast = useCallback((msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
  }, []);

  const carregarVisitas = useCallback(async () => {
    if (!perfil?.empresa_id) return;
    setLoading(true);
    const query = supabase
      .from('visitas')
      .select('*')
      .eq('empresa_id', perfil.empresa_id)
      .order('created_at', { ascending: false });

    if (!isLideranca) {
      query.eq('user_id', user?.id);
    }

    const { data, error } = await query;
    if (!error && data) setVisitas(data as Visita[]);
    setLoading(false);
  }, [perfil?.empresa_id, user?.id, isLideranca]);

  const carregarVendedores = useCallback(async () => {
    if (!perfil?.empresa_id || !isLideranca) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, nome, cargo')
      .eq('empresa_id', perfil.empresa_id);
    if (data) setVendedores(data as Perfil[]);
  }, [perfil?.empresa_id, isLideranca]);

  useEffect(() => {
    carregarVisitas();
    carregarVendedores();
  }, [carregarVisitas, carregarVendedores]);

  function abrirModalNovaVisita() {
    setEmpresa('');
    setTelefone('');
    setObservacao('');
    setCoords(null);
    setGeoStatus('loading');
    setIsModalOpen(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoStatus('ok');
      },
      () => setGeoStatus('denied'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function salvarVisita() {
    if (!empresa.trim()) return;
    setSaving(true);
    const mapsUrl = coords ? `https://www.google.com/maps?q=${coords.lat},${coords.lng}` : null;
    const payload = {
      empresa: empresa.trim(),
      telefone: telefone || null,
      observacao: observacao || null,
      user_id: user?.id,
      empresa_id: perfil?.empresa_id,
      unidade: perfil?.unidade || null,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      localizacao_url: mapsUrl,
      lead_id: null,
    };
    try {
      const { data, error } = await supabase.from('visitas').insert([payload]).select();
      if (error) throw error;
      if (data) setVisitas(prev => [data[0] as Visita, ...prev]);
      setIsModalOpen(false);
      toast('Visita registrada! 📍');
    } catch {
      toast('Erro ao salvar visita.');
    } finally {
      setSaving(false);
    }
  }

  async function criarLeadDaVisita(visita: Visita) {
    setCriandoLead(true);
    try {
      const { data: leadData, error: leadError } = await supabase
        .from('leads')
        .insert([{
          empresa: visita.empresa,
          telefone: visita.telefone || null,
          descricao: visita.observacao || null,
          tipo: 'visita',
          etapa: 0,
          status: 'aberto',
          valor_total: 0,
          user_id: visita.user_id,
          empresa_id: visita.empresa_id,
          unidade: visita.unidade || null,
          latitude: visita.latitude ?? null,
          longitude: visita.longitude ?? null,
          localizacao_url: visita.localizacao_url || null,
        }])
        .select()
        .single();

      if (leadError) throw leadError;

      const { error: updateError } = await supabase
        .from('visitas')
        .update({ lead_id: leadData.id })
        .eq('id', visita.id);

      if (updateError) throw updateError;

      setVisitas(prev => prev.map(v => v.id === visita.id ? { ...v, lead_id: leadData.id } : v));
      setCriarLeadVisita(null);
      toast('Lead criado no pipeline! 🎯');
    } catch {
      toast('Erro ao criar lead.');
    } finally {
      setCriandoLead(false);
    }
  }

  const visitasFiltradas = visitas.filter(v => {
    if (filtroVendedor !== 'todos' && v.user_id !== filtroVendedor) return false;
    if (filtroLead === 'com_lead' && !v.lead_id) return false;
    if (filtroLead === 'sem_lead' && v.lead_id) return false;
    if (busca && !v.empresa.toLowerCase().includes(busca.toLowerCase()) && !v.telefone?.includes(busca)) return false;
    return true;
  });

  const totalVisitas = visitas.length;
  const comLead = visitas.filter(v => v.lead_id).length;
  const semLead = visitas.filter(v => !v.lead_id).length;

  return (
    <div className="h-full flex flex-col pb-20 md:pb-2 animate-in fade-in duration-500">

      {/* TOPO */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 px-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-black tracking-tighter text-white uppercase italic flex items-center gap-2">
              <MapPin size={24} className="text-blue-400" /> Visitas
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">
              {perfil?.nome} — histórico de visitas a campo
            </p>
          </div>
        </div>

        <button
          onClick={abrirModalNovaVisita}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-[0_5px_20px_rgba(59,130,246,0.3)] flex items-center gap-2"
        >
          <Plus size={16} strokeWidth={3} /> Registrar Visita
        </button>
      </div>

      {/* CARDS RESUMO */}
      <div className="grid grid-cols-3 gap-2 px-2 mb-4">
        <div className="bg-[#0B1120] border border-white/10 rounded-xl p-3 text-center">
          <div className="text-2xl font-black text-white">{totalVisitas}</div>
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total</div>
        </div>
        <div className="bg-[#0B1120] border border-[#22C55E]/20 rounded-xl p-3 text-center">
          <div className="text-2xl font-black text-[#22C55E]">{comLead}</div>
          <div className="text-[9px] font-black uppercase tracking-widest text-[#22C55E]/70">Com Lead</div>
        </div>
        <div className="bg-[#0B1120] border border-orange-500/20 rounded-xl p-3 text-center">
          <div className="text-2xl font-black text-orange-400">{semLead}</div>
          <div className="text-[9px] font-black uppercase tracking-widest text-orange-400/70">Sem Lead</div>
        </div>
      </div>

      {/* FILTROS */}
      <div className="flex flex-wrap items-center gap-2 px-2 mb-4">
        <div className="flex items-center bg-[#0B1120] border border-white/10 rounded-xl px-3 h-9 gap-2 flex-1 min-w-[180px]">
          <Search size={12} className="text-slate-400" />
          <input
            type="text"
            placeholder="Buscar empresa ou telefone..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="bg-transparent text-white text-xs outline-none w-full placeholder:text-slate-600"
          />
        </div>

        <div className="flex items-center gap-1 bg-[#0B1120] border border-white/10 rounded-xl h-9 overflow-hidden">
          {(['todos', 'com_lead', 'sem_lead'] as const).map(opt => (
            <button
              key={opt}
              onClick={() => setFiltroLead(opt)}
              className={`px-3 h-full text-[10px] font-black uppercase tracking-widest transition-colors ${
                filtroLead === opt
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {opt === 'todos' ? 'Todos' : opt === 'com_lead' ? 'Com Lead' : 'Sem Lead'}
            </button>
          ))}
        </div>

        {isLideranca && (
          <select
            value={filtroVendedor}
            onChange={e => setFiltroVendedor(e.target.value)}
            className="bg-[#0B1120] border border-white/10 rounded-xl text-blue-400 text-[10px] font-bold uppercase outline-none cursor-pointer appearance-none px-3 h-9"
          >
            <option value="todos" className="bg-[#0B1120]">Todos Vendedores</option>
            {vendedores.map(v => (
              <option key={v.id} value={v.id} className="bg-[#0B1120]">{v.nome}</option>
            ))}
          </select>
        )}
      </div>

      {/* LISTA DE VISITAS */}
      <div className="flex-1 overflow-y-auto px-2 space-y-2 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-blue-400" />
          </div>
        ) : visitasFiltradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <MapPin size={48} className="text-slate-700" />
            <p className="text-slate-500 font-bold text-sm uppercase tracking-widest">Nenhuma visita encontrada</p>
            <button
              onClick={abrirModalNovaVisita}
              className="mt-2 bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600 hover:text-white px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center gap-2"
            >
              <Plus size={14} /> Registrar primeira visita
            </button>
          </div>
        ) : (
          visitasFiltradas.map(visita => (
            <div
              key={visita.id}
              className={`bg-[#0B1120] border rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-3 transition-all hover:border-white/20 ${
                visita.lead_id ? 'border-[#22C55E]/20' : 'border-white/10'
              }`}
            >
              {/* ÍCONE + DADOS */}
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center ${
                  visita.lead_id ? 'bg-[#22C55E]/10 border border-[#22C55E]/30' : 'bg-blue-500/10 border border-blue-500/30'
                }`}>
                  <MapPin size={18} className={visita.lead_id ? 'text-[#22C55E]' : 'text-blue-400'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-white font-black text-sm truncate">{visita.empresa}</span>
                    {visita.lead_id ? (
                      <span className="bg-[#22C55E]/15 border border-[#22C55E]/40 text-[#22C55E] text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 size={9} /> Lead no Pipeline
                      </span>
                    ) : (
                      <span className="bg-orange-500/10 border border-orange-500/30 text-orange-400 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Clock size={9} /> Sem Lead
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                    <span className="flex items-center gap-1">
                      <Calendar size={9} />
                      {formatDate(visita.created_at)} às {formatTime(visita.created_at)}
                    </span>
                    {visita.telefone && (
                      <span className="flex items-center gap-1">
                        <Phone size={9} /> {visita.telefone}
                      </span>
                    )}
                    {visita.unidade && (
                      <span className="flex items-center gap-1">
                        <Building2 size={9} /> {visita.unidade}
                      </span>
                    )}
                    {visita.localizacao_url && (
                      <a
                        href={visita.localizacao_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                        onClick={e => e.stopPropagation()}
                      >
                        <Navigation size={9} /> Ver no Maps
                      </a>
                    )}
                  </div>
                  {visita.observacao && (
                    <p className="mt-1.5 text-slate-400 text-xs line-clamp-2 italic">
                      "{visita.observacao}"
                    </p>
                  )}
                </div>
              </div>

              {/* AÇÕES */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {visita.lead_id ? (
                  <button
                    onClick={() => router.push('/deals')}
                    className="flex items-center gap-1.5 px-3 py-2 bg-[#22C55E]/10 border border-[#22C55E]/30 text-[#22C55E] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#22C55E]/20 transition-colors"
                  >
                    <Zap size={12} /> Ver Pipeline
                  </button>
                ) : (
                  <button
                    onClick={() => setCriarLeadVisita(visita)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-600/15 border border-blue-500/30 text-blue-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all"
                  >
                    <Plus size={12} /> Criar Lead
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* MODAL: NOVA VISITA */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-[#0B1120] border border-blue-500/30 w-full max-w-md rounded-[32px] shadow-2xl flex flex-col animate-in zoom-in-95">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-blue-500/5 rounded-t-[32px]">
              <h2 className="text-xl font-black uppercase italic tracking-tighter text-blue-400 flex items-center gap-2">
                <MapPin size={22} /> Registrar Visita
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-white/5 rounded-full text-slate-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                geoStatus === 'ok' ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                : geoStatus === 'denied' ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                : 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
              }`}>
                <MapPin size={12} className={geoStatus === 'loading' ? 'animate-pulse' : ''} />
                {geoStatus === 'loading' && 'Obtendo localização...'}
                {geoStatus === 'ok' && `Localização capturada: ${coords?.lat.toFixed(5)}, ${coords?.lng.toFixed(5)}`}
                {geoStatus === 'denied' && 'Sem permissão de localização — visita será salva sem coordenadas'}
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
                  Nome do Cliente / Empresa *
                </label>
                <input
                  autoFocus
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-medium outline-none focus:border-blue-500 transition-colors"
                  placeholder="Ex: João Silva, Loja ABC..."
                  value={empresa}
                  onChange={e => setEmpresa(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
                  Telefone (opcional)
                </label>
                <input
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-medium outline-none focus:border-blue-500 transition-colors"
                  placeholder="(00) 00000-0000"
                  value={telefone}
                  onChange={e => setTelefone(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">
                  Observação
                </label>
                <textarea
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-medium outline-none focus:border-blue-500 min-h-[90px] resize-none custom-scrollbar transition-colors"
                  placeholder="O que aconteceu na visita? Cliente disse que..."
                  value={observacao}
                  onChange={e => setObservacao(e.target.value)}
                />
              </div>
            </div>

            <div className="p-6 border-t border-white/10 bg-[#0F172A] rounded-b-[32px] flex gap-3">
              <button
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest bg-white/5 text-slate-400 hover:bg-white/10 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={salvarVisita}
                disabled={!empresa.trim() || saving}
                className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all flex items-center justify-center gap-2"
              >
                <MapPin size={14} /> {saving ? 'Salvando...' : 'Registrar Visita'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR CRIAR LEAD */}
      {criarLeadVisita && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-[#0B1120] border border-white/10 w-full max-w-sm rounded-[28px] shadow-2xl animate-in zoom-in-95">
            <div className="p-6 border-b border-white/10 flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center justify-center">
                <Zap size={18} className="text-blue-400" />
              </div>
              <div>
                <h2 className="text-white font-black text-sm uppercase tracking-widest">Criar Lead</h2>
                <p className="text-slate-500 text-[10px] font-bold">{criarLeadVisita.empresa}</p>
              </div>
            </div>
            <div className="p-6">
              <p className="text-slate-400 text-sm">
                Isso vai criar um lead no pipeline de Vendas para{' '}
                <span className="text-white font-bold">{criarLeadVisita.empresa}</span> com base nessa visita.
              </p>
            </div>
            <div className="p-6 border-t border-white/10 flex gap-3">
              <button
                onClick={() => setCriarLeadVisita(null)}
                className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest bg-white/5 text-slate-400 hover:bg-white/10 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => criarLeadDaVisita(criarLeadVisita)}
                disabled={criandoLead}
                className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {criandoLead ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                {criandoLead ? 'Criando...' : 'Criar Lead'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toastMessage} isVisible={showToast} onClose={() => setShowToast(false)} />
    </div>
  );
}
