"use client";
import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import JsBarcode from 'jsbarcode';
import { Loader2, Activity, ArrowLeft, Tag, Printer, Search, CheckSquare, Square } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePulseAccess } from '../../usePulseAccess';
import { ServicoConfig, ehMateriaPrima } from '../../shared';

// Etiqueta de código de barras (Code128, valor = SKU) pra impressora térmica 58mm com
// leitor acoplado — o SKU já existe (auto-gerado se vazio) e passa a ser o próprio código
// de barras: escanear na Saída Rápida lê esse mesmo valor e identifica o produto.
function Etiqueta({ servico }: { servico: ServicoConfig }) {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (svgRef.current && servico.sku) {
      try {
        JsBarcode(svgRef.current, servico.sku, { format: 'CODE128', width: 1.6, height: 38, fontSize: 11, margin: 4 });
      } catch { /* SKU com caractere que o CODE128 não aceita — etiqueta fica em branco, sem travar o resto */ }
    }
  }, [servico.sku]);
  return (
    <div className="etiqueta bg-white text-black p-2 flex flex-col items-center justify-center border border-dashed border-slate-300 rounded-lg">
      <p className="text-[9px] font-black uppercase text-center leading-tight mb-0.5 line-clamp-1">{servico.nome}</p>
      {servico.sku ? <svg ref={svgRef} /> : <p className="text-[9px] text-slate-400">sem SKU</p>}
    </div>
  );
}

export default function EtiquetasPage() {
  const { authLoading, temPulse, perfil } = usePulseAccess();
  const [servicos, setServicos] = useState<ServicoConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!perfil?.empresa_id) return;
    supabase.from('servicos').select('*').eq('empresa_id', perfil.empresa_id).order('nome')
      .then(({ data }) => { if (data) setServicos(data as ServicoConfig[]); setLoading(false); });
  }, [perfil?.empresa_id]);

  const itens = useMemo(() => servicos
    .filter(s => !ehMateriaPrima(s) || true) // matéria-prima também pode precisar de etiqueta (controle de insumo)
    .filter(s => !busca.trim() || s.nome.toLowerCase().includes(busca.trim().toLowerCase()) || (s.sku || '').toLowerCase().includes(busca.trim().toLowerCase())),
    [servicos, busca]);

  const toggle = (id: number) => setSelecionados(prev => {
    const novo = new Set(prev);
    if (novo.has(id)) novo.delete(id); else novo.add(id);
    return novo;
  });
  const marcarTodos = () => setSelecionados(new Set(itens.filter(i => i.sku).map(i => i.id)));
  const desmarcarTodos = () => setSelecionados(new Set());

  const itensParaImprimir = itens.filter(i => selecionados.size === 0 || selecionados.has(i.id));

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;

  if (!temPulse) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Activity size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">O módulo Pulse não está ativo pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <style>{`
        @media print {
          @page { size: 58mm auto; margin: 0; }
          .etiqueta { width: 58mm; page-break-after: always; border: none !important; }
        }
      `}</style>

      <header className="mb-6 flex items-center gap-4 print:hidden">
        <Link href="/pulse/estoque" className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors">
          <ArrowLeft size={16} className="text-slate-400" />
        </Link>
        <div>
          <h1 className="text-3xl font-black tracking-tighter uppercase italic text-[var(--cor-primaria)] flex items-center gap-3">
            <Tag size={28} /> Etiquetas
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Código de barras (SKU) pra impressora térmica 58mm</p>
        </div>
      </header>

      <div className="print:hidden bg-[#0F172A] border border-white/10 rounded-2xl p-4 mb-4 space-y-3">
        <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5">
          <Search size={14} className="text-slate-500 flex-shrink-0" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar produto ou SKU..." className="flex-1 bg-transparent outline-none text-white text-sm" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={marcarTodos} className="text-[10px] font-black uppercase text-slate-400 hover:text-white flex items-center gap-1"><CheckSquare size={12} /> Marcar todos</button>
          <button onClick={desmarcarTodos} className="text-[10px] font-black uppercase text-slate-400 hover:text-white flex items-center gap-1"><Square size={12} /> Limpar seleção</button>
          <span className="text-[10px] text-slate-600">{selecionados.size > 0 ? `${selecionados.size} selecionado(s)` : 'Nenhum selecionado — imprime todos os filtrados'}</span>
          <button onClick={() => window.print()} className="ml-auto bg-[var(--cor-primaria)] hover:bg-[#16A34A] text-[#0B1120] px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">
            <Printer size={14} /> Imprimir ({itensParaImprimir.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
      ) : (
        <>
          <div className="print:hidden grid grid-cols-2 md:grid-cols-4 gap-3">
            {itens.map(s => (
              <button key={s.id} onClick={() => toggle(s.id)} className={`text-left border rounded-xl p-2 transition-all ${selecionados.has(s.id) ? 'border-[var(--cor-primaria)] bg-[rgb(var(--cor-primaria-rgb)/10%)]' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'}`}>
                <p className="text-white text-xs font-bold truncate">{s.nome}</p>
                <p className="text-slate-500 text-[10px] font-mono">{s.sku || 'sem SKU — não gera etiqueta'}</p>
              </button>
            ))}
          </div>

          <div id="area-impressao" className="hidden print:grid grid-cols-1 gap-2 mt-6">
            {itensParaImprimir.filter(s => s.sku).map(s => <Etiqueta key={s.id} servico={s} />)}
          </div>
        </>
      )}
    </div>
  );
}
