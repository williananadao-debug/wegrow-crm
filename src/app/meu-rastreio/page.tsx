"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, Navigation, Bell, BellRing, Route, Lock, Unlock, Share2, LogOut, KeyRound, Gauge, Power, AlertTriangle, X, MapPin, Satellite, Signal, Battery, BatteryCharging, Shield, Wallet, Siren } from 'lucide-react';
import { situacao, SITUACAO_INFO, haQuanto, fmtDataHora, fmtHora, linkMapa, barrasSinal, type Veiculo } from '../rastreio/shared';
import GraficoVelocidade from '../rastreio/GraficoVelocidade';
import type { PontoTrajeto } from '../rastreio/MapaRastreio';
import { analisarTrajeto, fmtDuracao } from '../rastreio/analise';
import CercasApp from './CercasApp';
import ContaApp from './ContaApp';

const MapaRastreio = dynamic(() => import('../rastreio/MapaRastreio'), { ssr: false });

type Dados = {
  empresa: { nome: string; logo: string | null; cor: string };
  cliente: { nome: string; suspenso: boolean; temPin: boolean; titular?: boolean; podeBloquear?: boolean };
  cobrancas?: { id: number; valor: number; vencimento: string; status: string; invoice_url: string | null }[];
  veiculos: Veiculo[];
  alertas: { id: number; veiculo_id: string; tipo: string; mensagem: string; ocorrido_em: string }[];
};
type Aba = 'mapa' | 'trajeto' | 'cercas' | 'alertas' | 'conta';

const MOTIVOS = ['Meu veículo foi roubado ou furtado', 'Não reconheço o uso agora', 'Outro motivo'];
const hojeISO = () => new Date().toLocaleDateString('en-CA');

async function post(caminho: string, corpo: unknown) {
  const r = await fetch(`/api/rastreio/app/${caminho}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  return j;
}

export default function MeuRastreioPage() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [semSessao, setSemSessao] = useState(false);
  const [aba, setAba] = useState<Aba>('mapa');
  const [selId, setSelId] = useState<string | null>(null);
  const [dia, setDia] = useState(hojeISO());
  const [trajeto, setTrajeto] = useState<PontoTrajeto[]>([]);
  const [carregandoTrajeto, setCarregandoTrajeto] = useState(false);
  const [modal, setModal] = useState<null | 'bloquear' | 'desbloquear' | 'pin' | 'compartilhar' | 'alertas' | 'roubo'>(null);
  const [tipoRoubo, setTipoRoubo] = useState<'roubo' | 'furto'>('roubo');
  const [prefs, setPrefs] = useState<{ alertas: Record<string, boolean>; nomes: Record<string, string> } | null>(null);
  const [linkConvite, setLinkConvite] = useState('');
  const [motivo, setMotivo] = useState(0);
  const [pin, setPin] = useState('');
  const [pinNovo, setPinNovo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [vistos, setVistos] = useState<number>(0);
  const [endereco, setEndereco] = useState<Record<string, string>>({});

  const carregar = useCallback(async () => {
    const r = await fetch('/api/rastreio/app/dados', { cache: 'no-store' }).catch(() => null);
    if (!r) return;
    if (r.status === 401) { setSemSessao(true); return; }
    if (r.ok) setDados(await r.json());
  }, []);

  useEffect(() => {
    void Promise.resolve().then(carregar);
    try { setVistos(Number(localStorage.getItem('rastreio_alertas_vistos') || 0)); } catch { /* sem storage */ }
    const t = setInterval(() => { if (document.visibilityState === 'visible') carregar(); }, 15000);
    return () => clearInterval(t);
  }, [carregar]);

  useEffect(() => {
    if (!dados) return;
    type Cap = { isNativePlatform?: () => boolean; getPlatform?: () => string; Plugins?: Record<string, {
      requestPermissions: () => Promise<{ receive: string }>; register: () => Promise<void>;
      addListener: (ev: string, cb: (x: { value?: string }) => void) => void; createChannel?: (c: Record<string, unknown>) => Promise<void>;
    }> };
    const cap = (window as unknown as { Capacitor?: Cap }).Capacitor;
    const push = cap?.isNativePlatform?.() ? cap.Plugins?.PushNotifications : undefined;
    if (!push) return;
    push.addListener('registration', t => {
      if (t.value) fetch('/api/rastreio/app/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t.value, plataforma: cap?.getPlatform?.() || 'android' }) }).catch(() => null);
    });
    push.createChannel?.({ id: 'alarmes', name: 'Alarmes do veículo', importance: 5, vibration: true }).catch(() => null);
    push.createChannel?.({ id: 'alertas', name: 'Alertas', importance: 3 }).catch(() => null);
    push.requestPermissions().then(r => { if (r.receive === 'granted') push.register(); }).catch(() => null);
  }, [dados]);

  const abrirPrefs = async () => {
    setModal('alertas'); setMsg(null);
    const r = await fetch('/api/rastreio/app/push', { cache: 'no-store' }).catch(() => null);
    if (r?.ok) setPrefs(await r.json());
  };
  const salvarPrefs = async (alertas: Record<string, boolean>) => {
    setPrefs(p => (p ? { ...p, alertas } : p));
    await post('push', { alertas }).catch(() => null);
  };

  const veiculo = useMemo(() => dados?.veiculos.find(v => v.id === selId) || dados?.veiculos[0] || null, [dados, selId]);
  const novos = (dados?.alertas || []).filter(a => a.id > vistos).length;

  // Endereço da posição atual (o servidor só consulta de novo quando o veículo andou).
  const vId = veiculo?.id, vLat = veiculo?.ultima_lat, vLng = veiculo?.ultima_lng;
  useEffect(() => {
    if (!vId || vLat == null || vLng == null) return;
    const t = setTimeout(() => {
      fetch(`/api/rastreio/app/endereco?veiculo=${vId}`, { cache: 'no-store' }).then(r => r.json())
        .then(j => { if (j.endereco) setEndereco(e => ({ ...e, [vId]: j.endereco })); }).catch(() => null);
    }, 400);
    return () => clearTimeout(t);
  }, [vId, vLat, vLng]);

  useEffect(() => {
    if (aba !== 'trajeto' || !veiculo) return;
    const ini = new Date(`${dia}T00:00:00`), fim = new Date(`${dia}T23:59:59.999`);
    void Promise.resolve().then(() => setCarregandoTrajeto(true));
    fetch(`/api/rastreio/app/trajeto?veiculo=${veiculo.id}&ini=${ini.toISOString()}&fim=${fim.toISOString()}`, { cache: 'no-store' })
      .then(r => r.json()).then(j => setTrajeto(j.pontos || [])).catch(() => setTrajeto([]))
      .finally(() => setCarregandoTrajeto(false));
  }, [aba, veiculo, dia]);

  const abrirAlertas = () => {
    setAba('alertas');
    const maior = Math.max(0, ...(dados?.alertas || []).map(a => a.id));
    setVistos(maior);
    try { localStorage.setItem('rastreio_alertas_vistos', String(maior)); } catch { /* sem storage */ }
  };

  // Link ao vivo (atualiza sozinho e expira). Se o servidor falhar, cai no link fixo do Google Maps.
  const compartilhar = async (horas: number) => {
    if (!veiculo?.ultima_lat) return;
    setEnviando(true);
    let url = linkMapa(veiculo.ultima_lat, veiculo.ultima_lng!);
    let texto = `Localização do veículo ${veiculo.placa} (${haQuanto(veiculo.ultima_posicao_em)})`;
    try {
      const r = await post('compartilhar', { veiculoId: veiculo.id, horas });
      url = r.link;
      texto = `Acompanhe o veículo ${veiculo.placa} ao vivo (link vale ${horas < 24 ? `${horas} h` : `${horas / 24} dia${horas > 24 ? 's' : ''}`})`;
    } catch { /* usa o link fixo */ }
    setEnviando(false);
    setModal(null);
    try {
      if (navigator.share) await navigator.share({ title: veiculo.placa, text: texto, url });
      else window.open(`https://wa.me/?text=${encodeURIComponent(`${texto}: ${url}`)}`, '_blank');
    } catch { /* cancelado */ }
  };

  const enviarComando = async () => {
    if (!veiculo || !modal || modal === 'pin') return;
    setEnviando(true); setMsg(null);
    try {
      const r = await post('comando', { veiculoId: veiculo.id, tipo: modal, motivo: modal === 'bloquear' ? MOTIVOS[motivo] : 'Desbloqueio pelo app', pin });
      setMsg({ ok: true, texto: modal === 'bloquear' ? `${veiculo.placa} bloqueado. ${r.mensagem}` : `${veiculo.placa} desbloqueado.` });
      setModal(null); setPin('');
      carregar();
    } catch (e) {
      setMsg({ ok: false, texto: (e as Error).message });
    } finally { setEnviando(false); }
  };

  const salvarPin = async () => {
    setEnviando(true); setMsg(null);
    try {
      await post('pin', { pin: pinNovo, pinAtual: pin });
      setMsg({ ok: true, texto: 'PIN salvo. Ele será pedido para bloquear ou desbloquear.' });
      setModal(null); setPin(''); setPinNovo('');
      carregar();
    } catch (e) {
      setMsg({ ok: false, texto: (e as Error).message });
    } finally { setEnviando(false); }
  };

  const sair = async () => {
    if (!confirm('Sair do app neste celular? Para entrar de novo, peça um novo link para a central.')) return;
    await post('sair', {}).catch(() => null);
    setSemSessao(true);
  };

  const [loginApp, setLoginApp] = useState('');
  const [senhaApp, setSenhaApp] = useState('');
  const [erroLogin, setErroLogin] = useState('');
  const [entrandoSenha, setEntrandoSenha] = useState(false);
  const entrarComSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    setEntrandoSenha(true); setErroLogin('');
    try {
      const r = await fetch('/api/rastreio/app/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: loginApp, senha: senhaApp }) });
      if (r.ok) { window.location.replace('/meu-rastreio'); return; }
      const j = await r.json().catch(() => ({}));
      setErroLogin(j.error || 'Não foi possível entrar.');
    } catch { setErroLogin('Sem conexão. Tente de novo.'); }
    setEntrandoSenha(false);
  };

  if (semSessao) {
    return (
      <main className="min-h-[100dvh] bg-[#0B1120] text-white flex flex-col items-center justify-center p-6 text-center gap-3">
        <Navigation size={40} className="text-sky-400" />
        <h1 className="text-xl font-black">Acesso ao rastreamento</h1>
        <form onSubmit={entrarComSenha} className="w-full max-w-xs mt-2 space-y-2 text-left">
          <label htmlFor="login-app" className="text-[11px] font-black uppercase tracking-widest text-slate-500">CPF, CNPJ ou celular</label>
          <input id="login-app" inputMode="numeric" autoComplete="username" value={loginApp} onChange={e => setLoginApp(e.target.value)}
            className="w-full min-h-12 bg-white/5 border border-white/15 rounded-xl px-4 text-base text-white outline-none focus:border-sky-400" />
          <label htmlFor="senha-app" className="text-[11px] font-black uppercase tracking-widest text-slate-500 block pt-1">Senha</label>
          <input id="senha-app" type="password" autoComplete="current-password" autoCapitalize="none" value={senhaApp} onChange={e => setSenhaApp(e.target.value)}
            className="w-full min-h-12 bg-white/5 border border-white/15 rounded-xl px-4 text-base text-white outline-none focus:border-sky-400" />
          {erroLogin && <p className="text-sm text-red-300">{erroLogin}</p>}
          <button type="submit" disabled={entrandoSenha || !loginApp.trim() || !senhaApp.trim()} className="w-full min-h-12 rounded-xl bg-sky-400 text-[#0B1120] font-black uppercase text-sm disabled:opacity-40 inline-flex items-center justify-center gap-2">
            {entrandoSenha && <Loader2 size={16} className="animate-spin" />} Entrar
          </button>
          <p className="text-xs text-slate-500 text-center">Esqueceu a senha? Peça uma nova para a sua central de rastreamento.</p>
        </form>
        <div className="w-full max-w-xs mt-6 space-y-2">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Recebeu um link de acesso? Cole aqui</p>
          <input value={linkConvite} onChange={e => setLinkConvite(e.target.value)} placeholder="https://…/meu-rastreio/entrar?t=…"
            className="w-full min-h-12 bg-white/5 border border-white/15 rounded-xl px-4 text-sm text-white outline-none focus:border-sky-400" />
          <button onClick={() => { const t = linkConvite.match(/[?&]t=([A-Za-z0-9_-]{20,})/)?.[1]; if (t) window.location.href = `/meu-rastreio/entrar?t=${t}`; }}
            disabled={!/[?&]t=[A-Za-z0-9_-]{20,}/.test(linkConvite)} className="w-full min-h-12 rounded-xl bg-sky-400 text-[#0B1120] font-black uppercase text-sm disabled:opacity-40">Entrar</button>
        </div>
      </main>
    );
  }
  if (!dados) return <main className="min-h-[100dvh] bg-[#0B1120] flex items-center justify-center"><Loader2 size={28} className="animate-spin text-slate-500" /></main>;

  const cor = dados.empresa.cor || '#38BDF8';
  const s = veiculo ? situacao(veiculo) : 'sem_sinal';
  const an = analisarTrajeto(trajeto);
  const km = an.km;
  const velMax = an.velMax;

  return (
    <main className="min-h-[100dvh] bg-[#0B1120] text-white flex flex-col max-w-lg mx-auto" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <header className="px-4 pt-4 pb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {dados.empresa.logo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={dados.empresa.logo} alt="" className="w-10 h-10 rounded-xl object-contain bg-white/5" />
            : <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-[#0B1120]" style={{ background: cor }}>{dados.empresa.nome.slice(0, 2).toUpperCase()}</div>}
          <div className="min-w-0">
            <p className="font-black truncate">{dados.empresa.nome}</p>
            <p className="text-xs text-slate-400 truncate">Olá, {dados.cliente.nome.split(' ')[0]}</p>
          </div>
        </div>
        <div className="flex gap-1">
          <button onClick={abrirPrefs} aria-label="Notificações" className="w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center text-slate-300"><BellRing size={18} /></button>
          {dados.cliente.titular !== false && <button onClick={() => { setModal('pin'); setPin(''); setPinNovo(''); setMsg(null); }} aria-label="Meu PIN de bloqueio" className="w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center text-slate-300"><KeyRound size={18} /></button>}
          <button onClick={sair} aria-label="Sair" className="w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center text-slate-300"><LogOut size={18} /></button>
        </div>
      </header>

      {dados.cliente.suspenso && (
        <div className="mx-4 mb-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">Há uma pendência na sua mensalidade.{(dados.cobrancas || []).some(c => c.invoice_url) ? ' Pague abaixo e o acesso volta sozinho.' : ' Fale com a central para regularizar.'}</div>
      )}
      {(dados.cobrancas || []).filter(c => c.invoice_url).map(c => (
        <a key={c.id} href={c.invoice_url!} target="_blank" rel="noreferrer"
          className={`mx-4 mb-2 rounded-xl border px-4 py-3 text-sm font-bold flex items-center justify-between gap-3 ${c.status === 'OVERDUE' ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-white/15 bg-white/5 text-slate-200'}`}>
          <span>Mensalidade {c.status === 'OVERDUE' ? 'vencida em' : 'vence em'} {c.vencimento.split('-').reverse().join('/')} · {Number(c.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
          <span className="shrink-0 rounded-lg px-3 py-1.5 text-[#0B1120] font-black text-xs uppercase" style={{ background: cor }}>Pagar</span>
        </a>
      ))}
      {!dados.cliente.temPin && dados.cliente.titular !== false && (
        <button onClick={() => { setModal('pin'); setPin(''); setPinNovo(''); }} className="mx-4 mb-2 rounded-xl border border-sky-400/40 bg-sky-400/10 px-4 py-3 text-sm text-sky-200 text-left font-bold">
          Crie seu PIN de bloqueio para poder bloquear o veículo pelo app →
        </button>
      )}
      {msg && (
        <div role="status" className={`mx-4 mb-2 rounded-xl border px-4 py-3 text-sm font-bold flex justify-between gap-2 ${msg.ok ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-red-500/40 bg-red-500/10 text-red-200'}`}>
          <span>{msg.texto}</span><button onClick={() => setMsg(null)} aria-label="Fechar"><X size={14} /></button>
        </div>
      )}

      {dados.veiculos.length === 0 ? (
        <p className="px-6 py-16 text-center text-slate-400 text-sm">Nenhum veículo ativo no seu cadastro. Fale com a central.</p>
      ) : (
        <>
          {dados.veiculos.length > 1 && (
            <div className="px-4 flex gap-2 overflow-x-auto pb-1">
              {dados.veiculos.map(v => (
                <button key={v.id} onClick={() => setSelId(v.id)}
                  className="shrink-0 min-h-11 px-4 rounded-xl border text-sm font-black tracking-wider"
                  style={v.id === veiculo?.id ? { borderColor: cor, background: `${cor}1F` } : { borderColor: 'rgba(255,255,255,0.1)', color: '#CBD5E1' }}>
                  {v.placa}{v.descricao ? <span className="font-semibold tracking-normal text-xs text-slate-400"> · {v.descricao}</span> : null}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 px-4 pt-3 pb-24 space-y-3">
            {veiculo && aba === 'mapa' && (
              <>
                {veiculo.ultima_lat != null
                  ? <MapaRastreio veiculos={[veiculo]} selecionadoId={veiculo.id} chaveEnquadrar={veiculo.id} altura="h-[42vh] min-h-[260px]" />
                  : <div className="h-[42vh] min-h-[260px] rounded-2xl border border-white/10 flex items-center justify-center text-slate-400 text-sm px-6 text-center">Aguardando o primeiro sinal do rastreador.</div>}
                <section aria-label="Situação" className="grid grid-cols-3 gap-2 bg-[#0F172A] border border-white/10 rounded-2xl p-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Agora</p>
                    <p className="font-black" style={{ color: veiculo.bloqueado ? '#F87171' : SITUACAO_INFO[s].cor }}>{veiculo.bloqueado ? 'Bloqueado' : SITUACAO_INFO[s].label}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1"><Gauge size={11} /> Veloc.</p>
                    <p className="font-black">{Math.round(Number(veiculo.ultima_velocidade || 0))} km/h</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1"><Power size={11} /> Ignição</p>
                    <p className="font-black">{veiculo.ignicao == null ? '—' : veiculo.ignicao ? 'Ligada' : 'Desligada'}</p>
                  </div>
                  {(endereco[veiculo.id] || veiculo.endereco) && (
                    <p className="col-span-3 text-sm text-slate-200 flex items-start gap-1.5"><MapPin size={14} className="mt-0.5 shrink-0" style={{ color: cor }} /> {endereco[veiculo.id] || veiculo.endereco}</p>
                  )}
                  <p className="col-span-3 text-xs text-slate-400">Atualizado {haQuanto(veiculo.ultima_comunicacao_em || veiculo.ultima_posicao_em)}</p>
                  {(veiculo.satelites != null || veiculo.sinal_gsm != null || veiculo.bateria_interna != null) && (
                    <div className="col-span-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 border-t border-white/5 pt-2">
                      {veiculo.satelites != null && <span className="inline-flex items-center gap-1"><Satellite size={12} /> {veiculo.satelites} satélites</span>}
                      {barrasSinal(veiculo.sinal_gsm) != null && <span className="inline-flex items-center gap-1"><Signal size={12} /> sinal {barrasSinal(veiculo.sinal_gsm)}/4</span>}
                      {veiculo.bateria_interna != null && (
                        <span className={`inline-flex items-center gap-1 ${veiculo.carregando === false ? 'text-amber-300' : ''}`}>
                          {veiculo.carregando ? <BatteryCharging size={12} /> : <Battery size={12} />} rastreador {veiculo.bateria_interna}%{veiculo.carregando === false ? ' · sem energia do veículo' : ''}
                        </span>
                      )}
                    </div>
                  )}
                </section>
                <div className="grid grid-cols-2 gap-2">
                  {veiculo.tem_bloqueio && dados.cliente.podeBloquear !== false && (veiculo.bloqueado
                    ? <button onClick={() => { setModal('desbloquear'); setPin(''); setMsg(null); }} className="min-h-14 rounded-2xl border border-white/15 bg-white/5 font-black uppercase text-sm flex items-center justify-center gap-2"><Unlock size={18} /> Desbloquear</button>
                    : <button onClick={() => { setModal('bloquear'); setPin(''); setMotivo(0); setMsg(null); }} className="min-h-14 rounded-2xl bg-red-600 font-black uppercase text-sm flex items-center justify-center gap-2"><Lock size={18} /> Bloquear</button>)}
                  <button onClick={() => { setModal('compartilhar'); setMsg(null); }} disabled={veiculo.ultima_lat == null} className={`min-h-14 rounded-2xl border border-white/15 bg-white/5 font-black uppercase text-sm flex items-center justify-center gap-2 disabled:opacity-40 ${veiculo.tem_bloqueio && dados.cliente.podeBloquear !== false ? '' : 'col-span-2'}`}><Share2 size={18} /> Compartilhar</button>
                  <button onClick={() => { setModal('roubo'); setMsg(null); }} className="col-span-2 min-h-12 rounded-2xl border border-red-500/40 bg-red-500/10 text-red-200 font-black uppercase text-xs flex items-center justify-center gap-2"><Siren size={16} /> Fui roubado / furtado</button>
                </div>
              </>
            )}

            {veiculo && aba === 'trajeto' && (
              <>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dia</label>
                  <input type="date" value={dia} max={hojeISO()} onChange={e => setDia(e.target.value || hojeISO())}
                    className="min-h-11 bg-white/[0.03] border border-white/10 rounded-xl px-3 text-sm text-white [color-scheme:dark]" />
                </div>
                <MapaRastreio veiculos={[veiculo]} selecionadoId={veiculo.id} trajeto={trajeto} paradas={an.paradas} chaveEnquadrar={`${veiculo.id}|${dia}|${trajeto.length > 0}`} altura="h-[42vh] min-h-[260px]" />
                {trajeto.length > 1 && <GraficoVelocidade pontos={trajeto} limite={veiculo.limite_velocidade} />}
                <section aria-label="Resumo do dia" className="grid grid-cols-2 gap-2">
                  <Caixa titulo="Rodou" valor={carregandoTrajeto ? '…' : `${km.toFixed(1)} km`} />
                  <Caixa titulo="Máxima" valor={carregandoTrajeto ? '…' : `${Math.round(velMax)} km/h`} />
                  <Caixa titulo="Em movimento" valor={carregandoTrajeto ? '…' : fmtDuracao(an.minutosMovimento)} />
                  <Caixa titulo="Período" valor={trajeto.length ? `${fmtHora(trajeto[0].registrado_em!)}–${fmtHora(trajeto[trajeto.length - 1].registrado_em!)}` : '—'} />
                </section>
                {an.paradas.length > 0 && (
                  <section aria-label="Paradas" className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Paradas ({an.paradas.length})</p>
                    <ol className="divide-y divide-white/5 text-sm">
                      {an.paradas.map((x, i) => (
                        <li key={i}>
                          <a href={linkMapa(x.lat, x.lng)} target="_blank" rel="noreferrer" className="min-h-11 flex items-center gap-3">
                            <span className="w-6 h-6 rounded-full bg-amber-500 text-[#0B1120] text-xs font-black flex items-center justify-center shrink-0">{i + 1}</span>
                            <span className="flex-1">{fmtHora(x.ini)}–{fmtHora(x.fim)}</span>
                            <span className="text-slate-400">{fmtDuracao(x.minutos)}</span>
                          </a>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
                {!carregandoTrajeto && trajeto.length === 0 && <p className="text-center text-sm text-slate-400">Nenhum deslocamento nesse dia.</p>}
              </>
            )}

            {veiculo && aba === 'cercas' && <CercasApp veiculo={veiculo} cor={cor} />}

            {aba === 'conta' && <ContaApp cor={cor} />}

            {aba === 'alertas' && (
              <section aria-label="Alertas" className="space-y-2">
                {dados.alertas.length === 0 && <p className="text-center text-sm text-slate-400 py-10">Nenhum alerta ainda.</p>}
                {dados.alertas.map(a => {
                  const urgente = a.tipo === 'alarme';
                  return (
                    <article key={a.id} className={`rounded-2xl border p-4 ${urgente ? 'border-red-500/40 bg-red-500/10' : 'border-white/10 bg-[#0F172A]'}`}>
                      <p className={`text-[11px] font-black uppercase tracking-widest ${urgente ? 'text-red-300' : 'text-slate-400'}`}>{urgente ? 'Urgente · ' : ''}{fmtDataHora(a.ocorrido_em)}</p>
                      <p className="font-bold mt-1 flex items-start gap-2">{urgente && <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />}{a.mensagem}</p>
                    </article>
                  );
                })}
              </section>
            )}
          </div>
        </>
      )}

      <nav aria-label="Menu" className="fixed bottom-0 inset-x-0 bg-[#0B1120]/95 backdrop-blur border-t border-white/10" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className={`max-w-lg mx-auto grid ${dados.cliente.titular !== false ? 'grid-cols-5' : 'grid-cols-4'}`}>
          {([['mapa', 'Mapa', Navigation], ['trajeto', 'Trajeto', Route], ['cercas', 'Cercas', Shield], ['alertas', 'Alertas', Bell],
            ...(dados.cliente.titular !== false ? [['conta', 'Conta', Wallet] as const] : [])] as const).map(([k, nome, Icone]) => (
            <button key={k} onClick={() => (k === 'alertas' ? abrirAlertas() : setAba(k))} aria-current={aba === k ? 'page' : undefined}
              className="min-h-16 flex flex-col items-center justify-center gap-1 text-[11px] font-black relative"
              style={{ color: aba === k ? cor : '#94A3B8' }}>
              <Icone size={20} />{nome}
              {k === 'alertas' && novos > 0 && <span className="absolute top-2 left-1/2 ml-2 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">{novos}</span>}
            </button>
          ))}
        </div>
      </nav>

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={() => !enviando && setModal(null)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-lg bg-[#0F172A] border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 space-y-4" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }} onClick={e => e.stopPropagation()}>
            {modal === 'alertas' ? (
              <>
                <h2 className="text-xl font-black">Notificações no celular</h2>
                <p className="text-sm text-slate-300">Escolha quais alertas chegam como notificação. Todos continuam aparecendo na aba Alertas.</p>
                {!prefs ? <Loader2 className="animate-spin text-slate-500" /> : (
                  <ul className="divide-y divide-white/10">
                    {Object.entries(prefs.nomes).map(([k, nome]) => (
                      <li key={k}>
                        <label className="min-h-12 flex items-center justify-between gap-3 text-sm font-bold">
                          {nome}
                          <input type="checkbox" checked={Boolean(prefs.alertas[k])} onChange={e => salvarPrefs({ ...prefs.alertas, [k]: e.target.checked })} className="w-5 h-5" style={{ accentColor: cor }} />
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-slate-500">As notificações funcionam no app instalado da loja (Android e iPhone).</p>
              </>
            ) : modal === 'roubo' ? (
              <>
                <h2 className="text-xl font-black flex items-center gap-2"><Siren size={20} className="text-red-400" /> Avisar roubo ou furto</h2>
                <p className="text-sm text-slate-300">A central é avisada na hora, o rastreador passa a mandar a posição a cada 10 segundos e sai um link ao vivo para a polícia. Se estiver em perigo, ligue <b>190</b> primeiro.</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['roubo', 'furto'] as const).map(t => (
                    <button key={t} onClick={() => setTipoRoubo(t)} className="min-h-12 rounded-xl border font-black uppercase text-sm"
                      style={tipoRoubo === t ? { borderColor: '#EF4444', background: '#EF44441F', color: '#FCA5A5' } : { borderColor: 'rgba(255,255,255,0.1)', color: '#CBD5E1' }}>{t === 'roubo' ? 'Roubo (com abordagem)' : 'Furto (levaram parado)'}</button>
                  ))}
                </div>
                <button disabled={enviando} onClick={async () => {
                  if (!veiculo) return;
                  setEnviando(true); setMsg(null);
                  try {
                    const r = await post('ocorrencia', { veiculoId: veiculo.id, tipo: tipoRoubo });
                    setModal(null);
                    setMsg({ ok: true, texto: r.jaAberta ? 'A central já está acompanhando este veículo.' : 'Central avisada. O veículo está em rastreamento intensivo.' + (veiculo.tem_bloqueio && dados.cliente.podeBloquear !== false ? ' Se for seguro, use o botão Bloquear.' : '') });
                    if (r.link) {
                      try { if (navigator.share) await navigator.share({ title: veiculo.placa, text: `Localização ao vivo do veículo ${veiculo.placa}`, url: r.link }); } catch { /* cancelado */ }
                    }
                  } catch (e) { setMsg({ ok: false, texto: (e as Error).message }); }
                  finally { setEnviando(false); }
                }} className="w-full min-h-14 rounded-2xl bg-red-600 font-black uppercase disabled:opacity-40 flex items-center justify-center gap-2">
                  {enviando ? <Loader2 size={18} className="animate-spin" /> : <Siren size={18} />} Avisar a central agora
                </button>
              </>
            ) : modal === 'compartilhar' ? (
              <>
                <h2 className="text-xl font-black">Compartilhar localização ao vivo</h2>
                <p className="text-sm text-slate-300">Quem receber o link vê só a posição atual do {veiculo?.placa}, atualizando sozinha, até o link expirar. Não dá acesso ao bloqueio nem ao histórico.</p>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 8, 24].map(h => (
                    <button key={h} onClick={() => compartilhar(h)} disabled={enviando} className="min-h-14 rounded-2xl border border-white/15 bg-white/5 font-black disabled:opacity-40">
                      {h < 24 ? `${h} h` : '1 dia'}
                    </button>
                  ))}
                </div>
                {enviando && <p className="text-sm text-slate-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> gerando link…</p>}
              </>
            ) : modal === 'pin' ? (
              <>
                <h2 className="text-xl font-black">{dados.cliente.temPin ? 'Trocar PIN de bloqueio' : 'Criar PIN de bloqueio'}</h2>
                <p className="text-sm text-slate-300">O PIN (4 a 6 números) é pedido sempre que você bloquear ou desbloquear o veículo.</p>
                {dados.cliente.temPin && <CampoPin rotulo="PIN atual" valor={pin} onChange={setPin} />}
                <CampoPin rotulo="Novo PIN" valor={pinNovo} onChange={setPinNovo} />
                <button onClick={salvarPin} disabled={enviando || pinNovo.length < 4} className="w-full min-h-14 rounded-2xl font-black uppercase text-[#0B1120] disabled:opacity-40 flex items-center justify-center gap-2" style={{ background: cor }}>
                  {enviando && <Loader2 size={16} className="animate-spin" />} Salvar PIN
                </button>
              </>
            ) : (
              <>
                <h2 className={`text-xl font-black ${modal === 'bloquear' ? 'text-red-400' : ''}`}>{modal === 'bloquear' ? `Bloquear ${veiculo?.placa}?` : `Desbloquear ${veiculo?.placa}?`}</h2>
                {modal === 'bloquear' && (
                  <>
                    <p className="text-sm text-slate-300">O veículo fica sem conseguir dar partida até ser desbloqueado.</p>
                    <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">Por segurança, o bloqueio só é enviado com o veículo <b>parado ou abaixo de 20 km/h</b>.</p>
                    <fieldset className="space-y-2">
                      <legend className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Motivo</legend>
                      {MOTIVOS.map((m, i) => (
                        <button key={m} onClick={() => setMotivo(i)} className="w-full min-h-12 text-left px-4 rounded-xl border text-sm font-bold"
                          style={i === motivo ? { borderColor: '#EF4444', background: 'rgba(239,68,68,0.12)' } : { borderColor: 'rgba(255,255,255,0.12)' }}>{m}</button>
                      ))}
                    </fieldset>
                  </>
                )}
                {!dados.cliente.temPin
                  ? <p className="text-sm text-sky-200">{dados.cliente.titular === false ? 'O titular da conta ainda não criou o PIN de bloqueio.' : 'Crie seu PIN primeiro (ícone de chave no topo).'}</p>
                  : <CampoPin rotulo={dados.cliente.titular === false ? 'PIN do titular' : 'Seu PIN'} valor={pin} onChange={setPin} />}
                <button onClick={enviarComando} disabled={enviando || pin.length < 4 || !dados.cliente.temPin}
                  className={`w-full min-h-14 rounded-2xl font-black uppercase disabled:opacity-40 flex items-center justify-center gap-2 ${modal === 'bloquear' ? 'bg-red-600' : 'text-[#0B1120]'}`}
                  style={modal === 'bloquear' ? undefined : { background: cor }}>
                  {enviando && <Loader2 size={16} className="animate-spin" />} {modal === 'bloquear' ? 'Confirmar bloqueio' : 'Confirmar desbloqueio'}
                </button>
              </>
            )}
            <button onClick={() => setModal(null)} disabled={enviando} className="w-full min-h-12 text-sm font-bold text-slate-300">Cancelar</button>
          </div>
        </div>
      )}
    </main>
  );
}

function Caixa({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{titulo}</p>
      <p className="font-black mt-1">{valor}</p>
    </div>
  );
}

function CampoPin({ rotulo, valor, onChange }: { rotulo: string; valor: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">{rotulo}</span>
      <input type="password" inputMode="numeric" autoComplete="off" value={valor} onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className="mt-1 w-full min-h-14 bg-white/[0.03] border border-white/10 rounded-2xl px-4 text-2xl tracking-[0.5em] text-white outline-none focus:border-sky-400" />
    </label>
  );
}
