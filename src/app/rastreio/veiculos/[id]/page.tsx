"use client";
import { useEffect, useState, useCallback, use } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowLeft, Loader2, Lock, Unlock, Gauge, Power, Battery, MapPin, Cpu, Route, History, AlertTriangle, ExternalLink, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  useRastreioAccess, COLUNAS_VEICULO, situacao, SITUACAO_INFO, haQuanto, fmtDataHora, fmtHora, linkMapa, apiRastreio,
  type Veiculo, type Evento,
} from '../../shared';
import type { PontoTrajeto } from '../../MapaRastreio';

const MapaRastreio = dynamic(() => import('../../MapaRastreio'), { ssr: false });

type Comando = { id: number; tipo: string; status: string; motivo: string | null; detalhe: string | null; velocidade_no_momento: number | null; user_nome: string | null; created_at: string };

const hojeISO = () => new Date().toLocaleDateString('en-CA'); // AAAA-MM-DD no fuso local

// Distância total do trajeto (haversine), em km.
function kmTrajeto(p: PontoTrajeto[]) {
  let total = 0;
  for (let i = 1; i < p.length; i++) {
    const r = Math.PI / 180, a = p[i - 1], b = p[i];
    const h = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lng - a.lng) * r / 2) ** 2;
    total += 12742 * Math.asin(Math.sqrt(h));
  }
  return total;
}

export default function VeiculoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { authLoading, temRastreio, podeBloquear } = useRastreioAccess();

  const [v, setV] = useState<Veiculo | null>(null);
  const [cliente, setCliente] = useState<{ nome: string; telefone: string | null } | null>(null);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [comandos, setComandos] = useState<Comando[]>([]);
  const [dia, setDia] = useState(hojeISO());
  const [trajeto, setTrajeto] = useState<PontoTrajeto[]>([]);
  const [carregandoTrajeto, setCarregandoTrajeto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'bloquear' | 'desbloquear' | null>(null);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('rastreio_veiculos').select(COLUNAS_VEICULO).eq('id', id).maybeSingle();
    setV(data as Veiculo | null);
    setLoading(false);
    return data as Veiculo | null;
  }, [id]);

  const carregarHistorico = useCallback(async () => {
    const [{ data: ev }, { data: cm }] = await Promise.all([
      supabase.from('rastreio_eventos').select('id, veiculo_id, tipo, mensagem, lat, lng, lido, ocorrido_em').eq('veiculo_id', id).order('ocorrido_em', { ascending: false }).limit(40),
      supabase.from('rastreio_comandos').select('id, tipo, status, motivo, detalhe, velocidade_no_momento, user_nome, created_at').eq('veiculo_id', id).order('created_at', { ascending: false }).limit(20),
    ]);
    setEventos((ev as Evento[]) || []);
    setComandos((cm as Comando[]) || []);
  }, [id]);

  useEffect(() => {
    carregar().then(d => {
      if (d?.cliente_id) supabase.from('rastreio_clientes').select('nome, telefone').eq('id', d.cliente_id).maybeSingle().then(({ data }) => setCliente(data));
    });
    carregarHistorico();
    const t = setInterval(() => { if (document.visibilityState === 'visible') carregar(); }, 15000);
    return () => clearInterval(t);
  }, [carregar, carregarHistorico]);

  // Trajeto de um dia (00:00–23:59 local). Limite de segurança: 5.000 pontos (~1 a cada 15s por 20h).
  useEffect(() => {
    setCarregandoTrajeto(true);
    const ini = new Date(`${dia}T00:00:00`), fim = new Date(`${dia}T23:59:59.999`);
    supabase.from('rastreio_posicoes').select('lat, lng, velocidade, registrado_em')
      .eq('veiculo_id', id).gte('registrado_em', ini.toISOString()).lte('registrado_em', fim.toISOString())
      .order('registrado_em').limit(5000)
      .then(({ data }) => { setTrajeto((data as PontoTrajeto[]) || []); setCarregandoTrajeto(false); });
  }, [id, dia]);

  const enviarComando = async () => {
    if (!modal || !v) return;
    setEnviando(true);
    setAviso(null);
    try {
      const r = await apiRastreio('comando', { veiculoId: v.id, tipo: modal, motivo });
      setAviso({ ok: true, texto: r.mensagem || 'Comando enviado.' });
      setModal(null);
      setMotivo('');
      carregar();
    } catch (err) {
      setAviso({ ok: false, texto: (err as Error).message });
    } finally {
      setEnviando(false);
      carregarHistorico();
    }
  };

  if (authLoading || loading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;
  if (!temRastreio || !v) return <div className="p-8 text-slate-400 text-sm">Veículo não encontrado. <Link href="/rastreio" className="text-sky-400 underline">Voltar</Link></div>;

  const s = situacao(v);
  const km = kmTrajeto(trajeto);
  const velMax = trajeto.reduce((m, p) => Math.max(m, Number(p.velocidade || 0)), 0);

  return (
    <div className="md:p-8 pb-20 text-white">
      <Link href="/rastreio" className="inline-flex items-center gap-1 text-xs font-black uppercase text-slate-500 hover:text-white mb-3"><ArrowLeft size={14} /> Frota</Link>

      <header className="mb-4 flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-wider">{v.placa}</h1>
          <p className="text-slate-400 text-sm">{[v.descricao, cliente?.nome].filter(Boolean).join(' · ')}{cliente?.telefone ? ` · ${cliente.telefone}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className={`text-[11px] font-black uppercase px-3 py-1.5 rounded-full border ${SITUACAO_INFO[s].classe}`}>{SITUACAO_INFO[s].label}</span>
          {v.bloqueado && <span className="text-[11px] font-black uppercase px-3 py-1.5 rounded-full border text-red-400 bg-red-500/10 border-red-500/30 inline-flex items-center gap-1"><Lock size={12} /> Bloqueado</span>}
          <Link href={`/rastreio/clientes?veiculo=${v.id}`} className="inline-flex items-center gap-1 text-[11px] font-black uppercase px-3 py-1.5 rounded-full border border-white/10 text-slate-300 hover:bg-white/5"><Pencil size={12} /> Editar</Link>
        </div>
      </header>

      {aviso && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-bold ${aviso.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>{aviso.texto}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Info icone={<Gauge size={14} />} label="Velocidade" valor={`${Math.round(Number(v.ultima_velocidade || 0))} km/h`} />
        <Info icone={<Power size={14} />} label="Ignição" valor={v.ignicao == null ? '—' : v.ignicao ? 'Ligada' : 'Desligada'} destaque={v.ignicao ? 'text-emerald-400' : undefined} />
        <Info icone={<Battery size={14} />} label="Bateria do veículo" valor={v.bateria_externa != null ? `${Number(v.bateria_externa).toFixed(1)} V` : '—'} />
        <Info icone={<MapPin size={14} />} label="Última posição" valor={haQuanto(v.ultima_posicao_em)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1"><Route size={13} /> Trajeto do dia</label>
            <input type="date" value={dia} max={hojeISO()} onChange={e => setDia(e.target.value || hojeISO())}
              className="bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white outline-none [color-scheme:dark]" />
            <span className="text-xs text-slate-400">
              {carregandoTrajeto ? 'carregando…' : trajeto.length ? `${km.toFixed(1)} km · máx ${Math.round(velMax)} km/h · ${trajeto.length} pontos · ${fmtHora(trajeto[0].registrado_em!)}–${fmtHora(trajeto[trajeto.length - 1].registrado_em!)}` : 'sem deslocamento registrado'}
            </span>
            {v.ultima_lat != null && (
              <a href={linkMapa(v.ultima_lat, v.ultima_lng!)} target="_blank" rel="noreferrer" className="ml-auto text-[11px] font-black uppercase text-sky-400 hover:underline inline-flex items-center gap-1">Abrir no Google Maps <ExternalLink size={11} /></a>
            )}
          </div>
          <MapaRastreio veiculos={[v]} selecionadoId={v.id} trajeto={trajeto} chaveEnquadrar={`${dia}|${trajeto.length > 0}`} altura="h-[55vh] min-h-[320px]" />
        </div>

        <div className="space-y-4">
          <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2"><Lock size={13} /> Bloqueio</p>
            {!v.tem_bloqueio ? (
              <p className="text-xs text-slate-500">Este veículo foi instalado sem relé de bloqueio.</p>
            ) : !podeBloquear ? (
              <p className="text-xs text-slate-500">Só diretor ou gerente pode bloquear/desbloquear.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setModal('bloquear'); setMotivo(''); }} className="flex items-center justify-center gap-2 bg-red-500 text-white rounded-xl py-3 font-black text-xs uppercase hover:brightness-110"><Lock size={14} /> Bloquear</button>
                <button onClick={() => { setModal('desbloquear'); setMotivo(''); }} className="flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-slate-200 rounded-xl py-3 font-black text-xs uppercase hover:bg-white/10"><Unlock size={14} /> Desbloquear</button>
              </div>
            )}
            <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">Por segurança, o bloqueio só é enviado com o veículo abaixo de 20 km/h e posição de até 10 min. Tudo fica registrado abaixo.</p>
            {comandos.length > 0 && (
              <ul className="mt-3 divide-y divide-white/5 text-xs">
                {comandos.map(c => (
                  <li key={c.id} className="py-2">
                    <p className="font-bold"><span className={c.tipo === 'bloquear' ? 'text-red-400' : 'text-slate-200'}>{c.tipo === 'bloquear' ? 'Bloqueio' : 'Desbloqueio'}</span>
                      {' · '}<span className={c.status === 'enviado' ? 'text-emerald-400' : 'text-amber-400'}>{c.status}</span></p>
                    <p className="text-slate-400">{c.user_nome} · {fmtDataHora(c.created_at)}{c.velocidade_no_momento != null ? ` · ${Math.round(Number(c.velocidade_no_momento))} km/h` : ''}</p>
                    {c.motivo && <p className="text-slate-500">Motivo: {c.motivo}</p>}
                    {c.detalhe && <p className="text-slate-500">{c.detalhe}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2"><History size={13} /> Eventos</p>
            {eventos.length === 0 ? <p className="text-xs text-slate-500">Nenhum evento ainda.</p> : (
              <ul className="divide-y divide-white/5 text-xs max-h-72 overflow-y-auto">
                {eventos.map(e => (
                  <li key={e.id} className="py-2 flex justify-between gap-2">
                    <span className={e.tipo === 'alarme' ? 'text-red-300 font-bold' : 'text-slate-300'}>{e.mensagem.replace(`${v.placa}: `, '')}</span>
                    <span className="text-slate-500 shrink-0">{fmtDataHora(e.ocorrido_em)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4 text-xs space-y-1.5">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2"><Cpu size={13} /> Aparelho</p>
            <Linha k="IMEI" v={v.imei} />
            <Linha k="Modelo" v={v.modelo_rastreador} />
            <Linha k="Chip" v={[v.chip_numero, v.chip_operadora].filter(Boolean).join(' · ')} />
            <Linha k="Instalação" v={[v.instalado_em ? new Date(`${v.instalado_em}T12:00:00`).toLocaleDateString('pt-BR') : null, v.instalado_por].filter(Boolean).join(' · ')} />
            <Linha k="Limite de velocidade" v={v.limite_velocidade ? `${v.limite_velocidade} km/h` : 'sem alerta'} />
            <Linha k="Servidor" v={v.traccar_device_id ? `vinculado (#${v.traccar_device_id})` : 'aguardando 1º sinal'} />
          </div>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => !enviando && setModal(null)}>
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className={`text-xl font-black uppercase mb-2 flex items-center gap-2 ${modal === 'bloquear' ? 'text-red-400' : 'text-white'}`}>
              {modal === 'bloquear' ? <><AlertTriangle size={20} /> Bloquear {v.placa}?</> : <><Unlock size={20} /> Desbloquear {v.placa}?</>}
            </h2>
            <p className="text-sm text-slate-400 mb-4">
              {modal === 'bloquear'
                ? `O veículo fica sem conseguir dar partida. Agora: ${Math.round(Number(v.ultima_velocidade || 0))} km/h, posição ${haQuanto(v.ultima_posicao_em)}.`
                : 'O veículo volta a funcionar normalmente.'}
            </p>
            <label className="text-[10px] font-black uppercase text-slate-500">Motivo (fica registrado)</label>
            <input autoFocus value={motivo} onChange={e => setMotivo(e.target.value)} placeholder={modal === 'bloquear' ? 'Ex.: roubo informado pelo cliente' : 'Ex.: veículo recuperado'}
              className="w-full mt-1 mb-4 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-sky-400" />
            <div className="flex gap-2">
              <button onClick={() => setModal(null)} disabled={enviando} className="flex-1 bg-white/5 border border-white/10 rounded-xl py-3 font-black text-xs uppercase">Cancelar</button>
              <button onClick={enviarComando} disabled={enviando || !motivo.trim()}
                className={`flex-1 rounded-xl py-3 font-black text-xs uppercase disabled:opacity-40 flex items-center justify-center gap-2 ${modal === 'bloquear' ? 'bg-red-500 text-white' : 'bg-sky-400 text-[#0B1120]'}`}>
                {enviando && <Loader2 size={14} className="animate-spin" />} Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ icone, label, valor, destaque }: { icone: React.ReactNode; label: string; valor: string; destaque?: string }) {
  return (
    <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-1">{icone} {label}</p>
      <p className={`text-lg font-black ${destaque || 'text-white'}`}>{valor}</p>
    </div>
  );
}

function Linha({ k, v }: { k: string; v: string | null | undefined }) {
  return <p className="flex justify-between gap-3"><span className="text-slate-500">{k}</span><span className="text-slate-200 text-right break-all">{v || '—'}</span></p>;
}
