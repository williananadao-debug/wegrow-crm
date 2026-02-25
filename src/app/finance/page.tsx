"use client";
import { useState } from 'react';
import { 
  Plus, TrendingUp, AlertTriangle, FileText, Barcode
} from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';

// ==========================================
// 1. COMPONENTE NOVO: FINANCEIRO PRO (CDL)
// ==========================================
function FinanceiroPro() {
  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500 text-white p-4">
      <header className="flex justify-between items-end border-b border-white/10 pb-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter uppercase text-blue-500 flex items-center gap-3">
             <FileText size={32}/> Financeiro Avançado
          </h1>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-[0.2em] mt-1">Gestão de Cobranças e Boletos</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-blue-900/20">
          <Plus size={18} /> Nova Fatura
        </button>
      </header>

      {/* PAINEL DE INADIMPLÊNCIA */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-3xl">
           <AlertTriangle className="text-red-500 mb-2" size={24}/>
           <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">Inadimplência</p>
           <h2 className="text-3xl font-black text-white mt-1">12.4%</h2>
        </div>
        <div className="bg-[#0B1120] border border-white/10 p-6 rounded-3xl">
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Atrasados (R$)</p>
           <h2 className="text-2xl font-black text-red-500 mt-1">R$ 8.450,00</h2>
        </div>
        <div className="bg-[#0B1120] border border-white/10 p-6 rounded-3xl">
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">A Vencer (R$)</p>
           <h2 className="text-2xl font-black text-yellow-500 mt-1">R$ 15.200,00</h2>
        </div>
        <div className="bg-[#0B1120] border border-white/10 p-6 rounded-3xl">
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Recebido (R$)</p>
           <h2 className="text-2xl font-black text-[#22C55E] mt-1">R$ 42.100,00</h2>
        </div>
      </div>

      {/* TABELA DE COBRANÇAS */}
      <div className="bg-[#0B1120] border border-white/10 rounded-3xl overflow-hidden">
        <div className="p-6 border-b border-white/5 flex justify-between items-center">
            <h3 className="font-bold uppercase tracking-widest text-sm text-slate-300">Contas a Receber</h3>
        </div>
        <div className="p-6 space-y-3">
            {[
                { id: 1, cliente: 'Empresa X', vencimento: '10/03/2026', valor: 2500, status: 'atrasado' },
                { id: 2, cliente: 'Loja Y', vencimento: '25/03/2026', valor: 1200, status: 'pendente' },
            ].map((fatura) => (
                <div key={fatura.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                    <div>
                        <h4 className="font-black text-white uppercase">{fatura.cliente}</h4>
                        <p className="text-[10px] text-slate-500 font-mono mt-1">Vencimento: {fatura.vencimento}</p>
                    </div>
                    <div className="flex items-center gap-6">
                        <span className="font-black text-lg">R$ {fatura.valor.toLocaleString('pt-BR')}</span>
                        {fatura.status === 'atrasado' ? (
                            <span className="bg-red-500/20 text-red-500 px-3 py-1 rounded text-[10px] font-black uppercase">Atrasado</span>
                        ) : (
                            <span className="bg-yellow-500/20 text-yellow-500 px-3 py-1 rounded text-[10px] font-black uppercase">A Vencer</span>
                        )}
                        <button className="bg-white text-black px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-slate-200 transition-colors">
                            <Barcode size={14}/> Gerar Boleto
                        </button>
                    </div>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 2. COMPONENTE ORIGINAL: FINANCEIRO PADRÃO
// ==========================================
function FinanceiroPadrao() {
  return (
    <div className="p-4 text-white">
        <h1 className="text-4xl font-black tracking-tighter uppercase italic text-[#22C55E]">Fluxo de Caixa Simples</h1>
        <p className="text-slate-400 mt-2">Este é o painel padrão que clientes do Plano Básico vêem.</p>
        <div className="mt-10 p-10 border border-white/10 rounded-3xl text-center bg-white/5">
            <TrendingUp size={48} className="mx-auto text-slate-600 mb-4"/>
            <p className="font-bold text-slate-400 uppercase tracking-widest">Painel Padrão Carregado</p>
        </div>
    </div>
  )
}

// ==========================================
// 3. O ROTEADOR INTELIGENTE (O "GUARDA DE TRÂNSITO")
// ==========================================
export default function FinancePage() {
  const auth = useAuth() || {};
  const perfil = auth.perfil;

  // 👇 COLOQUE O ID DA CDL AQUI 👇
  const ID_DA_CDL = 'b1e53603-de85-473f-90dc-5efff638b571';

  // Se o usuário logado pertencer à CDL (Plano PRO)
  if (perfil?.empresa_id === ID_DA_CDL) {
      return <FinanceiroPro />;
  }

  // Se for qualquer outra empresa, carrega o padrão
  return <FinanceiroPadrao />;
}