"use client";
import React from 'react';
import Link from 'next/link';
import { 
  ShieldCheck, Zap, Target, ArrowRight, 
  Search, Sparkles, TrendingUp, PieChart, 
  Cpu, LayoutDashboard 
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 selection:bg-[#22C55E]/30">
      
      {/* --- NAVBAR --- */}
      <nav className="fixed top-0 w-full z-[100] border-b border-white/5 bg-[#020617]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#22C55E] rounded-xl flex items-center justify-center font-black text-[#0F172A] text-2xl shadow-[0_0_15px_rgba(34,197,94,0.4)]">
              W
            </div>
            <span className="text-xl font-black uppercase italic tracking-tighter text-white">WeGrow</span>
          </div>
          
          <Link href="/login" className="bg-white/5 hover:bg-white/10 px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all border border-white/10 text-white">
            Acessar o Sistema
          </Link>
        </div>
      </nav>

      {/* --- HERO SECTION --- */}
      <section className="pt-40 pb-20 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-[#22C55E]/10 border border-[#22C55E]/20 px-4 py-1.5 rounded-full text-[#22C55E] text-[10px] font-black uppercase tracking-[0.2em] mb-8 animate-pulse">
            <Sparkles size={14} /> CRM Personalizável para o seu Negócio
          </div>
          <h1 className="text-5xl md:text-7xl font-black text-white uppercase italic tracking-tighter leading-[0.9] mb-8">
            Transforme dados em <span className="text-[#22C55E]">Contratos Fechados.</span>
          </h1>
          <p className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto font-medium leading-relaxed mb-12">
            Um CRM inteligente, ágil e totalmente adaptável ao seu cenário. Automação de vendas, gestão de metas, IA e integração via API para empresas que querem escalar de verdade.
          </p>
          
          <div className="flex flex-col md:flex-row items-center justify-center gap-4">
            <a href="https://wa.me/5547997022381" target="_blank" rel="noopener noreferrer" className="w-full md:w-auto bg-[#22C55E] hover:bg-[#16a34a] text-[#0F172A] px-10 py-5 rounded-2xl font-black uppercase text-sm tracking-widest flex items-center justify-center gap-3 transition-all hover:scale-105 shadow-[0_0_20px_rgba(34,197,94,0.3)]">
              Agendar Demonstração <ArrowRight size={20} />
            </a>
            <Link href="/login" className="w-full md:w-auto bg-white/5 hover:bg-white/10 text-white px-10 py-5 rounded-2xl font-black uppercase text-sm tracking-widest transition-all border border-white/10 text-center">
              Acessar Sistema
            </Link>
          </div>
        </div>
      </section>

      {/* --- BENTO GRID FEATURES (SUPER GRADE) --- */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* LINHA 1: Lupa (Ocupa 2 espaços) e Semáforo (Ocupa 1 espaço) */}
          <div className="md:col-span-2 bg-gradient-to-br from-white/5 to-transparent border border-white/10 p-10 rounded-[40px] relative overflow-hidden group">
            <div className="relative z-10">
              <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center mb-6 text-blue-500">
                <Search size={24} />
              </div>
              <h3 className="text-2xl font-black text-white uppercase italic mb-4">Lupa Inteligente</h3>
              <p className="text-slate-400 font-medium max-w-md">
                Encontre qualquer empresa pelo CNPJ. O WeGrow puxa automaticamente o capital social, tempo de abertura e saúde financeira em segundos.
              </p>
            </div>
            <div className="absolute right-[-20px] bottom-[-20px] opacity-10 group-hover:opacity-20 transition-all duration-500">
                <Search size={200} />
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 p-10 rounded-[40px] flex flex-col justify-between hover:bg-white/[0.07] transition-all">
            <div className="w-12 h-12 bg-[#22C55E]/20 rounded-2xl flex items-center justify-center text-[#22C55E] mb-6">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-white uppercase italic mb-4">Semáforo de Risco</h3>
              <p className="text-slate-400 text-sm font-medium">
                Venda com segurança. Nosso algoritmo classifica o risco do cliente para evitar a inadimplência antes da assinatura.
              </p>
            </div>
          </div>

          {/* LINHA 2: IA, Metas e API (3 Cartões iguais) */}
          <div className="bg-white/5 border border-white/10 p-8 rounded-[40px] flex flex-col justify-between hover:bg-white/[0.07] transition-all">
            <div className="w-12 h-12 bg-purple-500/20 rounded-2xl flex items-center justify-center text-purple-500 mb-6">
              <Sparkles size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-white uppercase italic mb-3">Central de IA</h3>
              <p className="text-slate-400 text-sm font-medium">
                Resgate de clientes inativos e prevenção de churn. Deixe a IA identificar quem está pronto para comprar de novo.
              </p>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 p-8 rounded-[40px] flex flex-col justify-between hover:bg-white/[0.07] transition-all">
            <div className="w-12 h-12 bg-orange-500/20 rounded-2xl flex items-center justify-center text-orange-500 mb-6">
              <Target size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-white uppercase italic mb-3">Gestão de Metas</h3>
              <p className="text-slate-400 text-sm font-medium">
                Crie objetivos para a equipe, acompanhe o progresso em tempo real e engaje seus vendedores a baterem recordes.
              </p>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 p-8 rounded-[40px] flex flex-col justify-between hover:bg-white/[0.07] transition-all">
            <div className="w-12 h-12 bg-cyan-500/20 rounded-2xl flex items-center justify-center text-cyan-500 mb-6">
              <Cpu size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-white uppercase italic mb-3">Integração API</h3>
              <p className="text-slate-400 text-sm font-medium">
                Conecte o WeGrow ao seu ERP ou sistema financeiro. Sincronização de dados contínua e sem retrabalho manual.
              </p>
            </div>
          </div>

          {/* LINHA 3: Dashboard (1 espaço) e Relatórios (2 espaços) */}
          <div className="bg-white/5 border border-white/10 p-10 rounded-[40px] flex flex-col justify-between hover:bg-white/[0.07] transition-all">
            <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center text-blue-500 mb-6">
              <LayoutDashboard size={24} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-white uppercase italic mb-4">Dashboard Kanban</h3>
              <p className="text-slate-400 text-sm font-medium">
                Controle o funil de vendas e o pipeline da sua equipe com um painel visual super intuitivo e atualizado ao segundo.
              </p>
            </div>
          </div>

          <div className="md:col-span-2 bg-gradient-to-tr from-[#22C55E]/10 to-transparent border border-white/10 p-10 rounded-[40px] hover:border-[#22C55E]/30 transition-all">
             <div className="flex flex-col md:flex-row gap-10 items-center h-full">
                <div className="flex-1">
                    <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-white mb-6">
                        <PieChart size={24} />
                    </div>
                    <h3 className="text-2xl font-black text-white uppercase italic mb-4">Relatórios Estratégicos</h3>
                    <p className="text-slate-400 font-medium">
                        Tome decisões baseadas em dados. Tenha acesso a relatórios completos de conversão, ticket médio, ciclo de vendas e previsibilidade financeira da operação.
                    </p>
                </div>
                <div className="w-full md:w-1/2 bg-[#0B1120] border border-white/10 p-4 rounded-2xl shadow-2xl">
                    <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-red-500" />
                          <div className="w-2 h-2 rounded-full bg-yellow-500" />
                          <div className="w-2 h-2 rounded-full bg-[#22C55E]" />
                        </div>
                        <TrendingUp className="text-[#22C55E]" size={16} />
                    </div>
                    <div className="space-y-3">
                        <div className="flex justify-between items-end gap-2 h-20 mt-4 px-2">
                            <div className="w-1/4 bg-[#22C55E]/20 rounded-t-md h-[40%] animate-pulse" />
                            <div className="w-1/4 bg-[#22C55E]/40 rounded-t-md h-[60%] animate-pulse delay-75" />
                            <div className="w-1/4 bg-[#22C55E]/60 rounded-t-md h-[80%] animate-pulse delay-150" />
                            <div className="w-1/4 bg-[#22C55E] rounded-t-md h-[100%] shadow-[0_0_15px_rgba(34,197,94,0.4)]" />
                        </div>
                    </div>
                </div>
             </div>
          </div>

        </div>
      </section>

      {/* --- CTA FINAL --- */}
      <section className="py-32 px-6">
        <div className="max-w-4xl mx-auto bg-[#22C55E] rounded-[50px] p-12 md:p-20 text-center relative overflow-hidden shadow-[0_0_100px_rgba(34,197,94,0.2)]">
            <div className="relative z-10">
                <h2 className="text-4xl md:text-5xl font-black text-[#0F172A] uppercase italic tracking-tighter mb-8 leading-tight">
                    Pronto para escalar a sua operação comercial?
                </h2>
                <a href="https://wa.me/5547997022381" target="_blank" rel="noopener noreferrer" className="inline-flex bg-[#0F172A] text-white px-12 py-5 rounded-2xl font-black uppercase text-sm tracking-[0.2em] hover:scale-105 transition-all shadow-xl">
                    Falar com um Consultor
                </a>
            </div>
            <Zap className="absolute top-[-50px] left-[-50px] text-[#0F172A]/10" size={300} />
            <ShieldCheck className="absolute bottom-[-50px] right-[-50px] text-[#0F172A]/10" size={250} />
        </div>
      </section>

      {/* --- FOOTER --- */}
      <footer className="py-10 border-t border-white/5 text-center">
        <p className="text-[10px] font-black uppercase text-slate-500 tracking-[0.3em]">
          &copy; {new Date().getFullYear()} WeGrow Tecnologia - Todos os direitos reservados
        </p>
      </footer>

    </div>
  );
}