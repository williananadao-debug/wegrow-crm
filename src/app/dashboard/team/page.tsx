"use client";
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Edit2, X, ShieldAlert, Plus, Loader2, Fingerprint, KeyRound, Search, Mail, MapPin, UserX, UserCheck, Factory, Printer } from 'lucide-react';
import { loginCurto, slugLogin } from '@/lib/loginSemEmail';
import { Toast } from '@/components/Toast';
import { useUnidades } from '@/lib/useUnidades';

const CARGO_CFG: Record<string, { label: string; cor: string; vende: boolean }> = {
  diretor:      { label: 'Diretor',      cor: 'bg-purple-500/15 text-purple-300 border-purple-500/30', vende: true },
  gerente:      { label: 'Gerente',      cor: 'bg-blue-500/15 text-blue-300 border-blue-500/30',       vende: true },
  vendedor:     { label: 'Vendedor',     cor: 'bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30',    vende: true },
  producao:     { label: 'Produção',     cor: 'bg-amber-500/15 text-amber-300 border-amber-500/30',    vende: false },
  almoxarifado: { label: 'Almoxarifado', cor: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',       vende: false },
  opec:         { label: 'Opec',         cor: 'bg-pink-500/15 text-pink-300 border-pink-500/30',       vende: false },
};

export default function TeamPage() {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  
  const isDirector = perfil?.cargo === 'diretor';
  const { unidades } = useUnidades(perfil?.empresa_id);

  const [members, setMembers] = useState<any[]>([]);
  const [perfStats, setPerfStats] = useState<Record<string, { leads: number; ganhos: number; faturamento: number }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  
  const [editNome, setEditNome] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCargo, setEditCargo] = useState('vendedor');
  const [editUnidade, setEditUnidade] = useState('');
  const [editCpf, setEditCpf] = useState(''); // 👇 NOVO ESTADO PARA O CPF

  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [resetandoSenha, setResetandoSenha] = useState(false);

  const [busca, setBusca] = useState('');

  // Só carrega com a empresa do usuário já conhecida — antes rodava na montagem, com perfil
  // ainda nulo, e buscava a equipe sem filtro de empresa (lista piscando/misturada).
  useEffect(() => {
    if (!perfil?.empresa_id) return;
    carregarEquipe();
  }, [perfil?.empresa_id]);

  // Função para aplicar máscara de CPF (000.000.000-00)
  const aplicarMascaraCPF = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  const carregarEquipe = async () => {
    setLoading(true);
    try {
      const agora = new Date();
      const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();

      let query = supabase.from('profiles').select('*').order('nome');
      if (perfil?.empresa_id) query = query.eq('empresa_id', perfil.empresa_id);

      // Leads = criados no mês; ganhos/faturamento = fechados no mês (fechado_em), mesmo que
      // o lead tenha sido criado antes.
      let leadsQuery = supabase
        .from('leads')
        .select('user_id')
        .gte('created_at', inicioMes);
      if (perfil?.empresa_id) leadsQuery = leadsQuery.eq('empresa_id', perfil.empresa_id);
      let ganhosQuery = supabase
        .from('leads')
        .select('user_id, valor_total')
        .eq('status', 'ganho')
        .gte('fechado_em', inicioMes);
      if (perfil?.empresa_id) ganhosQuery = ganhosQuery.eq('empresa_id', perfil.empresa_id);

      const [{ data: membersData }, { data: leadsData }, { data: ganhosData }] = await Promise.all([query, leadsQuery, ganhosQuery]);

      // Desativados no fim da lista.
      setMembers((membersData || []).sort((a, b) => Number(!!a.desativado_em) - Number(!!b.desativado_em)));

      const stats: Record<string, { leads: number; ganhos: number; faturamento: number }> = {};
      for (const lead of leadsData || []) {
        if (!lead.user_id) continue;
        if (!stats[lead.user_id]) stats[lead.user_id] = { leads: 0, ganhos: 0, faturamento: 0 };
        stats[lead.user_id].leads++;
      }
      for (const lead of ganhosData || []) {
        if (!lead.user_id) continue;
        if (!stats[lead.user_id]) stats[lead.user_id] = { leads: 0, ganhos: 0, faturamento: 0 };
        stats[lead.user_id].ganhos++;
        stats[lead.user_id].faturamento += lead.valor_total || 0;
      }
      setPerfStats(stats);
    } catch (error) {
      console.error("Erro ao carregar equipe:", error);
    } finally {
      setLoading(false);
    }
  };

  const abrirModalNovo = () => {
    setEditingUser(null);
    setEditNome('');
    setEditEmail('');
    setEditCargo('vendedor');
    setEditUnidade('');
    setEditCpf('');
    setIsModalOpen(true);
  };

  const abrirModalEdit = (membro: any) => {
    setEditingUser(membro);
    setEditNome(membro.nome || '');
    setEditEmail(membro.email || '');
    setEditCargo(membro.cargo || 'vendedor');
    setEditUnidade(membro.unidade || '');
    setEditCpf(membro.cpf || '');
    setIsModalOpen(true);
  };

  const salvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
          nome: editNome,
          cargo: editCargo,
          unidade: editUnidade,
          cpf: editCpf,
      };

      if (editingUser) {
          const { error } = await supabase.from('profiles').update(payload).eq('id', editingUser.id);
          if (error) throw error;
          setToastMessage("Perfil atualizado! ✅");
          setShowToast(true);
      } else {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('Sessão expirada. Faça login novamente.');

          const res = await fetch('/api/team/invite', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ ...payload, email: editEmail }),
          });

          const json = await res.json();
          if (!res.ok) throw new Error(json.erro || 'Erro ao criar acesso.');

          setToastMessage(json.aviso ? `Acesso criado. ${json.aviso}` : "Acesso criado! Convite enviado por e-mail. 🎉");
          setShowToast(true);
      }
      setIsModalOpen(false);
      carregarEquipe();
    } catch (error: any) {
      alert(`Erro: ${error.message}`);
    } finally {
        setSaving(false);
    }
  };

  const resetarSenha = async () => {
    if (!editingUser?.id) return;
    setResetandoSenha(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada. Faça login novamente.');

      const res = await fetch('/api/team/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId: editingUser.id }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.erro || 'Erro ao redefinir senha.');

      setToastMessage(
        json.senhaTemp
          ? `Senha redefinida: ${json.senhaTemp} (${json.aviso || 'repasse manualmente'})`
          : `Nova senha enviada por e-mail para ${editingUser.email} ✅`
      );
      setShowToast(true);
    } catch (error: any) {
      alert(`Erro: ${error.message}`);
    } finally {
      setResetandoSenha(false);
    }
  };

  // Desativar = corta o acesso e mantém o histórico (leads, metas, visitas, relatórios).
  const alternarAtivo = async () => {
    if (!editingUser) return;
    const ativar = !!editingUser.desativado_em;
    const msg = ativar
      ? `Reativar ${editingUser.nome}? O acesso volta a funcionar com a mesma senha.`
      : `Desativar ${editingUser.nome}?\n\nO acesso é cortado (não entra mais no sistema). Leads, metas, visitas e relatórios continuam com o nome dele. Dá pra reativar depois.`;
    if (!confirm(msg)) return;
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/team/desativar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ userId: editingUser.id, ativo: ativar }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.erro || 'Erro ao alterar o acesso.');
      setToastMessage(ativar ? `${editingUser.nome} reativado ✅` : `${editingUser.nome} desativado — acesso cortado.`);
      setShowToast(true);
      setIsModalOpen(false);
      carregarEquipe();
    } catch (error: any) { alert(error.message); }
    finally { setSaving(false); }
  };

  // Acessos SEM e-mail em lote (equipe de fábrica): login "nome.sufixo" + senha inicial.
  const [loteAberto, setLoteAberto] = useState(false);
  const [loteNomes, setLoteNomes] = useState('');
  const [loteSenha, setLoteSenha] = useState('');
  const [loteSufixo, setLoteSufixo] = useState('');
  const [loteCargo, setLoteCargo] = useState('producao');
  const [loteResultado, setLoteResultado] = useState<{ nome: string; login?: string; erro?: string }[] | null>(null);
  const [loteSenhaUsada, setLoteSenhaUsada] = useState('');
  const [loteErro, setLoteErro] = useState<string | null>(null);
  const abrirLote = () => {
    // Sufixo sugerido: última palavra do nome da empresa que não seja LTDA/ME/etc.
    const palavras = String(auth.empresa?.nome || '').split(/\s+/).map(slugLogin)
      .filter(w => w && !['ltda', 'me', 'eireli', 'sa', 'epp', 'mei', 'cia', 'de', 'do', 'da'].includes(w));
    setLoteSufixo(palavras[palavras.length - 1] || '');
    setLoteNomes(''); setLoteSenha(''); setLoteCargo('producao'); setLoteResultado(null); setLoteErro(null);
    setLoteAberto(true);
  };
  const criarLote = async () => {
    setSaving(true); setLoteErro(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/team/criar-acessos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ nomes: loteNomes.split('\n'), senha: loteSenha, sufixo: loteSufixo, cargo: loteCargo }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.erro || 'Erro ao criar acessos.');
      setLoteResultado(json.resultados || []);
      setLoteSenhaUsada(loteSenha);
      carregarEquipe();
    } catch (error: any) { setLoteErro(error.message); }
    finally { setSaving(false); }
  };

  const excluirUsuario = async () => {
    if (!editingUser) return;
    if (confirm(`Apagar ${editingUser.nome} de vez? Só funciona pra quem não tem histórico (cadastro feito por engano). Quem já trabalhou no sistema deve ser DESATIVADO.`)) {
        setSaving(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Sessão expirada.');

            const res = await fetch('/api/team/delete', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ userId: editingUser.id }),
            });

            const json = await res.json();
            if (!res.ok) throw new Error(json.erro || 'Erro ao excluir.');

            setIsModalOpen(false);
            carregarEquipe();
        } catch (error: any) { alert(error.message); }
        finally { setSaving(false); }
    }
  };

  return (
    <div className="md:p-6 text-white">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-white/5 pb-6">
          <div>
              <h1 className="text-2xl md:text-3xl font-black uppercase italic text-white flex items-center gap-2">
                 <ShieldAlert className="text-[#22C55E]" size={28} /> Gestão de Equipe
              </h1>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">{loading ? 'Carregando…' : (() => { const ativos = members.filter(m => !m.desativado_em).length; const inativos = members.length - ativos; return `${ativos} ${ativos === 1 ? 'membro ativo' : 'membros ativos'}${inativos ? ` · ${inativos} desativado${inativos > 1 ? 's' : ''}` : ''} · desempenho do mês atual`; })()}</p>
          </div>
          {isDirector && (
              <div className="flex flex-wrap gap-2">
                  <button onClick={abrirLote} title="Cria vários acessos sem e-mail (login + senha) — pra equipe de fábrica" className="bg-white/5 border border-white/10 text-slate-200 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2">
                      <Factory size={16}/> Acessos da fábrica
                  </button>
                  <button onClick={abrirModalNovo} className="bg-[#22C55E] text-[#0B1120] px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(34,197,94,0.3)] flex items-center gap-2">
                      <Plus size={16}/> Adicionar Membro
                  </button>
              </div>
          )}
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-40 animate-pulse text-slate-500 font-bold">Carregando...</div>
      ) : (
        <>
          <div className="flex items-center gap-2 bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 mb-5 max-w-md">
            <Search size={14} className="text-slate-500" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail..." className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-slate-600" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {members.filter(m => !busca.trim() || `${m.nome || ''} ${m.email || ''}`.toLowerCase().includes(busca.toLowerCase())).map((m) => {
            const s = perfStats[m.id];
            const taxa = s && s.leads > 0 ? Math.round((s.ganhos / s.leads) * 100) : 0;
            const cfg = CARGO_CFG[m.cargo] || { label: m.cargo || 'Sem cargo', cor: 'bg-white/5 text-slate-300 border-white/10', vende: false };
            return (
              <div key={m.id} className={`bg-[#0F172A] border border-white/5 hover:border-white/15 rounded-2xl p-4 transition-colors flex flex-col gap-4 min-w-0 ${m.desativado_em ? 'opacity-50' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 shrink-0 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center font-black text-base">{m.nome?.charAt(0).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-sm uppercase truncate">{m.nome || 'Sem nome'}</p>
                    <span className={`inline-block mt-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${cfg.cor}`}>{cfg.label}</span>
                    {m.desativado_em && (
                      <span className="inline-block mt-1 ml-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border bg-red-500/10 text-red-400 border-red-500/30" title={`Desativado em ${new Date(m.desativado_em).toLocaleDateString('pt-BR')}`}>Desativado</span>
                    )}
                  </div>
                  {isDirector && (
                    <button onClick={() => abrirModalEdit(m)} title="Editar acesso" className="shrink-0 p-2 bg-white/5 text-slate-400 rounded-lg hover:bg-blue-600 hover:text-white transition-all"><Edit2 size={14} /></button>
                  )}
                </div>

                <div className="space-y-1.5 text-[11px] text-slate-400">
                  <p className="flex items-center gap-2 min-w-0"><Mail size={12} className="shrink-0 text-slate-600" /><span className="truncate">{loginCurto(m.email) ? `Login: ${loginCurto(m.email)}` : (m.email || '—')}</span></p>
                  <p className="flex items-center gap-2 min-w-0"><MapPin size={12} className="shrink-0 text-slate-600" /><span className="truncate">{m.unidade || 'Sem unidade'}</span></p>
                  <p className="flex items-center gap-2 min-w-0"><Fingerprint size={12} className="shrink-0 text-slate-600" /><span className="truncate font-mono">{m.cpf || 'CPF não cadastrado'}</span></p>
                </div>

                {cfg.vende && (
                  <div className="grid grid-cols-4 gap-2 text-center bg-[#0B1120] border border-white/5 rounded-xl py-2.5 px-2 mt-auto">
                    <div><p className="text-sm font-black text-white">{s?.leads ?? 0}</p><p className="text-[8px] text-slate-500 uppercase font-bold">Leads</p></div>
                    <div><p className="text-sm font-black text-[#22C55E]">{s?.ganhos ?? 0}</p><p className="text-[8px] text-slate-500 uppercase font-bold">Ganhos</p></div>
                    <div><p className="text-sm font-black text-orange-400">{taxa}%</p><p className="text-[8px] text-slate-500 uppercase font-bold">Conv.</p></div>
                    <div><p className="text-sm font-black text-white">{(s?.faturamento ?? 0) >= 1000 ? `${Math.round((s?.faturamento ?? 0) / 1000)}k` : (s?.faturamento ?? 0)}</p><p className="text-[8px] text-slate-500 uppercase font-bold">R$ mês</p></div>
                  </div>
                )}
              </div>
            );
          })}
          </div>
          {members.length === 0 && <p className="text-center text-slate-600 text-sm py-10">Nenhum membro cadastrado.</p>}
        </>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
           <div className="bg-[#0B1120] border border-white/10 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center p-5 border-b border-white/10 bg-[#0F172A]">
                  <h2 className="text-lg font-black uppercase italic text-white flex items-center gap-2">
                      <Edit2 size={16} className="text-[#22C55E]"/> {editingUser ? 'Editar Acesso' : 'Novo Membro'}
                  </h2>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 bg-white/5 rounded-full text-slate-500 hover:text-white"><X size={16}/></button>
              </div>

              <div className="p-6 overflow-y-auto">
                <form id="userForm" onSubmit={salvarEdicao} className="space-y-4">
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Nome Completo</label>
                        <input required className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={editNome} onChange={e => setEditNome(e.target.value)} />
                    </div>

                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">CPF do Vendedor</label>
                        <div className="relative">
                            <Fingerprint size={16} className="absolute left-4 top-3.5 text-slate-500" />
                            <input 
                                required 
                                placeholder="000.000.000-00" 
                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" 
                                value={editCpf} 
                                onChange={e => setEditCpf(aplicarMascaraCPF(e.target.value))} 
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">E-mail de Acesso</label>
                        <input required type="email" disabled={!!editingUser} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold disabled:opacity-50" value={editEmail} onChange={e => setEditEmail(e.target.value)} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Cargo</label>
                            <select className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm font-bold" value={editCargo} onChange={e => setEditCargo(e.target.value)}>
                                <option value="vendedor">Vendedor</option>
                                <option value="producao">Produção</option>
                                <option value="almoxarifado">Almoxarifado</option>
                                <option value="gerente">Gerente</option>
                                <option value="diretor">Diretor (Admin)</option>
                                <option value="opec">Opec</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Unidade/Filial</label>
                            <select className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm font-bold" value={editUnidade} onChange={e => setEditUnidade(e.target.value)}>
                                <option value="">SELECIONE...</option>
                                {unidades.map(u => (
                                  <option key={u.id} value={u.nome}>{u.nome}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </form>
              </div>

              <div className="p-5 border-t border-white/10 bg-[#0F172A] flex flex-col gap-3">
                  <button type="submit" form="userForm" disabled={saving} className="w-full bg-[#22C55E] text-[#0B1120] py-3.5 rounded-xl font-black uppercase text-xs tracking-widest hover:scale-[1.02] transition-transform flex items-center justify-center gap-2">
                      {saving ? <Loader2 size={16} className="animate-spin"/> : 'Salvar Configurações'}
                  </button>
                  {editingUser && (
                      <button
                        type="button"
                        onClick={resetarSenha}
                        disabled={resetandoSenha}
                        className="w-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 py-3 rounded-xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 hover:bg-yellow-500/20 transition-all disabled:opacity-50"
                      >
                        {resetandoSenha ? <Loader2 size={14} className="animate-spin"/> : <KeyRound size={14}/>}
                        {resetandoSenha ? 'Enviando...' : 'Resetar Senha'}
                      </button>
                  )}
                  {editingUser && (
                      <button type="button" onClick={alternarAtivo} disabled={saving} className={`w-full py-3 rounded-xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 border transition-all disabled:opacity-50 ${editingUser.desativado_em ? 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30 hover:bg-[#22C55E]/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/30 hover:bg-orange-500/20'}`}>
                        {editingUser.desativado_em ? <><UserCheck size={14}/> Reativar Usuário</> : <><UserX size={14}/> Desativar Usuário</>}
                      </button>
                  )}
                  {editingUser && (
                      <button type="button" onClick={excluirUsuario} className="w-full text-red-500/70 hover:text-red-400 py-1 font-black uppercase text-[10px] tracking-widest">Apagar de vez (só sem histórico)</button>
                  )}
              </div>
           </div>
        </div>
      )}
      {loteAberto && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-[#0B1120] border border-white/10 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-5 border-b border-white/10 bg-[#0F172A]">
              <h2 className="text-lg font-black uppercase italic text-white flex items-center gap-2"><Factory size={16} className="text-[#22C55E]"/> Acessos da fábrica</h2>
              <button onClick={() => setLoteAberto(false)} className="p-2 bg-white/5 rounded-full text-slate-500 hover:text-white"><X size={16}/></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4" id="lote-impressao">
              {loteResultado ? (
                <>
                  <p className="text-sm text-slate-300">Entrem em <b className="text-white">wegrow.app.br</b> com o login abaixo e a senha <b className="text-white font-mono">{loteSenhaUsada}</b>.</p>
                  <div className="divide-y divide-white/5 border border-white/10 rounded-2xl">
                    {loteResultado.map(r => (
                      <div key={r.nome} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <span className="text-sm font-bold text-white truncate">{r.nome}</span>
                        {r.login
                          ? <span className="font-mono text-sm text-[#22C55E]">{r.login}</span>
                          : <span className="text-[11px] text-red-400 text-right">{r.erro}</span>}
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500">Anote ou imprima agora — a senha não aparece de novo. Pra trocar depois: editar o membro → Resetar Senha.</p>
                </>
              ) : (
                <>
                  <p className="text-[11px] text-slate-400 leading-relaxed">Pra quem não tem e-mail. Cada pessoa entra com um <b className="text-slate-200">login</b> (ex.: <span className="font-mono">helton.{loteSufixo || 'empresa'}</span>) e a senha que você definir. Nome repetido ganha número (fabio2).</p>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Nomes (um por linha)</label>
                    <textarea value={loteNomes} onChange={e => setLoteNomes(e.target.value)} rows={8} placeholder={'Helton\nClaudecir\nFábio'} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] resize-y" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Final do login</label>
                      <input value={loteSufixo} onChange={e => setLoteSufixo(slugLogin(e.target.value))} placeholder="travel" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Cargo</label>
                      <select value={loteCargo} onChange={e => setLoteCargo(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm font-bold">
                        <option value="producao">Produção</option>
                        <option value="almoxarifado">Almoxarifado</option>
                        <option value="vendedor">Vendedor</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Senha inicial (mín. 6 caracteres)</label>
                    <input value={loteSenha} onChange={e => setLoteSenha(e.target.value)} autoComplete="new-password" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold font-mono outline-none focus:border-[#22C55E]" />
                  </div>
                  {loteErro && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl">{loteErro}</div>}
                </>
              )}
            </div>
            <div className="p-5 border-t border-white/10 bg-[#0F172A]">
              {loteResultado ? (
                <button type="button" onClick={() => window.print()} className="w-full bg-white/5 border border-white/10 text-white py-3.5 rounded-xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 hover:bg-white/10"><Printer size={14}/> Imprimir lista</button>
              ) : (
                <button type="button" onClick={criarLote} disabled={saving || !loteNomes.trim() || loteSenha.length < 6 || !loteSufixo} className="w-full bg-[#22C55E] text-[#0B1120] py-3.5 rounded-xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 disabled:opacity-40">
                  {saving ? <Loader2 size={16} className="animate-spin"/> : <Plus size={16}/>} Criar acessos
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <Toast message={toastMessage} isVisible={showToast} onClose={() => setShowToast(false)} />
    </div>
  );
}