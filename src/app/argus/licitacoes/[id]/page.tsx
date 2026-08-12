"use client";
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, ArrowLeft, ExternalLink, AlertTriangle, CheckCircle2, Info, HardHat, ChevronRight } from 'lucide-react';
import ArgusTopNav from '../../ArgusTopNav';
import {
  ArgusEdital, ArgusEvento, ArgusAlerta, STATUS_INTERESSE_CORES, STATUS_INTERESSE_LABELS,
  SEVERIDADE_CORES, fmtMoeda, fmtData, calcularAlertasAutomaticos,
} from '../../shared';

const TODOS_STATUS: ArgusEdital['status_interesse'][] = ['candidato', 'acompanhando', 'proposta_enviada', 'ganho', 'perdido', 'arquivado'];

export default function ArgusEditalDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const isLideranca = perfil?.cargo === 'diretor' || perfil?.cargo === 'gerente';
  const temObras = Boolean(empresa?.modulos?.obras);

  const [edital, setEdital] = useState<ArgusEdital | null>(null);
  const [eventos, setEventos] = useState<ArgusEvento[]>([]);
  const [alertasSalvos, setAlertasSalvos] = useState<ArgusAlerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [obraVinculada, setObraVinculada] = useState<{ id: number; nome: string } | null>(null);
  const [criandoObra, setCriandoObra] = useState(false);

  const carregar = async () => {
    if (!perfil?.empresa_id || !id) return;
    setLoading(true);
    const [editalRes, eventosRes, alertasRes, obraRes] = await Promise.all([
      supabase.from('argus_editais').select('*').eq('id', id).eq('empresa_id', perfil.empresa_id).single(),
      supabase.from('argus_edital_eventos').select('*').eq('edital_id', id).order('data_evento', { ascending: false }),
      supabase.from('argus_edital_alertas').select('*').eq('edital_id', id).eq('resolvido', false),
      supabase.from('obras').select('id, nome').eq('edital_id', id).eq('empresa_id', perfil.empresa_id).maybeSingle(),
    ]);
    setEdital(editalRes.data as ArgusEdital);
    setEventos((eventosRes.data as ArgusEvento[]) || []);
    setAlertasSalvos((alertasRes.data as ArgusAlerta[]) || []);
    setObraVinculada(obraRes.data as { id: number; nome: string } | null);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, [perfil?.empresa_id, id]);

  const criarObraApartirDoEdital = async () => {
    if (!edital || !perfil?.empresa_id) return;
    setCriandoObra(true);
    const nome = edital.orgao ? `${edital.orgao} — ${edital.objeto?.slice(0, 60) || 'Obra'}` : (edital.objeto?.slice(0, 80) || `Obra do edital #${edital.id}`);
    const { data, error } = await supabase.from('obras').insert([{
      empresa_id: perfil.empresa_id,
      edital_id: edital.id,
      nome,
      endereco: edital.municipio ? `${edital.municipio}${edital.uf ? `/${edital.uf}` : ''}` : null,
      status: 'planejamento',
      valor_orcado_total: edital.valor_homologado || edital.valor_proposto || edital.valor_estimado || null,
    }]).select().single();
    setCriandoObra(false);
    if (error) { alert('Erro ao criar obra: ' + error.message); return; }
    router.push(`/argus/obras/${data.id}`);
  };

  const atualizarCampo = async (campos: Partial<ArgusEdital>) => {
    if (!edital) return;
    setEdital({ ...edital, ...campos });
    await supabase.from('argus_editais').update({ ...campos, updated_at: new Date().toISOString() }).eq('id', edital.id);
  };

  if (loading) return <div><ArgusTopNav nomeEmpresa={empresa?.nome} /><div className="p-8 flex justify-center"><Loader2 size={22} className="animate-spin text-[#d9861c]" /></div></div>;

  if (!edital) {
    return (
      <div>
        <ArgusTopNav nomeEmpresa={empresa?.nome} />
        <div className="max-w-[1400px] mx-auto px-6 py-10 text-center text-[#6b6862] font-semibold">Edital não encontrado.</div>
      </div>
    );
  }

  const alertasAutomaticos = calcularAlertasAutomaticos(edital).map((a, i) => ({ ...a, id: -1 - i, automatico: true }));
  const todosAlertas = [...alertasSalvos.map(a => ({ ...a, automatico: false })), ...alertasAutomaticos];

  return (
    <div>
      <ArgusTopNav nomeEmpresa={empresa?.nome} />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <Link href="/argus/licitacoes" className="inline-flex items-center gap-2 text-[#9a958a] hover:text-[#241c14] text-xs font-bold uppercase tracking-widest mb-6">
          <ArrowLeft size={14} /> Voltar
        </Link>

        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <p className="text-[12px] font-bold text-[#9a958a] uppercase tracking-wide">{edital.modalidade} · {edital.municipio}{edital.uf ? `/${edital.uf}` : ''}</p>
            <h1 className="text-2xl font-bold text-[#241c14] mt-1" style={{ fontFamily: 'var(--font-argus-serif)' }}>{edital.orgao || 'Edital'}</h1>
            <p className="text-sm text-[#6b6862] mt-1 max-w-2xl">{edital.objeto}</p>
          </div>
          <select
            value={edital.status_interesse}
            disabled={!isLideranca}
            onChange={e => atualizarCampo({ status_interesse: e.target.value as ArgusEdital['status_interesse'] })}
            className={`text-[12px] font-bold uppercase px-3 py-2 rounded-full border outline-none flex-shrink-0 ${STATUS_INTERESSE_CORES[edital.status_interesse]}`}
          >
            {TODOS_STATUS.map(s => <option key={s} value={s}>{STATUS_INTERESSE_LABELS[s]}</option>)}
          </select>
        </div>

        {temObras && edital.status_interesse === 'ganho' && (
          obraVinculada ? (
            <Link href={`/argus/obras/${obraVinculada.id}`} className="mb-5 flex items-center justify-between gap-3 bg-[#d9f2e3] border border-[#b8e6cb] rounded-2xl p-5 hover:border-[#1fa85a]/60 transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center flex-shrink-0"><HardHat size={18} className="text-[#1fa85a]" /></div>
                <div>
                  <p className="text-sm font-bold text-[#241c14]">Obra vinculada: {obraVinculada.nome}</p>
                  <p className="text-[12px] text-[#6b6862] font-semibold">Cronograma, medições e contratados já estão sendo acompanhados lá.</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-[#1fa85a] flex-shrink-0" />
            </Link>
          ) : (
            <div className="mb-5 flex items-center justify-between gap-3 bg-[#fdf0d4] border border-[#f0d19a] rounded-2xl p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center flex-shrink-0"><HardHat size={18} className="text-[#d9861c]" /></div>
                <div>
                  <p className="text-sm font-bold text-[#241c14]">Edital ganho — criar a obra correspondente?</p>
                  <p className="text-[12px] text-[#6b6862] font-semibold">Leva órgão, endereço e valor pro cadastro da obra automaticamente.</p>
                </div>
              </div>
              {isLideranca && (
                <button onClick={criarObraApartirDoEdital} disabled={criandoObra}
                  className="inline-flex items-center gap-2 bg-[#d9861c] hover:bg-[#c47716] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all flex-shrink-0">
                  {criandoObra ? <Loader2 size={14} className="animate-spin" /> : <HardHat size={14} />} Criar Obra
                </button>
              )}
            </div>
          )
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5">
            <p className="text-[12px] font-bold text-[#9a958a] uppercase tracking-wide mb-3">Dados do Edital</p>
            <dl className="space-y-2.5 text-xs">
              <Linha label="Processo" valor={edital.numero_processo} />
              <Linha label="Órgão" valor={edital.orgao} />
              <Linha label="Valor estimado" valor={fmtMoeda(edital.valor_estimado)} />
              <Linha label="Sessão pública" valor={fmtData(edital.data_sessao)} />
              <Linha label="Encerramento proposta" valor={fmtData(edital.data_encerramento_proposta)} />
              <Linha label="Status no PNCP" valor={edital.estagio_processo} />
              {edital.link_pncp && (
                <a href={edital.link_pncp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[#d9861c] font-bold text-[13px] mt-2">
                  Ver no PNCP <ExternalLink size={11} />
                </a>
              )}
            </dl>
          </div>

          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5">
            <p className="text-[12px] font-bold text-[#9a958a] uppercase tracking-wide mb-3">Situação Financeira</p>
            <div className="space-y-3">
              <Campo label="Valor proposto" valor={edital.valor_proposto} editavel={isLideranca} onSalvar={v => atualizarCampo({ valor_proposto: v })} />
              <Campo label="Margem estimada (%)" valor={edital.margem_estimada} editavel={isLideranca} onSalvar={v => atualizarCampo({ margem_estimada: v })} />
              <Campo label="Concorrentes" valor={edital.concorrentes} editavel={isLideranca} onSalvar={v => atualizarCampo({ concorrentes: v })} />
              <div>
                <label className="text-[11px] font-bold text-[#9a958a] uppercase tracking-wide block mb-1">Posição atual</label>
                <input defaultValue={edital.posicao_atual || ''} disabled={!isLideranca} onBlur={e => atualizarCampo({ posicao_atual: e.target.value })}
                  className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:border-[#d9861c]" />
              </div>
            </div>
          </div>

          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5">
            <p className="text-[12px] font-bold text-[#9a958a] uppercase tracking-wide mb-3">Alertas Operacionais</p>
            {todosAlertas.length === 0 ? (
              <p className="text-[13px] text-[#9a958a] font-semibold flex items-center gap-1.5"><CheckCircle2 size={13} className="text-[#1fa85a]" /> Nenhum alerta ativo.</p>
            ) : (
              <div className="space-y-2">
                {todosAlertas.map(a => (
                  <div key={a.id} className={`flex items-start gap-2 p-2.5 rounded-lg border text-[13px] font-semibold ${SEVERIDADE_CORES[a.severidade]}`}>
                    <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                    <span>{a.mensagem}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5 mt-5">
          <p className="text-[12px] font-bold text-[#9a958a] uppercase tracking-wide mb-3">Linha do Tempo</p>
          {eventos.length === 0 ? (
            <p className="text-[13px] text-[#9a958a] font-semibold flex items-center gap-1.5"><Info size={13} /> Sem eventos registrados ainda — o cron de sincronização diária registra mudanças de status automaticamente.</p>
          ) : (
            <div className="space-y-3">
              {eventos.map(ev => (
                <div key={ev.id} className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#d9861c] mt-1.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-[#241c14]">{ev.titulo}</p>
                    {ev.descricao && <p className="text-[13px] text-[#6b6862]">{ev.descricao}</p>}
                    <p className="text-[11px] text-[#9a958a] font-semibold mt-0.5">{fmtData(ev.data_evento)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Linha({ label, valor }: { label: string; valor?: string | null }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[#9a958a] font-semibold">{label}</dt>
      <dd className="text-[#241c14] font-bold text-right">{valor || '—'}</dd>
    </div>
  );
}

function Campo({ label, valor, editavel, onSalvar }: { label: string; valor: number | null; editavel: boolean; onSalvar: (v: number) => void }) {
  return (
    <div>
      <label className="text-[11px] font-bold text-[#9a958a] uppercase tracking-wide block mb-1">{label}</label>
      <input type="number" defaultValue={valor ?? ''} disabled={!editavel} onBlur={e => onSalvar(Number(e.target.value))}
        className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:border-[#d9861c]" />
    </div>
  );
}
