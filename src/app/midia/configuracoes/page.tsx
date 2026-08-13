"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Save, Instagram, KeyRound, Cake, Plus, Trash2, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { MidiaMetaConfig, MidiaMetricasMensais, MESES_LABEL, MidiaAniversarioMunicipio, SUGESTOES_ANIVERSARIOS_DEMAIS_FM, PRACAS, MidiaEmissoraAudiencia } from '../shared';

const CAMPO = "w-full bg-[#0B1120] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-pink-500";
const LABEL = "text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block";

export default function MidiaConfiguracoesPage() {
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

  const [metaConfig, setMetaConfig] = useState({ ig_business_account_id: '', fb_page_id: '', access_token: '' });
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [metricas, setMetricas] = useState({
    ouvintes_por_minuto_estimado: '', site_acessos: '', youtube_visualizacoes: '', youtube_observacoes: '',
    instagram_demais_news_visualizacoes: '', instagram_demais_news_interacoes: '', instagram_demais_news_seguidores: '',
    app_downloads_apple_total: '', app_downloads_android_total: '', monetizacao_valor: '',
  });

  const [praca, setPraca] = useState<string>(PRACAS[0]);
  const [audienciaPraca, setAudienciaPraca] = useState({ ouvintes_por_minuto: '', share_audiencia: '' });
  const [salvandoAudiencia, setSalvandoAudiencia] = useState(false);

  const [aniversarios, setAniversarios] = useState<MidiaAniversarioMunicipio[]>([]);
  const [carregandoSugestao, setCarregandoSugestao] = useState(false);
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
      if (cfg) setMetaConfig({ ig_business_account_id: cfg.ig_business_account_id || '', fb_page_id: cfg.fb_page_id || '', access_token: cfg.access_token || '' });
      const m = met as MidiaMetricasMensais | null;
      setMetricas({
        ouvintes_por_minuto_estimado: m?.ouvintes_por_minuto_estimado?.toString() || '',
        site_acessos: m?.site_acessos?.toString() || '',
        youtube_visualizacoes: m?.youtube_visualizacoes?.toString() || '',
        youtube_observacoes: m?.youtube_observacoes || '',
        instagram_demais_news_visualizacoes: m?.instagram_demais_news_visualizacoes?.toString() || '',
        instagram_demais_news_interacoes: m?.instagram_demais_news_interacoes?.toString() || '',
        instagram_demais_news_seguidores: m?.instagram_demais_news_seguidores?.toString() || '',
        app_downloads_apple_total: m?.app_downloads_apple_total?.toString() || '',
        app_downloads_android_total: m?.app_downloads_android_total?.toString() || '',
        monetizacao_valor: m?.monetizacao_valor?.toString() || '',
      });
      setLoading(false);
    });
    carregarAniversarios();
  }, [perfil?.empresa_id, temMidia, isDiretor, ano, mes]);

  useEffect(() => {
    if (!perfil?.empresa_id || !temMidia) return;
    supabase.from('midia_emissoras_audiencia').select('*').eq('empresa_id', perfil.empresa_id).eq('praca', praca).eq('ano', ano).eq('mes', mes).maybeSingle()
      .then(({ data }) => {
        const d = data as MidiaEmissoraAudiencia | null;
        setAudienciaPraca({ ouvintes_por_minuto: d?.ouvintes_por_minuto?.toString() || '', share_audiencia: d?.share_audiencia?.toString() || '' });
      });
  }, [perfil?.empresa_id, temMidia, praca, ano, mes]);

  const salvarAudienciaPraca = async () => {
    if (!perfil?.empresa_id) return;
    setSalvandoAudiencia(true);
    const num = (v: string) => v.trim() === '' ? null : Number(v);
    const { error } = await supabase.from('midia_emissoras_audiencia').upsert([{
      empresa_id: perfil.empresa_id, praca, ano, mes,
      ouvintes_por_minuto: num(audienciaPraca.ouvintes_por_minuto),
      share_audiencia: num(audienciaPraca.share_audiencia),
      criado_por: perfil.id, updated_at: new Date().toISOString(),
    }], { onConflict: 'empresa_id,praca,ano,mes' });
    setSalvandoAudiencia(false);
    setToast(error ? `Erro: ${error.message}` : `Audiência de ${praca} FM (${MESES_LABEL[mes - 1]}/${ano}) salva!`);
    setTimeout(() => setToast(''), 4000);
  };

  const carregarSugestao = async () => {
    if (!perfil?.empresa_id) return;
    setCarregandoSugestao(true);
    const existentes = new Set(aniversarios.map(a => a.municipio.toLowerCase()));
    const faltando = SUGESTOES_ANIVERSARIOS_DEMAIS_FM.filter(s => !existentes.has(s.municipio.toLowerCase()));
    if (faltando.length === 0) { setCarregandoSugestao(false); setToast('Todas as cidades sugeridas já estão cadastradas.'); setTimeout(() => setToast(''), 4000); return; }
    const { error } = await supabase.from('midia_aniversarios_municipios').insert(
      faltando.map(s => ({ empresa_id: perfil.empresa_id, municipio: s.municipio, uf: s.uf, praca: s.praca, dia: s.dia, mes: s.mes, observacao: s.observacao || null, criado_por: perfil.id }))
    );
    setCarregandoSugestao(false);
    setToast(error ? `Erro: ${error.message}` : `${faltando.length} cidade(s) adicionada(s)! Confira as datas com observação antes de usar pra vender.`);
    setTimeout(() => setToast(''), 6000);
    carregarAniversarios();
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
      token_atualizado_em: new Date().toISOString(),
      criado_por: perfil.id,
      updated_at: new Date().toISOString(),
    }], { onConflict: 'empresa_id' });
    setSalvandoMeta(false);
    setToast(error ? `Erro: ${error.message}` : 'Credenciais do Instagram salvas!');
    setTimeout(() => setToast(''), 4000);
  };

  const salvarMetricas = async () => {
    if (!perfil?.empresa_id) return;
    setSalvandoMetricas(true);
    const num = (v: string) => v.trim() === '' ? null : Number(v);
    const { error } = await supabase.from('midia_metricas_mensais').upsert([{
      empresa_id: perfil.empresa_id, ano, mes,
      ouvintes_por_minuto_estimado: num(metricas.ouvintes_por_minuto_estimado),
      site_acessos: num(metricas.site_acessos),
      youtube_visualizacoes: num(metricas.youtube_visualizacoes),
      youtube_observacoes: metricas.youtube_observacoes.trim() || null,
      instagram_demais_news_visualizacoes: num(metricas.instagram_demais_news_visualizacoes),
      instagram_demais_news_interacoes: num(metricas.instagram_demais_news_interacoes),
      instagram_demais_news_seguidores: num(metricas.instagram_demais_news_seguidores),
      app_downloads_apple_total: num(metricas.app_downloads_apple_total),
      app_downloads_android_total: num(metricas.app_downloads_android_total),
      monetizacao_valor: num(metricas.monetizacao_valor),
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
          <p className="text-slate-400 font-bold text-sm">{!temMidia ? 'O módulo Mídia não está ativo pra sua empresa ainda.' : 'Só diretor ou gerente pode acessar essa área.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-20 text-white max-w-3xl mx-auto">
      <Link href="/midia" className="inline-flex items-center gap-2 text-slate-500 hover:text-white text-xs font-black uppercase tracking-widest mb-6">
        <ArrowLeft size={14} /> Voltar
      </Link>

      <h1 className="text-2xl font-black uppercase italic tracking-tighter mb-6">Configurações — Mídia</h1>

      {loading ? (
        <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>
      ) : (
        <div className="space-y-6">

          {isDiretor && (
            <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-6 space-y-4">
              <h2 className="text-sm font-black uppercase flex items-center gap-2 text-pink-400"><Instagram size={16} /> Instagram (Meta Graph API)</h2>
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
              <button onClick={salvarMetaConfig} disabled={salvandoMeta} className="bg-pink-500 hover:bg-pink-400 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">
                {salvandoMeta ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar credenciais
              </button>
            </div>
          )}

          <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-sm font-black uppercase text-slate-300">Audiência por praça (aba Emissoras)</h2>
              <div className="flex items-center gap-2">
                <select value={praca} onChange={e => setPraca(e.target.value)} className="bg-[#0B1120] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-bold uppercase text-white outline-none">
                  {PRACAS.map(p => <option key={p} value={p}>{p} FM</option>)}
                </select>
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
                <label className={LABEL}>Ouvintes por minuto (estimado)</label>
                <input type="number" className={CAMPO} value={audienciaPraca.ouvintes_por_minuto} onChange={e => setAudienciaPraca({ ...audienciaPraca, ouvintes_por_minuto: e.target.value })} />
              </div>
              <div>
                <label className={LABEL}>Share de audiência (%)</label>
                <input type="number" step="0.1" className={CAMPO} value={audienciaPraca.share_audiencia} onChange={e => setAudienciaPraca({ ...audienciaPraca, share_audiencia: e.target.value })} />
              </div>
            </div>
            <button onClick={salvarAudienciaPraca} disabled={salvandoAudiencia} className="bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">
              {salvandoAudiencia ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar {praca} FM — {MESES_LABEL[mes - 1]}/{ano}
            </button>
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
                <label className={LABEL}>Ouvintes por minuto (estimado, rede em cadeia)</label>
                <input type="number" className={CAMPO} value={metricas.ouvintes_por_minuto_estimado} onChange={e => setMetricas({ ...metricas, ouvintes_por_minuto_estimado: e.target.value })} />
              </div>
              <div>
                <label className={LABEL}>Acessos do site Demais News</label>
                <input type="number" className={CAMPO} value={metricas.site_acessos} onChange={e => setMetricas({ ...metricas, site_acessos: e.target.value })} />
              </div>
              <div>
                <label className={LABEL}>Visualizações YouTube da rede</label>
                <input type="number" className={CAMPO} value={metricas.youtube_visualizacoes} onChange={e => setMetricas({ ...metricas, youtube_visualizacoes: e.target.value })} />
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
              <div>
                <label className={LABEL}>Monetização digital (R$ líquido do mês)</label>
                <input type="number" step="0.01" className={CAMPO} value={metricas.monetizacao_valor} onChange={e => setMetricas({ ...metricas, monetizacao_valor: e.target.value })} />
              </div>
              <div>
                <label className={LABEL}>Downloads do app — Apple (acumulado)</label>
                <input type="number" className={CAMPO} value={metricas.app_downloads_apple_total} onChange={e => setMetricas({ ...metricas, app_downloads_apple_total: e.target.value })} />
              </div>
              <div>
                <label className={LABEL}>Downloads do app — Android (acumulado)</label>
                <input type="number" className={CAMPO} value={metricas.app_downloads_android_total} onChange={e => setMetricas({ ...metricas, app_downloads_android_total: e.target.value })} />
              </div>
            </div>

            <button onClick={salvarMetricas} disabled={salvandoMetricas} className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-[#0B1120] px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">
              {salvandoMetricas ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar {MESES_LABEL[mes - 1]}/{ano}
            </button>
          </div>

          <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-sm font-black uppercase text-emerald-400 flex items-center gap-2"><Cake size={16} /> Aniversários de Município</h2>
              <button onClick={carregarSugestao} disabled={carregandoSugestao} className="inline-flex items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50">
                {carregandoSugestao ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Carregar sugestão (24 cidades)
              </button>
            </div>
            <p className="text-[11px] text-slate-500 font-semibold">
              Alerta dispara 5 dias antes da data. Algumas cidades têm data de instalação diferente da data de criação — confira as com observação antes de usar pra vender.
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
