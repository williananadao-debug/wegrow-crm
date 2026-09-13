"use client";
import { useState, useEffect } from 'react';
import { Loader2, X, FileText, Receipt, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type NotaDetalhe = {
  id: number; tipo: string; numero: string | null; serie: string | null;
  chave_acesso: string | null; cnpj_participante: string | null; nome_participante: string | null;
  valor_total: number | null; status: string; origem: string;
  xml_url: string | null; danfe_url: string | null; data_emissao: string | null;
  observacao: string | null; itens_status: string; created_at: string;
};

type ItemDetalhe = {
  id: number; descricao: string; quantidade: number; valor_unitario: number;
  status: string; servico_id: number | null;
};

const STATUS_ITEM_LABEL: Record<string, { label: string; cor: string }> = {
  confirmado: { label: 'Confirmado', cor: 'text-[var(--cor-primaria)] bg-[rgb(var(--cor-primaria-rgb)/10%)]' },
  pendente: { label: 'Pendente', cor: 'text-amber-400 bg-amber-500/10' },
  ignorado: { label: 'Ignorado', cor: 'text-slate-500 bg-white/5' },
};

// Painel "só ver" — mostra tudo que a nota já tem gravado (cabeçalho + itens), sem
// nenhuma ação de confirmar/editar. RevisarItensNotaModal já cobre o fluxo de decidir o
// que fazer com item pendente; esse aqui é só pra consultar uma nota (de qualquer status)
// depois que ela já existe, de dentro do Kardex do Estoque ou da lista em /pulse/fiscal.
export default function VerNotaFiscalModal({ aberto, onFechar, notaId }: { aberto: boolean; onFechar: () => void; notaId: number | null }) {
  const [carregando, setCarregando] = useState(true);
  const [nota, setNota] = useState<NotaDetalhe | null>(null);
  const [itens, setItens] = useState<ItemDetalhe[]>([]);

  useEffect(() => {
    if (!aberto || !notaId) return;
    setCarregando(true); setNota(null); setItens([]);
    Promise.all([
      supabase.from('fiscal_notas').select('*').eq('id', notaId).single(),
      supabase.from('fiscal_notas_itens').select('id, descricao, quantidade, valor_unitario, status, servico_id').eq('nota_id', notaId).order('id'),
    ]).then(([resNota, resItens]) => {
      setNota((resNota.data as NotaDetalhe) || null);
      setItens((resItens.data as ItemDetalhe[]) || []);
      setCarregando(false);
    });
  }, [aberto, notaId]);

  if (!aberto) return null;

  const arquivo = nota?.danfe_url || nota?.xml_url;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-black text-white uppercase italic text-lg flex items-center gap-2"><Receipt size={20} className="text-purple-400" /> Nota Fiscal</h3>
          <button onClick={onFechar} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
        </div>

        {carregando ? (
          <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>
        ) : !nota ? (
          <p className="text-slate-500 text-sm text-center py-10">Nota não encontrada.</p>
        ) : (
          <div className="space-y-4">
            <div className="bg-black/30 border border-white/5 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-white font-black text-base truncate min-w-0">{nota.nome_participante || 'Sem fornecedor/cliente informado'}</p>
                <span className="shrink-0 text-[9px] font-black uppercase px-2 py-1 rounded-full bg-white/5 text-slate-400">{nota.tipo === 'entrada' ? 'Entrada' : 'Saída'}</span>
              </div>
              {nota.cnpj_participante && <p className="text-slate-500 text-xs">CNPJ {nota.cnpj_participante}</p>}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 pt-1">
                {nota.numero && <span><b className="text-slate-300">NF</b> {nota.numero}{nota.serie ? `/${nota.serie}` : ''}</span>}
                {nota.data_emissao && <span><b className="text-slate-300">Emissão</b> {new Date(nota.data_emissao).toLocaleDateString('pt-BR')}</span>}
                <span><b className="text-slate-300">Lançada em</b> {new Date(nota.created_at).toLocaleDateString('pt-BR')}</span>
              </div>
              {nota.chave_acesso && <p className="text-slate-600 text-[10px] font-mono break-all">{nota.chave_acesso}</p>}
              {nota.observacao && (
                <div className="bg-black/40 border border-white/5 rounded-lg p-2.5 mt-1 max-h-28 overflow-y-auto">
                  <p className="text-slate-500 text-[10px] italic break-all whitespace-pre-wrap leading-relaxed">{nota.observacao}</p>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Itens ({itens.length})</p>
                <p className="text-white font-black text-sm">R$ {(nota.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
              {itens.length === 0 ? (
                <p className="text-slate-500 text-xs text-center py-6 bg-black/20 rounded-xl">Essa nota não tem itens lançados.</p>
              ) : (
                <div className="space-y-1.5">
                  {itens.map(item => {
                    const info = STATUS_ITEM_LABEL[item.status] || { label: item.status, cor: 'text-slate-400 bg-white/5' };
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-2 bg-black/30 border border-white/5 rounded-xl px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-white text-xs font-bold truncate">{item.descricao}</p>
                          <p className="text-slate-500 text-[10px]">{item.quantidade}x R$ {item.valor_unitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <span className={`shrink-0 text-[8px] font-black uppercase px-2 py-0.5 rounded ${info.cor}`}>{info.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {arquivo ? (
              <a href={arquivo} target="_blank" rel="noopener noreferrer" className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-black uppercase text-xs py-3 rounded-xl transition-colors">
                <ExternalLink size={14} /> Abrir arquivo original ({nota.danfe_url ? 'foto/PDF' : 'XML'})
              </a>
            ) : (
              <p className="text-slate-600 text-[10px] text-center flex items-center justify-center gap-1.5"><FileText size={11} /> Sem arquivo original salvo pra essa nota.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
