"use client";
import { FileText, FileCode2, MessageCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { motivoRecusaNf, STATUS_NF_FALHA, ehNfComplementar } from '@/lib/fiscalMotivo';

// NF-e (produto) ligadas a uma venda (fiscal_notas.lead_id) — pra achar e mandar a nota pro
// cliente direto da venda. Antes a NF-e só aparecia em Notas Fiscais; na venda só existia o
// botão da NFS-e (serviço), que não é a nota do trailer.
export type NotaVenda = {
  id: number; lead_id: number | null; numero: string | null; serie: string | null; chave_acesso: string | null;
  status: string; danfe_url: string | null; xml_url: string | null; observacao: string | null;
  chave_nf_referenciada: string | null; created_at: string; ref_focus_nfe?: string | null;
};

export const COLUNAS_NOTA_VENDA = 'id, lead_id, numero, serie, chave_acesso, status, danfe_url, xml_url, observacao, chave_nf_referenciada, created_at, ref_focus_nfe';

function numeroDaNota(n: NotaVenda) {
  if (n.numero) return n.numero;
  const c = (n.chave_acesso || '').replace(/\D/g, '');
  return c.length === 44 ? String(parseInt(c.slice(25, 34), 10)) : null;
}

export default function NotasDaVenda({ notas, telefone, cliente, protocolo, compacto }: {
  notas: NotaVenda[]; telefone?: string | null; cliente?: string | null; protocolo?: string; compacto?: boolean;
}) {
  if (!notas.length) return null;
  const tel = (telefone || '').replace(/\D/g, '');
  return (
    <div className={compacto ? 'flex flex-wrap gap-1.5' : 'space-y-2'}>
      {notas.map(n => {
        const falhou = STATUS_NF_FALHA.includes(n.status);
        const processando = !falhou && n.status !== 'autorizada' && n.status !== 'cancelada';
        const num = numeroDaNota(n);
        const tipo = ehNfComplementar(n.ref_focus_nfe) ? 'NF complementar' : n.chave_nf_referenciada ? 'NF de remessa' : 'NF';
        const rotulo = `${tipo}${num ? ` ${num}` : ''}`;
        const msgWpp = n.danfe_url
          ? `Olá${cliente ? `, ${cliente.split(' ')[0]}` : ''}! Segue a nota fiscal${protocolo ? ` do seu pedido ${protocolo}` : ''}: ${n.danfe_url}`
          : '';
        const botao = 'inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-1 rounded-lg border transition-colors';
        return (
          <div key={n.id} className={compacto ? 'flex flex-wrap items-center gap-1.5' : 'bg-black/30 border border-white/10 rounded-xl p-2.5 space-y-1.5'}>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg border ${
                falhou ? 'text-red-400 bg-red-500/10 border-red-500/20'
                  : processando ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                  : n.status === 'cancelada' ? 'text-slate-500 bg-white/5 border-white/10 line-through'
                  : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'}`}>
                {processando && <Loader2 size={9} className="inline animate-spin mr-1" />}
                {rotulo} · {falhou ? 'recusada' : processando ? 'processando' : n.status === 'cancelada' ? 'cancelada' : 'autorizada'}
              </span>
              {n.status === 'autorizada' && n.danfe_url && (
                <a href={n.danfe_url} target="_blank" rel="noopener noreferrer" className={`${botao} text-slate-300 border-white/10 hover:bg-white/10`}><FileText size={10} /> DANFE</a>
              )}
              {n.status === 'autorizada' && n.xml_url && (
                <a href={n.xml_url} target="_blank" rel="noopener noreferrer" className={`${botao} text-slate-300 border-white/10 hover:bg-white/10`}><FileCode2 size={10} /> XML</a>
              )}
              {n.status === 'autorizada' && n.danfe_url && tel.length >= 10 && (
                <a href={`https://wa.me/55${tel}?text=${encodeURIComponent(msgWpp)}`} target="_blank" rel="noopener noreferrer" className={`${botao} text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10`}><MessageCircle size={10} /> Enviar ao cliente</a>
              )}
            </div>
            {falhou && !compacto && (
              <p className="text-[10px] text-red-300 leading-snug flex items-start gap-1"><AlertTriangle size={11} className="shrink-0 mt-0.5" /> {motivoRecusaNf(n.observacao) || 'Recusada pela SEFAZ/Focus NFe.'}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
