"use client";
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Loader2, Activity, ArrowLeft, ScanLine, CheckCircle2, XCircle, PackageMinus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePulseAccess } from '../../usePulseAccess';
import { ServicoConfig, alertarEstoqueBaixoSeCruzou } from '../../shared';

type Leitura = { id: string; nome: string; sku: string; ok: boolean; mensagem: string; hora: string };

// Tela simples pro time de operação dar saída de estoque só escaneando o código de barras
// (leitor lê o SKU impresso na etiqueta + manda Enter sozinho, como um teclado) — sem
// digitar quantidade nem motivo, cada leitura tira 1 unidade. Ajuste manual (quantidade
// exata, qualquer motivo) continua só em /pulse/estoque, restrito a diretor/gerente.
export default function SaidaRapidaPage() {
  const { authLoading, temPulse, user, perfil } = usePulseAccess();
  const [servicos, setServicos] = useState<ServicoConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [codigo, setCodigo] = useState('');
  const [processando, setProcessando] = useState(false);
  const [leituras, setLeituras] = useState<Leitura[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!perfil?.empresa_id) return;
    supabase.from('servicos').select('*').eq('empresa_id', perfil.empresa_id).order('nome')
      .then(({ data }) => { if (data) setServicos(data as ServicoConfig[]); setLoading(false); });
  }, [perfil?.empresa_id]);

  useEffect(() => { inputRef.current?.focus(); }, [loading]);

  const registrarLeitura = (nome: string, sku: string, ok: boolean, mensagem: string) => {
    setLeituras(prev => [{ id: crypto.randomUUID(), nome, sku, ok, mensagem, hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }, ...prev].slice(0, 30));
  };

  const processarCodigo = async (skuLido: string) => {
    const sku = skuLido.trim();
    if (!sku || processando) return;
    setProcessando(true);
    const servico = servicos.find(s => (s.sku || '').toLowerCase() === sku.toLowerCase());
    if (!servico) {
      registrarLeitura('—', sku, false, 'SKU não encontrado no catálogo.');
      setProcessando(false);
      setCodigo('');
      inputRef.current?.focus();
      return;
    }
    const atual = servico.estoque ?? 0;
    if (atual <= 0) {
      registrarLeitura(servico.nome, sku, false, 'Sem estoque disponível pra dar saída.');
      setProcessando(false);
      setCodigo('');
      inputRef.current?.focus();
      return;
    }
    const novo = atual - 1;
    setServicos(prev => prev.map(s => s.id === servico.id ? { ...s, estoque: novo } : s));
    await supabase.from('servicos').update({ estoque: novo }).eq('id', servico.id);
    await supabase.from('estoque_movimentacoes').insert([{
      empresa_id: perfil?.empresa_id, servico_id: servico.id, quantidade: -1,
      tipo: 'ajuste', motivo: 'uso_interno', user_id: user?.id, observacao: 'Saída via leitor de código de barras.',
    }]);
    alertarEstoqueBaixoSeCruzou(servico.id, atual, novo, servico.estoque_minimo ?? 5);
    registrarLeitura(servico.nome, sku, true, `Saída registrada — estoque agora: ${novo}`);
    setProcessando(false);
    setCodigo('');
    inputRef.current?.focus();
  };

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
      <header className="mb-6 flex items-center gap-4">
        <Link href="/pulse/estoque" className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors">
          <ArrowLeft size={16} className="text-slate-400" />
        </Link>
        <div>
          <h1 className="text-3xl font-black tracking-tighter uppercase italic text-[var(--cor-primaria)] flex items-center gap-3">
            <ScanLine size={28} /> Saída Rápida
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Escaneie o código de barras — cada leitura tira 1 unidade do estoque</p>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
      ) : (
        <>
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-8 mb-5 text-center">
            <ScanLine size={40} className="text-[var(--cor-primaria)] mx-auto mb-4" />
            <input
              ref={inputRef}
              value={codigo}
              onChange={e => setCodigo(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') processarCodigo(codigo); }}
              onBlur={() => inputRef.current?.focus()}
              autoFocus
              disabled={processando}
              placeholder="Aponte o leitor aqui e escaneie..."
              className="w-full max-w-md mx-auto bg-black/30 border-2 border-white/10 focus:border-[var(--cor-primaria)] rounded-2xl px-5 py-4 text-white text-center text-lg font-mono font-bold outline-none disabled:opacity-50"
            />
            <p className="text-slate-600 text-[10px] font-bold uppercase tracking-widest mt-3">Também aceita digitar o SKU na mão + Enter</p>
          </div>

          <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden">
            <div className="p-4 border-b border-white/5">
              <h3 className="font-black uppercase text-xs text-slate-400 flex items-center gap-2"><PackageMinus size={14} /> Últimas leituras</h3>
            </div>
            {leituras.length === 0 ? (
              <p className="text-slate-600 text-sm font-bold text-center py-10">Nenhuma leitura ainda.</p>
            ) : (
              <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
                {leituras.map(l => (
                  <div key={l.id} className="flex items-center gap-3 p-3">
                    {l.ok ? <CheckCircle2 size={16} className="text-[var(--cor-primaria)] flex-shrink-0" /> : <XCircle size={16} className="text-red-400 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-bold truncate">{l.nome}</p>
                      <p className={`text-[10px] font-bold ${l.ok ? 'text-slate-500' : 'text-red-400'}`}>{l.mensagem} <span className="text-slate-700 font-mono">({l.sku})</span></p>
                    </div>
                    <span className="text-slate-600 text-[10px] flex-shrink-0">{l.hora}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
