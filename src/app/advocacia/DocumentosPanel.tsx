"use client";
import { useState, useEffect, useCallback } from 'react';
import { Upload, FileText, Trash2, Loader2, Download, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { AdvocaciaDocumento, CATEGORIA_DOCUMENTO_LABELS, fmtData } from './shared';

// Painel de upload/lista de documentos, reaproveitado tanto no modal de lead (Processos)
// quanto no cadastro de cliente — bucket privado "advocacia-documentos" (dado jurídico é
// sensível: RG/CPF, procuração), visualização via signed URL gerada na hora do clique,
// nunca uma URL pública guardada. Mesmo padrão de caminho do bucket "nexus"
// (empresa_id/dono/timestamp.ext), mas dono aqui é lead_id OU client_id.
export default function DocumentosPanel({ leadId, clientId, processoId }: { leadId?: number; clientId?: number; processoId?: number }) {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const user = auth.user;

  const [itens, setItens] = useState<AdvocaciaDocumento[]>([]);
  const [loading, setLoading] = useState(true);
  const [formAberto, setFormAberto] = useState(false);
  const [categoria, setCategoria] = useState<AdvocaciaDocumento['categoria']>('documento_pessoal');
  const [titulo, setTitulo] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    if (!perfil?.empresa_id || (!leadId && !clientId)) { setLoading(false); return; }
    setLoading(true);
    let query = supabase.from('advocacia_documentos').select('*').eq('empresa_id', perfil.empresa_id).order('created_at', { ascending: false });
    query = clientId ? query.eq('client_id', clientId) : query.eq('lead_id', leadId as number);
    const { data } = await query;
    setItens((data as AdvocaciaDocumento[]) || []);
    setLoading(false);
  }, [perfil?.empresa_id, leadId, clientId]);

  useEffect(() => { carregar(); }, [carregar]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!arquivo || !titulo.trim() || !perfil?.empresa_id || (!leadId && !clientId)) return;
    setEnviando(true);
    setErro('');
    try {
      const ext = arquivo.name.split('.').pop() || 'bin';
      const dono = clientId || leadId;
      const path = `${perfil.empresa_id}/${dono}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('advocacia-documentos').upload(path, arquivo, { upsert: false, contentType: arquivo.type || undefined });
      if (upErr) throw upErr;
      const payload = {
        empresa_id: perfil.empresa_id,
        client_id: clientId || null,
        lead_id: leadId || null,
        processo_id: processoId || null,
        categoria,
        titulo: titulo.trim(),
        arquivo_path: path,
        tamanho_bytes: arquivo.size,
        responsavel_nome: perfil?.nome || null,
        user_id: user?.id,
      };
      const { data, error } = await supabase.from('advocacia_documentos').insert([payload]).select();
      if (error) throw error;
      if (data) setItens(prev => [data[0] as AdvocaciaDocumento, ...prev]);
      setTitulo(''); setArquivo(null); setFormAberto(false);
    } catch (err: any) {
      setErro(err?.message || 'Erro ao enviar arquivo.');
    } finally {
      setEnviando(false);
    }
  };

  const abrir = async (item: AdvocaciaDocumento) => {
    const { data } = await supabase.storage.from('advocacia-documentos').createSignedUrl(item.arquivo_path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const excluir = async (item: AdvocaciaDocumento) => {
    if (!confirm(`Excluir "${item.titulo}"? Essa ação não pode ser desfeita.`)) return;
    await supabase.storage.from('advocacia-documentos').remove([item.arquivo_path]);
    const { error } = await supabase.from('advocacia_documentos').delete().eq('id', item.id);
    if (!error) setItens(prev => prev.filter(i => i.id !== item.id));
  };

  if (!leadId && !clientId) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-bold uppercase text-[#9a958a] flex items-center gap-1.5"><FileText size={12} /> Documentos</p>
        <button onClick={() => setFormAberto(v => !v)} className="text-[11px] font-semibold text-[#d9861c] hover:underline flex items-center gap-1">
          {formAberto ? <X size={12} /> : <Upload size={12} />} {formAberto ? 'Cancelar' : 'Enviar documento'}
        </button>
      </div>

      {formAberto && (
        <form onSubmit={enviar} className="bg-[#faf7f2] border border-[#e5e0d5] rounded-xl p-3 mb-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] font-bold uppercase text-[#9a958a]">Categoria</label>
              <select value={categoria} onChange={e => setCategoria(e.target.value as AdvocaciaDocumento['categoria'])}
                className="w-full mt-1 border border-[#e5e0d5] rounded-lg px-2.5 py-1.5 text-[13px] bg-white focus:outline-none focus:border-[#d9861c]">
                {Object.entries(CATEGORIA_DOCUMENTO_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-[#9a958a]">Arquivo</label>
              <input type="file" onChange={e => setArquivo(e.target.files?.[0] || null)} required
                className="w-full mt-1 text-[11px] text-[#6b6862] file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-[#fdf0d4] file:text-[#d9861c]" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-[#9a958a]">Título</label>
            <input value={titulo} onChange={e => setTitulo(e.target.value)} required placeholder="Ex: Procuração assinada"
              className="w-full mt-1 border border-[#e5e0d5] rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-[#d9861c]" />
          </div>
          {erro && <p className="text-[11px] text-[#d63f3f] font-semibold">{erro}</p>}
          <button type="submit" disabled={enviando || !arquivo || !titulo.trim()}
            className="w-full bg-[#241c14] hover:bg-[#3a2c1c] disabled:opacity-50 text-white py-2 rounded-lg text-[12.5px] font-semibold transition-all flex items-center justify-center gap-2">
            {enviando ? <Loader2 size={13} className="animate-spin" /> : 'Enviar'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-[#d9861c]" /></div>
      ) : itens.length === 0 ? (
        <p className="text-[12px] text-[#9a958a]">Nenhum documento enviado ainda.</p>
      ) : (
        <div className="space-y-1.5">
          {itens.map(item => (
            <div key={item.id} className="flex items-center justify-between gap-2 bg-[#faf7f2] border border-[#e5e0d5] rounded-lg px-3 py-2">
              <button onClick={() => abrir(item)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                <FileText size={14} className="text-[#d9861c] flex-shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold text-[#241c14] truncate">{item.titulo}</span>
                  <span className="block text-[10.5px] text-[#9a958a]">{CATEGORIA_DOCUMENTO_LABELS[item.categoria]} · {fmtData(item.created_at)}</span>
                </span>
              </button>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => abrir(item)} className="p-1.5 text-[#6b6862] hover:text-[#d9861c]"><Download size={13} /></button>
                <button onClick={() => excluir(item)} className="p-1.5 text-[#6b6862] hover:text-[#d63f3f]"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
