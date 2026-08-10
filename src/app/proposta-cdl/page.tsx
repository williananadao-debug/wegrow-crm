"use client";
import { useState } from 'react';
import {
  CheckCircle2, Zap, MessageCircle, BarChart3, CreditCard,
  Shield, ChevronDown, ChevronUp, Sparkles, Star,
  Check, Wallet, Repeat2, Lock, Award
} from 'lucide-react';

const ENTREGUES = [
  'CRM completo com funil de filiação (Kanban)',
  'Dashboard com KPIs de associados e anuidades',
  'Módulo financeiro — inadimplência + alertas de vencimento',
  'Cadastro de associados com histórico completo',
  'Portal público de pré-cadastro de filiação',
  'Portal de acompanhamento de status por protocolo',
  'Perfis por cargo: Diretor, Gerente, Consultor',
  'App mobile (PWA) para equipe de captação',
  'WhatsApp de cobrança com 1 clique',
  'Relatório de Base CDL — associados por segmento',
  'Carteirinha Digital do Associado (QR Code)',
  'Portal Autenticado do Associado (CNPJ + protocolo)',
  'Confirmação de filiação com tipo, valor e vigência',
  'Ficha de Filiação para impressão',
  'Boas-vindas automático via WhatsApp na filiação',
];

const MODULOS_FUTUROS = [
  {
    icon: <Wallet size={22} />,
    cor: 'text-yellow-400',
    bg: 'bg-yellow-500/10 border-yellow-500/20',
    titulo: 'Cobrança Automática de Anuidades',
    desc: 'Régua completa D-30, D-7, D+1. Boleto e Pix gerados automaticamente por associado. Confirmação de pagamento via webhook. Zero trabalho manual para cobrar toda a base.',
    tag: 'Fase 3',
    tagCor: 'bg-yellow-500/20 text-yellow-300',
    preco: 'R$ 299/mês',
  },
  {
    icon: <Shield size={22} />,
    cor: 'text-[#22C55E]',
    bg: 'bg-[#22C55E]/10 border-[#22C55E]/20',
    titulo: 'Consulta SPC / Serasa',
    desc: 'O maior benefício de ser filiado CDL. Integração com bureau de crédito direto no painel. Consulta por CNPJ ou CPF com resultado instantâneo. Requer contrato com bureau.',
    tag: 'Estratégico',
    tagCor: 'bg-[#22C55E]/20 text-[#22C55E]',
    preco: 'A combinar',
  },
];

const PLANOS = [
  {
    nome: 'Essencial CDL',
    preco: 497,
    cor: 'border-white/10',
    corTexto: 'text-white',
    itens: [
      'CRM + Funil de Filiação',
      'Dashboard com KPIs CDL',
      'Portal público de pré-cadastro',
      'App mobile (PWA offline)',
      'Usuários ilimitados',
    ],
  },
  {
    nome: 'Add-on WhatsApp',
    preco: 149,
    cor: 'border-green-500/30',
    corTexto: 'text-green-400',
    itens: [
      'Cobrança de anuidade com 1 clique',
      'Mensagem pré-formatada com dados do associado',
      'Boas-vindas automático na filiação',
    ],
  },
  {
    nome: 'Add-on Financeiro CDL',
    preco: 249,
    cor: 'border-blue-500/30',
    corTexto: 'text-blue-400',
    destaque: true,
    itens: [
      'Alertas de vencimento ≤ 30 dias',
      'Gestão de inadimplência + histórico',
      'Relatório de base por segmento',
      'Carteirinha Digital (QR Code)',
      'Portal autenticado do associado',
    ],
  },
];

const PRECO_CHEIO = 895;
const PRECO_PARCEIRO = 497;
const DESCONTO = PRECO_CHEIO - PRECO_PARCEIRO;

export default function PropostaCDL() {
  const [expandido, setExpandido] = useState<number | null>(null);
  const dataValidade = new Date();
  dataValidade.setDate(dataValidade.getDate() + 30);

  return (
    <div className="min-h-screen bg-[#0B1120] text-white overflow-x-hidden">

      <div className="fixed top-0 left-0 w-full h-screen pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-[#22C55E]/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-blue-500/5 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-16">

        {/* HEADER */}
        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-5 mb-8">
            <div className="flex items-center gap-2">
              <div className="w-12 h-12 bg-[#22C55E] rounded-xl flex items-center justify-center font-black text-[#0F172A] text-xl">W</div>
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
            <Award size={12} className="text-[#22C55E]" />
            <span className="text-[11px] font-black text-[#22C55E] uppercase tracking-widest">CDL Parceira Inaugural · Abril 2026</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter text-white leading-none mb-4">
            CRM CDL<br />
            <span className="text-[#22C55E]">Plataforma Completa</span>
          </h1>
          <p className="text-slate-400 text-base max-w-xl mx-auto">
            A CDL de Taio é a primeira entidade do Alto Vale a ter um CRM completo de gestão associativa. Por isso, preço e condições de parceiro inaugural.
          </p>
        </div>

        {/* JÁ ENTREGUE */}
        <div className="bg-[#0F172A] border border-white/5 rounded-3xl p-6 md:p-8 mb-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-[#22C55E]/20 rounded-lg flex items-center justify-center">
              <CheckCircle2 size={16} className="text-[#22C55E]" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-white">Plataforma CDL — Já está no ar</h2>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">15 features entregues · Ativo desde Abril 2026</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {ENTREGUES.map((item, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5">
                <CheckCircle2 size={13} className="text-[#22C55E] flex-shrink-0" />
                <span className="text-xs text-slate-300 font-medium">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* PRÓXIMAS FASES */}
        <div className="mb-10">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
            <Zap size={12} className="text-[#22C55E]" /> Próximas fases
          </h2>
          <div className="space-y-3">
            {MODULOS_FUTUROS.map((mod, i) => (
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
                    {expandido !== i && <p className="text-[11px] text-slate-500 mt-0.5 truncate">{mod.desc}</p>}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`hidden md:block text-xs font-black ${mod.cor}`}>{mod.preco}</span>
                    {expandido === i ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                  </div>
                </div>
                {expandido === i && (
                  <div className="px-5 pb-5 border-t border-white/5 pt-4">
                    <p className="text-sm text-slate-300 leading-relaxed">{mod.desc}</p>
                    <p className={`text-sm font-black mt-3 ${mod.cor}`}>{mod.preco}</p>
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
              { num: 'R$ 4.000', label: 'de receita recuperada', sub: `vs. R$ ${PRECO_PARCEIRO}/mês do plano parceiro`, cor: 'text-[#22C55E]' },
            ].map((item, i) => (
              <div key={i} className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 text-center">
                <p className={`text-3xl font-black ${item.cor} mb-1`}>{item.num}</p>
                <p className="text-sm font-bold text-white">{item.label}</p>
                <p className="text-[11px] text-slate-500 mt-1">{item.sub}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-slate-500 text-xs mt-5">
            Recuperando <strong className="text-white">5 anuidades/mês</strong> que hoje estão inadimplentes, o plano custa <strong className="text-[#22C55E]">menos de 17% do retorno gerado.</strong>
          </p>
        </div>

        {/* INVESTIMENTO */}
        <div className="mb-10">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
            <Star size={12} className="text-[#22C55E]" /> Investimento
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {PLANOS.map((plano, i) => (
              <div key={i} className={`relative bg-[#0F172A] border-2 ${plano.cor} rounded-3xl p-6 flex flex-col ${'destaque' in plano && plano.destaque ? 'shadow-[0_0_30px_rgba(59,130,246,0.1)]' : ''}`}>
                {'destaque' in plano && plano.destaque && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[9px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full whitespace-nowrap">
                    Recomendado
                  </div>
                )}
                <h3 className={`text-xs font-black uppercase tracking-widest mb-3 ${plano.corTexto}`}>{plano.nome}</h3>
                <div className="space-y-2 flex-1 mb-5">
                  {plano.itens.map((item, j) => (
                    <div key={j} className="flex items-start gap-2 text-xs text-slate-300">
                      <Check size={12} className={`${plano.corTexto} flex-shrink-0 mt-0.5`} /> {item}
                    </div>
                  ))}
                </div>
                <div className="border-t border-white/5 pt-4">
                  <p className={`text-2xl font-black ${plano.corTexto}`}>R$ {plano.preco}</p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">/ mês</p>
                </div>
              </div>
            ))}
          </div>

          {/* Preço cheio → parceiro */}
          <div className="bg-[#0F172A] border-2 border-[#22C55E]/30 rounded-3xl p-6 shadow-[0_0_40px_rgba(34,197,94,0.08)]">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Award size={16} className="text-[#22C55E]" />
                  <span className="text-xs font-black uppercase tracking-widest text-[#22C55E]">Preço CDL Parceira Inaugural</span>
                </div>
                <p className="text-slate-400 text-sm">
                  Essencial <span className="text-white font-bold">R$ 497</span> + WhatsApp <span className="text-white font-bold">R$ 149</span> + Financeiro <span className="text-white font-bold">R$ 249</span>
                </p>
                <div className="flex flex-wrap gap-3 mt-4">
                  <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                    <Lock size={11} className="text-[#22C55E]"/>
                    <span className="text-[11px] font-bold text-slate-300">Preço fixo por 12 meses</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                    <CheckCircle2 size={11} className="text-[#22C55E]"/>
                    <span className="text-[11px] font-bold text-slate-300">Sem taxa de setup</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                    <CheckCircle2 size={11} className="text-[#22C55E]"/>
                    <span className="text-[11px] font-bold text-slate-300">Cancela quando quiser</span>
                  </div>
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <div className="flex items-center justify-end gap-3 mb-1">
                  <span className="text-slate-600 line-through text-lg font-bold">R$ {PRECO_CHEIO}</span>
                  <span className="bg-[#22C55E]/20 text-[#22C55E] text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg">-R$ {DESCONTO}/mês</span>
                </div>
                <p className="text-4xl font-black text-[#22C55E]">R$ {PRECO_PARCEIRO}<span className="text-xl text-slate-400">/mês</span></p>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">preço de parceiro inaugural · sem surpresas</p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="bg-gradient-to-br from-[#22C55E]/10 to-[#0F172A] border border-[#22C55E]/20 rounded-3xl p-8 text-center mb-10">
          <h2 className="text-2xl font-black uppercase italic tracking-tighter text-white mb-3">Vamos fechar?</h2>
          <p className="text-slate-400 text-sm mb-6 max-w-md mx-auto">
            Plataforma pronta, preço de parceiro e suporte direto. É só confirmar.
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

        <p className="text-center text-slate-600 text-[10px] uppercase tracking-widest font-bold">
          WeGrow · Proposta válida até {dataValidade.toLocaleDateString('pt-BR')}
        </p>

      </div>
    </div>
  );
}
