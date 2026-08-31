"use client";
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Loader2, Gavel } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { fmtData } from './shared';

type Processo = { id: number; numero_processo: string | null; tribunal: string | null; ultima_sincronizacao: string | null };
type Andamento = { id: number; nome: string; data_hora: string };

// Captura automática de andamentos via API Pública do DataJud (CNJ) — gratuita, cobre
// todos os tribunais do país. Só aparece depois que o lead vira advocacia_processos
// (ao entrar em "Contrato fechado" no funil) — processo em negociação ainda não tem
// número de processo pra sincronizar.
export default function AndamentosProcessuais({ leadId }: { leadId: number }) {
  const auth = useAuth() || {};
  const perfil = auth.perfil;

  const [processo, setProcesso] = useState<Processo | null>(null);
  const [andamentos, setAndamentos] = useState<Andamento[]>([]);
  const [numeroProcesso, setNumeroProcesso] = useState('');
  const [tribunal, setTribunal] = useState('');
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data: proc } = await supabase.from('advocacia_processos')
      .select('id, numero_processo, tribunal, ultima_sincronizacao').eq('lead_id', leadId).maybeSingle();
    setProcesso(proc as Processo | null);
    setNumeroProcesso(proc?.numero_processo || '');
    setTribunal(proc?.tribunal || '');
    if (proc?.id) {
      const { data: itens } = await supabase.from('advocacia_andamentos')
        .select('id, nome, data_hora').eq('processo_id', proc.id).order('data_hora', { ascending: false }).limit(30);
      setAndamentos((itens as Andamento[]) || []);
    }
    setLoading(false);
  }, [leadId]);

  useEffect(() => { carregar(); }, [carregar]);

  const salvarNumero = async () => {
    if (!processo) return;
    setSalvando(true);
    await supabase.from('advocacia_processos').update({
      numero_processo: numeroProcesso.trim() || null,
      tribunal: tribunal.trim().toLowerCase() || null,
    }).eq('id', processo.id);
    setSalvando(false);
    carregar();
  };

  const sincronizar = async () => {
    if (!processo || !perfil?.empresa_id) return;
    setSincronizando(true);
    setErro('');
    try {
      const res = await fetch('/api/advocacia/sincronizar-andamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_id: perfil.empresa_id, processo_id: processo.id }),
      });
      const json = await res.json();
      if (!res.ok) { setErro(json.erro || 'Erro ao sincronizar.'); }
      else { await carregar(); }
    } catch (err: any) {
      setErro(err?.message || 'Erro ao sincronizar.');
    }
    setSincronizando(false);
  };

  if (loading) return <div className="flex justify-center py-3"><Loader2 size={14} className="animate-spin text-[#d9861c]" /></div>;
  if (!processo) return null;

  return (
    <div>
      <p className="text-[11px] font-bold uppercase text-[#9a958a] flex items-center gap-1.5 mb-2"><Gavel size={12} /> Andamentos processuais</p>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label className="text-[10px] font-bold uppercase text-[#9a958a]">Número do processo (CNJ)</label>
          <input value={numeroProcesso} onChange={e => setNumeroProcesso(e.target.value)} onBlur={salvarNumero}
            placeholder="0000000-00.0000.0.00.0000"
            className="w-full mt-1 border border-[#e5e0d5] rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-[#d9861c]" />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-[#9a958a]">Tribunal</label>
          <input value={tribunal} onChange={e => setTribunal(e.target.value)} onBlur={salvarNumero}
            placeholder="ex: tjsp, tjsc, trf4, trt9"
            className="w-full mt-1 border border-[#e5e0d5] rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-[#d9861c]" />
        </div>
      </div>
      <button onClick={sincronizar} disabled={sincronizando || salvando || !numeroProcesso.trim() || !tribunal.trim()}
        className="flex items-center gap-1.5 text-[12px] font-semibold text-[#d9861c] disabled:opacity-40 disabled:cursor-not-allowed mb-2">
        {sincronizando ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Sincronizar andamentos (DataJud)
      </button>
      {erro && <p className="text-[11px] text-[#d63f3f] font-semibold mb-2">{erro}</p>}
      {processo.ultima_sincronizacao && (
        <p className="text-[10.5px] text-[#9a958a] mb-2">Última sincronização: {fmtData(processo.ultima_sincronizacao)}</p>
      )}
      {andamentos.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {andamentos.map(a => (
            <div key={a.id} className="flex items-center justify-between gap-2 bg-[#faf7f2] border border-[#e5e0d5] rounded-lg px-2.5 py-1.5">
              <span className="text-[11.5px] font-semibold text-[#241c14] truncate">{a.nome}</span>
              <span className="text-[10.5px] text-[#9a958a] flex-shrink-0">{fmtData(a.data_hora)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
