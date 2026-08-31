"use client";
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, Instagram, RefreshCw, AlertTriangle, KeyRound, Save, TrendingUp } from 'lucide-react';

type InstagramInsights = { seguidores: number; visualizacoes: number; interacoes: number; visitasPerfil: number };

const fmtCompacto = (v: number | null | undefined) => Number(v || 0).toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const fmtNumero = (v: number | null | undefined) => Number(v || 0).toLocaleString('pt-BR');

// Módulo de redes sociais genérico — mesma lógica/tabela (argus_meta_config,
// já era por empresa_id puro) e mesma API (/api/argus/instagram, sem checagem de
// modulos.argus) que já existiam em src/app/argus/marketing/page.tsx, só sem o shell
// visual do Argus, pra qualquer empresa poder ativar sem precisar do módulo Argus.
export default function MarketingPage() {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const isDiretor = perfil?.cargo === 'diretor';
  const temModulo = Boolean(empresa?.modulos?.redes_sociais);

  const [insights, setInsights] = useState<InstagramInsights | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [precisaConfigurar, setPrecisaConfigurar] = useState(false);
  const [config, setConfig] = useState({ ig_business_account_id: '', access_token: '' });
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState('');

  const carregarInsights = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/argus/instagram', { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 400) setPrecisaConfigurar(true);
        throw new Error(json.erro || 'Erro ao buscar Instagram.');
      }
      setPrecisaConfigurar(false);
      setInsights(json);
    } catch (err: any) {
      setInsights(null);
      setErro(err?.message || 'Erro ao buscar Instagram.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (!perfil?.empresa_id || !temModulo) return;
    if (isDiretor) {
      supabase.from('argus_meta_config').select('ig_business_account_id, access_token').eq('empresa_id', perfil.empresa_id).maybeSingle()
        .then(({ data }) => setConfig({ ig_business_account_id: data?.ig_business_account_id || '', access_token: data?.access_token || '' }));
    }
    carregarInsights();
  }, [perfil?.empresa_id, isDiretor, temModulo, carregarInsights]);

  const salvarConfig = async () => {
    if (!perfil?.empresa_id) return;
    setSalvando(true);
    const { error } = await supabase.from('argus_meta_config').upsert([{
      empresa_id: perfil.empresa_id,
      ig_business_account_id: config.ig_business_account_id.trim() || null,
      access_token: config.access_token.trim() || null,
      token_atualizado_em: new Date().toISOString(),
      criado_por: perfil.id,
      updated_at: new Date().toISOString(),
    }], { onConflict: 'empresa_id' });
    setSalvando(false);
    setToast(error ? `Erro: ${error.message}` : 'Credenciais salvas!');
    setTimeout(() => setToast(''), 4000);
    if (!error) carregarInsights();
  };

  if (!temModulo) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <TrendingUp size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">O módulo de Redes Sociais não está ativo pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <h1 className="text-4xl font-black tracking-tighter uppercase italic text-[var(--cor-primaria)] flex items-center gap-3 mb-6">
        <TrendingUp size={32} /> Redes Sociais
      </h1>

      <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-bold text-white flex items-center gap-2"><Instagram size={16} /> Instagram (ao vivo)</p>
          <button onClick={carregarInsights} disabled={carregando} className="text-slate-500 hover:text-white transition-colors">
            <RefreshCw size={15} className={carregando ? 'animate-spin' : ''} />
          </button>
        </div>

        {erro && !precisaConfigurar && (
          <p className="text-[13px] text-amber-400 font-semibold flex items-center gap-2"><AlertTriangle size={14} /> {erro}</p>
        )}

        {precisaConfigurar && !isDiretor && (
          <p className="text-[13px] text-slate-400 font-semibold">Instagram ainda não configurado — peça pro diretor cadastrar as credenciais.</p>
        )}

        {insights && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><p className="text-xl font-bold text-white">{fmtNumero(insights.seguidores)}</p><p className="text-[11px] text-slate-500 font-bold uppercase mt-0.5">Seguidores</p></div>
            <div><p className="text-xl font-bold text-white">{fmtCompacto(insights.visualizacoes)}</p><p className="text-[11px] text-slate-500 font-bold uppercase mt-0.5">Visualizações</p></div>
            <div><p className="text-xl font-bold text-white">{fmtCompacto(insights.interacoes)}</p><p className="text-[11px] text-slate-500 font-bold uppercase mt-0.5">Interações</p></div>
            <div><p className="text-xl font-bold text-white">{fmtCompacto(insights.visitasPerfil)}</p><p className="text-[11px] text-slate-500 font-bold uppercase mt-0.5">Visitas ao Perfil</p></div>
          </div>
        )}
      </div>

      {isDiretor && (
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 space-y-4">
          <h2 className="text-sm font-bold text-white flex items-center gap-2"><KeyRound size={16} /> Credenciais do Instagram</h2>
          <p className="text-[12px] text-slate-500 font-semibold">
            Conta Instagram Business/Creator vinculada a uma Página do Facebook, com token de acesso de longa duração. Visível só pra diretor.
          </p>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Instagram Business Account ID</label>
            <input className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-white outline-none focus:border-[var(--cor-primaria)]" value={config.ig_business_account_id} onChange={e => setConfig({ ...config, ig_business_account_id: e.target.value })} placeholder="17841400000000000" />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Access Token</label>
            <input type="password" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-white outline-none focus:border-[var(--cor-primaria)]" value={config.access_token} onChange={e => setConfig({ ...config, access_token: e.target.value })} placeholder="EAAG..." />
          </div>
          <button onClick={salvarConfig} disabled={salvando} className="bg-[var(--cor-primaria)] hover:bg-[#1ea34d] disabled:opacity-50 text-[#0B1120] px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar credenciais
          </button>
          {toast && <p className="text-xs font-bold text-slate-400">{toast}</p>}
        </div>
      )}
    </div>
  );
}
