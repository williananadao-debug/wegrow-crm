"use client";
import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, Save, Instagram, KeyRound, Cake, Plus, Trash2, Sparkles, Youtube, LinkIcon, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { MidiaMetaConfig, MidiaMetricasMensais, MESES_LABEL, MidiaAniversarioMunicipio, SUGESTOES_ANIVERSARIOS_DEMAIS_FM, SUGESTOES_RESULTADOS_ANIVERSARIOS_2026 } from '../shared';

const CAMPO = "w-full bg-[#0B1120] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]";
const LABEL = "text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block";

export default function MidiaConfiguracoesPage() {
  return (
    <Suspense fallback={<div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>}>
      <MidiaConfiguracoesContent />
    </Suspense>
  );
}

function MidiaConfiguracoesContent() {
  const auth = useAuth() || {};
  const authLoading = (auth as any).loading;
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const temMidia = Boolean(empresa?.modulos?.midia);
  const isDiretor = perfil?.cargo === 'diretor';
  const isLideranca = isDiretor || perfil?.cargo === 'gerente';

  const hoje = new Date();
  const [loading, setLoading] = useState(true);
  const [salvandoMeta, setSalvandoMeta] = useState(false);
  const [salvandoMetricas, setSalvandoMetricas] = useState(false);
  const [toast, setToast] = useState('');

  const [metaConfig, setMetaConfig] = useState({ ig_business_account_id: '', fb_page_id: '', access_token: '', youtube_channel_id: '' });
  const [youtubeConectadoEm, setYoutubeConectadoEm] = useState<string | null>(null);
  const [conectandoGoogle, setConectandoGoogle] = useState(false);
  const [viewsOauthMes, setViewsOauthMes] = useState<number | null>(null);
  const [erroViewsOauth, setErroViewsOauth] = useState<string | null>(null);
  const [carregandoViewsOauth, setCarregandoViewsOauth] = useState(false);
  const searchParams = useSearchParams();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [metricas, setMetricas] = useState({
    youtube_visualizacoes: '', youtube_observacoes: '',
    instagram_demais_news_visualizacoes: '', instagram_demais_news_interacoes: '', instagram_demais_news_seguidores: '',
    redes_sociais_visualizacoes: '', redes_sociais_interacoes: '', redes_sociais_visitas_perfil: '',
  });

  const [aniversarios, setAniversarios] = useState<MidiaAniversarioMunicipio[]>([]);
  const [carregandoSugestao, setCarregandoSugestao] = useState(false);
  const [carregandoResultados, setCarregandoResultados] = useState(false);
  const [novoAniversario, setNovoAniversario] = useState({ municipio: '', uf: '', praca: '', dia: '', mes: '' });
  const [salvandoAniversario, setSalvandoAniversario] = useState(false);

  const carregarAniversarios = async () => {
    if (!perfil?.empresa_id) return;
    const { data } = await supabase.from('midia_aniversarios_municipios').select('*').eq('empresa_id', perfil.empresa_id).order('mes').order('dia');
    setAniversarios((data as MidiaAniversarioMunicipio[]) || []);
  };

  useEffect(() => {
    if (!perfil?.empresa_id || !temMidia) return;
    setLoading(true);
    Promise.all([
      isDiretor ? supabase.from('midia_meta_config').select('*').eq('empresa_id', perfil.empresa_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('midia_metricas_mensais').select('*').eq('empresa_id', perfil.empresa_id).eq('ano', ano).eq('mes', mes).maybeSingle(),
    ]).then(([{ data: cfg }, { data: met }]) => {
      if (cfg) {
        setMetaConfig({ ig_business_account_id: cfg.ig_business_account_id || '', fb_page_id: cfg.fb_page_id || '', access_token: cfg.access_token || '', youtube_channel_id: cfg.youtube_channel_id || '' });
        setYoutubeConectadoEm(cfg.youtube_oauth_conectado_em || null);
      }
      const m = met as MidiaMetricasMensais | null;
      setMetricas({
        youtube_visualizacoes: m?.youtube_visualizacoes?.toString() || '',
        youtube_observacoes: m?.youtube_observacoes || '',
        instagram_demais_news_visualizacoes: m?.instagram_demais_news_visualizacoes?.toString() || '',
        instagram_demais_news_interacoes: m?.instagram_demais_news_interacoes?.toString() || '',
        instagram_demais_news_seguidores: m?.instagram_demais_news_seguidores?.toString() || '',
        redes_sociais_visualizacoes: m?.redes_sociais_visualizacoes?.toString() || '',
        redes_sociais_interacoes: m?.redes_sociais_interacoes?.toString() || '',
        redes_sociais_visitas_perfil: m?.redes_sociais_visitas_perfil?.toString() || '',
      });
      setLoading(false);
    });
    carregarAniversarios();
  }, [perfil?.empresa_id, temMidia, isDiretor, ano, mes]);

  useEffect(() => {
    const resultado = searchParams.get('youtube_oauth');
    if (!resultado) return;
    const msg = searchParams.get('msg');
    setToast(resultado === 'sucesso' ? 'Google conectado! Já dá pra puxar visualizações mensais reais.' : `Erro ao conectar: ${msg || 'tente de novo'}`);
    setTimeout(() => setToast(''), 6000);
    window.history.replaceState(null, '', '/midia/configuracoes');
  }, [searchParams]);

  const conectarGoogle = async () => {
    setConectandoGoogle(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/midia/youtube/oauth/iniciar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro || 'Erro ao iniciar conexão.');
      window.location.href = json.authUrl;
    } catch (err: any) {
      setToast(`Erro: ${err.message}`);
      setTimeout(() => setToast(''), 5000);
      setConectandoGoogle(false);
    }
  };

  const buscarViewsOauth = async () => {
    setCarregandoViewsOauth(true);
    setErroViewsOauth(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch(`/api/midia/youtube/mensal?ano=${ano}&mes=${mes}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro || 'Erro ao buscar views.');
      setViewsOauthMes(json.visualizacoes);
    } catch (err: any) {
      setViewsOauthMes(null);
      setErroViewsOauth(err?.message || 'Erro ao buscar views.');
    } finally {
      setCarregandoViewsOauth(false);
    }
  };

  const carregarSugestao = async () => {
    if (!perfil?.empresa_id) return;
    setCarregandoSugestao(true);
    const porNome = new Map(aniversarios.map(a => [a.municipio.toLowerCase(), a]));
    const novos = SUGESTOES_ANIVERSARIOS_DEMAIS_FM.filter(s => !porNome.has(s.municipio.toLowerCase()));
    const existentes = SUGESTOES_ANIVERSARIOS_DEMAIS_FM.filter(s => porNome.has(s.municipio.toLowerCase()));

    let erro: string | null = null;
    if (novos.length > 0) {
      const { error } = await supabase.from('midia_aniversarios_municipios').insert(
        novos.map(s => ({ empresa_id: perfil.empresa_id, municipio: s.municipio, uf: s.uf, praca: s.praca, dia: s.dia, mes: s.mes, observacao: s.observacao || null, criado_por: perfil.id }))
      );
      if (error) erro = error.message;
    }
    // Datas/observações da sugestão foram corrigidas (confrontadas com o painel real de
    // vendas) — atualiza quem já estava cadastrado com os dados antigos também.
    for (const s of existentes) {
      const atual = porNome.get(s.municipio.toLowerCase())!;
      if (atual.dia !== s.dia || atual.mes !== s.mes || atual.praca !== s.praca || (atual.observacao || '') !== (s.observacao || '')) {
        const { error } = await supabase.from('midia_aniversarios_municipios').update({ dia: s.dia, mes: s.mes, praca: s.praca, observacao: s.observacao || null }).eq('id', atual.id);
        if (error) erro = error.message;
      }
    }

    setCarregandoSugestao(false);
    setToast(erro ? `Erro: ${erro}` : `Sugestão carregada/atualizada (${novos.length} nova(s), ${existentes.length} conferida(s)). Confira as datas com observação antes de usar pra vender.`);
    setTimeout(() => setToast(''), 6000);
    carregarAniversarios();
  };

  const carregarResultados2026 = async () => {
    if (!perfil?.empresa_id) return;
    if (aniversarios.length === 0) { setToast('Carregue a lista de cidades primeiro.'); setTimeout(() => setToast(''), 4000); return; }
    setCarregandoResultados(true);
    const porNome = new Map(aniversarios.map(a => [a.municipio.toLowerCase(), a]));
    const linhas = SUGESTOES_RESULTADOS_ANIVERSARIOS_2026
      .map(r => { const a = porNome.get(r.municipio.toLowerCase()); return a ? { a, r } : null; })
      .filter((x): x is { a: MidiaAniversarioMunicipio; r: typeof SUGESTOES_RESULTADOS_ANIVERSARIOS_2026[number] } => Boolean(x));

    const { error } = await supabase.from('midia_aniversarios_resultados').upsert(
      linhas.map(({ a, r }) => ({
        empresa_id: perfil.empresa_id, aniversario_id: a.id, ano: 2026,
        status: r.status, valor: r.valor ?? null, observacao: r.observacao || null, criado_por: perfil.id,
      })),
      { onConflict: 'aniversario_id,ano' }
    );
    setCarregandoResultados(false);
    setToast(error ? `Erro: ${error.message}` : `${linhas.length} resultado(s) de 2026 carregado(s).`);
    setTimeout(() => setToast(''), 5000);
  };

  const adicionarAniversario = async () => {
    if (!perfil?.empresa_id || !novoAniversario.municipio.trim() || !novoAniversario.dia || !novoAniversario.mes) return;
    setSalvandoAniversario(true);
    const { error } = await supabase.from('midia_aniversarios_municipios').insert([{
      empresa_id: perfil.empresa_id, municipio: novoAniversario.municipio.trim(), uf: novoAniversario.uf.trim() || null,
      praca: novoAniversario.praca.trim() || null, dia: Number(novoAniversario.dia), mes: Number(novoAniversario.mes), criado_por: perfil.id,
    }]);
    setSalvandoAniversario(false);
    if (!error) { setNovoAniversario({ municipio: '', uf: '', praca: '', dia: '', mes: '' }); carregarAniversarios(); }
    else { setToast(`Erro: ${error.message}`); setTimeout(() => setToast(''), 4000); }
  };

  const excluirAniversario = async (id: number) => {
    if (!confirm('Remover essa cidade da lista de aniversários?')) return;
    await supabase.from('midia_aniversarios_municipios').delete().eq('id', id);
    carregarAniversarios();
  };

  const salvarMetaConfig = async () => {
    if (!perfil?.empresa_id) return;
    setSalvandoMeta(true);
    const { error } = await supabase.from('midia_meta_config').upsert([{
      empresa_id: perfil.empresa_id,
      ig_business_account_id: metaConfig.ig_business_account_id.trim() || null,
      fb_page_id: metaConfig.fb_page_id.trim() || null,
      access_token: metaConfig.access_token.trim() || null,
      youtube_channel_id: metaConfig.youtube_channel_id.trim() || null,
      token_atualizado_em: new Date().toISOString(),
      criado_por: perfil.id,
      updated_at: new Date().toISOString(),
    }], { onConflict: 'empresa_id' });
    setSalvandoMeta(false);
    setToast(error ? `Erro: ${error.message}` : 'Credenciais salvas!');
    setTimeout(() => setToast(''), 4000);
  };

  const salvarMetricas = async () => {
    if (!perfil?.empresa_id) return;
    setSalvandoMetricas(true);
    const num = (v: string) => v.trim() === '' ? null : Number(v);
    const { error } = await supabase.from('midia_metricas_mensais').upsert([{
      empresa_id: perfil.empresa_id, ano, mes,
      youtube_visualizacoes: num(metricas.youtube_visualizacoes),
      youtube_observacoes: metricas.youtube_observacoes.trim() || null,
      instagram_demais_news_visualizacoes: num(metricas.instagram_demais_news_visualizacoes),
      instagram_demais_news_interacoes: num(metricas.instagram_demais_news_interacoes),
      instagram_demais_news_seguidores: num(metricas.instagram_demais_news_seguidores),
      redes_sociais_visualizacoes: num(metricas.redes_sociais_visualizacoes),
      redes_sociais_interacoes: num(metricas.redes_sociais_interacoes),
      redes_sociais_visitas_perfil: num(metricas.redes_sociais_visitas_perfil),
      criado_por: perfil.id,
      updated_at: new Date().toISOString(),
    }], { onConflict: 'empresa_id,ano,mes' });
    setSalvandoMetricas(false);
    setToast(error ? `Erro: ${error.message}` : `Dados de ${MESES_LABEL[mes - 1]}/${ano} salvos!`);
    setTimeout(() => setToast(''), 4000);
  };

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;

  if (!temMidia || !isLideranca) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <p className="text-slate-400 font-bold text-sm">{!temMidia ? 'O módulo Demais FM Comercial não está ativo pra sua empresa ainda.' : 'Só diretor ou gerente pode acessar essa área.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-20 text-white max-w-3xl mx-auto">
      <Link href="/midia" className="inline-flex items-center gap-2 text-slate-500 hover:text-white text-xs font-black uppercase tracking-widest mb-6">
        <ArrowLeft size={14} /> Voltar
      </Link>

      <h1 className="text-2xl font-black uppercase italic tracking-tighter mb-6">Configurações — Demais FM Comercial</h1>

      {loading ? (
        <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>
      ) : (
        <div className="space-y-6">

          {isDiretor && (
            <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-6 space-y-4">
              <h2 className="text-sm font-black uppercase flex items-center gap-2 text-[#22C55E]"><Instagram size={16} /> Instagram (Meta Graph API)</h2>
              <p className="text-[11px] text-slate-500 font-semibold">
                Precisa de uma conta Instagram Business/Creator vinculada a uma Página do Facebook, um app criado em developers.facebook.com,
                e um token de acesso de longa duração com permissão de leitura de insights. Visível só pra diretor.
              </p>
              <div>
                <label className={LABEL}>Instagram Business Account ID</label>
                <input className={CAMPO} value={metaConfig.ig_business_account_id} onChange={e => setMetaConfig({ ...metaConfig, ig_business_account_id: e.target.value })} placeholder="17841400000000000" />
              </div>
              <div>
                <label className={LABEL}>Facebook Page ID (opcional, pra uso futuro)</label>
                <input className={CAMPO} value={metaConfig.fb_page_id} onChange={e => setMetaConfig({ ...metaConfig, fb_page_id: e.target.value })} />
              </div>
              <div>
                <label className={LABEL}><KeyRound size={10} className="inline mr-1" />Access Token</label>
                <input type="password" className={CAMPO} value={metaConfig.access_token} onChange={e => setMetaConfig({ ...metaConfig, access_token: e.target.value })} placeholder="EAAG..." />
              </div>

              <h2 className="text-sm font-black uppercase flex items-center gap-2 text-red-400 pt-2 border-t border-white/5"><Youtube size={16} /> YouTube (Data API)</h2>
              <p className="text-[11px] text-slate-500 font-semibold">
                Só precisa do Channel ID do canal — a chave de API é configurada uma vez só no servidor (YOUTUBE_API_KEY), não por empresa.
                Traz inscritos e visualizações totais históricas.
              </p>
              <div>
                <label className={LABEL}>YouTube Channel ID</label>
                <input className={CAMPO} value={metaConfig.youtube_channel_id} onChange={e => setMetaConfig({ ...metaConfig, youtube_channel_id: e.target.value })} placeholder="UCxxxxxxxxxxxxxxxxxxxxxx" />
              </div>

              <button onClick={salvarMetaConfig} disabled={salvandoMeta} className="bg-[#22C55E] hover:bg-[#22C55E] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">
                {salvandoMeta ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar credenciais
              </button>

              <div className="pt-3 border-t border-white/5">
                <p className="text-[11px] text-slate-500 font-semibold mb-2">
                  Visualização <strong>por mês</strong> real (não só total histórico) exige autorização do dono do canal via Google — conecta uma vez, renova sozinho depois.
                </p>
                {youtubeConectadoEm ? (
                  <p className="text-[10px] text-[#22C55E] font-bold flex items-center gap-1.5"><CheckCircle2 size={13} /> Conectado desde {new Date(youtubeConectadoEm).toLocaleDateString('pt-BR')}</p>
                ) : (
                  <button onClick={conectarGoogle} disabled={conectandoGoogle} className="inline-flex items-center gap-2 bg-white text-[#0B1120] hover:bg-slate-200 disabled:opacity-50 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest">
                    {conectandoGoogle ? <Loader2 size={14} className="animate-spin" /> : <LinkIcon size={14} />} Conectar com Google
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-4">
            <p className="text-[11px] text-slate-400 font-semibold">
              Audiência, site, downloads do app e monetização agora vêm ao vivo da API da Demais FM Comercial (Leo) — não precisam mais ser digitados aqui.
              Só o YouTube da rede e o Instagram do Demais News continuam manuais/abaixo.
            </p>
          </div>

          <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-sm font-black uppercase text-amber-400">Dados manuais do mês</h2>
              <div className="flex items-center gap-2">
                <select value={mes} onChange={e => setMes(Number(e.target.value))} className="bg-[#0B1120] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-bold uppercase text-white outline-none">
                  {MESES_LABEL.map((l, i) => <option key={i} value={i + 1}>{l}</option>)}
                </select>
                <select value={ano} onChange={e => setAno(Number(e.target.value))} className="bg-[#0B1120] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-bold uppercase text-white outline-none">
                  {[hoje.getFullYear(), hoje.getFullYear() - 1].map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Redes sociais (rede) — visualizações</label>
                <input type="number" className={CAMPO} value={metricas.redes_sociais_visualizacoes} onChange={e => setMetricas({ ...metricas, redes_sociais_visualizacoes: e.target.value })} placeholder="Ex: 21500000" />
              </div>
              <div>
                <label className={LABEL}>Redes sociais (rede) — interações</label>
                <input type="number" className={CAMPO} value={metricas.redes_sociais_interacoes} onChange={e => setMetricas({ ...metricas, redes_sociais_interacoes: e.target.value })} placeholder="Ex: 315000" />
              </div>
              <div>
                <label className={LABEL}>Redes sociais (rede) — visitas ao perfil</label>
                <input type="number" className={CAMPO} value={metricas.redes_sociais_visitas_perfil} onChange={e => setMetricas({ ...metricas, redes_sociais_visitas_perfil: e.target.value })} placeholder="Ex: 81000" />
                <p className="text-[9px] text-slate-600 font-bold mt-1">Soma Instagram + Facebook das três emissoras — vem pronto do painel do Leo/IAlto, mesmo número do card "Redes sociais" dele.</p>
              </div>
              <div>
                <label className={LABEL}>Visualizações YouTube da rede</label>
                <input type="number" className={CAMPO} value={metricas.youtube_visualizacoes} onChange={e => setMetricas({ ...metricas, youtube_visualizacoes: e.target.value })} />
                {youtubeConectadoEm && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <button type="button" onClick={buscarViewsOauth} disabled={carregandoViewsOauth} className="text-[9px] font-black uppercase text-blue-400 hover:text-blue-300 disabled:opacity-50 flex items-center gap-1">
                      {carregandoViewsOauth ? <Loader2 size={10} className="animate-spin" /> : <Youtube size={10} />} Buscar real de {MESES_LABEL[mes - 1]}/{ano}
                    </button>
                    {erroViewsOauth && <span className="text-[9px] text-amber-400 font-bold">{erroViewsOauth}</span>}
                    {viewsOauthMes !== null && (
                      <button type="button" onClick={() => setMetricas({ ...metricas, youtube_visualizacoes: String(viewsOauthMes) })} className="text-[9px] font-black uppercase text-[#22C55E] hover:underline">
                        {viewsOauthMes.toLocaleString('pt-BR')} — usar este valor
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className={LABEL}>Observações do YouTube (ex: "início do Podmais")</label>
                <input className={CAMPO} value={metricas.youtube_observacoes} onChange={e => setMetricas({ ...metricas, youtube_observacoes: e.target.value })} />
              </div>
              <div>
                <label className={LABEL}>Instagram Demais News — visualizações</label>
                <input type="number" className={CAMPO} value={metricas.instagram_demais_news_visualizacoes} onChange={e => setMetricas({ ...metricas, instagram_demais_news_visualizacoes: e.target.value })} />
              </div>
              <div>
                <label className={LABEL}>Instagram Demais News — interações</label>
                <input type="number" className={CAMPO} value={metricas.instagram_demais_news_interacoes} onChange={e => setMetricas({ ...metricas, instagram_demais_news_interacoes: e.target.value })} />
              </div>
              <div>
                <label className={LABEL}>Instagram Demais News — seguidores</label>
                <input type="number" className={CAMPO} value={metricas.instagram_demais_news_seguidores} onChange={e => setMetricas({ ...metricas, instagram_demais_news_seguidores: e.target.value })} />
              </div>
            </div>

            <button onClick={salvarMetricas} disabled={salvandoMetricas} className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-[#0B1120] px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">
              {salvandoMetricas ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar {MESES_LABEL[mes - 1]}/{ano}
            </button>
          </div>

          <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-sm font-black uppercase text-emerald-400 flex items-center gap-2"><Cake size={16} /> Aniversários de Município</h2>
              <div className="flex items-center gap-2">
                <button onClick={carregarSugestao} disabled={carregandoSugestao} className="inline-flex items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50">
                  {carregandoSugestao ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Carregar sugestão (24 cidades)
                </button>
                <button onClick={carregarResultados2026} disabled={carregandoResultados} className="inline-flex items-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50">
                  {carregandoResultados ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Carregar resultados de vendas 2026
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 font-semibold">
              Alerta dispara 5 dias antes da data. Algumas cidades têm dia não confirmado (só o mês bate com o painel real de vendas) — confira as com observação antes de usar pra vender.
            </p>

            {aniversarios.length > 0 && (
              <div className="space-y-1.5 max-h-80 overflow-y-auto custom-scrollbar pr-1">
                {aniversarios.map(a => (
                  <div key={a.id} className="flex items-center gap-2 bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">{a.municipio}{a.uf ? `/${a.uf}` : ''} <span className="text-slate-500 font-normal">— {String(a.dia).padStart(2, '0')}/{String(a.mes).padStart(2, '0')}</span></p>
                      {(a.praca || a.observacao) && <p className="text-[9px] text-slate-500 font-bold uppercase mt-0.5">{a.praca}{a.observacao ? ` · ${a.observacao}` : ''}</p>}
                    </div>
                    <button onClick={() => excluirAniversario(a.id)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-white/5 rounded-lg flex-shrink-0"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end pt-2 border-t border-white/5">
              <div className="col-span-2">
                <label className={LABEL}>Município</label>
                <input className={CAMPO} value={novoAniversario.municipio} onChange={e => setNovoAniversario({ ...novoAniversario, municipio: e.target.value })} />
              </div>
              <div>
                <label className={LABEL}>UF</label>
                <input className={CAMPO} maxLength={2} value={novoAniversario.uf} onChange={e => setNovoAniversario({ ...novoAniversario, uf: e.target.value.toUpperCase() })} />
              </div>
              <div>
                <label className={LABEL}>Praça</label>
                <input className={CAMPO} value={novoAniversario.praca} onChange={e => setNovoAniversario({ ...novoAniversario, praca: e.target.value })} placeholder="104.7" />
              </div>
              <div>
                <label className={LABEL}>Dia</label>
                <input type="number" min={1} max={31} className={CAMPO} value={novoAniversario.dia} onChange={e => setNovoAniversario({ ...novoAniversario, dia: e.target.value })} />
              </div>
              <div>
                <label className={LABEL}>Mês</label>
                <input type="number" min={1} max={12} className={CAMPO} value={novoAniversario.mes} onChange={e => setNovoAniversario({ ...novoAniversario, mes: e.target.value })} />
              </div>
            </div>
            <button onClick={adicionarAniversario} disabled={salvandoAniversario} className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50">
              {salvandoAniversario ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Adicionar cidade
            </button>
          </div>

          {toast && <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-white">{toast}</div>}
        </div>
      )}
    </div>
  );
}
