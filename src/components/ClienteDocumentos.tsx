'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, FileText, Image as ImageIcon, Trash2, Loader2, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';

// Documentos e arquivos do cadastro do cliente — pra todas as empresas, sem depender do
// módulo Nexus. Bucket PRIVADO "clientes-documentos" (RG/CPF, comprovante, contrato, projeto):
// abre por signed URL gerada no clique, nunca URL pública guardada. Ver migration 20261019110000.
type Categoria = 'documento_pessoal' | 'comprovante' | 'contrato' | 'projeto' | 'foto' | 'outro';
type Documento = {
  id: number; client_id: number; categoria: Categoria; titulo: string; arquivo_path: string;
  tamanho_bytes: number | null; tipo_mime: string | null; responsavel_nome: string | null;
  user_id: string | null; created_at: string;
};

const CATEGORIAS: Record<Categoria, string> = {
  documento_pessoal: 'Documento pessoal (RG/CPF/CNH)',
  comprovante: 'Comprovante (endereço, pagamento)',
  contrato: 'Contrato',
  projeto: 'Projeto / planta',
  foto: 'Foto',
  outro: 'Outro',
};

const BUCKET = 'clientes-documentos';
const LIMITE_MB = 25;

function tamanho(b: number | null) {
  if (!b) return '';
  return b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
}

// Nome do arquivo no storage sem acento/espaço (o Supabase recusa alguns caracteres na chave).
function nomeSeguro(nome: string) {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80);
}

export default function ClienteDocumentos({ clientId }: { clientId: number }) {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const user = auth.user;
  const podeApagarTudo = perfil?.cargo === 'diretor' || perfil?.cargo === 'gerente';

  const [itens, setItens] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoria, setCategoria] = useState<Categoria>('documento_pessoal');
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Sem filtro de empresa_id no client — quem filtra é o RLS (ver o problema da Saída Rápida).
  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('clientes_documentos').select('*').eq('client_id', clientId).order('created_at', { ascending: false });
    if (error) setErro(/clientes_documentos/.test(error.message) ? 'Falta rodar a migration 20261019110000_clientes_documentos.sql no Supabase.' : error.message);
    setItens((data as Documento[]) || []);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { carregar(); }, [carregar]);

  const enviar = async (arquivos: FileList | null) => {
    if (!arquivos?.length || !perfil?.empresa_id) return;
    setErro('');
    for (const arquivo of Array.from(arquivos)) {
      if (arquivo.size > LIMITE_MB * 1024 * 1024) { setErro(`"${arquivo.name}" passa de ${LIMITE_MB} MB.`); continue; }
      setEnviando(arquivo.name);
      try {
        const path = `${perfil.empresa_id}/${clientId}/${Date.now()}-${nomeSeguro(arquivo.name)}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, arquivo, { upsert: false, contentType: arquivo.type || undefined });
        if (upErr) throw upErr;
        const { data, error } = await supabase.from('clientes_documentos').insert([{
          empresa_id: perfil.empresa_id, client_id: clientId, categoria: arquivo.type.startsWith('image/') && categoria === 'outro' ? 'foto' : categoria,
          titulo: arquivo.name, arquivo_path: path, tamanho_bytes: arquivo.size, tipo_mime: arquivo.type || null,
          responsavel_nome: perfil?.nome || null, user_id: user?.id,
        }]).select();
        if (error) { await supabase.storage.from(BUCKET).remove([path]); throw error; }
        if (data) setItens(prev => [data[0] as Documento, ...prev]);
      } catch (err: any) {
        setErro(`"${arquivo.name}": ${err?.message || 'erro ao enviar.'}`);
      }
    }
    setEnviando(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const abrir = async (item: Documento) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(item.arquivo_path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
    else setErro(error?.message || 'Não foi possível abrir o arquivo.');
  };

  const excluir = async (item: Documento) => {
    if (!confirm(`Excluir "${item.titulo}"? Essa ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from('clientes_documentos').delete().eq('id', item.id);
    if (error) { setErro(error.message); return; }
    await supabase.storage.from(BUCKET).remove([item.arquivo_path]);
    setItens(prev => prev.filter(i => i.id !== item.id));
  };

  return (
    <div className="bg-white/5 border border-white/10 p-4 rounded-2xl">
      <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block">Documentos e arquivos {itens.length > 0 ? `(${itens.length})` : ''}</label>

      <div className="flex flex-col sm:flex-row gap-2">
        <select value={categoria} onChange={e => setCategoria(e.target.value as Categoria)}
          className="sm:w-56 bg-[#0B1120] border border-white/10 rounded-lg px-2.5 py-2 text-[11px] text-white outline-none focus:border-indigo-400">
          {Object.entries(CATEGORIAS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={!!enviando}
          className="flex-1 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white font-black uppercase text-[10px] px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-all">
          {enviando ? <><Loader2 size={13} className="animate-spin" /> Enviando {enviando.slice(0, 24)}…</> : <><Upload size={13} /> Anexar arquivos</>}
        </button>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={e => enviar(e.target.files)}
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.dwg,.zip,.txt" />
      </div>
      <p className="text-[10px] text-slate-600 mt-1.5">PDF, foto, Word, Excel, projeto — até {LIMITE_MB} MB cada. Pode selecionar vários de uma vez.</p>
      {erro && <p className="text-red-400 text-[10px] font-bold mt-2">{erro}</p>}

      {loading ? (
        <div className="flex justify-center py-3"><Loader2 size={14} className="animate-spin text-slate-500" /></div>
      ) : itens.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {itens.map(item => (
            <li key={item.id} className="flex items-center justify-between gap-2 bg-[#0B1120] border border-white/5 rounded-lg px-3 py-2">
              <button type="button" onClick={() => abrir(item)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                {item.tipo_mime?.startsWith('image/') ? <ImageIcon size={14} className="text-indigo-400 flex-shrink-0" /> : <FileText size={14} className="text-indigo-400 flex-shrink-0" />}
                <span className="min-w-0">
                  <span className="block text-[11px] text-slate-200 font-bold truncate">{item.titulo}</span>
                  <span className="block text-[10px] text-slate-500 truncate">
                    {CATEGORIAS[item.categoria]} · {new Date(item.created_at).toLocaleDateString('pt-BR')}{item.responsavel_nome ? ` · ${item.responsavel_nome}` : ''}{item.tamanho_bytes ? ` · ${tamanho(item.tamanho_bytes)}` : ''}
                  </span>
                </span>
              </button>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button type="button" onClick={() => abrir(item)} title="Abrir / baixar" className="p-1.5 text-slate-500 hover:text-white"><Download size={13} /></button>
                {(podeApagarTudo || item.user_id === user?.id) && (
                  <button type="button" onClick={() => excluir(item)} title="Excluir" className="p-1.5 text-slate-600 hover:text-red-400"><Trash2 size={13} /></button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
