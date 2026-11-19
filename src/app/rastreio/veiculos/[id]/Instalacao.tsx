"use client";
import { useCallback, useEffect, useState } from 'react';
import { Wrench, RefreshCw, Loader2, CheckCircle2, Circle, AlertTriangle, Copy, MessageSquare, ChevronDown } from 'lucide-react';
import { apiRastreio, haQuanto, type Veiculo } from '../../shared';

type Diag = {
  configurado: boolean; host?: string; ip?: string | null; erro?: string; consultadoEm?: string;
  traccar?: { cadastrado: boolean; deviceId?: number; status?: string; ultimaConexao?: string | null; protocolo?: string | null; ultimoGps?: string | null; gpsValido?: boolean | null; satelites?: number | null; sinal?: number | null };
};

// APNs das operadoras (chip comum). Chip M2M usa a APN do fornecedor.
const APNS: Record<string, { apn: string; user: string; pass: string }> = {
  claro: { apn: 'claro.com.br', user: 'claro', pass: 'claro' },
  vivo: { apn: 'zap.vivo.com.br', user: 'vivo', pass: 'vivo' },
  tim: { apn: 'timbrasil.br', user: 'tim', pass: 'tim' },
  oi: { apn: 'gprs.oi.com.br', user: 'oi', pass: 'oi' },
};

type Perfil = 'gt06' | 'senha';
const PERFIS: Record<Perfil, { nome: string; porta: number }> = {
  gt06: { nome: 'J16 / GT06 / Concox (comandos com #)', porta: 5023 },
  senha: { nome: 'Modelos com senha 123456 (TK / H02)', porta: 5013 },
};

function comandos(perfil: Perfil, ip: string, apn: { apn: string; user: string; pass: string }) {
  const porta = PERFIS[perfil].porta;
  if (perfil === 'gt06') return [
    { o: 'Internet do chip (APN)', c: `APN,${apn.apn},${apn.user},${apn.pass}#` },
    { o: 'Servidor de rastreio', c: `SERVER,0,${ip},${porta},0#` },
    { o: 'Envio: 30 s andando, 3 min parado', c: 'TIMER,30,180#' },
    { o: 'Reiniciar para aplicar', c: 'RESET#' },
    { o: 'Conferir conexão (GPRS/GPS)', c: 'STATUS#' },
    { o: 'Conferir configuração', c: 'PARAM#' },
  ];
  return [
    { o: 'Internet do chip (APN)', c: `apn123456 ${apn.apn}` },
    { o: 'Usuário/senha da APN', c: `apnuser123456 ${apn.user}` },
    { o: 'Servidor de rastreio', c: `adminip123456 ${ip} ${porta}` },
    { o: 'Ligar envio pela internet', c: 'gprs123456' },
    { o: 'Envio a cada 30 s', c: 'fix030s***n123456' },
    { o: 'Conferir', c: 'check123456' },
  ];
}

function operadoraDe(texto: string | null) {
  const t = (texto || '').toLowerCase();
  return Object.keys(APNS).find(k => t.includes(k)) || 'claro';
}

export default function Instalacao({ v }: { v: Veiculo }) {
  const nuncaComunicou = !v.ultima_comunicacao_em;
  const [aberto, setAberto] = useState(nuncaComunicou);
  const [diag, setDiag] = useState<Diag | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [perfil, setPerfil] = useState<Perfil>(/gt06|j16|concox|jimi/i.test(v.modelo_rastreador || 'j16') ? 'gt06' : 'senha');
  const [operadora, setOperadora] = useState(operadoraDe(v.chip_operadora));
  const [copiado, setCopiado] = useState('');

  const verificar = useCallback(async () => {
    setCarregando(true);
    try { setDiag(await apiRastreio('diagnostico', { veiculoId: v.id })); }
    catch (e) { setDiag({ configurado: true, erro: (e as Error).message }); }
    finally { setCarregando(false); }
  }, [v.id]);

  useEffect(() => { if (aberto && !diag) void Promise.resolve().then(verificar); }, [aberto, diag, verificar]);

  const t = diag?.traccar;
  const status = t?.status;
  const passos = [
    { ok: Boolean(t?.cadastrado), txt: 'Aparelho cadastrado no servidor', det: t?.deviceId ? `#${t.deviceId}` : '' },
    { ok: status === 'online' || Boolean(t?.ultimaConexao), txt: 'Aparelho conectou no servidor',
      det: status === 'online' ? 'conectado agora' : t?.ultimaConexao ? `última conexão ${haQuanto(t.ultimaConexao)}` : 'nunca conectou' },
    { ok: Boolean(t?.ultimoGps) && t?.gpsValido !== false, txt: 'GPS enviou posição',
      det: t?.ultimoGps ? `${haQuanto(t.ultimoGps)}${t.satelites != null ? ` · ${t.satelites} satélites` : ''}${t.protocolo ? ` · ${t.protocolo}` : ''}` : 'sem posição ainda' },
    { ok: Boolean(v.ultima_posicao_em), txt: 'Posição chegou no WeGrow', det: v.ultima_posicao_em ? haQuanto(v.ultima_posicao_em) : 'aguardando' },
  ];
  const dica = !diag ? null
    : t?.protocolo === 'osmand' ? 'A última posição veio de um TESTE (celular/navegador, protocolo osmand), não do rastreador. Para o aparelho de verdade, o protocolo aparece como gt06, h02, suntech ou teltonika.'
    : diag.configurado === false ? 'Servidor de rastreio ainda não configurado.'
    : diag.erro ? `Não consegui consultar o servidor: ${diag.erro}`
    : !passos[1].ok ? 'O aparelho nunca falou com o servidor. Confira: chip com internet (abrir um site no celular com Wi-Fi desligado), APN da operadora, comando do servidor aceito e IMEI da etiqueta igual ao cadastrado. Depois mande RESET# e STATUS#.'
    : status !== 'online' && !passos[2].ok ? 'Já conectou, mas sem GPS. Deixe o veículo a céu aberto por alguns minutos.'
    : status !== 'online' ? 'Já funcionou e agora está desconectado: sem sinal de celular, sem crédito/dados no chip ou aparelho sem energia.'
    : !passos[3].ok ? 'Conectado, aguardando a primeira posição com GPS (céu aberto).'
    : 'Tudo certo: o aparelho está enviando.';

  const ip = diag?.ip || diag?.host || 'IP-DO-SERVIDOR';
  const lista = comandos(perfil, ip, APNS[operadora]);
  const numero = (v.chip_numero || '').replace(/\D/g, '');

  const copiar = async (c: string) => {
    try { await navigator.clipboard.writeText(c); setCopiado(c); setTimeout(() => setCopiado(''), 1500); } catch { /* sem clipboard */ }
  };

  return (
    <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
      <button onClick={() => setAberto(a => !a)} className="w-full flex items-center justify-between gap-2">
        <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><Wrench size={13} /> Instalação e diagnóstico</span>
        <ChevronDown size={16} className={`text-slate-500 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && (
        <div className="mt-3 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-black uppercase text-slate-500">Situação no servidor</p>
              <button onClick={verificar} disabled={carregando} className="text-[10px] font-black uppercase text-sky-400 flex items-center gap-1 disabled:opacity-50">
                {carregando ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Verificar agora
              </button>
            </div>
            <ul className="space-y-1.5 text-xs">
              {passos.map((p, i) => (
                <li key={i} className="flex items-start gap-2">
                  {!diag ? <Circle size={14} className="text-slate-600 mt-0.5 shrink-0" /> : p.ok ? <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" /> : <Circle size={14} className="text-amber-400 mt-0.5 shrink-0" />}
                  <span className="flex-1"><span className="text-slate-200">{p.txt}</span>{diag && <span className="text-slate-500"> · {p.det}</span>}</span>
                </li>
              ))}
            </ul>
            {dica && (
              <p className={`mt-2 text-[11px] leading-relaxed rounded-lg px-3 py-2 border ${dica.startsWith('Tudo certo') ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
                {!dica.startsWith('Tudo certo') && <AlertTriangle size={12} className="inline mr-1 -mt-0.5" />}{dica}
              </p>
            )}
          </div>

          <div>
            <p className="text-[10px] font-black uppercase text-slate-500 mb-2">Configurar por SMS {numero ? `(para ${v.chip_numero})` : ''}</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <select value={perfil} onChange={e => setPerfil(e.target.value as Perfil)} className="col-span-2 bg-white/[0.03] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white [color-scheme:dark]">
                {(Object.keys(PERFIS) as Perfil[]).map(k => <option key={k} value={k}>{PERFIS[k].nome}</option>)}
              </select>
              <select value={operadora} onChange={e => setOperadora(e.target.value)} className="col-span-2 bg-white/[0.03] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white [color-scheme:dark]">
                {Object.keys(APNS).map(k => <option key={k} value={k}>Chip {k.toUpperCase()} ({APNS[k].apn})</option>)}
              </select>
            </div>
            <ol className="space-y-1.5">
              {lista.map((x, i) => (
                <li key={x.c} className="bg-white/[0.03] border border-white/5 rounded-lg px-2.5 py-2">
                  <p className="text-[10px] text-slate-500">{i + 1}. {x.o}</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[12px] text-sky-300 break-all">{x.c}</code>
                    <button onClick={() => copiar(x.c)} title="Copiar" className="p-1.5 rounded-md hover:bg-white/10 text-slate-400">{copiado === x.c ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}</button>
                    {numero && <a href={`sms:${numero}?body=${encodeURIComponent(x.c)}`} title="Abrir no SMS do celular" className="p-1.5 rounded-md hover:bg-white/10 text-slate-400"><MessageSquare size={14} /></a>}
                  </div>
                </li>
              ))}
            </ol>
            <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
              Mande um por vez do seu celular para o número do chip do rastreador e espere a resposta. {numero ? 'No celular, o ícone de mensagem já abre o SMS pronto.' : 'Cadastre o número do chip no veículo para abrir o SMS pronto pelo celular.'} O IMEI da etiqueta precisa ser {v.imei}.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
