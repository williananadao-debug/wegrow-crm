"use client";
import { useState } from 'react';
import { CDL } from '@/lib/cdl-config';
import {
  CheckCircle2, XCircle, Loader2, AlertCircle, LogIn,
  CreditCard, History, Calendar, Award, ArrowLeft, QrCode,
  Shield, User, MessageCircle, MapPin, Phone, Hash,
  ShieldCheck, Clock, ChevronRight, Tag
} from 'lucide-react';
import Link from 'next/link';

type DadosAssociado = {
  id: number;
  empresa: string;
  tipo: string;
  segmento: string | null;
  cnpj: string | null;
  telefone: string | null;
  cidade: string | null;
  contrato_inicio: string | null;
  contrato_fim: string | null;
  valor_total: number;
  ativa: boolean;
  historicoPagamentos: { data: string; descricao: string }[];
};

type Aba = 'carteirinha' | 'financeiro' | 'spc' | 'dados';

function maskCnpj(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

function fmtData(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
}

/* ── ABA: CARTEIRINHA ─────────────────────────────────────────── */
function AbaCarteirinha({ dados }: { dados: DadosAssociado }) {
  const carteirinhaUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/carteirinha/${dados.id}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&color=22C55E&bgcolor=0B1120&data=${encodeURIComponent(carteirinhaUrl)}`;

  const compartilhar = () => {
    if (navigator.share) {
      navigator.share({ title: `Carteirinha CDL — ${dados.empresa}`, url: carteirinhaUrl });
    } else {
      navigator.clipboard.writeText(carteirinhaUrl);
      alert('Link copiado!');
    }
  };

  return (
    <div className="space-y-4">
      {/* Card carteirinha */}
      <div className={`bg-gradient-to-br ${dados.ativa ? 'from-[#0F2A1A] to-[#0B1120]' : 'from-[#1A0F0F] to-[#0B1120]'} border ${dados.ativa ? 'border-[#22C55E]/40' : 'border-red-500/40'} rounded-3xl p-5 shadow-xl`}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-[#22C55E] rounded-xl flex items-center justify-center font-black text-[#0B1120] text-base shadow-[0_0_20px_rgba(34,197,94,0.3)]">CDL</div>
            <div>
              <p className="font-black text-white text-xs uppercase tracking-tight">{CDL.nome}</p>
              <p className="text-[9px] text-[#22C55E] uppercase tracking-widest font-bold">{CDL.sub}</p>
            </div>
          </div>
          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[9px] font-black uppercase ${dados.ativa ? 'bg-[#22C55E]/20 text-[#22C55E] border border-[#22C55E]/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
            {dados.ativa ? <CheckCircle2 size={10}/> : <XCircle size={10}/>}
            {dados.ativa ? 'Ativo' : 'Vencido'}
          </div>
        </div>

        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Empresa Associada</p>
        <h2 className="text-lg font-black text-white uppercase tracking-tight leading-tight mb-4">{dados.empresa}</h2>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="bg-black/30 rounded-2xl p-3">
            <div className="flex items-center gap-1 mb-1"><Award size={9} className="text-[#22C55E]"/><p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Tipo</p></div>
            <p className="text-white font-black text-[11px] uppercase">{dados.tipo}</p>
          </div>
          {dados.segmento && (
            <div className="bg-black/30 rounded-2xl p-3">
              <div className="flex items-center gap-1 mb-1"><Tag size={9} className="text-[#22C55E]"/><p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Segmento</p></div>
              <p className="text-white font-black text-[11px] uppercase truncate">{dados.segmento}</p>
            </div>
          )}
          {dados.contrato_inicio && (
            <div className="bg-black/30 rounded-2xl p-3">
              <div className="flex items-center gap-1 mb-1"><Calendar size={9} className="text-[#22C55E]"/><p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Desde</p></div>
              <p className="text-white font-black text-[11px]">{fmtData(dados.contrato_inicio)}</p>
            </div>
          )}
          {dados.contrato_fim && (
            <div className="bg-black/30 rounded-2xl p-3">
              <div className="flex items-center gap-1 mb-1"><Calendar size={9} className={dados.ativa ? 'text-[#22C55E]' : 'text-red-400'}/><p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Validade</p></div>
              <p className={`font-black text-[11px] ${dados.ativa ? 'text-white' : 'text-red-400'}`}>{fmtData(dados.contrato_fim)}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between bg-black/30 rounded-2xl p-3">
          <div>
            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Protocolo</p>
            <p className="text-[#22C55E] font-black text-lg">#{String(dados.id).padStart(6, '0')}</p>
            <p className="text-[8px] text-slate-600 mt-0.5">Escaneie para verificar</p>
          </div>
          <img src={qrUrl} alt="QR Code" width={72} height={72} className="rounded-xl opacity-90" />
        </div>
      </div>

      <button
        onClick={compartilhar}
        className="w-full bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E] py-3 rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-2"
      >
        <QrCode size={14}/> Compartilhar Carteirinha
      </button>

      <Link
        href={`/carteirinha/${dados.id}`}
        target="_blank"
        className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white py-3 rounded-2xl font-bold uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-2"
      >
        Abrir em tela cheia <ChevronRight size={12}/>
      </Link>
    </div>
  );
}

/* ── ABA: FINANCEIRO ──────────────────────────────────────────── */
function AbaFinanceiro({ dados }: { dados: DadosAssociado }) {
  const diasParaVencer = dados.contrato_fim
    ? Math.floor((new Date(dados.contrato_fim + 'T00:00:00').getTime() - Date.now()) / 86400000)
    : null;

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className={`rounded-3xl p-5 border ${!dados.ativa ? 'bg-red-500/10 border-red-500/20' : diasParaVencer !== null && diasParaVencer <= 30 ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-[#22C55E]/10 border-[#22C55E]/20'}`}>
        <div className="flex items-center gap-3">
          {!dados.ativa
            ? <XCircle size={28} className="text-red-400 shrink-0"/>
            : diasParaVencer !== null && diasParaVencer <= 30
              ? <AlertCircle size={28} className="text-yellow-400 shrink-0"/>
              : <CheckCircle2 size={28} className="text-[#22C55E] shrink-0"/>
          }
          <div>
            <p className="font-black text-white text-sm uppercase">
              {!dados.ativa ? 'Associação Vencida' : diasParaVencer !== null && diasParaVencer <= 30 ? `Vence em ${diasParaVencer} dias` : 'Associação Ativa'}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {!dados.ativa
                ? 'Entre em contato para renovar'
                : dados.contrato_fim
                  ? `Válida até ${fmtData(dados.contrato_fim)}`
                  : 'Sem data de vencimento definida'}
            </p>
          </div>
        </div>
      </div>

      {/* Detalhes financeiros */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4">
          <div className="flex items-center gap-1 mb-1"><CreditCard size={10} className="text-[#22C55E]"/><p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Anuidade</p></div>
          <p className="text-white font-black text-sm">R$ {(dados.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4">
          <div className="flex items-center gap-1 mb-1"><Award size={10} className="text-[#22C55E]"/><p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Plano</p></div>
          <p className="text-white font-black text-xs uppercase">{dados.tipo || '—'}</p>
        </div>
        {dados.contrato_inicio && (
          <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4">
            <div className="flex items-center gap-1 mb-1"><Calendar size={10} className="text-[#22C55E]"/><p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Início</p></div>
            <p className="text-white font-black text-xs">{fmtData(dados.contrato_inicio)}</p>
          </div>
        )}
        {dados.contrato_fim && (
          <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4">
            <div className="flex items-center gap-1 mb-1"><Clock size={10} className={dados.ativa ? 'text-[#22C55E]' : 'text-red-400'}/><p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Vencimento</p></div>
            <p className={`font-black text-xs ${dados.ativa ? 'text-white' : 'text-red-400'}`}>{fmtData(dados.contrato_fim)}</p>
          </div>
        )}
      </div>

      {/* Histórico */}
      <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1"><History size={10}/> Histórico de Pagamentos</p>
        {dados.historicoPagamentos.length === 0 ? (
          <p className="text-slate-600 text-xs">Nenhum pagamento registrado ainda.</p>
        ) : (
          <div className="space-y-2">
            {dados.historicoPagamentos.map((p, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 bg-[#22C55E] rounded-full shrink-0 mt-1.5"/>
                <span className="text-[11px] text-slate-400">{new Date(p.data).toLocaleDateString('pt-BR')} — {p.descricao}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CTA renovação */}
      {(!dados.ativa || (diasParaVencer !== null && diasParaVencer <= 60)) && (
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`Olá! Sou associado da ${CDL.nome}, protocolo #${String(dados.id).padStart(6,'0')}, e gostaria de renovar minha associação.`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full bg-[#22C55E] hover:bg-[#16A34A] text-[#0B1120] py-3.5 rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-2"
        >
          <MessageCircle size={14}/> Entrar em contato para renovar
        </a>
      )}
    </div>
  );
}

/* ── ABA: CONSULTA SPC ────────────────────────────────────────── */
function AbaSPC({ dados }: { dados: DadosAssociado }) {
  const [termo, setTermo] = useState('');

  return (
    <div className="space-y-4">
      <div className="bg-[#22C55E]/10 border border-[#22C55E]/20 rounded-3xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-[#22C55E]/20 rounded-xl flex items-center justify-center">
            <ShieldCheck size={20} className="text-[#22C55E]"/>
          </div>
          <div>
            <p className="font-black text-white text-sm uppercase">Consulta de Crédito</p>
            <p className="text-[10px] text-[#22C55E] font-bold uppercase tracking-widest">Benefício exclusivo CDL</p>
          </div>
        </div>
        <p className="text-slate-400 text-xs leading-relaxed">
          Como associado ativo da {CDL.nome}, você terá acesso a consultas de crédito por CNPJ ou CPF diretamente neste portal. O maior benefício da filiação CDL.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">CNPJ ou CPF para consultar</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="000.000.000-00 ou 00.000.000/0001-00"
            value={termo}
            onChange={e => setTermo(e.target.value)}
            disabled
            className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-white font-mono text-sm outline-none placeholder:text-slate-600 opacity-50 cursor-not-allowed"
          />
        </div>

        <button
          disabled
          className="w-full bg-slate-700/50 text-slate-500 py-4 rounded-2xl font-black uppercase text-sm tracking-widest cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Shield size={16}/> Consultar — Em breve
        </button>
      </div>

      <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4 space-y-3">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">O que você vai poder consultar</p>
        {[
          'Situação de crédito por CNPJ ou CPF',
          'Pendências financeiras e restrições',
          'Score de crédito atualizado',
          'Histórico de protestos e cheques',
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-slate-400">
            <CheckCircle2 size={11} className="text-slate-600 shrink-0"/> {item}
          </div>
        ))}
      </div>

      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4">
        <p className="text-yellow-400 text-xs font-bold flex items-center gap-2">
          <Clock size={12} className="shrink-0"/> Disponível em breve — aguardando contrato com bureau de crédito
        </p>
      </div>
    </div>
  );
}

/* ── ABA: MEUS DADOS ─────────────────────────────────────────── */
function AbaMeusDados({ dados }: { dados: DadosAssociado }) {
  const campos = [
    { icon: <User size={12} className="text-[#22C55E]"/>, label: 'Empresa', valor: dados.empresa },
    { icon: <Hash size={12} className="text-[#22C55E]"/>, label: 'CNPJ', valor: dados.cnpj || '—' },
    { icon: <Tag size={12} className="text-[#22C55E]"/>, label: 'Segmento', valor: dados.segmento || '—' },
    { icon: <MapPin size={12} className="text-[#22C55E]"/>, label: 'Município', valor: dados.cidade || '—' },
    { icon: <Phone size={12} className="text-[#22C55E]"/>, label: 'Telefone', valor: dados.telefone || '—' },
    { icon: <Award size={12} className="text-[#22C55E]"/>, label: 'Tipo de Associação', valor: dados.tipo || '—' },
    { icon: <Hash size={12} className="text-[#22C55E]"/>, label: 'Protocolo', valor: `#${String(dados.id).padStart(6, '0')}` },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-[#0F172A] border border-white/5 rounded-2xl divide-y divide-white/5">
        {campos.map((c, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <div className="shrink-0">{c.icon}</div>
            <div className="flex-1 min-w-0">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{c.label}</p>
              <p className="text-white text-xs font-bold truncate mt-0.5">{c.valor}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3">Falar com a {CDL.nome}</p>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`Olá! Sou associado da ${CDL.nome} — ${dados.empresa}, protocolo #${String(dados.id).padStart(6,'0')}.`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E] py-3 rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-2"
        >
          <MessageCircle size={14}/> Enviar mensagem
        </a>
      </div>
    </div>
  );
}

/* ── PORTAL PRINCIPAL ─────────────────────────────────────────── */
function PortalAssociadoConteudo({ dados, onSair }: { dados: DadosAssociado; onSair: () => void }) {
  const [aba, setAba] = useState<Aba>('carteirinha');

  const ABAS: { id: Aba; label: string; icon: React.ReactNode }[] = [
    { id: 'carteirinha', label: 'Carteirinha', icon: <QrCode size={20}/> },
    { id: 'financeiro',  label: 'Financeiro',  icon: <CreditCard size={20}/> },
    { id: 'spc',         label: 'Consulta SPC', icon: <Shield size={20}/> },
    { id: 'dados',       label: 'Meus Dados',  icon: <User size={20}/> },
  ];

  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col max-w-md mx-auto w-full">
      {/* Header fixo */}
      <div className="sticky top-0 z-10 bg-[#0B1120]/95 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#22C55E] rounded-xl flex items-center justify-center font-black text-[#0B1120] text-xs">CDL</div>
          <div>
            <p className="font-black text-white text-xs uppercase tracking-tight leading-none">{dados.empresa}</p>
            <p className="text-[9px] text-[#22C55E] font-bold uppercase tracking-widest mt-0.5">#{String(dados.id).padStart(6, '0')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase ${dados.ativa ? 'bg-[#22C55E]/20 text-[#22C55E]' : 'bg-red-500/20 text-red-400'}`}>
            {dados.ativa ? <CheckCircle2 size={9}/> : <XCircle size={9}/>}
            {dados.ativa ? 'Ativo' : 'Vencido'}
          </div>
          <button onClick={onSair} className="p-1.5 text-slate-500 hover:text-white transition-colors">
            <ArrowLeft size={16}/>
          </button>
        </div>
      </div>

      {/* Conteúdo da aba */}
      <div className="flex-1 overflow-y-auto px-4 py-5 pb-28">
        {aba === 'carteirinha' && <AbaCarteirinha dados={dados}/>}
        {aba === 'financeiro'  && <AbaFinanceiro  dados={dados}/>}
        {aba === 'spc'         && <AbaSPC         dados={dados}/>}
        {aba === 'dados'       && <AbaMeusDados   dados={dados}/>}
      </div>

      {/* Nav inferior fixo */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-[#0B1120]/95 backdrop-blur-md border-t border-white/10 flex z-10">
        {ABAS.map(a => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-all ${aba === a.id ? 'text-[#22C55E]' : 'text-slate-600 hover:text-slate-400'}`}
          >
            {a.icon}
            <span className="text-[9px] font-black uppercase tracking-wide leading-none">{a.label}</span>
            {aba === a.id && <div className="w-4 h-0.5 bg-[#22C55E] rounded-full mt-0.5"/>}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── TELA DE LOGIN ────────────────────────────────────────────── */
export default function PortalAssociadoPage() {
  const [cnpj, setCnpj] = useState('');
  const [protocolo, setProtocolo] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [dados, setDados] = useState<DadosAssociado | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    setLoading(true);
    const res = await fetch(`/api/portal-cdl/associado?cnpj=${encodeURIComponent(cnpj)}&id=${encodeURIComponent(protocolo)}`);
    const json = await res.json();
    if (!res.ok) setErro(json.erro || 'Não foi possível verificar os dados.');
    else setDados(json);
    setLoading(false);
  };

  if (dados) return <PortalAssociadoConteudo dados={dados} onSair={() => setDados(null)}/>;

  return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-4">
      <div className="bg-[#0F172A] border border-white/10 p-8 rounded-3xl max-w-md w-full shadow-2xl animate-in fade-in duration-500">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 bg-[#22C55E] rounded-xl flex items-center justify-center font-black text-[#0B1120] text-xl shadow-[0_0_20px_rgba(34,197,94,0.3)]">CDL</div>
            <div className="text-left">
              <p className="font-black text-white text-sm uppercase tracking-tight">{CDL.nome}</p>
              <p className="text-[10px] text-[#22C55E] uppercase tracking-widest font-bold">Área do Associado</p>
            </div>
          </div>
          <h1 className="text-xl font-black text-white uppercase italic tracking-tighter">Acessar Portal</h1>
          <p className="text-slate-400 text-sm mt-2">Informe seu CNPJ e número de protocolo.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">CNPJ</label>
            <input
              type="text" inputMode="numeric" placeholder="00.000.000/0001-00"
              value={cnpj} onChange={e => setCnpj(maskCnpj(e.target.value))} required
              className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-white font-mono text-sm outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"
            />
          </div>
          <div>
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Número do Protocolo</label>
            <input
              type="text" inputMode="numeric" placeholder="Ex: 000123"
              value={protocolo} onChange={e => setProtocolo(e.target.value.replace(/\D/g, '').slice(0, 6))} required
              className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-white font-mono text-sm outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"
            />
          </div>
          <button
            type="submit"
            disabled={loading || cnpj.replace(/\D/g, '').length !== 14 || !protocolo}
            className="w-full bg-[#22C55E] hover:bg-[#16A34A] text-[#0B1120] py-4 rounded-2xl font-black uppercase text-sm tracking-widest disabled:opacity-50 flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
          >
            {loading ? <Loader2 size={18} className="animate-spin"/> : <LogIn size={18}/>}
            {loading ? 'Verificando...' : 'Acessar'}
          </button>
        </form>

        {erro && (
          <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mt-4">
            <AlertCircle size={18} className="text-red-400 shrink-0"/>
            <p className="text-red-400 text-sm font-bold">{erro}</p>
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-white/5 flex flex-col gap-2">
          <Link href="/portal-cdl/status" className="text-center text-slate-500 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors">
            Acompanhar pré-cadastro
          </Link>
          <Link href="/portal-cdl" className="text-center text-slate-600 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors">
            Novo cadastro
          </Link>
        </div>
      </div>
    </div>
  );
}
