"use client";
import { useState, useEffect, useCallback } from 'react';
import { Upload, FileText, Trash2, Loader2, Download, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { fmtData } from './shared';

type Categoria = 'nota_fiscal_compra' | 'nota_fiscal_venda' | 'crlv' | 'laudo_cautelar' | 'contrato' | 'foto' | 'outro';

type DocumentoVeiculo = {
  id: number;
  lead_id: number;
  categoria: Categoria;
  titulo: string;
  arquivo_path: string;
  created_at: string;
};

const CATEGORIA_LABELS: Record<Categoria, string> = {
  nota_fiscal_compra: 'Nota fiscal (compra)',
  nota_fiscal_venda: 'Nota fiscal (venda)',
  crlv: 'CRLV',
  laudo_cautelar: 'Laudo cautelar',
  contrato: 'Contrato',
  foto: 'Foto do veículo',
  outro: 'Outro',
};

// Mesmo padrão de src/app/advocacia/DocumentosPanel.tsx — bucket privado próprio
// (documento de veículo tem CRLV/nota fiscal, dado sensível o bastante pra não ser
// público), signed URL gerada na hora do clique, nunca guardada.
export default function DocumentosVeiculoPanel({ leadId }: { leadId: number }) {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const user = auth.user;

  const [itens, setItens] = useState<DocumentoVeiculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [formAberto, setFormAberto] = useState(false);
  const [categoria, setCategoria] = useState<Categoria>('nota_fiscal_compra');
  const [titulo, setTitulo] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    if (!perfil?.empresa_id || !leadId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from('leads_veiculo_documentos').select('*')
      .eq('empresa_id', perfil.empresa_id).eq('lead_id', leadId).order('created_at', { ascending: false });
    setItens((data as DocumentoVeiculo[]) || []);
    setLoading(false);
  }, [perfil?.empresa_id, leadId]);

  useEffect(() => { carregar(); }, [carregar]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!arquivo || !titulo.trim() || !perfil?.empresa_id) return;
    setEnviando(true);
    setErro('');
    try {
      const ext = arquivo.name.split('.').pop() || 'bin';
      const path = `${perfil.empresa_id}/${leadId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('veiculos-documentos').upload(path, arquivo, { upsert: false, contentType: arquivo.type || undefined });
      if (upErr) throw upErr;
      const payload = {
        empresa_id: perfil.empresa_id, lead_id: leadId, categoria, titulo: titulo.trim(),
        arquivo_path: path, tamanho_bytes: arquivo.size, responsavel_nome: perfil?.nome || null, user_id: user?.id,
      };
      const { data, error } = await supabase.from('leads_veiculo_documentos').insert([payload]).select();
      if (error) throw error;
      if (data) setItens(prev => [data[0] as DocumentoVeiculo, ...prev]);
      setTitulo(''); setArquivo(null); setFormAberto(false);
    } catch (err: any) {
      setErro(err?.message || 'Erro ao enviar arquivo.');
    } finally {
      setEnviando(false);
    }
  };

  const abrir = async (item: DocumentoVeiculo) => {
    const { data } = await supabase.storage.from('veiculos-documentos').createSignedUrl(item.arquivo_path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const excluir = async (item: DocumentoVeiculo) => {
    if (!confirm(`Excluir "${item.titulo}"? Essa ação não pode ser desfeita.`)) return;
    await supabase.storage.from('veiculos-documentos').remove([item.arquivo_path]);
    const { error } = await supabase.from('leads_veiculo_documentos').delete().eq('id', item.id);
    if (!error) setItens(prev => prev.filter(i => i.id !== item.id));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-bold uppercase text-[#8a8a8a] flex items-center gap-1.5"><FileText size={12} /> Documentos</p>
        <button onClick={() => setFormAberto(v => !v)} className="text-[11px] font-semibold text-[#171717] hover:underline flex items-center gap-1">
          {formAberto ? <X size={12} /> : <Upload size={12} />} {formAberto ? 'Cancelar' : 'Enviar documento'}
        </button>
      </div>

      {formAberto && (
        <form onSubmit={enviar} className="bg-[#f5f5f5] border border-[#e0e0e0] rounded-xl p-3 mb-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] font-bold uppercase text-[#8a8a8a]">Categoria</label>
              <select value={categoria} onChange={e => setCategoria(e.target.value as Categoria)}
                className="w-full mt-1 border border-[#e0e0e0] rounded-lg px-2.5 py-1.5 text-[13px] bg-white focus:outline-none focus:border-[#171717]">
                {Object.entries(CATEGORIA_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-[#8a8a8a]">Arquivo</label>
              <input type="file" onChange={e => setArquivo(e.target.files?.[0] || null)} required
                className="w-full mt-1 text-[11px] text-[#5c5c5c] file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-[#e0e0e0] file:text-[#171717]" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-[#8a8a8a]">Título</label>
            <input value={titulo} onChange={e => setTitulo(e.target.value)} required placeholder="Ex: CRLV atualizado"
              className="w-full mt-1 border border-[#e0e0e0] rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-[#171717]" />
          </div>
          {erro && <p className="text-[11px] text-red-600 font-semibold">{erro}</p>}
          <button type="submit" disabled={enviando || !arquivo || !titulo.trim()}
            className="w-full bg-[#171717] hover:bg-black disabled:opacity-50 text-white py-2 rounded-lg text-[12.5px] font-semibold transition-all flex items-center justify-center gap-2">
            {enviando ? <Loader2 size={13} className="animate-spin" /> : 'Enviar'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-[#171717]" /></div>
      ) : itens.length === 0 ? (
        <p className="text-[12px] text-[#8a8a8a]">Nenhum documento enviado ainda.</p>
      ) : (
        <div className="space-y-1.5">
          {itens.map(item => (
            <div key={item.id} className="flex items-center justify-between gap-2 bg-[#f5f5f5] border border-[#e0e0e0] rounded-lg px-3 py-2">
              <button onClick={() => abrir(item)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                <FileText size={14} className="text-[#171717] flex-shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold text-[#171717] truncate">{item.titulo}</span>
                  <span className="block text-[10.5px] text-[#8a8a8a]">{CATEGORIA_LABELS[item.categoria]} · {fmtData(item.created_at)}</span>
                </span>
              </button>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => abrir(item)} className="p-1.5 text-[#5c5c5c] hover:text-[#171717]"><Download size={13} /></button>
                <button onClick={() => excluir(item)} className="p-1.5 text-[#5c5c5c] hover:text-red-600"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
