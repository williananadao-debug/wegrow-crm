"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  Building2, Plus, Edit2, X, Save, Loader2, Users, Package,
  ShieldAlert, ToggleLeft, ToggleRight, Trash2, ChevronRight,
  BarChart2, TrendingUp, Clock, Activity, Upload, Image as ImageIcon
} from 'lucide-react';
import { SkeletonPage } from '@/components/Skeleton';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim());

type Empresa = {
  id: string; nome: string; cnpj?: string; plano: string;
  status: string; modulos: Record<string, boolean>; created_at: string;
  total_usuarios?: number; logo_url?: string | null;
};
type Unidade = {
  id: string; nome: string; razao_social?: string;
  cnpj?: string; endereco?: string; cidade?: string; estado?: string;
};

const PLANOS = ['essencial', 'pro', 'enterprise'];
const STATUS_OPTS = ['trial', 'ativa', 'suspensa'];
// "crm" é o macro-toggle: liga/desliga o produto inteiro de pipeline/vendas de uma vez.
// Ausente no JSON (empresas criadas antes disso existir) conta como ligado — só desliga
// se alguém marcar explicitamente crm:false, senão o deploy apagaria o menu de quem já usa.
const CRM_SUBMODULOS = ['opec', 'ia', 'financeiro', 'whatsapp', 'assinatura'];

const COR_STATUS: Record<string, string> = {
  ativa: 'bg-green-500/20 text-green-400 border-green-500/30',
  trial: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  suspensa: 'bg-red-500/20 text-red-400 border-red-500/30',
};
const COR_PLANO: Record<string, string> = {
  essencial: 'text-slate-300',
  pro: 'text-blue-400',
  enterprise: 'text-purple-400',
};

export default function AdminPage() {
  const { user, perfil, loading: authLoading } = useAuth();
  const [token, setToken] = useState('');
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [empresaSelecionada, setEmpresaSelecionada] = useState<Empresa | null>(null);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // Form empresa selecionada
  const [editNome, setEditNome] = useState('');
  const [editPlano, setEditPlano] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editModulos, setEditModulos] = useState<Record<string, boolean>>({});
  const [editLogoUrl, setEditLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Form nova unidade
  const [novaUnidadeNome, setNovaUnidadeNome] = useState('');
  const [novaUnidadeRazao, setNovaUnidadeRazao] = useState('');
  const [novaUnidadeCnpj, setNovaUnidadeCnpj] = useState('');
  const [novaUnidadeEndereco, setNovaUnidadeEndereco] = useState('');
  const [novaUnidadeCidade, setNovaUnidadeCidade] = useState('');

  // Form nova empresa
  const [showNovaEmpresa, setShowNovaEmpresa] = useState(false);
  const [novaEmpresaNome, setNovaEmpresaNome] = useState('');
  const [novaEmpresaCnpj, setNovaEmpresaCnpj] = useState('');
  const [novaEmpresaDiretorNome, setNovaEmpresaDiretorNome] = useState('');
  const [novaEmpresaDiretorEmail, setNovaEmpresaDiretorEmail] = useState('');
  const [novaEmpresaFeedback, setNovaEmpresaFeedback] = useState<{ tipo: 'sucesso' | 'erro'; msg: string } | null>(null);

  const isAdmin = !authLoading && user && ADMIN_EMAILS.includes(user.email || '');

  useEffect(() => {
    if (!user) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setToken(session.access_token);
    });
  }, [user]);

  useEffect(() => {
    if (token) carregarEmpresas();
  }, [token]);

  const headers = () => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` });

  const carregarEmpresas = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/empresas', { headers: headers() });
    if (res.ok) setEmpresas(await res.json());
    setLoading(false);
  };

  const abrirEmpresa = async (e: Empresa) => {
    setEmpresaSelecionada(e);
    setEditNome(e.nome);
    setEditPlano(e.plano);
    setEditStatus(e.status);
    setEditModulos({ ...e.modulos });
    setEditLogoUrl(e.logo_url || null);
    setMetrics(null);

    const [resUnidades, resMetrics] = await Promise.all([
      fetch(`/api/admin/unidades?empresa_id=${e.id}`, { headers: headers() }),
      fetch(`/api/admin/metrics?empresa_id=${e.id}`, { headers: headers() }),
    ]);

    if (resUnidades.ok) setUnidades(await resUnidades.json());
    else setUnidades([]);

    if (resMetrics.ok) setMetrics(await resMetrics.json());
  };

  const salvarEmpresa = async () => {
    if (!empresaSelecionada) return;
    if (!editNome.trim()) { alert('O nome da empresa não pode ficar vazio.'); return; }
    setSaving(true);
    // Mescla módulos atuais com os editados para não perder campos não-boolean (ex: tokens de integração)
    const modulosMesclados = { ...empresaSelecionada.modulos, ...editModulos };
    await fetch('/api/admin/empresas', {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ id: empresaSelecionada.id, nome: editNome.trim(), plano: editPlano, status: editStatus, modulos: modulosMesclados }),
    });
    await carregarEmpresas();
    setSaving(false);
  };

  const uploadLogo = async (file: File) => {
    if (!empresaSelecionada) return;
    setUploadingLogo(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const ext = file.name.split('.').pop() || 'png';
      const res = await fetch('/api/admin/empresas/logo', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ empresaId: empresaSelecionada.id, imagemBase64: base64, extensao: ext }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { alert(json.erro || `Erro ao subir logo (HTTP ${res.status}).`); return; }
      setEditLogoUrl(json.logoUrl);
      await carregarEmpresas();
    } catch (err: any) {
      alert('Erro ao subir logo: ' + (err?.message || 'erro desconhecido.'));
    } finally {
      setUploadingLogo(false);
    }
  };

  const criarEmpresa = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNovaEmpresaFeedback(null);
    const res = await fetch('/api/admin/empresas', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ nome: novaEmpresaNome, cnpj: novaEmpresaCnpj, diretorNome: novaEmpresaDiretorNome, diretorEmail: novaEmpresaDiretorEmail }),
    });
    const json = await res.json();
    if (!res.ok) {
      setNovaEmpresaFeedback({ tipo: 'erro', msg: json.erro || 'Erro ao criar empresa.' });
      setSaving(false);
      return;
    }
    setNovaEmpresaFeedback({ tipo: 'sucesso', msg: `Empresa criada! Login: ${json.diretorEmail} · Senha temporária: ${json.senhaTemp}` });
    setNovaEmpresaNome(''); setNovaEmpresaCnpj(''); setNovaEmpresaDiretorNome(''); setNovaEmpresaDiretorEmail('');
    await carregarEmpresas();
    setSaving(false);
  };

  const adicionarUnidade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empresaSelecionada) return;
    setSaving(true);
    await fetch('/api/admin/unidades', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        empresa_id: empresaSelecionada.id,
        nome: novaUnidadeNome,
        razao_social: novaUnidadeRazao || null,
        cnpj: novaUnidadeCnpj || null,
        endereco: novaUnidadeEndereco || null,
        cidade: novaUnidadeCidade || null,
      }),
    });
    setNovaUnidadeNome(''); setNovaUnidadeRazao(''); setNovaUnidadeCnpj('');
    setNovaUnidadeEndereco(''); setNovaUnidadeCidade('');
    const res = await fetch(`/api/admin/unidades?empresa_id=${empresaSelecionada.id}`, { headers: headers() });
    if (res.ok) setUnidades(await res.json());
    setSaving(false);
  };

  const removerUnidade = async (id: string) => {
    if (!confirm('Remover esta unidade?')) return;
    await fetch(`/api/admin/unidades?id=${id}`, { method: 'DELETE', headers: headers() });
    setUnidades(prev => prev.filter(u => u.id !== id));
  };

  if (authLoading) return <div className="p-4 md:p-8"><SkeletonPage /></div>;
  if (!isAdmin) return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
      <div className="text-center">
        <ShieldAlert className="mx-auto text-red-500 mb-4" size={48}/>
        <p className="text-white font-black text-2xl uppercase">Acesso Restrito</p>
        <p className="text-slate-500 text-sm mt-2">Apenas administradores do sistema.</p>
      </div>
    </div>
  );

  return (
    <div className="text-white p-4 md:p-8 pb-20">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-6">
          <div>
            <h1 className="text-3xl font-black uppercase italic flex items-center gap-3">
              <ShieldAlert className="text-[#22C55E]" size={32}/> God Mode
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Painel de controle do sistema</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-slate-500 font-bold">{empresas.length} empresas</p>
              <p className="text-xs text-[#22C55E] font-black">
                {empresas.filter(e => e.status === 'ativa').length} ativas
              </p>
            </div>
            <Link
              href="/admin/clientes-wegrow"
              className="bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all"
            >
              <TrendingUp size={14}/> Assinaturas
            </Link>
            <button
              onClick={() => setShowNovaEmpresa(true)}
              className="bg-[#22C55E] text-[#0B1120] px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all"
            >
              <Plus size={14}/> Nova Empresa
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Lista de Empresas */}
          <div className="lg:col-span-2 space-y-2">
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-white/[0.03] border border-white/5 rounded-2xl animate-pulse"/>)}</div>
            ) : empresas.map(e => (
              <button
                key={e.id}
                onClick={() => abrirEmpresa(e)}
                className={`w-full text-left bg-[#0F172A] border rounded-2xl p-4 transition-all hover:border-white/20 flex items-center justify-between gap-3 ${empresaSelecionada?.id === e.id ? 'border-[#22C55E]/50 bg-[#22C55E]/5' : 'border-white/5'}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center shrink-0">
                    <Building2 size={18} className="text-slate-400"/>
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-sm truncate">{e.nome}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[9px] font-black uppercase ${COR_PLANO[e.plano]}`}>{e.plano}</span>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${COR_STATUS[e.status]}`}>{e.status}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-slate-500 text-[10px] flex items-center gap-1"><Users size={10}/>{e.total_usuarios}</span>
                  <ChevronRight size={14} className="text-slate-600"/>
                </div>
              </button>
            ))}
          </div>

          {/* Painel de Edição */}
          {empresaSelecionada && (
            <div className="lg:col-span-3 space-y-4">

              {/* Plano e Status */}
              <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="font-black uppercase text-sm flex items-center gap-2">
                    <Edit2 size={14} className="text-[#22C55E]"/> {empresaSelecionada.nome}
                  </h2>
                  <button onClick={salvarEmpresa} disabled={saving} className="bg-[#22C55E] text-[#0B1120] px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2">
                    {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Salvar
                  </button>
                </div>

                <div className="mb-5">
                  <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Nome da Empresa</label>
                  <input value={editNome} onChange={e => setEditNome(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm font-bold outline-none focus:border-[#22C55E]"/>
                </div>

                <div className="mb-5">
                  <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Logo (aparece no menu lateral do cliente)</label>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {editLogoUrl ? <img src={editLogoUrl} alt="Logo" className="w-full h-full object-contain"/> : <ImageIcon size={18} className="text-slate-600"/>}
                    </div>
                    <label className="flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-black uppercase text-slate-400 hover:text-white cursor-pointer transition-all">
                      {uploadingLogo ? <Loader2 size={14} className="animate-spin"/> : <Upload size={14}/>}
                      {uploadingLogo ? 'Enviando...' : 'Subir logo'}
                      <input type="file" accept="image/*" className="hidden" disabled={uploadingLogo} onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }}/>
                    </label>
                  </div>
                  <p className="text-[9px] text-slate-600 mt-1.5">Sem logo, o menu mostra um quadrado com a inicial do nome.</p>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Plano</label>
                    <select value={editPlano} onChange={e => setEditPlano(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm font-bold outline-none">
                      {PLANOS.map(p => <option key={p} value={p} className="bg-[#0B1120] capitalize">{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 mb-1 block">Status</label>
                    <select value={editStatus} onChange={e => setEditStatus(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm font-bold outline-none">
                      {STATUS_OPTS.map(s => <option key={s} value={s} className="bg-[#0B1120] capitalize">{s}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-5">
                  <label className="text-[10px] font-black uppercase text-slate-500 block">Módulos Ativos</label>

                  <div>
                    <button
                      type="button"
                      onClick={() => setEditModulos(prev => ({ ...prev, crm: prev.crm !== false ? false : true }))}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-sm font-black uppercase ${editModulos.crm !== false ? 'bg-[#22C55E]/10 border-[#22C55E]/40 text-[#22C55E]' : 'bg-white/5 border-white/10 text-slate-500'}`}
                    >
                      CRM
                      {editModulos.crm !== false ? <ToggleRight size={18}/> : <ToggleLeft size={18}/>}
                    </button>
                    <div className={`grid grid-cols-2 gap-2 mt-2 ml-2 pl-3 border-l border-white/10 transition-opacity ${editModulos.crm === false ? 'opacity-40 pointer-events-none' : ''}`}>
                      {CRM_SUBMODULOS.map(mod => (
                        <button
                          key={mod}
                          type="button"
                          onClick={() => setEditModulos(prev => ({ ...prev, [mod]: !prev[mod] }))}
                          className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-sm font-black uppercase ${editModulos[mod] ? 'bg-[#22C55E]/10 border-[#22C55E]/40 text-[#22C55E]' : 'bg-white/5 border-white/10 text-slate-500'}`}
                        >
                          {mod}
                          {editModulos[mod] ? <ToggleRight size={18}/> : <ToggleLeft size={18}/>}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={() => setEditModulos(prev => ({ ...prev, nexus: !prev.nexus }))}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-sm font-black uppercase ${editModulos.nexus ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-400' : 'bg-white/5 border-white/10 text-slate-500'}`}
                    >
                      Nexus
                      {editModulos.nexus ? <ToggleRight size={18}/> : <ToggleLeft size={18}/>}
                    </button>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-white/5">
                  <p className="text-[10px] text-slate-600 font-mono">ID: {empresaSelecionada.id}</p>
                </div>
              </div>

              {/* Métricas */}
              <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6">
                <h3 className="font-black uppercase text-sm flex items-center gap-2 mb-5">
                  <BarChart2 size={14} className="text-orange-400"/> Métricas do Tenant
                </h3>

                {!metrics ? (
                  <div className="flex justify-center py-6"><Loader2 className="animate-spin text-slate-600" size={20}/></div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                      {[
                        { label: 'Leads Total', value: metrics.total_leads, icon: TrendingUp, color: 'text-blue-400' },
                        { label: 'Leads no Mês', value: metrics.leads_mes, icon: Activity, color: 'text-orange-400' },
                        { label: 'Ganhos no Mês', value: metrics.leads_ganhos_mes, icon: TrendingUp, color: 'text-[#22C55E]' },
                        { label: 'Usuários Ativos', value: `${metrics.usuarios_ativos}/${metrics.total_usuarios}`, icon: Users, color: 'text-purple-400' },
                      ].map(({ label, value, icon: Icon, color }) => (
                        <div key={label} className="bg-[#0B1120] border border-white/5 rounded-2xl p-3 text-center">
                          <Icon size={14} className={`${color} mx-auto mb-1`}/>
                          <p className={`text-xl font-black ${color}`}>{value}</p>
                          <p className="text-[8px] text-slate-500 uppercase font-black mt-0.5">{label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Logs de acesso */}
                    <div>
                      <p className="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1 mb-3"><Clock size={10}/> Último Acesso por Usuário</p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                        {[...(metrics.profiles || [])].sort((a: any, b: any) =>
                          (b.ultimo_acesso || '').localeCompare(a.ultimo_acesso || '')
                        ).map((p: any) => (
                          <div key={p.id} className="flex items-center justify-between bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.ativo_recente ? 'bg-[#22C55E]' : 'bg-slate-600'}`}/>
                              <p className="text-xs font-black truncate">{p.nome || p.email}</p>
                              <span className="text-[8px] text-slate-600 uppercase font-bold shrink-0">{p.cargo}</span>
                            </div>
                            <p className="text-[9px] text-slate-500 font-mono shrink-0 ml-2">
                              {p.ultimo_acesso
                                ? new Date(p.ultimo_acesso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                                : 'nunca'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Unidades/Filiais */}
              <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6">
                <h3 className="font-black uppercase text-sm flex items-center gap-2 mb-5">
                  <Package size={14} className="text-blue-400"/> Unidades / Filiais
                </h3>

                <div className="space-y-2 mb-5 max-h-52 overflow-y-auto">
                  {unidades.length === 0 && (
                    <p className="text-slate-600 text-xs text-center py-4">Nenhuma unidade cadastrada.</p>
                  )}
                  {unidades.map(u => (
                    <div key={u.id} className="flex items-center justify-between bg-white/5 border border-white/5 rounded-xl px-4 py-3 group">
                      <div>
                        <p className="font-black text-sm">{u.nome}</p>
                        {u.razao_social && <p className="text-[10px] text-slate-500 font-mono">{u.razao_social} · {u.cnpj}</p>}
                        {u.cidade && <p className="text-[10px] text-slate-600">{u.cidade}, {u.estado}</p>}
                      </div>
                      <button onClick={() => removerUnidade(u.id)} className="text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-2">
                        <Trash2 size={14}/>
                      </button>
                    </div>
                  ))}
                </div>

                <form onSubmit={adicionarUnidade} className="border-t border-white/5 pt-5 space-y-3">
                  <p className="text-[10px] font-black uppercase text-slate-500">Nova Unidade</p>
                  <input required placeholder="Nome da unidade *" value={novaUnidadeNome} onChange={e => setNovaUnidadeNome(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]"/>
                  <div className="grid grid-cols-2 gap-3">
                    <input placeholder="Razão Social" value={novaUnidadeRazao} onChange={e => setNovaUnidadeRazao(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm font-bold outline-none focus:border-[#22C55E]"/>
                    <input placeholder="CNPJ" value={novaUnidadeCnpj} onChange={e => setNovaUnidadeCnpj(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm font-bold outline-none focus:border-[#22C55E]"/>
                    <input placeholder="Cidade" value={novaUnidadeCidade} onChange={e => setNovaUnidadeCidade(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm font-bold outline-none focus:border-[#22C55E]"/>
                    <input placeholder="Endereço" value={novaUnidadeEndereco} onChange={e => setNovaUnidadeEndereco(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm font-bold outline-none focus:border-[#22C55E]"/>
                  </div>
                  <button type="submit" disabled={saving} className="w-full bg-blue-600 text-white py-3 rounded-xl font-black uppercase text-xs flex items-center justify-center gap-2">
                    {saving ? <Loader2 size={12} className="animate-spin"/> : <Plus size={12}/>} Adicionar Unidade
                  </button>
                </form>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* Modal Nova Empresa */}
      {showNovaEmpresa && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-black uppercase text-sm">Nova Empresa</h3>
              <button onClick={() => { setShowNovaEmpresa(false); setNovaEmpresaFeedback(null); }} className="text-slate-500 hover:text-white"><X size={16}/></button>
            </div>
            <form onSubmit={criarEmpresa} className="space-y-3">
              <input required placeholder="Nome da empresa *" value={novaEmpresaNome} onChange={e => setNovaEmpresaNome(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]"/>
              <input placeholder="CNPJ" value={novaEmpresaCnpj} onChange={e => setNovaEmpresaCnpj(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]"/>
              <div className="border-t border-white/10 pt-3 mt-1">
                <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-2">Primeiro diretor (obrigatório — sem isso a empresa fica invisível)</p>
                <input required placeholder="Nome do diretor *" value={novaEmpresaDiretorNome} onChange={e => setNovaEmpresaDiretorNome(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] mb-3"/>
                <input required type="email" placeholder="E-mail do diretor *" value={novaEmpresaDiretorEmail} onChange={e => setNovaEmpresaDiretorEmail(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]"/>
              </div>
              {novaEmpresaFeedback && (
                <div className={`text-xs font-bold p-3 rounded-xl ${novaEmpresaFeedback.tipo === 'sucesso' ? 'bg-[#22C55E]/10 border border-[#22C55E]/30 text-[#22C55E]' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
                  {novaEmpresaFeedback.msg}
                </div>
              )}
              <button type="submit" disabled={saving} className="w-full bg-[#22C55E] text-[#0B1120] py-3 rounded-xl font-black uppercase text-xs">
                {saving ? 'Criando...' : 'Criar Empresa'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
