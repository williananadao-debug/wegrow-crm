"use client";
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { destacar, textoBuscavel, normalizarTexto } from './palavrasChave';

type VisitaRelatorio = {
  id: number;
  empresa: string;
  observacao?: string;
  user_id?: string;
  cidade?: string;
  unidade?: string;
  lead_id?: number | null;
  created_at: string;
};

type Props = {
  visitas: VisitaRelatorio[];
  palavras: string[];
  modo: 'qualquer' | 'todas';
  dataInicio: string;
  dataFim: string;
  nomesMap: Record<string, string>;
  empresaNome?: string;
  filtros: string[];
  geradoPor?: string;
  onFechar: () => void;
};

const fmtData = (yyyymmdd: string) => (yyyymmdd ? yyyymmdd.split('-').reverse().join('/') : '—');
const fmtDataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const chaveCliente = (nome: string) => nome.trim().toLowerCase();

// Agrupa e conta visitas/clientes/com lead por uma chave qualquer (vendedor, cidade...).
function agrupar(visitas: VisitaRelatorio[], chave: (v: VisitaRelatorio) => string) {
  const mapa = new Map<string, { visitas: number; clientes: Set<string>; comLead: number }>();
  for (const v of visitas) {
    const k = chave(v);
    if (!mapa.has(k)) mapa.set(k, { visitas: 0, clientes: new Set(), comLead: 0 });
    const e = mapa.get(k)!;
    e.visitas++;
    e.clientes.add(chaveCliente(v.empresa));
    if (v.lead_id) e.comLead++;
  }
  return Array.from(mapa.entries())
    .map(([nome, e]) => ({ nome, visitas: e.visitas, clientes: e.clientes.size, comLead: e.comLead }))
    .sort((a, b) => b.visitas - a.visitas);
}

const th = 'text-left text-[9px] font-black uppercase tracking-widest text-slate-500 py-1.5 px-2 border-b border-slate-200';
const td = 'py-1.5 px-2 border-b border-slate-100 text-xs';

type LinhaTabela = { nome: string; visitas: number; clientes: number; comLead: number };

function Tabela({ titulo: t, linhas, rotulo }: { titulo: string; linhas: LinhaTabela[]; rotulo: string }) {
  return (
    <section className="mb-6 break-inside-avoid">
      <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-700 mb-2">{t}</h3>
      <table className="w-full border-collapse">
        <thead><tr><th className={th}>{rotulo}</th><th className={`${th} text-right`}>Visitas</th><th className={`${th} text-right`}>Clientes</th><th className={`${th} text-right`}>Com lead</th></tr></thead>
        <tbody>
          {linhas.map(l => (
            <tr key={l.nome}>
              <td className={`${td} font-bold`}>{l.nome}</td>
              <td className={`${td} text-right`}>{l.visitas}</td>
              <td className={`${td} text-right`}>{l.clientes}</td>
              <td className={`${td} text-right`}>{l.comLead}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// Relatório de visitas pronto pra imprimir / salvar em PDF (pedido da Demais FM). Mesmo
// esquema do Material Semanal em /reports: portal direto no body + classe que esconde o
// resto da página só na impressão (regra em globals.css).
export default function RelatorioVisitas({ visitas, palavras, modo, dataInicio, dataFim, nomesMap, empresaNome, filtros, geradoPor, onFechar }: Props) {
  useEffect(() => {
    document.body.classList.add('modo-exportacao-isolada');
    const estiloPagina = document.createElement('style');
    estiloPagina.textContent = '@page { size: portrait; margin: 12mm; }';
    document.head.appendChild(estiloPagina);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', esc);
    return () => {
      document.body.classList.remove('modo-exportacao-isolada');
      estiloPagina.remove();
      window.removeEventListener('keydown', esc);
    };
  }, [onFechar]);

  const totalClientes = new Set(visitas.map(v => chaveCliente(v.empresa))).size;
  const comLead = visitas.filter(v => v.lead_id).length;
  const conversao = visitas.length > 0 ? Math.round((comLead / visitas.length) * 100) : 0;

  const porPalavra = palavras.map(p => {
    const n = normalizarTexto(p);
    const lista = visitas.filter(v => textoBuscavel(v).includes(n));
    return { nome: p, visitas: lista.length, clientes: new Set(lista.map(v => chaveCliente(v.empresa))).size, comLead: lista.filter(v => v.lead_id).length };
  });
  const porVendedor = agrupar(visitas, v => (v.user_id && nomesMap[v.user_id]) || 'Sem vendedor');
  const porCidade = agrupar(visitas, v => v.cidade || 'Sem cidade').slice(0, 10);
  const ordenadas = [...visitas].sort((a, b) => a.created_at.localeCompare(b.created_at));

  const titulo = palavras.length > 0 ? 'Relatório de Visitas por Palavra-chave' : 'Relatório de Visitas';
  return createPortal(
    <div className="export-overlay-isolada fixed inset-0 z-[9999] bg-slate-100 overflow-y-auto print:static print:overflow-visible print:bg-white">
      <div className="print:hidden sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-2">
        <span className="text-xs font-black uppercase tracking-widest text-slate-500 truncate">Prévia do relatório</span>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-slate-700">
            <Printer size={14} /> Imprimir / PDF
          </button>
          <button onClick={onFechar} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" title="Fechar"><X size={18} /></button>
        </div>
      </div>

      <div className="max-w-[820px] mx-auto bg-white text-slate-900 my-4 md:my-8 p-5 md:p-10 shadow-sm print:shadow-none print:m-0 print:p-0 print:max-w-none">
        <div className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-3 mb-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{empresaNome || 'WeGrow'}</p>
            <h1 className="text-lg md:text-xl font-black uppercase italic tracking-tighter leading-tight">{titulo}</h1>
          </div>
          <div className="text-right text-[10px] text-slate-500 shrink-0">
            <p className="font-bold text-slate-700">{fmtData(dataInicio)} a {fmtData(dataFim)}</p>
            <p>Gerado em {new Date().toLocaleDateString('pt-BR')}{geradoPor ? ` por ${geradoPor}` : ''}</p>
          </div>
        </div>

        {(palavras.length > 0 || filtros.length > 0) && (
          <div className="mb-5 text-xs space-y-1">
            {palavras.length > 0 && (
              <p><span className="font-black uppercase text-[10px] tracking-widest text-slate-500">Palavras-chave: </span>
                {palavras.map(p => <span key={p} className="inline-block bg-amber-100 text-amber-900 font-bold rounded px-1.5 py-0.5 mr-1">{p}</span>)}
                <span className="text-slate-500">({modo === 'todas' ? 'visitas que citam todas' : 'visitas que citam qualquer uma'})</span>
              </p>
            )}
            {filtros.length > 0 && <p><span className="font-black uppercase text-[10px] tracking-widest text-slate-500">Filtros: </span>{filtros.join(' · ')}</p>}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 print:grid-cols-4 gap-2 mb-6">
          {[
            { l: 'Visitas', v: visitas.length },
            { l: 'Clientes', v: totalClientes },
            { l: 'Com lead', v: comLead },
            { l: 'Conversão', v: `${conversao}%` },
          ].map(k => (
            <div key={k.l} className="border border-slate-200 rounded-lg p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{k.l}</p>
              <p className="text-2xl font-black">{k.v}</p>
            </div>
          ))}
        </div>

        {porPalavra.length > 0 && <Tabela titulo="Por palavra-chave" rotulo="Palavra" linhas={porPalavra} />}
        <div className="grid md:grid-cols-2 print:grid-cols-2 gap-x-6">
          <Tabela titulo="Por vendedor" rotulo="Vendedor" linhas={porVendedor} />
          <Tabela titulo={porCidade.length === 10 ? 'Por cidade (top 10)' : 'Por cidade'} rotulo="Cidade" linhas={porCidade} />
        </div>

        <section>
          <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-700 mb-2">Visitas ({ordenadas.length})</h3>
          <div className="divide-y divide-slate-100 border-t border-slate-200">
            {ordenadas.map(v => (
              <div key={v.id} className="py-2.5 break-inside-avoid">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="font-black text-sm">{v.empresa}{v.lead_id ? <span className="ml-2 text-[9px] font-black uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 align-middle">Lead</span> : null}</p>
                  <p className="text-[10px] text-slate-500">{fmtDataHora(v.created_at)}</p>
                </div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">
                  {[(v.user_id && nomesMap[v.user_id]) || null, v.cidade || null, v.unidade || null].filter(Boolean).join(' · ')}
                </p>
                {v.observacao && (
                  <p className="text-xs text-slate-700 mt-1 italic">&ldquo;{destacar(v.observacao, palavras, 'bg-amber-200 text-slate-900 rounded px-0.5 not-italic font-bold')}&rdquo;</p>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>,
    document.body
  );
}
