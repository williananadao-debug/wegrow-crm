"use client";
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  Handshake, Radio, Wallet, Users, Plus, Search, LogIn, KeyRound, Loader2, X, Copy, Check,
  AlertTriangle, Clock, RefreshCw, MessageCircle, ShieldAlert, Activity, TrendingUp, Sparkles,
  ExternalLink, Headphones, GraduationCap, Rocket, CircleDollarSign,
} from 'lucide-react';
import { SkeletonPage } from '@/components/Skeleton';

type Parceiro = { id: string; nome: string; logo_url: string | null; comissao_pct: number };
type Emissora = {
  id: string; nome: string; cnpj: string | null; plano: string; status: string; demo: boolean;
  logo_url: string | null; cor_primaria: string | null; created_at: string; cancelado_em: string | null;
  total_usuarios: number; usuarios_ativos_7d: number; ultimo_acesso: string | null;
  leads_mes: number; leads_total: number; diretor_nome: string | null; diretor_email: string | null;
  valor_mensal: number; proximo_vencimento: string | null;
};
type Filtro = 'todas' | 'ativa' | 'trial' | 'suspensa';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const DIA = 86400000;

function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / DIA);
}

function tempoRelativo(iso: string | null): string {
  if (!iso) return 'nunca acessou';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

// Saúde = quanto tempo a equipe da rádio está sem entrar no sistema.
function saude(r: Emissora): { label: string; cor: string; ponto: string } {
  const d = diasDesde(r.ultimo_acesso);
  if (d === null || d > 7) return { label: 'Parada', cor: 'text-red-400', ponto: 'bg-red-400' };
  if (d > 3) return { label: 'Esfriando', cor: 'text-yellow-400', ponto: 'bg-yellow-400' };
  return { label: 'Em uso', cor: 'text-[#22C55E]', ponto: 'bg-[#22C55E]' };
}

const STATUS_CFG: Record<string, { label: string; cor: string }> = {
  ativa:    { label: 'Cliente',  cor: 'bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30' },
  trial:    { label: 'Em teste', cor: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  suspensa: { label: 'Suspensa', cor: 'bg-red-500/15 text-red-400 border-red-500/30' },
};

function iniciais(nome: string) {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

function Avatar({ nome, logo, cor, tamanho = 'w-12 h-12' }: { nome: string; logo: string | null; cor?: string | null; tamanho?: string }) {
  if (logo) return (
    <div className={`${tamanho} bg-white rounded-2xl flex items-center justify-center shrink-0 overflow-hidden`}>
      <img src={logo} alt={nome} className="w-full h-full object-contain p-1.5"/>
    </div>
  );
  return (
    <div className={`${tamanho} rounded-2xl flex items-center justify-center shrink-0 font-black text-sm text-white`}
      style={{ background: `linear-gradient(135deg, ${cor || '#22C55E'}, ${cor || '#22C55E'}66)` }}>
      {iniciais(nome)}
    </div>
  );
}

export default function PortalParceiroPage() {
  const { user, loading: authLoading } = useAuth();
  const [token, setToken] = useState('');
  const [parceiro, setParceiro] = useState<Parceiro | null>(null);
  const [radios, setRadios] = useState<Emissora[]>([]);
  const [loading, setLoading] = useState(true);
  const [semAcesso, setSemAcesso] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [busca, setBusca] = useState('');
  // Admin da plataforma abre o portal de um parceiro específico por ?parceiro_id=
  const [parceiroIdPreview, setParceiroIdPreview] = useState<string | null>(null);

  const [acaoId, setAcaoId] = useState<string | null>(null);
  const [credencial, setCredencial] = useState<{ titulo: string; radio: string; email: string; senha: string; aviso?: string } | null>(null);
  const [linkSuporte, setLinkSuporte] = useState<{ radio: string; link: string } | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  const [novaAberta, setNovaAberta] = useState(false);
  const [nova, setNova] = useState({ nome: '', cnpj: '', diretorNome: '', diretorEmail: '' });
  const [criando, setCriando] = useState(false);
  const [erroNova, setErroNova] = useState<string | null>(null);

  useEffect(() => {
    setParceiroIdPreview(new URLSearchParams(window.location.search).get('parceiro_id'));
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setToken(session.access_token);
    });
  }, [user]);

  useEffect(() => { if (token) carregar(); }, [token, parceiroIdPreview]);

  const url = (base: string) => parceiroIdPreview ? `${base}?parceiro_id=${parceiroIdPreview}` : base;
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });

  const carregar = async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(url('/api/parceiro'), { headers: headers() });
      if (res.status === 403) { setSemAcesso(true); return; }
      const json = await res.json();
      if (!res.ok) { setErro(json.erro || 'Erro ao carregar a carteira.'); return; }
      setParceiro(json.parceiro);
      setRadios(json.empresas);
    } catch (err: any) {
      setErro(err?.message === 'Failed to fetch' ? 'Não consegui carregar — confira sua conexão e tente de novo.' : (err?.message || 'Erro ao carregar.'));
    } finally {
      setLoading(false);
    }
  };

  const post = async (body: any) => {
    const res = await fetch(url('/api/parceiro'), { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, json };
  };

  const entrarComo = async (r: Emissora) => {
    setAcaoId(r.id + ':entrar');
    try {
      const { ok, json } = await post({ acao: 'entrar', empresa_id: r.id });
      if (!ok || !json.link) { alert(json.erro || 'Erro ao gerar o acesso.'); return; }
      setLinkSuporte({ radio: r.nome, link: json.link });
    } finally { setAcaoId(null); }
  };

  const novaSenha = async (r: Emissora) => {
    if (!confirm(`Gerar uma senha nova para o responsável da ${r.nome}? A senha atual para de funcionar.`)) return;
    setAcaoId(r.id + ':senha');
    try {
      const { ok, json } = await post({ acao: 'senha', empresa_id: r.id });
      if (!ok || !json.senha) { alert(json.erro || 'Erro ao gerar a senha.'); return; }
      setCredencial({ titulo: 'Nova senha gerada', radio: r.nome, email: json.email, senha: json.senha, aviso: 'A senha anterior parou de funcionar.' });
    } finally { setAcaoId(null); }
  };

  const criarRadio = async (e: React.FormEvent) => {
    e.preventDefault();
    setCriando(true);
    setErroNova(null);
    try {
      const { ok, json } = await post({ acao: 'criar', ...nova });
      if (!ok) { setErroNova(json.erro || 'Erro ao criar a rádio.'); return; }
      setNovaAberta(false);
      setNova({ nome: '', cnpj: '', diretorNome: '', diretorEmail: '' });
      setCredencial({
        titulo: 'Rádio criada em teste', radio: json.nome, email: json.email, senha: json.senha,
        aviso: json.emailErro ? `O e-mail de boas-vindas não saiu (${json.emailErro}) — envie o acesso abaixo manualmente.` : 'Também enviamos esse acesso por e-mail para o responsável.',
      });
      carregar();
    } finally { setCriando(false); }
  };

  const copiar = (chave: string, texto: string) => {
    navigator.clipboard.writeText(texto);
    setCopiado(chave);
    setTimeout(() => setCopiado(null), 2200);
  };

  // Carteira que conta pra comissão: só rádio real (demo de apresentação não fatura).
  const carteira = useMemo(() => radios.filter(r => !r.demo), [radios]);
  const ativas = carteira.filter(r => r.status === 'ativa');
  const emTeste = carteira.filter(r => r.status === 'trial');
  const mrr = ativas.reduce((s, r) => s + r.valor_mensal, 0);
  const pct = parceiro?.comissao_pct ?? 0;
  const comissao = mrr * pct / 100;
  const usuariosTotal = ativas.reduce((s, r) => s + r.total_usuarios, 0);
  const usuariosAtivos = ativas.reduce((s, r) => s + r.usuarios_ativos_7d, 0);
  const adocao = usuariosTotal > 0 ? Math.round(usuariosAtivos / usuariosTotal * 100) : 0;

  const hoje = new Date().toISOString().substring(0, 10);
  const alertas = [
    ...emTeste.filter(r => (diasDesde(r.created_at) ?? 0) >= 10)
      .map(r => ({ r, tipo: 'teste' as const, texto: `Em teste há ${diasDesde(r.created_at)} dias — hora de fechar` })),
    ...carteira.filter(r => r.status !== 'suspensa' && (diasDesde(r.ultimo_acesso) ?? 99) > 7)
      .map(r => ({ r, tipo: 'parada' as const, texto: r.ultimo_acesso ? `Ninguém entra há ${diasDesde(r.ultimo_acesso)} dias` : 'Equipe ainda não acessou' })),
    ...ativas.filter(r => r.proximo_vencimento && r.proximo_vencimento < hoje)
      .map(r => ({ r, tipo: 'pagamento' as const, texto: 'Mensalidade em atraso' })),
  ];

  const contagem: Record<Filtro, number> = { todas: carteira.length, ativa: ativas.length, trial: emTeste.length, suspensa: carteira.filter(r => r.status === 'suspensa').length };
  const lista = radios
    .filter(r => filtro === 'todas' || r.status === filtro)
    .filter(r => !busca.trim() || r.nome.toLowerCase().includes(busca.trim().toLowerCase()))
    .sort((a, b) => (a.status === 'ativa' ? 0 : a.status === 'trial' ? 1 : 2) - (b.status === 'ativa' ? 0 : b.status === 'trial' ? 1 : 2) || a.nome.localeCompare(b.nome));

  if (authLoading || (loading && !parceiro && !semAcesso && !erro)) return <div className="p-4 md:p-8"><SkeletonPage /></div>;

  if (semAcesso) return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 mx-auto mb-5 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center"><ShieldAlert className="text-slate-400" size={28}/></div>
        <p className="text-white font-black text-xl uppercase italic">Portal do Parceiro</p>
        <p className="text-slate-500 text-sm mt-2">Seu login não está vinculado a nenhum parceiro WeGrow. Fale com a WeGrow para liberar o acesso.</p>
      </div>
    </div>
  );

  return (
    <div className="text-white pb-20 space-y-6">

      {/* Hero */}
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0F172A]">
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-[#22C55E]/20 blur-3xl pointer-events-none"/>
        <div className="absolute -bottom-32 left-1/3 w-96 h-96 rounded-full bg-sky-500/10 blur-3xl pointer-events-none"/>
        <div className="relative p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex items-center -space-x-3 shrink-0">
              {parceiro && <Avatar nome={parceiro.nome} logo={parceiro.logo_url} cor="#38BDF8" tamanho="w-14 h-14"/>}
              <div className="w-14 h-14 rounded-2xl bg-[#0B1120] border-2 border-[#0F172A] flex items-center justify-center overflow-hidden">
                <img src="/logo.png" alt="WeGrow" className="w-9 h-9 object-contain"/>
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#22C55E] flex items-center gap-1.5"><Handshake size={12}/> Portal do Parceiro</p>
              <h1 className="text-2xl md:text-3xl font-black uppercase italic tracking-tight truncate">{parceiro?.nome} <span className="text-slate-500">×</span> WeGrow</h1>
              <p className="text-slate-400 text-xs md:text-sm mt-1">Sua carteira de rádios, a saúde de cada uma e a sua comissão — tudo num lugar só.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={carregar} title="Atualizar" className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-slate-400 hover:text-white transition-colors">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>
            </button>
            <button onClick={() => { setErroNova(null); setNovaAberta(true); }}
              className="bg-[#22C55E] text-[#0B1120] px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:scale-[1.03] transition-all shadow-lg shadow-[#22C55E]/20">
              <Plus size={16}/> Nova rádio
            </button>
          </div>
        </div>
      </div>

      {erro && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center justify-between gap-3">
          <p className="text-red-300 text-xs font-bold flex items-center gap-2"><AlertTriangle size={14}/> {erro}</p>
          <button onClick={carregar} className="text-red-300 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5"><RefreshCw size={11}/> Tentar de novo</button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Kpi icone={<Radio size={16}/>} titulo="Rádios clientes" valor={String(ativas.length)} detalhe={`${emTeste.length} em teste`} destaque="text-white"/>
        <Kpi icone={<TrendingUp size={16}/>} titulo="Receita recorrente" valor={brl(mrr)} detalhe="mensalidades das clientes" destaque="text-white"/>
        <Kpi icone={<Wallet size={16}/>} titulo="Sua comissão / mês" valor={brl(comissao)} detalhe={`${pct.toLocaleString('pt-BR')}% da receita recorrente`} destaque="text-[#22C55E]" brilho/>
        <Kpi icone={<Activity size={16}/>} titulo="Uso da equipe (7d)" valor={`${adocao}%`} detalhe={`${usuariosAtivos} de ${usuariosTotal} usuários entraram`} destaque={adocao >= 60 ? 'text-[#22C55E]' : adocao >= 30 ? 'text-yellow-400' : 'text-red-400'} barra={adocao}/>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Carteira */}
        <div className="xl:col-span-2 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-2xl p-1 overflow-x-auto">
              {([['todas', 'Todas'], ['ativa', 'Clientes'], ['trial', 'Em teste'], ['suspensa', 'Suspensas']] as [Filtro, string][]).map(([id, label]) => (
                <button key={id} onClick={() => setFiltro(id)}
                  className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${filtro === id ? 'bg-white text-[#0B1120]' : 'text-slate-400 hover:text-white'}`}>
                  {label} <span className={filtro === id ? 'text-slate-500' : 'text-slate-600'}>{contagem[id]}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center bg-[#0F172A] border border-white/10 rounded-2xl px-4 py-2.5 gap-2 md:w-64">
              <Search size={14} className="text-slate-500"/>
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar rádio..." className="flex-1 bg-transparent outline-none text-sm text-white min-w-0"/>
            </div>
          </div>

          {lista.length === 0 ? (
            <div className="border border-dashed border-white/10 rounded-3xl p-10 text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[#22C55E]/10 flex items-center justify-center"><Radio className="text-[#22C55E]" size={24}/></div>
              <p className="font-black uppercase text-sm">{radios.length === 0 ? 'Sua carteira começa aqui' : 'Nenhuma rádio nesse filtro'}</p>
              <p className="text-slate-500 text-xs mt-1">{radios.length === 0 ? 'Cadastre a primeira rádio em teste — o responsável recebe o acesso por e-mail na hora.' : 'Troque o filtro ou a busca.'}</p>
              {radios.length === 0 && (
                <button onClick={() => setNovaAberta(true)} className="mt-5 bg-[#22C55E] text-[#0B1120] px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest inline-flex items-center gap-2"><Plus size={14}/> Nova rádio</button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {lista.map(r => {
                const s = saude(r);
                const st = STATUS_CFG[r.status] || STATUS_CFG.trial;
                const uso = r.total_usuarios > 0 ? Math.round(r.usuarios_ativos_7d / r.total_usuarios * 100) : 0;
                return (
                  <div key={r.id} className="group bg-[#0F172A] border border-white/5 hover:border-white/15 rounded-3xl p-5 transition-all flex flex-col">
                    <div className="flex items-start gap-3">
                      <Avatar nome={r.nome} logo={r.logo_url} cor={r.cor_primaria}/>
                      <div className="min-w-0 flex-1">
                        <p className="font-black text-sm truncate">{r.nome}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${st.cor}`}>{st.label}</span>
                          {r.demo && <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border border-dashed border-purple-400/40 text-purple-300">Demo</span>}
                          <span className={`text-[10px] font-bold flex items-center gap-1.5 ${s.cor}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${s.ponto} ${s.label === 'Em uso' ? 'animate-pulse' : ''}`}/>{s.label}
                          </span>
                        </div>
                      </div>
                      {r.status === 'ativa' && r.valor_mensal > 0 && (
                        <div className="text-right shrink-0">
                          <p className="text-[#22C55E] text-sm font-black">{brl(r.valor_mensal)}</p>
                          <p className="text-[9px] text-slate-600 font-bold uppercase">/mês</p>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-5">
                      <div className="bg-white/[0.03] rounded-2xl p-3">
                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><Users size={9}/> Equipe</p>
                        <p className="text-sm font-black mt-1">{r.usuarios_ativos_7d}<span className="text-slate-600">/{r.total_usuarios}</span></p>
                        <div className="h-1 bg-white/5 rounded-full mt-1.5 overflow-hidden"><div className="h-full bg-[#22C55E] rounded-full" style={{ width: `${uso}%` }}/></div>
                      </div>
                      <div className="bg-white/[0.03] rounded-2xl p-3">
                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><Sparkles size={9}/> Leads mês</p>
                        <p className="text-sm font-black mt-1">{r.leads_mes}</p>
                        <p className="text-[9px] text-slate-600 mt-0.5">{r.leads_total} no total</p>
                      </div>
                      <div className="bg-white/[0.03] rounded-2xl p-3">
                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><Clock size={9}/> Acesso</p>
                        <p className="text-sm font-black mt-1 truncate">{r.ultimo_acesso ? tempoRelativo(r.ultimo_acesso).replace('há ', '') : '—'}</p>
                        <p className="text-[9px] text-slate-600 mt-0.5">{r.ultimo_acesso ? 'último login' : 'nunca entrou'}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-4 pt-4 border-t border-white/5">
                      <p className="text-[10px] text-slate-500 truncate min-w-0" title={r.diretor_email || ''}>
                        {r.diretor_nome || 'Sem responsável'} · desde {new Date(r.created_at).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })}
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => novaSenha(r)} disabled={acaoId === r.id + ':senha'} title="Gerar nova senha para o responsável"
                          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition-colors disabled:opacity-50">
                          {acaoId === r.id + ':senha' ? <Loader2 size={13} className="animate-spin"/> : <KeyRound size={13}/>}
                        </button>
                        <button onClick={() => entrarComo(r)} disabled={acaoId === r.id + ':entrar'}
                          className="px-3 py-2 rounded-xl bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E] text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-colors disabled:opacity-50">
                          {acaoId === r.id + ':entrar' ? <Loader2 size={12} className="animate-spin"/> : <LogIn size={12}/>} Suporte
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Lateral */}
        <div className="space-y-4">
          <div className="bg-[#0F172A] border border-white/5 rounded-3xl p-5">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-1.5"><AlertTriangle size={12}/> Precisa de atenção <span className="text-slate-600">{alertas.length}</span></p>
            {alertas.length === 0 ? (
              <div className="text-center py-6">
                <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-[#22C55E]/10 flex items-center justify-center"><Check size={18} className="text-[#22C55E]"/></div>
                <p className="text-xs text-slate-400 font-bold">Carteira em dia</p>
              </div>
            ) : (
              <div className="space-y-2">
                {alertas.slice(0, 8).map((a, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03]">
                    <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${a.tipo === 'teste' ? 'bg-yellow-500/10 text-yellow-400' : a.tipo === 'pagamento' ? 'bg-red-500/10 text-red-400' : 'bg-orange-500/10 text-orange-400'}`}>
                      {a.tipo === 'teste' ? <Rocket size={14}/> : a.tipo === 'pagamento' ? <CircleDollarSign size={14}/> : <Clock size={14}/>}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-black truncate">{a.r.nome}</p>
                      <p className="text-[10px] text-slate-500">{a.texto}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="relative overflow-hidden bg-gradient-to-br from-[#22C55E]/15 to-[#0F172A] border border-[#22C55E]/20 rounded-3xl p-5">
            <p className="text-[10px] font-black text-[#22C55E] uppercase tracking-widest mb-3 flex items-center gap-1.5"><Wallet size={12}/> Comissão projetada</p>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Em 12 meses</p>
                <p className="text-2xl font-black text-white">{brl(comissao * 12)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Se os testes fecharem</p>
                <p className="text-sm font-black text-[#22C55E]">+{brl(emTeste.length * (ativas.length ? mrr / ativas.length : 0) * pct / 100)}<span className="text-slate-500">/mês</span></p>
              </div>
            </div>
            <p className="text-[9px] text-slate-500 mt-3">Estimativa sobre a mensalidade atual das rádios clientes. Rádios em teste usam a mensalidade média da carteira.</p>
          </div>

          <div className="bg-[#0F172A] border border-white/5 rounded-3xl p-5">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Como funciona</p>
            <div className="space-y-3">
              {[
                { icone: <Rocket size={14}/>, titulo: 'Nova rádio', texto: 'Cadastre em teste. O responsável recebe o login por e-mail na hora.' },
                { icone: <GraduationCap size={14}/>, titulo: 'Treinamento', texto: 'Acompanhe o “Uso da equipe” — rádio parada é sinal de treinamento pendente.' },
                { icone: <Headphones size={14}/>, titulo: 'Suporte', texto: 'O botão Suporte abre a conta da rádio como o responsável, para ver exatamente o que ele vê.' },
                { icone: <Handshake size={14}/>, titulo: 'Fechamento', texto: 'Quando a rádio fechar, avise a WeGrow — ela vira cliente e entra na sua comissão.' },
              ].map((p, i) => (
                <div key={i} className="flex gap-3">
                  <span className="w-8 h-8 rounded-xl bg-white/5 text-slate-300 flex items-center justify-center shrink-0">{p.icone}</span>
                  <div>
                    <p className="text-xs font-black">{p.titulo}</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">{p.texto}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modal Nova rádio */}
      {novaAberta && (
        <Modal onFechar={() => setNovaAberta(false)} titulo="Nova rádio em teste" icone={<Radio size={14} className="text-[#22C55E]"/>}>
          <form onSubmit={criarRadio} className="space-y-3">
            <Campo label="Nome da rádio *"><input required autoFocus value={nova.nome} onChange={e => setNova(n => ({ ...n, nome: e.target.value }))} placeholder="Ex.: Rádio Cidade 98,7" className={INPUT}/></Campo>
            <Campo label="CNPJ"><input value={nova.cnpj} onChange={e => setNova(n => ({ ...n, cnpj: e.target.value }))} placeholder="Opcional" className={INPUT}/></Campo>
            <div className="pt-2 border-t border-white/5">
              <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-2 mt-2">Responsável na rádio (vira o diretor da conta)</p>
              <div className="space-y-3">
                <Campo label="Nome *"><input required value={nova.diretorNome} onChange={e => setNova(n => ({ ...n, diretorNome: e.target.value }))} className={INPUT}/></Campo>
                <Campo label="E-mail *"><input required type="email" value={nova.diretorEmail} onChange={e => setNova(n => ({ ...n, diretorEmail: e.target.value }))} className={INPUT}/></Campo>
              </div>
            </div>
            {erroNova && <div className="text-xs font-bold p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400">{erroNova}</div>}
            <button type="submit" disabled={criando} className="w-full bg-[#22C55E] text-[#0B1120] py-3.5 rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-2 disabled:opacity-60">
              {criando ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>} {criando ? 'Criando...' : 'Criar rádio e enviar acesso'}
            </button>
          </form>
        </Modal>
      )}

      {/* Modal credencial (rádio criada / senha nova) */}
      {credencial && (
        <Modal onFechar={() => setCredencial(null)} titulo={credencial.titulo} icone={<KeyRound size={14} className="text-[#22C55E]"/>}>
          <div className="space-y-3">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Rádio</p>
              <p className="text-sm font-bold">{credencial.radio}</p>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest pt-2">Login</p>
              <p className="text-sm font-bold break-all">{credencial.email}</p>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest pt-2">Senha</p>
              <p className="text-lg font-black text-[#22C55E] font-mono tracking-wide">{credencial.senha}</p>
            </div>
            <p className="text-[10px] text-slate-500">{credencial.aviso} Essa senha só aparece agora — copie antes de fechar.</p>
            {(() => {
              const texto = `Acesso WeGrow — ${credencial.radio}\nEndereço: https://www.wegrow.app.br/login\nLogin: ${credencial.email}\nSenha: ${credencial.senha}`;
              return (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => copiar('cred', texto)} className="bg-white/5 hover:bg-white/10 border border-white/10 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-1.5">
                    {copiado === 'cred' ? <Check size={12}/> : <Copy size={12}/>} {copiado === 'cred' ? 'Copiado!' : 'Copiar'}
                  </button>
                  <a href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer"
                    className="bg-white/5 hover:bg-white/10 border border-white/10 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-1.5">
                    <MessageCircle size={12}/> WhatsApp
                  </a>
                </div>
              );
            })()}
            <button onClick={() => setCredencial(null)} className="w-full bg-[#22C55E] text-[#0B1120] py-3 rounded-2xl font-black uppercase text-xs">Continuar</button>
          </div>
        </Modal>
      )}

      {/* Modal suporte (entrar como) */}
      {linkSuporte && (
        <Modal onFechar={() => setLinkSuporte(null)} titulo={`Suporte · ${linkSuporte.radio}`} icone={<Headphones size={14} className="text-[#22C55E]"/>}>
          <div className="space-y-3">
            <p className="text-sm text-slate-300">O link abaixo entra na conta da rádio como o responsável. Vale uma vez e expira em pouco tempo.</p>
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-3 text-[11px] text-yellow-200/90 flex gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5 text-yellow-400"/>
              <span>Para não sair da sua própria conta, <b>copie o link e abra numa janela anônima</b>. Abrindo neste navegador, você troca de usuário e precisa entrar de novo depois.</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => copiar('link', linkSuporte.link)} className="bg-[#22C55E] text-[#0B1120] py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-1.5">
                {copiado === 'link' ? <Check size={12}/> : <Copy size={12}/>} {copiado === 'link' ? 'Copiado!' : 'Copiar link'}
              </button>
              <a href={linkSuporte.link} target="_blank" rel="noopener noreferrer" onClick={() => setLinkSuporte(null)}
                className="bg-white/5 hover:bg-white/10 border border-white/10 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-1.5">
                <ExternalLink size={12}/> Abrir aqui
              </a>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

const INPUT = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600';

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function Modal({ titulo, icone, onFechar, children }: { titulo: string; icone: React.ReactNode; onFechar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-black uppercase text-sm flex items-center gap-2">{icone} {titulo}</h3>
          <button onClick={onFechar} className="text-slate-500 hover:text-white"><X size={16}/></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Kpi({ icone, titulo, valor, detalhe, destaque, brilho, barra }: { icone: React.ReactNode; titulo: string; valor: string; detalhe: string; destaque: string; brilho?: boolean; barra?: number }) {
  return (
    <div className={`relative overflow-hidden rounded-3xl p-4 md:p-5 border ${brilho ? 'bg-gradient-to-br from-[#22C55E]/15 to-[#0F172A] border-[#22C55E]/25' : 'bg-[#0F172A] border-white/5'}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">{titulo}</p>
        <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${brilho ? 'bg-[#22C55E]/20 text-[#22C55E]' : 'bg-white/5 text-slate-400'}`}>{icone}</span>
      </div>
      <p className={`text-xl md:text-2xl font-black tracking-tight ${destaque}`}>{valor}</p>
      <p className="text-[10px] text-slate-500 mt-1 truncate">{detalhe}</p>
      {barra !== undefined && (
        <div className="h-1.5 bg-white/5 rounded-full mt-3 overflow-hidden"><div className={`h-full bg-current rounded-full ${destaque}`} style={{ width: `${barra}%` }}/></div>
      )}
    </div>
  );
}
