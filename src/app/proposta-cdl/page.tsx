"use client";
import { useState } from 'react';
import {
  CheckCircle2, Zap, RefreshCw, AlertTriangle, MessageCircle,
  BarChart3, CreditCard, Shield, ChevronDown, ChevronUp,
  ArrowRight, Sparkles, Clock, Star, Check, X
} from 'lucide-react';

const ENTREGUES = [
  'CRM completo com funil de associação (Kanban)',
  'Dashboard com KPIs de filiação e anuidades',
  'Módulo financeiro adaptado para anuidades',
  'Cadastro de associados com histórico completo',
  'Portal público de pré-cadastro de filiação',
  'Perfis por cargo: Diretor, Gerente, Consultor',
  'App mobile (PWA) para equipe de captação',
];

const MODULOS = [
  {
    icon: <RefreshCw size={22} />,
    cor: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
    titulo: 'Renovação de Anuidade',
    desc: 'Alerta automático quando a anuidade vence. Botão "Iniciar Renovação" cria novo card no funil com dados pré-preenchidos do associado.',
    entrega: '7 dias',
    tag: 'Essencial',
    tagCor: 'bg-blue-500/20 text-blue-300',
  },
  {
    icon: <AlertTriangle size={22} />,
    cor: 'text-orange-400',
    bg: 'bg-orange-500/10 border-orange-500/20',
    titulo: 'Gestão de Inadimplência',
    desc: 'Associado vira "Inadimplente" automaticamente após o vencimento. Badge visível no cadastro, filtro de busca e relatório de inadimplentes.',
    entrega: '5 dias',
    tag: 'Essencial',
    tagCor: 'bg-orange-500/20 text-orange-300',
  },
  {
    icon: <MessageCircle size={22} />,
    cor: 'text-green-400',
    bg: 'bg-green-500/10 border-green-500/20',
    titulo: 'WhatsApp de Cobrança',
    desc: 'Mensagem automática 7 dias antes do vencimento com nome do associado, valor e link de contato. Um clique para enviar.',
    entrega: '3 dias',
    tag: 'Essencial',
    tagCor: 'bg-green-500/20 text-green-300',
  },
  {
    icon: <BarChart3 size={22} />,
    cor: 'text-purple-400',
    bg: 'bg-purple-500/10 border-purple-500/20',
    titulo: 'Relatório de Base',
    desc: 'Painel exclusivo CDL: associados por segmento, taxa de renovação, evasão mensal, crescimento da base e receita de anuidades.',
    entrega: '7 dias',
    tag: 'Essencial',
    tagCor: 'bg-purple-500/20 text-purple-300',
  },
  {
    icon: <CreditCard size={22} />,
    cor: 'text-yellow-400',
    bg: 'bg-yellow-500/10 border-yellow-500/20',
    titulo: 'Carteirinha Digital',
    desc: 'QR code gerado automaticamente ao filiar. Abre página pública com nome, segmento, tipo de associação e validade. Associado leva no celular.',
    entrega: '5 dias',
    tag: 'Diferencial',
    tagCor: 'bg-yellow-500/20 text-yellow-300',
  },
  {
    icon: <Shield size={22} />,
    cor: 'text-[#22C55E]',
    bg: 'bg-[#22C55E]/10 border-[#22C55E]/20',
    titulo: 'Consulta SPC / Serasa',
    desc: 'O maior benefício de ser associado CDL. Integração com bureau de crédito direto no painel. Consulta por CNPJ ou CPF, resultado instantâneo.',
    entrega: 'A combinar',
    tag: 'Estratégico',
    tagCor: 'bg-[#22C55E]/20 text-[#22C55E]',
  },
];

const PLANO_BASE = {
  nome: 'Plano Essencial',
  preco: 'R$ 497',
  itens: [
    'CRM completo + Funil de Associação',
    'Dashboard com KPIs CDL',
    'Cadastro de Associados',
    'Portal público de pré-cadastro',
    'App mobile (PWA offline)',
    'Usuários ilimitados',
  ],
};

const ADDONS = [
  {
    nome: 'Add-on WhatsApp',
    preco: 'R$ 149',
    cor: 'border-green-500/30',
    corTexto: 'text-green-400',
    itens: [
      'WhatsApp de cobrança de anuidade',
      'Lembrete automático 7 dias antes',
      'Envio com 1 clique pelo CRM',
    ],
  },
  {
    nome: 'Add-on Financeiro',
    preco: 'R$ 199',
    cor: 'border-blue-500/30',
    corTexto: 'text-blue-400',
    destaque: true,
    itens: [
      'Renovação de anuidade automática',
      'Gestão de inadimplência',
      'Relatório de base de associados',
      'Carteirinha digital do associado',
    ],
  },
  {
    nome: 'Add-on SPC / Serasa',
    preco: 'A combinar',
    cor: 'border-[#22C55E]/30',
    corTexto: 'text-[#22C55E]',
    itens: [
      'Consulta de crédito por CNPJ/CPF',
      'Resultado instantâneo no painel',
      'O principal benefício do associado CDL',
    ],
  },
];

export default function PropostaCDL() {
  const [expandido, setExpandido] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-[#0B1120] text-white overflow-x-hidden">

      {/* BG effects */}
      <div className="fixed top-0 left-0 w-full h-screen pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-[#22C55E]/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-blue-500/5 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-16">

        {/* HEADER */}
        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-5 mb-8">
            <div className="flex items-center gap-2">
              <div className="w-12 h-12 bg-[#22C55E] rounded-xl flex items-center justify-center font-black text-[#0B1120] text-xl">W</div>
              <span className="text-2xl font-black italic tracking-tighter text-white">WEGROW</span>
            </div>
            <div className="text-slate-600 text-2xl font-thin">×</div>
            <div className="flex items-center gap-2">
              <div className="w-12 h-12 bg-[#22C55E]/20 border border-[#22C55E]/30 rounded-xl flex items-center justify-center font-black text-[#22C55E] text-sm">CDL</div>
              <div className="text-left">
                <div className="text-sm font-black text-white uppercase tracking-wide">CDL de Taio</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest">Câmara de Dirigentes Lojistas</div>
              </div>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 bg-[#22C55E]/10 border border-[#22C55E]/20 px-4 py-2 rounded-full mb-6">
            <Sparkles size={12} className="text-[#22C55E]" />
            <span className="text-[11px] font-black text-[#22C55E] uppercase tracking-widest">Proposta Comercial — Abril 2026</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter text-white leading-none mb-4">
            Próxima Fase<br />
            <span className="text-[#22C55E]">da Plataforma CDL</span>
          </h1>
          <p className="text-slate-400 text-base max-w-xl mx-auto">
            A base está construída. Agora é hora de ativar os módulos que vão transformar a CDL de Taio em referência de gestão associativa no Alto Vale.
          </p>
        </div>

        {/* JÁ ENTREGUE */}
        <div className="bg-[#0F172A] border border-white/5 rounded-3xl p-6 md:p-8 mb-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-[#22C55E]/20 rounded-lg flex items-center justify-center">
              <CheckCircle2 size={16} className="text-[#22C55E]" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-white">Fase 1 — Já está no ar</h2>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Plataforma ativa desde Abril 2026</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {ENTREGUES.map((item, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <CheckCircle2 size={14} className="text-[#22C55E] flex-shrink-0" />
                <span className="text-sm text-slate-300 font-medium">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* MÓDULOS PROPOSTOS */}
        <div className="mb-10">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
            <Zap size={12} className="text-[#22C55E]" /> Fase 2 — O que vem a seguir
          </h2>

          <div className="space-y-3">
            {MODULOS.map((mod, i) => (
              <div
                key={i}
                className={`border rounded-2xl overflow-hidden transition-all ${mod.bg} cursor-pointer`}
                onClick={() => setExpandido(expandido === i ? null : i)}
              >
                <div className="flex items-center gap-4 p-5">
                  <div className={`${mod.cor} flex-shrink-0`}>{mod.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-black text-white uppercase tracking-wide">{mod.titulo}</h3>
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${mod.tagCor}`}>{mod.tag}</span>
                    </div>
                    {expandido !== i && (
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">{mod.desc}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="hidden md:flex items-center gap-1 text-[10px] text-slate-500">
                      <Clock size={10} /> {mod.entrega}
                    </div>
                    {expandido === i ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                  </div>
                </div>
                {expandido === i && (
                  <div className="px-5 pb-5 border-t border-white/5 pt-4">
                    <p className="text-sm text-slate-300 leading-relaxed">{mod.desc}</p>
                    <div className="flex items-center gap-2 mt-3">
                      <Clock size={12} className="text-slate-500" />
                      <span className="text-[11px] text-slate-500 font-bold uppercase tracking-widest">Prazo de entrega: {mod.entrega}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ROI */}
        <div className="bg-[#0F172A] border border-white/5 rounded-3xl p-6 md:p-8 mb-10">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
            <Sparkles size={12} className="text-[#22C55E]" /> O sistema se paga sozinho
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { num: '5', label: 'inadimplentes recuperados', sub: 'por mês com cobrança automática', cor: 'text-orange-400' },
              { num: 'R$ 800', label: 'de anuidade por associado', sub: 'valor médio recuperado', cor: 'text-blue-400' },
              { num: 'R$ 4.000', label: 'de receita recuperada', sub: 'vs. R$ 197/mês do plano Pro', cor: 'text-[#22C55E]' },
            ].map((item, i) => (
              <div key={i} className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 text-center">
                <p className={`text-3xl font-black ${item.cor} mb-1`}>{item.num}</p>
                <p className="text-sm font-bold text-white">{item.label}</p>
                <p className="text-[11px] text-slate-500 mt-1">{item.sub}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-slate-500 text-xs mt-5">
            Recuperando <strong className="text-white">5 anuidades/mês</strong> que hoje estão inadimplentes, o plano Pro custa <strong className="text-[#22C55E]">menos de 5% do retorno gerado.</strong>
          </p>
        </div>

        {/* INVESTIMENTO */}
        <div className="mb-10">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
            <Star size={12} className="text-[#22C55E]" /> Investimento
          </h2>

          {/* Plano base */}
          <div className="bg-[#0F172A] border-2 border-white/10 rounded-3xl p-6 mb-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Plano base já ativo</span>
                <h3 className="text-lg font-black text-white uppercase tracking-tight mt-1">{PLANO_BASE.nome}</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 mt-3">
                  {PLANO_BASE.itens.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-300">
                      <CheckCircle2 size={12} className="text-[#22C55E] flex-shrink-0" /> {item}
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-3xl font-black text-white">{PLANO_BASE.preco}</p>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">/ mês</p>
              </div>
            </div>
          </div>

          {/* Add-ons */}
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 ml-1">
            + Add-ons da Fase 2 (ativar conforme necessidade)
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {ADDONS.map((addon, i) => (
              <div key={i} className={`relative bg-[#0F172A] border-2 ${addon.cor} rounded-3xl p-6 flex flex-col ${'destaque' in addon && addon.destaque ? 'shadow-[0_0_30px_rgba(59,130,246,0.1)]' : ''}`}>
                {'destaque' in addon && addon.destaque && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[9px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full whitespace-nowrap">
                    Recomendado
                  </div>
                )}
                <h3 className={`text-xs font-black uppercase tracking-widest mb-3 ${addon.corTexto}`}>{addon.nome}</h3>
                <div className="space-y-2 flex-1 mb-5">
                  {addon.itens.map((item, j) => (
                    <div key={j} className="flex items-start gap-2 text-xs text-slate-300">
                      <Check size={12} className={`${addon.corTexto} flex-shrink-0 mt-0.5`} /> {item}
                    </div>
                  ))}
                </div>
                <div className="border-t border-white/5 pt-4">
                  <p className={`text-2xl font-black ${addon.corTexto}`}>{addon.preco}</p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{addon.preco === 'A combinar' ? 'conforme uso de API' : '/ mês'}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="mt-4 bg-white/[0.02] border border-white/5 rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">Total com Fase 2 completa</p>
              <p className="text-slate-400 text-sm mt-1">Essencial <span className="text-white">R$ 497</span> + WhatsApp <span className="text-white">R$ 149</span> + Financeiro <span className="text-white">R$ 199</span></p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black text-[#22C55E]">R$ 845<span className="text-lg text-slate-400">/mês</span></p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">sem SPC · cancela quando quiser</p>
            </div>
          </div>
        </div>

        {/* PRÓXIMOS PASSOS */}
        <div className="bg-gradient-to-br from-[#22C55E]/10 to-[#0F172A] border border-[#22C55E]/20 rounded-3xl p-8 text-center mb-10">
          <h2 className="text-2xl font-black uppercase italic tracking-tighter text-white mb-3">Vamos avançar?</h2>
          <p className="text-slate-400 text-sm mb-6 max-w-md mx-auto">
            Escolha o pacote, acertamos o contrato e iniciamos a entrega na semana seguinte. Sem surpresas.
          </p>
          <div className="flex flex-col md:flex-row gap-3 justify-center">
            <a
              href="https://wa.me/5547999999999"
              className="inline-flex items-center justify-center gap-2 bg-[#22C55E] text-[#0B1120] px-8 py-4 rounded-2xl font-black uppercase text-sm tracking-widest hover:bg-[#16A34A] transition-all shadow-[0_8px_30px_rgba(34,197,94,0.25)]"
            >
              <MessageCircle size={16} /> Fechar pelo WhatsApp
            </a>
            <a
              href="mailto:contato@wegrow.app.br"
              className="inline-flex items-center justify-center gap-2 bg-white/5 text-white px-8 py-4 rounded-2xl font-black uppercase text-sm tracking-widest hover:bg-white/10 transition-all border border-white/10"
            >
              Enviar por E-mail
            </a>
          </div>
        </div>

        {/* FOOTER */}
        <p className="text-center text-slate-600 text-[10px] uppercase tracking-widest font-bold">
          WeGrow CRM · Proposta válida por 30 dias · Abril 2026
        </p>

      </div>
    </div>
  );
}
