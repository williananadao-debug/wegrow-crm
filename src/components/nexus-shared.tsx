import { FileText, Image as ImageIcon, Box, Wrench } from 'lucide-react';

export type NexusCategoria = 'foto' | 'documento' | 'layout3d' | 'manutencao';

export type NexusArquivo = {
  id: number; client_id: number; categoria: NexusCategoria; titulo: string; tags: string[];
  arquivo_url: string; arquivo_path: string; responsavel_nome?: string | null; user_id?: string | null; created_at: string;
};

export const NEXUS_CATS: { key: 'todos' | NexusCategoria; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'foto', label: 'Fotos' },
  { key: 'documento', label: 'Documentos' },
  { key: 'layout3d', label: 'Layouts 3D' },
  { key: 'manutencao', label: 'Manutenções' },
];

export const NEXUS_CAT_LABEL: Record<NexusCategoria, string> = { foto: 'Foto', documento: 'Documento', layout3d: 'Layout 3D', manutencao: 'Manutenção' };

export const NEXUS_CAT_BG: Record<NexusCategoria, string> = {
  foto: 'bg-sky-500/10 text-sky-400',
  documento: 'bg-amber-500/10 text-amber-400',
  layout3d: 'bg-indigo-500/10 text-indigo-400',
  manutencao: 'bg-orange-500/10 text-orange-400',
};

export function NexusIcon({ categoria, size = 20 }: { categoria: NexusCategoria; size?: number }) {
  if (categoria === 'foto') return <ImageIcon size={size} />;
  if (categoria === 'documento') return <FileText size={size} />;
  if (categoria === 'layout3d') return <Box size={size} />;
  return <Wrench size={size} />;
}

// Fotos mostram a miniatura real do arquivo; as outras categorias (documento/layout/
// manutenção) não têm como gerar preview de PDF/etc. no cliente, então caem no ícone.
export function NexusThumb({ categoria, arquivoUrl, titulo, size = 20 }: { categoria: NexusCategoria; arquivoUrl: string; titulo?: string; size?: number }) {
  if (categoria === 'foto') {
    return <img src={arquivoUrl} alt={titulo || ''} className="w-full h-full object-cover" />;
  }
  return <NexusIcon categoria={categoria} size={size} />;
}
