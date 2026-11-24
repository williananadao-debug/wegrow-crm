"use client";
import { useCallback, useEffect, useState } from 'react';
import { Cpu, Loader2, RefreshCw, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { apiRastreio, fmtDataHora, type Veiculo } from '../../shared';

type Resposta = { id: number; mensagem: string; ocorrido_em: string };
type Enviado = { id: number; comando: string | null; motivo: string | null; status: string; detalhe: string | null; user_nome: string | null; created_at: string };

const RAPIDOS: { k: string; t: string }[] = [
  { k: 'localizar', t: 'Localizar agora' }, { k: 'status', t: 'Status' }, { k: 'parametros', t: 'Parâmetros' },
  { k: 'rede', t: 'Servidor e APN' }, { k: 'versao', t: 'Versão' },
];

// Comandos do rastreador pela internet (GT06/Concox: o mesmo texto do SMS, sem gastar SMS).
// A resposta chega como evento "resposta_aparelho" alguns segundos depois.
export default function Aparelho({ v }: { v: Veiculo }) {
  const [aberto, setAberto] = useState(false);
  const [respostas, setRespostas] = useState<Resposta[]>([]);
  const [enviados, setEnviados] = useState<Enviado[]>([]);
  const [ocupado, setOcupado] = useState('');
  const [aviso, setAviso] = useState<{ ok: boolean; t: string } | null>(null);
  const [tLigado, setTLigado] = useState(30);
  const [tDesligado, setTDesligado] = useState(300);
  const [kmh, setKmh] = useState(Number(v.limite_velocidade) || 100);
  const [sos, setSos] = useState(['', '', '']);
  const [raio, setRaio] = useState(200);
  const [porSms, setPorSms] = useState(false);
  const [graus, setGraus] = useState(30);
  const [metros, setMetros] = useState(300);
  const [hbt, setHbt] = useState(5);

  const carregar = useCallback(async () => {
    const [{ data: r }, { data: e }] = await Promise.all([
      supabase.from('rastreio_eventos').select('id, mensagem, ocorrido_em').eq('veiculo_id', v.id).eq('tipo', 'resposta_aparelho').order('ocorrido_em', { ascending: false }).limit(8),
      supabase.from('rastreio_comandos').select('id, comando, motivo, status, detalhe, user_nome, created_at').eq('veiculo_id', v.id).eq('tipo', 'configurar').order('created_at', { ascending: false }).limit(8),
    ]);
    setRespostas((r as Resposta[]) || []);
    setEnviados((e as Enviado[]) || []);
  }, [v.id]);

  useEffect(() => { if (aberto) void Promise.resolve().then(carregar); }, [aberto, carregar]);
  // Depois de mandar, olha de novo algumas vezes para pegar a resposta
  useEffect(() => {
    if (!aberto || !enviados[0] || Date.now() - Date.parse(enviados[0].created_at) > 90_000) return;
    const t = setInterval(carregar, 5000);
    return () => clearInterval(t);
  }, [aberto, enviados, carregar]);

  const enviar = async (comando: string, params?: Record<string, unknown>, confirmar?: string) => {
    if (confirmar && !confirm(confirmar)) return;
    setOcupado(comando); setAviso(null);
    try {
      const r = await apiRastreio('aparelho', { veiculoId: v.id, comando, params });
      setAviso({ ok: true, t: `${r.texto}: ${r.mensagem}` });
      await carregar();
    } catch (e) { setAviso({ ok: false, t: (e as Error).message }); }
    finally { setOcupado(''); }
  };

  const btn = 'bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[11px] font-black uppercase disabled:opacity-40 inline-flex items-center gap-1';
  const num = 'w-20 bg-white/[0.03] border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white';

  return (
    <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
      <button onClick={() => setAberto(a => !a)} className="w-full flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-slate-400">
        <span className="flex items-center gap-2"><Cpu size={13} /> Comandos do aparelho</span>
        {aberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {aberto && (
        <div className="mt-3 space-y-4 text-sm">
          <p className="text-[11px] text-slate-500">Vão pela internet (sem SMS). Funcionam nos rastreadores da família GT06; o texto exato muda um pouco por modelo/firmware: se ele não aceitar, a resposta abaixo vem com erro ou não vem. Mande &quot;Parâmetros&quot; antes para ver o que o aparelho suporta.</p>
          {aviso && <p className={`text-xs font-bold ${aviso.ok ? 'text-emerald-300' : 'text-red-300'}`}>{aviso.t}</p>}

          <div className="flex flex-wrap gap-2">
            {RAPIDOS.map(c => (
              <button key={c.k} onClick={() => enviar(c.k)} disabled={!!ocupado} className={btn}>
                {ocupado === c.k && <Loader2 size={12} className="animate-spin" />}{c.t}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase text-slate-500">Intervalo de envio de posição</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              ligado <input type="number" value={tLigado} onChange={e => setTLigado(Number(e.target.value))} className={num} /> s
              desligado <input type="number" value={tDesligado} onChange={e => setTDesligado(Number(e.target.value))} className={num} /> s
              <button onClick={() => enviar('intervalo', { ligado: tLigado, desligado: tDesligado })} disabled={!!ocupado} className={btn}>{ocupado === 'intervalo' && <Loader2 size={12} className="animate-spin" />}Aplicar</button>
            </div>
            <p className="text-[11px] text-slate-500">Menor = trajeto mais detalhado, mais dados do chip. Comum: 30 s ligado, 300 s desligado.</p>
          </div>

          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase text-slate-500">Alarme de velocidade no próprio aparelho</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              acima de <input type="number" value={kmh} onChange={e => setKmh(Number(e.target.value))} className={num} /> km/h
              <button onClick={() => enviar('velocidade', { kmh, segundos: 20, ativo: true })} disabled={!!ocupado} className={btn}>Ligar</button>
              <button onClick={() => enviar('velocidade', { ativo: false })} disabled={!!ocupado} className={btn}>Desligar</button>
            </div>
            <p className="text-[11px] text-slate-500">O alerta de velocidade do sistema (limite do cadastro) já funciona sem isso; este faz o aparelho avisar mesmo sem servidor.</p>
          </div>

          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase text-slate-500">Números SOS (recebem SMS de alarme do aparelho)</p>
            <div className="flex flex-wrap items-center gap-2">
              {sos.map((n, i) => (
                <input key={i} value={n} onChange={e => setSos(s => s.map((x, j) => (j === i ? e.target.value.replace(/\D/g, '').slice(0, 13) : x)))} placeholder={`Celular ${i + 1} com DDD`} inputMode="numeric"
                  className="w-40 bg-white/[0.03] border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white" />
              ))}
              <button onClick={() => enviar('sos', { numeros: sos.filter(Boolean) })} disabled={!!ocupado || !sos.some(Boolean)} className={btn}>Gravar</button>
              <button onClick={() => enviar('sos_limpar', undefined, 'Apagar os números SOS do aparelho?')} disabled={!!ocupado} className={btn}>Apagar</button>
            </div>
          </div>

          <div className="space-y-2 border-t border-white/5 pt-3">
            <p className="text-[10px] font-black uppercase text-slate-500">Segurança no próprio aparelho</p>
            <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={porSms} onChange={e => setPorSms(e.target.checked)} className="accent-sky-400" /> Mandar estes alarmes também por SMS para os números SOS</label>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              Vigilância (âncora): alarme se andar mais de <input type="number" value={raio} onChange={e => setRaio(Number(e.target.value))} className={num} /> m
              <button onClick={() => enviar('vigilancia', { ativo: true, metros: raio, sms: porSms })} disabled={!!ocupado} className={btn}>Ligar</button>
              <button onClick={() => enviar('vigilancia', { ativo: false })} disabled={!!ocupado} className={btn}>Desligar</button>
            </div>
            {([['vibracao', 'Alarme de vibração (mexeram no carro desligado)'], ['alarme_energia', 'Alarme de corte de energia (arrancaram o fio)'], ['alarme_bateria', 'Alarme de bateria interna baixa'], ['alarme_ignicao', 'Alarme de ignição no aparelho']] as const).map(([k, t]) => (
              <div key={k} className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                <span className="min-w-[230px]">{t}</span>
                <button onClick={() => enviar(k, { ativo: true, sms: porSms })} disabled={!!ocupado} className={btn}>Ligar</button>
                <button onClick={() => enviar(k, { ativo: false })} disabled={!!ocupado} className={btn}>Desligar</button>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t border-white/5 pt-3">
            <p className="text-[10px] font-black uppercase text-slate-500">Precisão do trajeto e consumo do chip</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              Ponto a cada curva de <input type="number" value={graus} onChange={e => setGraus(Number(e.target.value))} className={num} /> graus
              <button onClick={() => enviar('curva', { ativo: true, graus })} disabled={!!ocupado} className={btn}>Ligar</button>
              <button onClick={() => enviar('curva', { ativo: false })} disabled={!!ocupado} className={btn}>Desligar</button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              Também a cada <input type="number" value={metros} onChange={e => setMetros(Number(e.target.value))} className={num} /> metros
              <button onClick={() => enviar('distancia', { ativo: true, metros })} disabled={!!ocupado} className={btn}>Aplicar</button>
              <button onClick={() => enviar('distancia', { ativo: false })} disabled={!!ocupado} className={btn}>Desligar</button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              Sinal de vida parado a cada <input type="number" value={hbt} onChange={e => setHbt(Number(e.target.value))} className={num} /> min
              <button onClick={() => enviar('sinal_vida', { minutos: hbt })} disabled={!!ocupado} className={btn}>Aplicar</button>
            </div>
            <p className="text-[11px] text-slate-500">Curva de 30° deixa o trajeto colado nas ruas gastando pouco dado. Sinal de vida menor detecta mais rápido quando o aparelho cai.</p>
          </div>

          {v.chip_numero && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100 space-y-1">
              <p className="font-black uppercase text-[10px] text-amber-300 flex items-center gap-1"><MessageSquare size={12} /> Plano B sem internet (SMS)</p>
              <p>Se o chip estiver sem dados, mande por SMS para <b>{v.chip_numero}</b>: <b>WHERE#</b> (coordenadas) ou <b>URL#</b> (link do mapa). Use um celular Android (no iPhone pode ir como iMessage).</p>
              <a href={`sms:${String(v.chip_numero).replace(/\D/g, '')}?body=${encodeURIComponent('URL#')}`} className="inline-block mt-1 bg-amber-500/20 border border-amber-500/40 rounded-lg px-3 py-1.5 font-black uppercase text-[10px]">Abrir SMS com URL#</a>
            </div>
          )}

          <div>
            <button onClick={() => enviar('reiniciar', undefined, `Reiniciar o rastreador de ${v.placa}? Ele fica ~1 minuto sem comunicar.`)} disabled={!!ocupado}
              className="bg-red-600/15 border border-red-500/30 text-red-300 rounded-lg px-3 py-2 text-[11px] font-black uppercase disabled:opacity-40">Reiniciar aparelho</button>
          </div>

          <div className="border-t border-white/5 pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-black uppercase text-slate-500">Respostas do aparelho</p>
              <button onClick={carregar} className="text-slate-500 hover:text-white" aria-label="Atualizar"><RefreshCw size={12} /></button>
            </div>
            {respostas.length === 0 ? <p className="text-xs text-slate-500">Nenhuma resposta ainda.</p> : (
              <ul className="space-y-2">
                {respostas.map(r => (
                  <li key={r.id} className="text-xs">
                    <p className="text-slate-500">{fmtDataHora(r.ocorrido_em)}</p>
                    <p className="font-mono text-slate-200 break-all whitespace-pre-wrap">{r.mensagem.replace(/^[^:]+: resposta do aparelho:?\s*/, '') || '(sem texto)'}</p>
                  </li>
                ))}
              </ul>
            )}
            {enviados.length > 0 && (
              <details className="mt-3">
                <summary className="text-[10px] font-black uppercase text-slate-500 cursor-pointer">Comandos enviados</summary>
                <ul className="mt-2 space-y-1 text-xs text-slate-400">
                  {enviados.map(e => (
                    <li key={e.id}><span className="font-mono text-slate-200">{e.comando}</span> · {e.user_nome} · {fmtDataHora(e.created_at)}{e.status === 'erro' ? ` · ERRO: ${e.detalhe}` : ''}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
