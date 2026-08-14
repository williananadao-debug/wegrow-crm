"use client";
import { Gift, Megaphone } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import MidiaTabs from '../MidiaTabs';

export default function MidiaPromocoesPage() {
  const auth = useAuth() || {};
  const empresa = auth.empresa;
  const temMidia = Boolean(empresa?.modulos?.midia);

  if (!temMidia) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Megaphone size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">O módulo Demais FM Comercial não está ativo pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <MidiaTabs />
      <div className="bg-[#0B1120] border border-white/10 rounded-3xl p-10 text-center">
        <Gift size={32} className="text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400 font-bold text-sm mb-2">Ainda não construído.</p>
        <p className="text-slate-500 text-xs max-w-md mx-auto">
          Desempenho por promoção (cadastros, recall de patrocinador, matriz de receita vendido/permuta) é uma estrutura de dados
          própria — cada promoção tem nome, período, patrocinadores e resultado por praça. Combina com o Willian o desenho antes de construir.
        </p>
      </div>
    </div>
  );
}
