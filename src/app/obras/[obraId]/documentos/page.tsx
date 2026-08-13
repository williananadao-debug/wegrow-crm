"use client";
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, HardHat, ArrowLeft, Plus, FileText, Trash2, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useObrasAccess } from '../../useObrasAccess';
import { Obra, ObraDocumento, CATEGORIA_DOCUMENTO_LABELS, fmtTamanhoArquivo, fmtData } from '../../shared';

export default function DocumentosObraPage() {
  const { obraId } = useParams<{ obraId: string }>();
  const { authLoading, perfil, user, temObras, isLideranca } = useObrasAccess();

  const [obra, setObra] = useState<Obra | null>(null);
  const [documentos, setDocumentos] = useState<ObraDocumento[]>([]);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [categoria, setCategoria] = useState<ObraDocumento['categoria']>('outro');
  const [excluindo, setExcluindo] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const carregar = async () => {
    if (!perfil?.empresa_id || !obraId) return;
    setLoading(true);
    const [obraRes, docsRes] = await Promise.all([
      supabase.from('obras').select('*').eq('id', obraId).eq('empresa_id', perfil.empresa_id).single(),
      supabase.from('obra_documentos').select('*').eq('obra_id', obraId).order('created_at', { ascending: false }),
    ]);
    setObra(obraRes.data as Obra);
    setDocumentos((docsRes.data as ObraDocumento[]) || []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, [perfil?.empresa_id, obraId]);

  const enviarArquivo = async (file: File) => {
    if (!perfil?.empresa_id) return;
    setEnviando(true);
    const ext = file.name.split('.').pop() || 'bin';
    const path = `${perfil.empresa_id}/${obraId}/documentos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from('obras-arquivos').upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (upErr) { alert('Erro ao enviar arquivo: ' + upErr.message); setEnviando(false); return; }
    const { data: urlData } = supabase.storage.from('obras-arquivos').getPublicUrl(path);

    await supabase.from('obra_documentos').insert([{
      empresa_id: perfil.empresa_id, obra_id: Number(obraId), nome: file.name, categoria,
      arquivo_url: urlData.publicUrl, arquivo_path: path, tamanho_bytes: file.size,
      enviado_por: user?.id || null,
    }]);
    setEnviando(false);
    carregar();
  };

  const excluir = async (doc: ObraDocumento) => {
    if (!confirm(`Excluir "${doc.nome}"?`)) return;
    setExcluindo(doc.id);
    await supabase.storage.from('obras-arquivos').remove([doc.arquivo_path]);
    await supabase.from('obra_documentos').delete().eq('id', doc.id);
    setExcluindo(null);
    carregar();
  };

  if (authLoading || loading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;

  if (!temObras) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <HardHat size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">O módulo Obras não está ativo pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <Link href={`/obras/${obraId}`} className="inline-flex items-center gap-2 text-slate-500 hover:text-white text-xs font-black uppercase tracking-widest mb-6">
        <ArrowLeft size={14} /> Voltar pra {obra?.nome || 'obra'}
      </Link>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tighter uppercase italic text-orange-500 flex items-center gap-3"><FileText size={28} /> Documentos</h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Projetos, licenças, ARTs e demais documentos técnicos da obra</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={categoria} onChange={e => setCategoria(e.target.value as ObraDocumento['categoria'])}
            className="bg-[#0F172A] border border-white/10 rounded-xl px-3 py-2.5 text-xs font-bold uppercase outline-none focus:border-orange-500">
            {Object.entries(CATEGORIA_DOCUMENTO_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input ref={fileInputRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) enviarArquivo(f); e.target.value = ''; }} />
          <button onClick={() => fileInputRef.current?.click()} disabled={enviando}
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-[#0B1120] px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
            {enviando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {enviando ? 'Enviando...' : 'Enviar Documento'}
          </button>
        </div>
      </div>

      {documentos.length === 0 ? (
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <FileText size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">Nenhum documento anexado ainda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {documentos.map(doc => (
            <div key={doc.id} className="bg-[#0F172A] border border-white/10 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center flex-shrink-0"><FileText size={18} className="text-orange-400" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{doc.nome}</p>
                <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">
                  {CATEGORIA_DOCUMENTO_LABELS[doc.categoria]} · {fmtTamanhoArquivo(doc.tamanho_bytes)} · {fmtData(doc.created_at)}
                </p>
              </div>
              <a href={doc.arquivo_url} target="_blank" rel="noopener noreferrer" className="p-2 text-slate-400 hover:text-orange-400 hover:bg-white/5 rounded-lg flex-shrink-0"><Download size={16} /></a>
              {isLideranca && (
                <button onClick={() => excluir(doc)} disabled={excluindo === doc.id} className="p-2 text-slate-400 hover:text-red-400 hover:bg-white/5 rounded-lg flex-shrink-0 disabled:opacity-50">
                  {excluindo === doc.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
