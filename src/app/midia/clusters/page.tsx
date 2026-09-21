"use client";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, Megaphone, Bell, Users, MapPin, X, Save, Check, Cake } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import MidiaTabs from '../MidiaTabs';
import { PRACAS } from '../shared';
import {
  CidadeAniversario, PerfilCluster, VinculoCluster, DIAS_ALERTA_PADRAO,
  cidadesDoPerfil, possuiClusterExplicito, diasAte, anoDaOcorrencia, idadeNaOcorrencia, textoPrazo, pracasDoTexto,
} from '@/lib/aniversariosCluster';

const LIMITES_DISPONIVEIS = [60, 45, 30, 21, 15, 10, 7, 3, 1, 0];
const CARGO_LABEL: Record<string, string> = { diretor: 'Diretor', gerente: 'Gerente', vendedor: 'Vendedor' };

export default function MidiaClustersPage() {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const temMidia = Boolean(empresa?.modulos?.midia);
  const isLideranca = perfil?.cargo === 'diretor' || perfil?.cargo === 'gerente';

  const [cidades, setCidades] = useState<CidadeAniversario[]>([]);
  const [perfis, setPerfis] = useState<PerfilCluster[]>([]);
  const [vinculos, setVinculos] = useState<VinculoCluster[]>([]);
  const [limites, setLimites] = useState<number[]>(DIAS_ALERTA_PADRAO);
  const [loading, setLoading] = useState(true);
  const [salvandoLimites, setSalvandoLimites] = useState(false);
  const [editando, setEditando] = useState<PerfilCluster | null>(null);
  const [selecao, setSelecao] = useState<Set<number>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!perfil?.empresa_id || !temMidia) return;
    setLoading(true);
    const [{ data: c }, { data: p }, { data: v }] = await Promise.all([
      supabase.from('midia_aniversarios_municipios').select('id, municipio, praca, dia, mes, ano_emancipacao').eq('empresa_id', perfil.empresa_id).eq('ativo', true).order('municipio'),
      supabase.from('profiles').select('id, nome, cargo, unidade').eq('empresa_id', perfil.empresa_id).in('cargo', ['diretor', 'gerente', 'vendedor']).order('nome'),
      supabase.from('midia_cluster_vendedor_cidades').select('vendedor_id, aniversario_id').eq('empresa_id', perfil.empresa_id),
    ]);
    setCidades((c as CidadeAniversario[]) || []);
    setPerfis((p as PerfilCluster[]) || []);
    setVinculos((v as VinculoCluster[]) || []);
    const salvos = empresa?.modulos?.midia_aniversario_alerta_dias;
    if (Array.isArray(salvos) && salvos.length > 0) setLimites(salvos.map(Number));
    setLoading(false);
  }, [perfil?.empresa_id, temMidia, empresa?.modulos?.midia_aniversario_alerta_dias]);

  useEffect(() => { carregar(); }, [carregar]);

  const avisar = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 3500); };

  const alternarLimite = (n: number) => setLimites(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n].sort((a, b) => b - a));

  const salvarLimites = async () => {
    if (limites.length === 0) { avisar('Marque pelo menos um prazo de alerta.'); return; }
    setSalvandoLimites(true);
    const { error } = await supabase.from('empresas').update({ modulos: { ...(empresa?.modulos || {}), midia_aniversario_alerta_dias: [...limites].sort((a, b) => b - a) } }).eq('id', perfil?.empresa_id);
    setSalvandoLimites(false);
    avisar(error ? `Erro: ${error.message}` : 'Prazos de alerta salvos.');
  };

  const abrirEdicao = (p: PerfilCluster) => {
    setEditando(p);
    setSelecao(new Set(vinculos.filter(v => v.vendedor_id === p.id).map(v => v.aniversario_id)));
  };

  const alternarCidade = (id: number) => setSelecao(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const marcarPraca = (praca: string, marcar: boolean) => setSelecao(prev => {
    const n = new Set(prev);
    cidades.filter(c => pracasDoTexto(c.praca).includes(praca)).forEach(c => marcar ? n.add(c.id) : n.delete(c.id));
    return n;
  });

  const salvarCluster = async () => {
    if (!editando || !perfil?.empresa_id) return;
    setSalvando(true);
    // troca o conjunto inteiro do vendedor (vazio = volta pro padrão da praça da unidade)
    const { error: errDel } = await supabase.from('midia_cluster_vendedor_cidades').delete().eq('vendedor_id', editando.id).eq('empresa_id', perfil.empresa_id);
    let erro = errDel?.message;
    if (!erro && selecao.size > 0) {
      const { error } = await supabase.from('midia_cluster_vendedor_cidades').insert([...selecao].map(id => ({ empresa_id: perfil.empresa_id, vendedor_id: editando.id, aniversario_id: id })));
      erro = error?.message;
    }
    setSalvando(false);
    if (erro) { avisar(`Erro: ${erro}`); return; }
    setEditando(null); avisar('Cluster salvo.'); carregar();
  };

  // Prévia: próximos 90 dias, com quem recebe o alerta (mesma regra do cron)
  const previa = useMemo(() => {
    const hoje = new Date();
    return cidades
      .map(c => ({ c, dias: diasAte(c.dia, c.mes, hoje) }))
      .filter(x => x.dias <= 90)
      .sort((a, b) => a.dias - b.dias)
      .map(({ c, dias }) => ({
        c, dias,
        idade: idadeNaOcorrencia(c.ano_emancipacao, anoDaOcorrencia(c.dia, c.mes, hoje)),
        quem: perfis.filter(p => cidadesDoPerfil(p, [c], vinculos).length > 0),
      }));
  }, [cidades, perfis, vinculos]);

  if ((auth as any).loading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;
  if (!temMidia || !isLideranca) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Megaphone size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-base">{!temMidia ? 'O módulo Demais FM Comercial não está ativo pra sua empresa.' : 'Só diretor ou gerente pode configurar clusters.'}</p>
        </div>
      </div>
    );
  }

  const vendedores = perfis;

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <MidiaTabs />

      {msg && <div className="fixed top-6 right-6 z-[100] bg-[#0F172A] border border-[#22C55E]/40 text-white text-sm font-bold px-4 py-3 rounded-xl shadow-xl">{msg}</div>}

      {loading ? <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div> : (
        <div className="space-y-6">
          {/* Prazos de alerta */}
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-5">
            <h3 className="font-black uppercase text-sm text-slate-200 flex items-center gap-2 mb-1"><Bell size={14} className="text-[#22C55E]" /> Quando avisar</h3>
            <p className="text-slate-500 text-xs mb-4">Cada vendedor recebe no sino uma notificação por prazo marcado, só das cidades do cluster dele. Cada prazo avisa uma vez por cidade e por ano.</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {LIMITES_DISPONIVEIS.map(n => (
                <button key={n} onClick={() => alternarLimite(n)} className={`px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest border transition-all ${limites.includes(n) ? 'bg-[#22C55E] text-[#0B1120] border-[#22C55E]' : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'}`}>
                  {n === 0 ? 'No dia' : `${n} dias antes`}
                </button>
              ))}
            </div>
            <button onClick={salvarLimites} disabled={salvandoLimites} className="flex items-center gap-2 bg-[#22C55E] text-[#0B1120] px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50">
              {salvandoLimites ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Salvar prazos
            </button>
          </div>

          {/* Clusters */}
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-5">
            <h3 className="font-black uppercase text-sm text-slate-200 flex items-center gap-2 mb-1"><Users size={14} className="text-[#22C55E]" /> Cluster de cada vendedor</h3>
            <p className="text-slate-500 text-xs mb-4">Sem cidades marcadas, o vendedor recebe as cidades da praça da unidade dele. Marcando cidades, vale só o que você marcar. Diretores recebem tudo.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {vendedores.map(p => {
                const explicito = possuiClusterExplicito(p.id, vinculos);
                const minhas = cidadesDoPerfil(p, cidades, vinculos);
                const pracas = pracasDoTexto(p.unidade);
                return (
                  <div key={p.id} className="bg-black/20 border border-white/5 rounded-2xl p-4 flex flex-col gap-2 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-black text-sm uppercase truncate">{p.nome}</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase">{CARGO_LABEL[p.cargo || ''] || p.cargo} · {p.unidade || 'sem unidade'}</p>
                      </div>
                      {p.cargo !== 'diretor' && <button onClick={() => abrirEdicao(p)} className="shrink-0 text-[10px] font-black uppercase tracking-widest bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg">Editar</button>}
                    </div>
                    <p className="text-xs text-slate-300 flex items-center gap-1.5"><MapPin size={11} className="text-slate-500 shrink-0" />
                      {p.cargo === 'diretor' ? 'Todas as cidades' : explicito ? `${minhas.length} cidade(s) marcadas` : pracas.length ? `Padrão da praça ${pracas.join(' / ')} · ${minhas.length} cidade(s)` : 'Sem cluster — defina a unidade ou marque cidades'}
                    </p>
                    {p.cargo !== 'diretor' && minhas.length > 0 && <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2">{minhas.map(c => c.municipio).join(', ')}</p>}
                    {p.cargo !== 'diretor' && minhas.length === 0 && <p className="text-[10px] text-amber-400 font-bold">Não vai receber nenhum alerta.</p>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Prévia */}
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden">
            <div className="p-5 border-b border-white/5">
              <h3 className="font-black uppercase text-sm text-slate-200 flex items-center gap-2"><Cake size={14} className="text-[#22C55E]" /> Próximos aniversários (90 dias) e quem é avisado</h3>
            </div>
            <div className="divide-y divide-white/5">
              {previa.map(({ c, dias, idade, quem }) => (
                <div key={c.id} className="p-4 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                  <div className="md:w-56 shrink-0">
                    <p className="font-black text-sm uppercase">{c.municipio}</p>
                    <p className="text-[10px] text-slate-500 font-bold">{String(c.dia).padStart(2, '0')}/{String(c.mes).padStart(2, '0')}{idade ? ` · completa ${idade} anos` : ''} · praça {c.praca || '—'}</p>
                  </div>
                  <span className={`shrink-0 text-[10px] font-black uppercase px-2 py-1 rounded border w-fit ${dias <= 7 ? 'text-red-400 border-red-500/30 bg-red-500/10' : dias <= 30 ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' : 'text-slate-300 border-white/10 bg-white/5'}`}>{textoPrazo(dias)}</span>
                  <p className="text-xs text-slate-400 flex-1 min-w-0">{quem.length ? quem.map(q => q.nome).join(', ') : <span className="text-amber-400 font-bold">Ninguém no cluster — nenhum vendedor será avisado.</span>}</p>
                </div>
              ))}
              {previa.length === 0 && <p className="p-8 text-center text-slate-600 text-sm">Nenhum aniversário nos próximos 90 dias.</p>}
            </div>
          </div>
        </div>
      )}

      {editando && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !salvando && setEditando(null)}>
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div><h3 className="font-black uppercase italic">{editando.nome}</h3><p className="text-[10px] text-slate-500 font-bold uppercase">Cidades do cluster · {selecao.size === 0 ? 'nenhuma marcada = padrão da praça' : `${selecao.size} marcada(s)`}</p></div>
              <button onClick={() => setEditando(null)} className="text-slate-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-5">
              {PRACAS.map(praca => {
                const daPraca = cidades.filter(c => pracasDoTexto(c.praca).includes(praca));
                if (daPraca.length === 0) return null;
                const todas = daPraca.every(c => selecao.has(c.id));
                return (
                  <div key={praca}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-black uppercase tracking-widest text-slate-300">Praça {praca}</p>
                      <button onClick={() => marcarPraca(praca, !todas)} className="text-[10px] font-black uppercase text-[#22C55E] hover:underline">{todas ? 'Desmarcar todas' : 'Marcar todas'}</button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {daPraca.map(c => (
                        <button key={c.id} onClick={() => alternarCidade(c.id)} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-xs font-bold transition-all ${selecao.has(c.id) ? 'bg-[#22C55E]/10 border-[#22C55E]/40 text-white' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}>
                          <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${selecao.has(c.id) ? 'bg-[#22C55E] border-[#22C55E]' : 'border-white/20'}`}>{selecao.has(c.id) && <Check size={11} className="text-[#0B1120]" strokeWidth={4} />}</span>
                          <span className="truncate">{c.municipio}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-5 border-t border-white/10 flex gap-3">
              <button onClick={() => setSelecao(new Set())} className="px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest bg-white/5 text-slate-300 hover:bg-white/10">Usar padrão da praça</button>
              <button onClick={salvarCluster} disabled={salvando} className="flex-1 py-3 rounded-xl bg-[#22C55E] text-[#0B1120] font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar cluster
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
