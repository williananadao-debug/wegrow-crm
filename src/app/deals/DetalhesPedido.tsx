"use client";
import { useRef, useState } from 'react';
import { ClipboardList, Paperclip, Loader2, FileText, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Detalhes do pedido (como o "Detalhes do pedido" do beComm): PI, autorização, peça, produto,
// campanha, formato, tipo do contrato, governamental, contrato auditado e arquivos anexos.

export type PedidoDetalhes = {
  autorizacao?: string; peca?: string; produto?: string; campanha?: string; formato?: string;
  tipo_contrato?: string; governamental?: boolean; auditado?: boolean;
};
export type ArquivoPedido = { nome: string; path: string };

const TIPOS = ['Contrato', 'Pedido de inserção (PI)', 'Permuta', 'Patrocínio', 'Avulso', 'Pacote anual'];
const BUCKET = 'contratos-assinados';

export default function DetalhesPedido({ numPi, setNumPi, det, setDet, leadId, arquivos, setArquivos, disabled, onAbrirArquivo }: {
  numPi: string; setNumPi: (v: string) => void;
  det: PedidoDetalhes; setDet: (d: PedidoDetalhes) => void;
  leadId: number | null; arquivos: ArquivoPedido[]; setArquivos: (a: ArquivoPedido[]) => void;
  disabled?: boolean; onAbrirArquivo: (path: string) => void;
}) {
  const [aberto, setAberto] = useState(Boolean(numPi || Object.values(det).some(Boolean) || arquivos.length));
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const campo = 'w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs font-medium outline-none focus:border-[var(--cor-primaria)] disabled:opacity-60';
  const rot = 'text-[9px] font-black uppercase text-slate-500 mb-1 block';
  const txt = (k: keyof PedidoDetalhes, l: string, ph = '') => (
    <label className="block"><span className={rot}>{l}</span>
      <input value={(det[k] as string) || ''} disabled={disabled} onChange={e => setDet({ ...det, [k]: e.target.value })} placeholder={ph} className={campo} /></label>
  );
  const simNao = (k: 'governamental' | 'auditado', l: string) => (
    <div><span className={rot}>{l}</span>
      <div className="flex gap-1">
        {[true, false].map(v => (
          <button key={String(v)} type="button" disabled={disabled} onClick={() => setDet({ ...det, [k]: v })}
            className={`flex-1 py-2 rounded-xl border text-[10px] font-black uppercase ${Boolean(det[k]) === v ? 'border-[var(--cor-primaria)] text-[var(--cor-primaria)] bg-[rgb(var(--cor-primaria-rgb)/10%)]' : 'border-white/10 text-slate-500'}`}>{v ? 'Sim' : 'Não'}</button>
        ))}
      </div>
    </div>
  );

  const enviar = async (files: File[]) => {
    if (!leadId || !files.length) return;
    setEnviando(true); setErro('');
    try {
      const novos: ArquivoPedido[] = [];
      for (const f of files) {
        const ext = f.name.split('.').pop() || 'pdf';
        const path = `${leadId}/pedido/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, f, { upsert: true, contentType: f.type || 'application/octet-stream' });
        if (error) throw error;
        novos.push({ nome: f.name, path });
      }
      const todos = [...arquivos, ...novos];
      const { error } = await supabase.from('leads').update({ pedido_arquivos: todos }).eq('id', leadId);
      if (error) throw error;
      setArquivos(todos);
    } catch (e) { setErro((e as Error).message || 'Erro ao enviar.'); }
    finally { setEnviando(false); if (input.current) input.current.value = ''; }
  };
  const remover = async (a: ArquivoPedido) => {
    if (!leadId || !confirm(`Remover "${a.nome}" do pedido?`)) return;
    const todos = arquivos.filter(x => x.path !== a.path);
    await supabase.from('leads').update({ pedido_arquivos: todos }).eq('id', leadId);
    await supabase.storage.from(BUCKET).remove([a.path]).catch(() => null);
    setArquivos(todos);
  };

  return (
    <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
      <button type="button" onClick={() => setAberto(a => !a)} className="w-full flex items-center justify-between">
        <span className="text-[10px] font-black uppercase text-slate-300 flex items-center gap-1"><ClipboardList size={12} /> Detalhes do pedido</span>
        <span className="text-[9px] text-slate-500">{aberto ? 'ocultar' : (numPi ? `PI ${numPi}` : 'PI, autorização, campanha, arquivos…')}</span>
      </button>
      {aberto && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className={rot}>PI (pedido de inserção)</span>
              <input value={numPi} disabled={disabled} onChange={e => setNumPi(e.target.value)} className={campo} /></label>
            {txt('autorizacao', 'Autorização')}
            {txt('peca', 'Peça', 'Ex.: Spot Black Friday')}
            {txt('produto', 'Produto')}
            {txt('campanha', 'Campanha')}
            {txt('formato', 'Formato', 'Ex.: 30", testemunhal')}
            <label className="block col-span-2"><span className={rot}>Tipo do contrato</span>
              <input list="tipos-contrato-pedido" value={det.tipo_contrato || ''} disabled={disabled} onChange={e => setDet({ ...det, tipo_contrato: e.target.value })} placeholder="Digite ou escolha" className={campo} />
              <datalist id="tipos-contrato-pedido">{TIPOS.map(t => <option key={t} value={t} />)}</datalist>
            </label>
            {simNao('governamental', 'Governamental?')}
            {simNao('auditado', 'Contrato auditado?')}
          </div>
          <div>
            <span className={rot}>Arquivos</span>
            {arquivos.length > 0 && (
              <ul className="space-y-1 mb-2">
                {arquivos.map(a => (
                  <li key={a.path} className="flex items-center gap-2 text-xs">
                    <button type="button" onClick={() => onAbrirArquivo(a.path)} className="flex-1 min-w-0 text-left text-sky-300 hover:underline truncate flex items-center gap-1"><FileText size={12} /> {a.nome}</button>
                    {!disabled && <button type="button" onClick={() => remover(a)} className="text-slate-500 hover:text-red-400" aria-label={`Remover ${a.nome}`}><X size={12} /></button>}
                  </li>
                ))}
              </ul>
            )}
            {leadId ? (
              <>
                <input ref={input} type="file" multiple className="hidden" onChange={e => enviar(Array.from(e.target.files || []))} />
                <button type="button" disabled={disabled || enviando} onClick={() => input.current?.click()} className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-2 rounded-xl text-[10px] font-black uppercase text-slate-300 disabled:opacity-50">
                  {enviando ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />} Anexar arquivo (PI, autorização, áudio…)
                </button>
              </>
            ) : <p className="text-[10px] text-slate-500">Salve o lead uma vez para anexar arquivos.</p>}
            {erro && <p className="text-[10px] text-red-400 mt-1">{erro}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
