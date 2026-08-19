"use client";
import { Gift, Megaphone, Instagram, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import MidiaTabs from '../MidiaTabs';
import { PRACAS } from '../shared';

const STATUS_COR: Record<string, string> = {
  'Vendido': 'text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20',
  'Misto': 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  'Permuta': 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  'Não vendido': 'text-slate-500 bg-white/5 border-white/10',
};

export default function MidiaPromocoesPage() {
  const auth = useAuth() || {};
  const empresa = auth.empresa;
  const perfil = auth.perfil;
  const temMidia = Boolean(empresa?.modulos?.midia);
  const isDiretor = perfil?.cargo === 'diretor';

  if (!temMidia || !isDiretor) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Megaphone size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">{!temMidia ? 'O módulo Demais FM Comercial não está ativo pra sua empresa ainda.' : 'Só diretor pode acessar essa área por enquanto (módulo em teste).'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <MidiaTabs />

      <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl px-4 py-3 flex items-center gap-3 mb-6">
        <Sparkles size={16} className="text-amber-400 shrink-0" />
        <p className="text-amber-200 text-xs font-semibold">Pré-visualização da estrutura — os números abaixo são exemplo, ainda não conectados a dado real. Precisa de uma tabela de promoções própria (nome, período, patrocinadores, matriz de resultado por praça) — combina o desenho antes de construir de verdade.</p>
      </div>

      <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5 mb-4">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Promoção · Exemplo</p>
        <h2 className="text-lg font-black text-[#22C55E] mt-0.5">App Premiado Demais</h2>
        <p className="text-[11px] text-slate-500 font-semibold mt-1">Promoção de cadastro via app da rede, com patrocinadores locais do segmento de celulares.</p>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Cadastros na promoção</p>
            <span className="text-[8px] font-black uppercase text-[#22C55E] bg-[#22C55E]/10 px-1.5 py-0.5 rounded">Medido</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {PRACAS.map(p => (
              <div key={p} className="bg-white/[0.03] border border-white/5 rounded-xl p-3">
                <p className="text-[9px] text-slate-500 font-bold uppercase">{p}</p>
                <h3 className="text-lg font-black text-white">—</h3>
              </div>
            ))}
            <div className="bg-[#22C55E]/10 border border-[#22C55E]/20 rounded-xl p-3">
              <p className="text-[9px] text-[#22C55E] font-bold uppercase">Total da rede</p>
              <h3 className="text-lg font-black text-[#22C55E]">—</h3>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Recall do patrocinador por emissora</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {PRACAS.map(p => (
              <div key={p} className="bg-white/[0.03] border border-white/5 rounded-xl p-3">
                <p className="text-[9px] text-slate-500 font-bold uppercase">{p}</p>
                <h3 className="text-lg font-black text-white">—</h3>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Instagram size={11} /> Critérios de compra (pesquisa aberta)</p>
          <p className="text-[11px] text-slate-600 font-bold">Ranking por emissora — qualidade, preço, memória, câmera etc. Precisa de formulário de pesquisa próprio.</p>
        </div>
      </div>

      <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5 overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Matriz de receita — exemplo de estrutura</p>
          <span className="text-[8px] font-black uppercase text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">Uso Interno</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-3 py-2 text-[10px] font-black text-slate-500 uppercase">Promoção</th>
                {PRACAS.map(p => <th key={p} className="text-left px-3 py-2 text-[10px] font-black text-slate-500 uppercase">{p}</th>)}
              </tr>
            </thead>
            <tbody>
              {['App Premiado Demais', 'Dia dos Namorados', 'Clique de Amor'].map(nome => (
                <tr key={nome} className="border-b border-white/5 last:border-0">
                  <td className="px-3 py-3 font-bold text-white text-xs">{nome}</td>
                  {PRACAS.map((p, i) => {
                    const status = ['Vendido', 'Misto', 'Permuta', 'Não vendido'][(nome.length + i) % 4];
                    return (
                      <td key={p} className="px-3 py-3">
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${STATUS_COR[status]}`}>{status}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[9px] text-slate-600 font-semibold mt-3">Cada célula soma "receita líquida" só quando status é Vendido ou Misto — Permuta e Não vendido não somam em R$.</p>
      </div>

      <div className="mt-6 text-center">
        <Gift size={24} className="text-slate-600 mx-auto mb-2" />
        <p className="text-slate-500 text-xs font-bold">Página real fica assim quando a estrutura de dados de promoções existir — hoje é só a maquete visual.</p>
      </div>
    </div>
  );
}
