"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, Search, Plus, Save, ChevronRight, Filter } from 'lucide-react';
import ArgusTopNav from '../ArgusTopNav';
import { ArgusEdital, ArgusFiltroBusca, STATUS_INTERESSE_CORES, STATUS_INTERESSE_LABELS, fmtMoeda, fmtData } from '../shared';
import { MODALIDADES_PNCP, PncpContratacao } from '@/lib/pncp';

const ABAS: { key: ArgusEdital['status_interesse'] | 'todos'; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'candidato', label: 'Candidatos' },
  { key: 'acompanhando', label: 'Acompanhando' },
  { key: 'proposta_enviada', label: 'Proposta Enviada' },
  { key: 'ganho', label: 'Ganhos' },
  { key: 'perdido', label: 'Perdidos' },
];

export default function ArgusLicitacoesPage() {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;

  const [editais, setEditais] = useState<ArgusEdital[]>([]);
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState<typeof ABAS[number]['key']>('todos');

  const [filtros, setFiltros] = useState<ArgusFiltroBusca[]>([]);
  const [mostrarBusca, setMostrarBusca] = useState(false);
  const [uf, setUf] = useState('SC');
  const [modalidade, setModalidade] = useState(6);
  const [palavrasChave, setPalavrasChave] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<PncpContratacao[]>([]);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const [salvarFiltro, setSalvarFiltro] = useState(false);
  const [nomeFiltro, setNomeFiltro] = useState('');

  const carregar = async () => {
    if (!perfil?.empresa_id) return;
    setLoading(true);
    const [editaisRes, filtrosRes] = await Promise.all([
      supabase.from('argus_editais').select('*').eq('empresa_id', perfil.empresa_id).order('created_at', { ascending: false }),
      supabase.from('argus_filtros_busca').select('*').eq('empresa_id', perfil.empresa_id).order('created_at', { ascending: false }),
    ]);
    setEditais((editaisRes.data as ArgusEdital[]) || []);
    setFiltros((filtrosRes.data as ArgusFiltroBusca[]) || []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, [perfil?.empresa_id]);

  const buscarPncp = async () => {
    setBuscando(true);
    setErroBusca(null);
    setResultados([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/argus/pncp/buscar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ uf, modalidade, palavras_chave: palavrasChave, dias: 30 }),
      });
      const json = await res.json();
      if (!res.ok) { setErroBusca(json.erro || 'Erro ao buscar no PNCP.'); return; }
      setResultados(json.resultados || []);

      if (salvarFiltro && nomeFiltro.trim() && perfil?.empresa_id) {
        await supabase.from('argus_filtros_busca').insert([{
          empresa_id: perfil.empresa_id, nome: nomeFiltro.trim(), uf, modalidade, palavras_chave: palavrasChave || null,
        }]);
        setSalvarFiltro(false);
        setNomeFiltro('');
        carregar();
      }
    } catch (err: any) {
      setErroBusca(err.message || 'Erro ao buscar no PNCP.');
    } finally {
      setBuscando(false);
    }
  };

  const salvarComoCandidato = async (item: PncpContratacao) => {
    setSalvandoId(item.numeroControlePNCP);
    setErroBusca(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/argus/pncp/salvar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ item }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErroBusca(`Erro ao salvar "${item.orgaoEntidade?.razaoSocial || item.objetoCompra}": ${json.erro || res.statusText}`);
        return;
      }
      await carregar();
    } catch (err: any) {
      setErroBusca(err.message || 'Erro ao salvar o edital.');
    } finally {
      setSalvandoId(null);
    }
  };

  const jaSalvo = (numeroControlePNCP: string) => editais.some(e => e.numero_controle_pncp === numeroControlePNCP);

  const editaisFiltrados = aba === 'todos' ? editais : editais.filter(e => e.status_interesse === aba);

  return (
    <div>
      <ArgusTopNav nomeEmpresa={empresa?.nome} />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#241c14]" style={{ fontFamily: 'var(--font-argus-serif)' }}>Licitações</h1>
            <p className="text-[#9a958a] text-xs font-semibold mt-0.5">{editais.length} edital(is) cadastrado(s)</p>
          </div>
          <button onClick={() => setMostrarBusca(v => !v)} className="inline-flex items-center gap-2 bg-[#d9861c] hover:bg-[#c47716] text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all">
            <Search size={14} /> Buscar no PNCP
          </button>
        </div>

        {mostrarBusca && (
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5 mb-6 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
              <div>
                <label className="text-[9px] font-bold text-[#9a958a] uppercase tracking-wide mb-1 block">UF</label>
                <input value={uf} onChange={e => setUf(e.target.value.toUpperCase().slice(0, 2))} className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:border-[#d9861c]" />
              </div>
              <div>
                <label className="text-[9px] font-bold text-[#9a958a] uppercase tracking-wide mb-1 block">Modalidade</label>
                <select value={modalidade} onChange={e => setModalidade(Number(e.target.value))} className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:border-[#d9861c]">
                  {Object.entries(MODALIDADES_PNCP).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-[9px] font-bold text-[#9a958a] uppercase tracking-wide mb-1 block">Palavras-chave (separadas por vírgula)</label>
                <input value={palavrasChave} onChange={e => setPalavrasChave(e.target.value)} placeholder="ex: instrumentos musicais, transporte"
                  className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:border-[#d9861c]" />
              </div>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-[#6b6862]">
                <input type="checkbox" checked={salvarFiltro} onChange={e => setSalvarFiltro(e.target.checked)} /> Salvar como filtro recorrente (sincronizado automaticamente todo dia)
              </label>
              {salvarFiltro && (
                <input value={nomeFiltro} onChange={e => setNomeFiltro(e.target.value)} placeholder="Nome do filtro"
                  className="bg-[#faf7f2] border border-[#e5e0d5] rounded-lg px-3 py-1.5 text-xs font-semibold outline-none focus:border-[#d9861c]" />
              )}
            </div>
            <button onClick={buscarPncp} disabled={buscando} className="inline-flex items-center gap-2 bg-[#241c14] hover:bg-[#3a2e20] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all">
              {buscando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Buscar agora
            </button>
            {buscando && <p className="text-[#9a958a] text-[11px] font-semibold mt-2">Consultando o PNCP — pode levar alguns segundos, a API do governo às vezes é lenta/instável.</p>}
            {erroBusca && <p className="text-[#d63f3f] text-xs font-semibold mt-2">{erroBusca}</p>}

            {resultados.length > 0 && (
              <div className="mt-5 space-y-2 max-h-96 overflow-y-auto">
                <p className="text-[10px] font-bold text-[#9a958a] uppercase tracking-wide">{resultados.length} resultado(s) — {filtros.length > 0 ? '' : ''}</p>
                {resultados.map(item => (
                  <div key={item.numeroControlePNCP} className="border border-[#e5e0d5] rounded-xl p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#241c14] truncate">{item.orgaoEntidade?.razaoSocial}</p>
                      <p className="text-[11px] text-[#6b6862] truncate">{item.objetoCompra}</p>
                      <p className="text-[10px] text-[#9a958a] font-semibold mt-0.5">{item.unidadeOrgao?.municipioNome}/{item.unidadeOrgao?.ufSigla} · {fmtMoeda(item.valorTotalEstimado)}</p>
                    </div>
                    {jaSalvo(item.numeroControlePNCP) ? (
                      <span className="text-[10px] font-bold text-[#1fa85a] uppercase flex-shrink-0">Já salvo</span>
                    ) : (
                      <button onClick={() => salvarComoCandidato(item)} disabled={salvandoId === item.numeroControlePNCP}
                        className="inline-flex items-center gap-1.5 bg-[#fdf0d4] border border-[#f0d19a] text-[#d9861c] hover:bg-[#d9861c] hover:text-white px-3 py-2 rounded-lg font-bold text-[10px] uppercase tracking-wide transition-all flex-shrink-0">
                        {salvandoId === item.numeroControlePNCP ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 mb-5 overflow-x-auto">
          {ABAS.map(a => (
            <button key={a.key} onClick={() => setAba(a.key)}
              className={`px-3.5 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wide whitespace-nowrap transition-all ${aba === a.key ? 'bg-[#241c14] text-white' : 'bg-white border border-[#e5e0d5] text-[#6b6862] hover:border-[#d9861c]/40'}`}>
              {a.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="p-8 flex justify-center"><Loader2 size={22} className="animate-spin text-[#d9861c]" /></div>
        ) : editaisFiltrados.length === 0 ? (
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-10 text-center">
            <Filter size={28} className="text-[#d9d5c8] mx-auto mb-3" />
            <p className="text-[#6b6862] font-semibold text-sm">Nenhum edital nessa categoria.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {editaisFiltrados.map(edital => (
              <Link key={edital.id} href={`/argus/licitacoes/${edital.id}`} className="bg-white border border-[#e5e0d5] hover:border-[#d9861c]/40 rounded-xl p-4 flex items-center gap-4 transition-all">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-[#241c14] truncate">{edital.orgao || 'Sem órgão'}</p>
                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border flex-shrink-0 ${STATUS_INTERESSE_CORES[edital.status_interesse]}`}>
                      {STATUS_INTERESSE_LABELS[edital.status_interesse]}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#6b6862] truncate mt-0.5">{edital.objeto}</p>
                  <p className="text-[10px] text-[#9a958a] font-semibold mt-1">{edital.modalidade} · {edital.municipio}{edital.uf ? `/${edital.uf}` : ''} · Sessão: {fmtData(edital.data_sessao)}</p>
                </div>
                <p className="text-sm font-bold text-[#241c14] flex-shrink-0">{fmtMoeda(edital.valor_estimado)}</p>
                <ChevronRight size={16} className="text-[#c9c3b5] flex-shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
