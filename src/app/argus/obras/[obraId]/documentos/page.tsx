"use client";
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, ArrowLeft, Plus, FileText, Trash2, Download } from 'lucide-react';
import ArgusTopNav from '../../../ArgusTopNav';
import { Obra, ObraDocumento, CATEGORIA_DOCUMENTO_LABELS, fmtTamanhoArquivo, fmtData } from '@/app/obras/shared';

export default function ArgusDocumentosObraPage() {
  const { obraId } = useParams<{ obraId: string }>();
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const user = auth.user;
  const isLideranca = perfil?.cargo === 'diretor' || perfil?.cargo === 'gerente';

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

  if (loading) return <div><ArgusTopNav nomeEmpresa={empresa?.nome} /><div className="p-8 flex justify-center"><Loader2 size={22} className="animate-spin text-[#d9861c]" /></div></div>;

  return (
    <div>
      <ArgusTopNav nomeEmpresa={empresa?.nome} />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <Link href={`/argus/obras/${obraId}`} className="inline-flex items-center gap-2 text-[#9a958a] hover:text-[#241c14] text-xs font-bold uppercase tracking-widest mb-6">
          <ArrowLeft size={14} /> Voltar pra {obra?.nome || 'obra'}
        </Link>

        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#241c14] flex items-center gap-2" style={{ fontFamily: 'var(--font-argus-serif)' }}><FileText size={22} className="text-[#d9861c]" /> Documentos</h1>
            <p className="text-[#9a958a] text-xs font-bold uppercase tracking-wide mt-1">Projetos, licenças, ARTs e demais documentos técnicos</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={categoria} onChange={e => setCategoria(e.target.value as ObraDocumento['categoria'])}
              className="bg-white border border-[#e5e0d5] rounded-xl px-3 py-2.5 text-xs font-bold uppercase text-[#241c14] outline-none focus:border-[#d9861c]">
              {Object.entries(CATEGORIA_DOCUMENTO_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input ref={fileInputRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) enviarArquivo(f); e.target.value = ''; }} />
            <button onClick={() => fileInputRef.current?.click()} disabled={enviando}
              className="inline-flex items-center gap-2 bg-[#d9861c] hover:bg-[#c47716] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all">
              {enviando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {enviando ? 'Enviando...' : 'Enviar Documento'}
            </button>
          </div>
        </div>

        {documentos.length === 0 ? (
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-10 text-center">
            <FileText size={28} className="text-[#d9d5c8] mx-auto mb-3" />
            <p className="text-[#6b6862] font-semibold text-sm">Nenhum documento anexado ainda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {documentos.map(doc => (
              <div key={doc.id} className="bg-white border border-[#e5e0d5] rounded-2xl p-4 flex items-center gap-3 shadow-sm">
                <div className="w-10 h-10 bg-[#fdf0d4] rounded-xl flex items-center justify-center flex-shrink-0"><FileText size={18} className="text-[#d9861c]" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#241c14] truncate">{doc.nome}</p>
                  <p className="text-[10px] text-[#9a958a] font-bold uppercase mt-0.5">
                    {CATEGORIA_DOCUMENTO_LABELS[doc.categoria]} · {fmtTamanhoArquivo(doc.tamanho_bytes)} · {fmtData(doc.created_at)}
                  </p>
                </div>
                <a href={doc.arquivo_url} target="_blank" rel="noopener noreferrer" className="p-2 text-[#9a958a] hover:text-[#d9861c] hover:bg-[#faf7f2] rounded-lg flex-shrink-0"><Download size={16} /></a>
                {isLideranca && (
                  <button onClick={() => excluir(doc)} disabled={excluindo === doc.id} className="p-2 text-[#9a958a] hover:text-[#d63f3f] hover:bg-[#faf7f2] rounded-lg flex-shrink-0 disabled:opacity-50">
                    {excluindo === doc.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
