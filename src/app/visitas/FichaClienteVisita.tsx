"use client";
import { useEffect, useState } from 'react';
import { Loader2, Building2, FileText, Phone, Mail, MapPin, Store, TrendingUp, Wallet, CalendarClock, AlertTriangle, History, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Ficha do cliente dentro do detalhe da visita: quem é (cadastro), o que já comprou, o que está
// em negociação, se tem conta vencida e o histórico de visitas — pro vendedor chegar no cliente
// sabendo de tudo sem trocar de tela.

type VisitaRef = { id: number; empresa: string; cliente_id?: number | null; lead_id?: number | null };
type Lead = { id: number; status: string; valor_total: number | null; etapa: number | null; created_at: string; fechado_em: string | null; contrato_inicio: string | null; contrato_fim: string | null; followup_em: string | null; vendedor_nome: string | null; unidade: string | null };
type VisitaHist = { id: number; created_at: string; user_id: string | null; observacao: string | null };
type Ficha = {
  cliente: any | null;
  leads: Lead[];
  visitas: VisitaHist[];
  vencidas: { valor: number; qtd: number };
};

const ETAPAS = ['Novo', 'Contato', 'Proposta', 'Negociação'];
const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtData = (d: string | null) => d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR') : '—';

function Kpi({ label, valor, cor = 'text-white' }: { label: string; valor: string; cor?: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-2.5">
      <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`text-sm font-black ${cor}`}>{valor}</p>
    </div>
  );
}

export default function FichaClienteVisita({ visita, empresaId, nomesMap }: { visita: VisitaRef; empresaId?: string; nomesMap: Record<string, string> }) {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [agora] = useState(() => Date.now());

  useEffect(() => {
    if (!empresaId) return;
    let cancelado = false;
    (async () => {
      setCarregando(true);
      // Cliente: o vinculado na visita → o do lead da visita → o cadastro com o mesmo nome
      let clienteId = visita.cliente_id || null;
      if (!clienteId && visita.lead_id) {
        const { data } = await supabase.from('leads').select('client_id').eq('id', visita.lead_id).maybeSingle();
        clienteId = data?.client_id || null;
      }
      let cliente: any = null;
      if (clienteId) {
        const { data } = await supabase.from('clientes').select('*').eq('id', clienteId).maybeSingle();
        cliente = data;
      } else if (visita.empresa?.trim()) {
        const { data } = await supabase.from('clientes').select('*').eq('empresa_id', empresaId).ilike('nome_empresa', visita.empresa.trim()).limit(1);
        cliente = data?.[0] || null;
      }

      const [leadsRes, visitasRes] = await Promise.all([
        cliente
          ? supabase.from('leads').select('id, status, valor_total, etapa, created_at, fechado_em, contrato_inicio, contrato_fim, followup_em, vendedor_nome, unidade').eq('client_id', cliente.id).order('created_at', { ascending: false }).limit(100)
          : Promise.resolve({ data: [] as Lead[] }),
        (cliente
          ? supabase.from('visitas').select('id, created_at, user_id, observacao').eq('empresa_id', empresaId).or(`cliente_id.eq.${cliente.id},empresa.ilike.${JSON.stringify(visita.empresa.trim())}`)
          : supabase.from('visitas').select('id, created_at, user_id, observacao').eq('empresa_id', empresaId).ilike('empresa', visita.empresa.trim())
        ).order('created_at', { ascending: false }).limit(50),
      ]);
      const leads = (leadsRes.data || []) as Lead[];

      // Parcelas vencidas e não pagas das vendas desse cliente
      let vencidas = { valor: 0, qtd: 0 };
      const idsGanhos = leads.filter(l => l.status === 'ganho').map(l => l.id);
      if (idsGanhos.length) {
        const hoje = new Date().toISOString().substring(0, 10);
        const { data: lanc } = await supabase.from('lancamentos').select('valor').in('lead_id', idsGanhos).eq('status', 'pendente').lt('data_vencimento', hoje);
        vencidas = { valor: (lanc || []).reduce((s, l) => s + Number(l.valor || 0), 0), qtd: (lanc || []).length };
      }
      if (!cancelado) { setFicha({ cliente, leads, visitas: (visitasRes.data || []) as VisitaHist[], vencidas }); setCarregando(false); }
    })();
    return () => { cancelado = true; };
  }, [visita.id, visita.cliente_id, visita.lead_id, visita.empresa, empresaId]);

  if (carregando) return <div className="flex items-center gap-2 text-slate-500 text-xs py-3"><Loader2 size={14} className="animate-spin" /> Carregando ficha do cliente...</div>;
  if (!ficha) return null;

  const { cliente, leads, visitas, vencidas } = ficha;
  const hoje = new Date().toISOString().substring(0, 10);
  const ganhos = leads.filter(l => l.status === 'ganho');
  const totalComprado = ganhos.reduce((s, l) => s + Number(l.valor_total || 0), 0);
  const ativos = ganhos.filter(l => l.contrato_fim && l.contrato_fim >= hoje);
  const abertos = leads.filter(l => l.status === 'aberto');
  const perdidos = leads.filter(l => l.status === 'perdido').length;
  const ultimaCompra = ganhos.map(l => l.fechado_em || l.created_at).sort().pop() || null;
  const proximoFim = ativos.map(l => l.contrato_fim!).sort()[0] || null;
  const diasParaVencer = proximoFim ? Math.ceil((new Date(proximoFim + 'T12:00:00').getTime() - agora) / 86400000) : null;
  const followup = abertos.map(l => l.followup_em).filter(Boolean).sort()[0] || null;
  const situacao = ativos.length ? { t: 'Anunciando', c: 'text-green-400 bg-green-500/10 border-green-500/30' }
    : ganhos.length ? { t: 'Ex-cliente (reativar)', c: 'text-blue-400 bg-blue-500/10 border-blue-500/30' }
    : abertos.length ? { t: 'Em negociação', c: 'text-purple-400 bg-purple-500/10 border-purple-500/30' }
    : { t: cliente ? 'Cadastrado, nunca comprou' : 'Sem cadastro', c: 'text-orange-400 bg-orange-500/10 border-orange-500/30' };
  const endereco = cliente ? [[cliente.endereco, cliente.numero].filter(Boolean).join(', '), cliente.bairro, [cliente.cidade, cliente.estado].filter(Boolean).join('/')].filter(Boolean).join(' · ') : '';

  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5"><Building2 size={11} /> Ficha do cliente</p>
        <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${situacao.c}`}>{situacao.t}</span>
      </div>

      {cliente ? (
        <div className="space-y-1 text-xs text-slate-300">
          <p className="text-white font-black">{cliente.razao_social || cliente.nome_empresa}</p>
          {cliente.nome_fantasia && cliente.nome_fantasia !== cliente.nome_empresa && <p className="text-slate-400">{cliente.nome_fantasia}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 pt-1">
            {cliente.cnpj && <p className="flex items-center gap-1.5"><FileText size={11} className="text-blue-400" /> {cliente.cnpj}</p>}
            {cliente.segmento && <p className="flex items-center gap-1.5"><Store size={11} className="text-blue-400" /> {cliente.segmento}</p>}
            {cliente.telefone && <a href={`tel:${cliente.telefone}`} className="flex items-center gap-1.5 hover:text-white"><Phone size={11} className="text-blue-400" /> {cliente.telefone}</a>}
            {cliente.email && <a href={`mailto:${cliente.email}`} className="flex items-center gap-1.5 hover:text-white truncate"><Mail size={11} className="text-blue-400" /> {cliente.email}</a>}
            {endereco && <p className="flex items-start gap-1.5 sm:col-span-2"><MapPin size={11} className="text-blue-400 mt-0.5" /> {endereco}</p>}
            {cliente.user_id && nomesMap[cliente.user_id] && <p className="text-slate-500 sm:col-span-2">Carteira de {nomesMap[cliente.user_id]}</p>}
          </div>
          {Array.isArray(cliente.tags) && cliente.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">{cliente.tags.map((t: string) => <span key={t} className="text-[9px] font-bold bg-white/5 border border-white/10 rounded-full px-2 py-0.5">{t}</span>)}</div>
          )}
        </div>
      ) : (
        <p className="text-xs text-orange-300">Esse comércio ainda não está no cadastro de clientes. Ao criar o lead, o cadastro é feito junto.</p>
      )}

      {cliente && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Kpi label="Total comprado" valor={fmtBRL(totalComprado)} cor="text-green-400" />
          <Kpi label="Compras" valor={`${ganhos.length}${perdidos ? ` · ${perdidos} perdida${perdidos > 1 ? 's' : ''}` : ''}`} />
          <Kpi label="Ticket médio" valor={ganhos.length ? fmtBRL(totalComprado / ganhos.length) : '—'} />
          <Kpi label="Última compra" valor={fmtData(ultimaCompra)} />
        </div>
      )}

      <div className="space-y-1.5 text-[11px]">
        {ativos.length > 0 && (
          <p className={`flex items-center gap-1.5 font-bold ${diasParaVencer !== null && diasParaVencer <= 30 ? 'text-amber-400' : 'text-green-400'}`}>
            <TrendingUp size={12} /> {ativos.length} contrato{ativos.length > 1 ? 's' : ''} no ar · vence em {fmtData(proximoFim)}{diasParaVencer !== null && diasParaVencer <= 30 ? ` (${diasParaVencer} dias — hora de renovar)` : ''}
          </p>
        )}
        {abertos.length > 0 && (
          <p className="flex items-center gap-1.5 text-purple-300 font-bold">
            <Wallet size={12} /> {abertos.length} negociação{abertos.length > 1 ? 'ões' : ''} aberta{abertos.length > 1 ? 's' : ''} · {fmtBRL(abertos.reduce((s, l) => s + Number(l.valor_total || 0), 0))} · etapa {ETAPAS[Number(abertos[0].etapa) || 0] || '—'}
          </p>
        )}
        {followup && <p className="flex items-center gap-1.5 text-blue-300 font-bold"><CalendarClock size={12} /> Próximo follow-up: {fmtData(followup)}</p>}
        {vencidas.qtd > 0 && <p className="flex items-center gap-1.5 text-red-400 font-bold"><AlertTriangle size={12} /> {vencidas.qtd} parcela{vencidas.qtd > 1 ? 's' : ''} vencida{vencidas.qtd > 1 ? 's' : ''} · {fmtBRL(vencidas.valor)} — cobrar antes de vender mais</p>}
      </div>

      {visitas.length > 0 && (
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5 mb-1.5"><History size={11} /> {visitas.length} visita{visitas.length > 1 ? 's' : ''} registrada{visitas.length > 1 ? 's' : ''}</p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar pr-1">
            {visitas.slice(0, 8).map(v => (
              <div key={v.id} className={`text-[11px] rounded-lg px-2.5 py-1.5 border ${v.id === visita.id ? 'border-blue-500/40 bg-blue-500/5' : 'border-white/5 bg-white/[0.02]'}`}>
                <p className="text-slate-400 font-bold">{fmtData(v.created_at)}{v.user_id && nomesMap[v.user_id] ? ` · ${nomesMap[v.user_id]}` : ''}{v.id === visita.id ? ' · esta visita' : ''}</p>
                {v.observacao && <p className="text-slate-500 italic line-clamp-2">&quot;{v.observacao}&quot;</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {leads.length > 0 && (
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Histórico de negócios</p>
          <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar pr-1">
            {leads.slice(0, 10).map(l => (
              <div key={l.id} className="flex items-center justify-between text-[11px] border-b border-white/5 last:border-0 py-1">
                <span className="text-slate-400">LD-{String(l.id).padStart(4, '0')} · {fmtData(l.fechado_em || l.created_at)}{l.unidade ? ` · ${l.unidade}` : ''}</span>
                <span className={`font-black ${l.status === 'ganho' ? 'text-green-400' : l.status === 'perdido' ? 'text-red-400' : 'text-purple-300'}`}>{fmtBRL(Number(l.valor_total || 0))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {cliente && (
        <a href={`/customers?busca=${encodeURIComponent(cliente.nome_empresa)}`} className="flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white pt-1">
          <ExternalLink size={11} /> Abrir cadastro completo
        </a>
      )}
    </div>
  );
}
