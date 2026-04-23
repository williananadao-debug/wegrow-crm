"use client";
import { useState } from 'react';
import {
  CheckCircle2, Zap, MessageCircle, BarChart3, CreditCard,
  Shield, ChevronDown, ChevronUp, ArrowRight, Sparkles, Star,
  Check, Users, TrendingUp, HandshakeIcon, Building2, Repeat2,
  QrCode, FileText, Bell, Wallet
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

const NIVEIS_PARCERIA = [
  {
    nivel: '01',
    titulo: 'CDL usa WeGrow internamente',
    subtitulo: 'Já ativo',
    cor: 'text-[#22C55E]',
    bg: 'bg-[#22C55E]/10 border-[#22C55E]/20',
    icone: <Building2 size={20} />,
    itens: [
      'Funil de filiação e gestão de associados',
      'Financeiro: inadimplência, alertas e cobrança via WhatsApp',
      'Relatório de base, carteirinha digital e portal do associado',
      'Equipe da CDL usa no dia a dia para captar e reter lojistas',
    ],
  },
  {
    nivel: '02',
    titulo: 'CDL distribui WeGrow aos associados',
    subtitulo: 'Próxima fase',
    cor: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
    icone: <Users size={20} />,
    itens: [
      'Cada lojista filiado recebe acesso ao WeGrow CRM básico',
      'WeGrow vira benefício exclusivo da filiação CDL',
      'CDL ganha R$ 25/mês por lojista ativo na plataforma',
      '20 lojistas já pagam o plano CDL Pro inteiro',
    ],
  },
  {
    nivel: '03',
    titulo: 'CDL de Taio como referência regional',
    subtitulo: 'Visão futura',
    cor: 'text-purple-400',
    bg: 'bg-purple-500/10 border-purple-500/20',
    icone: <TrendingUp size={20} />,
    itens: [
      'Modelo replicável para outras CDLs do Alto Vale do Itajaí',
      'CDL de Taio recebe comissão por cada nova CDL que adotar a plataforma',
      'Acesso antecipado a novos módulos do WeGrow',
      'Co-marketing: "Powered by CDL de Taio"',
    ],
  },
];

const MODULOS_FUTUROS = [
  {
    icon: <Wallet size={22} />,
    cor: 'text-yellow-400',
    bg: 'bg-yellow-500/10 border-yellow-500/20',
    titulo: 'Cobrança Automática de Anuidades',
    desc: 'Régua completa: D-30, D-7, D+1. Boleto e Pix com QR Code gerados automaticamente. Confirmação de pagamento via webhook. Um clique para emitir a cobrança de toda a base.',
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
  {
    icon: <Repeat2 size={22} />,
    cor: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
    titulo: 'WeGrow para Lojistas CDL',
    desc: 'Versão simplificada do WeGrow CRM para os próprios associados gerenciarem suas vendas, metas e equipe. Distribuído pela CDL como benefício exclusivo de filiação.',
    tag: 'Parceria',
    tagCor: 'bg-blue-500/20 text-blue-300',
    preco: 'R$ 97/lojista/mês',
  },
];

export default function PropostaCDL() {
  const [expandido, setExpandido] = useState<number | null>(null);

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
            <span className="text-[11px] font-black text-[#22C55E] uppercase tracking-widest">Parceria Estratégica — Abril 2026</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter text-white leading-none mb-4">
            CDL de Taio<br />
            <span className="text-[#22C55E]">Parceira Tecnológica</span>
          </h1>
          <p className="text-slate-400 text-base max-w-xl mx-auto">
            A CDL que tem tecnologia atrai mais lojistas, retém mais associados e se torna referência no Alto Vale. Aqui não é uma assinatura — é uma parceria.
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

        {/* MODELO DE PARCERIA */}
        <div className="mb-10">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-2">
            <Zap size={12} className="text-[#22C55E]" /> Modelo de Parceria — 3 Níveis
          </h2>
          <p className="text-slate-500 text-xs mb-6">A CDL de Taio não é só cliente — é canal de distribuição do WeGrow para toda a sua base de associados.</p>

          <div className="space-y-4">
            {NIVEIS_PARCERIA.map((n, i) => (
              <div key={i} className={`border rounded-3xl p-6 ${n.bg}`}>
                <div className="flex items-start gap-4">
                  <div className={`text-3xl font-black ${n.cor} leading-none min-w-[36px]`}>{n.nivel}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <span className={`${n.cor}`}>{n.icone}</span>
                      <h3 className="text-sm font-black text-white uppercase tracking-wide">{n.titulo}</h3>
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${n.bg} ${n.cor}`}>{n.subtitulo}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                      {n.itens.map((item, j) => (
                        <div key={j} className="flex items-start gap-2 text-xs text-slate-300">
                          <Check size={11} className={`${n.cor} flex-shrink-0 mt-0.5`} /> {item}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CALCULADORA DE PARCERIA */}
        <div className="bg-[#0F172A] border border-white/5 rounded-3xl p-6 md:p-8 mb-10">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
            <TrendingUp size={12} className="text-[#22C55E]" /> O negócio por trás da parceria
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[
              { num: 'R$ 97', label: 'por lojista/mês', sub: 'WeGrow CRM básico para associados', cor: 'text-blue-400' },
              { num: 'R$ 25', label: 'por lojista para CDL', sub: '≈ 26% de receita recorrente', cor: 'text-[#22C55E]' },
              { num: '34', label: 'lojistas = CDL grátis', sub: 'plano CDL Pro pago pelos associados', cor: 'text-purple-400' },
            ].map((item, i) => (
              <div key={i} className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 text-center">
                <p className={`text-3xl font-black ${item.cor} mb-1`}>{item.num}</p>
                <p className="text-sm font-bold text-white">{item.label}</p>
                <p className="text-[11px] text-slate-500 mt-1">{item.sub}</p>
              </div>
            ))}
          </div>

          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4">Simulação de receita CDL com distribuição WeGrow</p>
            <div className="space-y-3">
              {[
                { lojistas: 20, receita: 500, desc: 'cobre 56% do plano CDL Pro' },
                { lojistas: 34, receita: 845, desc: 'plano CDL Pro 100% coberto' },
                { lojistas: 50, receita: 1250, desc: 'R$ 355/mês de lucro líquido + CRM grátis' },
                { lojistas: 100, receita: 2500, desc: 'R$ 1.605/mês de receita líquida + CRM grátis' },
              ].map((row, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-20 text-xs font-black text-slate-400 flex-shrink-0">{row.lojistas} lojistas</div>
                  <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden">
                    <div className="h-full bg-[#22C55E] rounded-full" style={{ width: `${Math.min(100, (row.lojistas / 100) * 100)}%` }} />
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-xs font-black text-[#22C55E]">R$ {row.receita.toLocaleString('pt-BR')}/mês</span>
                    <span className="text-[10px] text-slate-500 ml-2 hidden md:inline">{row.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* PRÓXIMAS FASES */}
        <div className="mb-10">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
            <ArrowRight size={12} className="text-[#22C55E]" /> Próximas fases
          </h2>
          <div className="space-y-3">
            {MODULOS_FUTUROS.map((mod, i) => (
              <div
                key={i}
                className={`border rounded-2xl overflow-hidden transition-all ${mod.bg} cursor-pointer`}
                onClick={() => setExpandido(expandido === i ? null : i)}
              >
                <div className="flex items-center gap-4 p-5">
                  <div className={`${mod.cor} flex-shrink-0`}>{mod.icone}</div>
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

        {/* INVESTIMENTO */}
        <div className="mb-10">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
            <Star size={12} className="text-[#22C55E]" /> Investimento atual
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {[
              {
                nome: 'Essencial CDL',
                preco: 'R$ 497',
                cor: 'border-white/10',
                corTexto: 'text-white',
                itens: [
                  'CRM + Funil de Filiação',
                  'Dashboard com KPIs CDL',
                  'Portal público de pré-cadastro',
                  'App mobile (PWA)',
                  'Usuários ilimitados',
                ],
              },
              {
                nome: 'Add-on WhatsApp',
                preco: 'R$ 149',
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
                preco: 'R$ 249',
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
            ].map((addon, i) => (
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
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">/ mês</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">CDL Pro — Plataforma completa ativa</p>
              <p className="text-slate-400 text-sm mt-1">
                Essencial <span className="text-white">R$ 497</span> + WhatsApp <span className="text-white">R$ 149</span> + Financeiro <span className="text-white">R$ 249</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black text-[#22C55E]">R$ 895<span className="text-lg text-slate-400">/mês</span></p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">coberto com 34 lojistas na plataforma</p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="bg-gradient-to-br from-[#22C55E]/10 to-[#0F172A] border border-[#22C55E]/20 rounded-3xl p-8 text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-[#22C55E]/10 border border-[#22C55E]/20 px-3 py-1.5 rounded-full mb-4">
            <span className="text-[10px] font-black text-[#22C55E] uppercase tracking-widest">Parceria, não assinatura</span>
          </div>
          <h2 className="text-2xl font-black uppercase italic tracking-tighter text-white mb-3">Vamos crescer juntos?</h2>
          <p className="text-slate-400 text-sm mb-6 max-w-md mx-auto">
            CDL de Taio como parceira tecnológica do WeGrow. Distribuição para associados, comissão recorrente e tecnologia de ponta para a entidade.
          </p>
          <div className="flex flex-col md:flex-row gap-3 justify-center">
            <a
              href="https://wa.me/5547999999999"
              className="inline-flex items-center justify-center gap-2 bg-[#22C55E] text-[#0B1120] px-8 py-4 rounded-2xl font-black uppercase text-sm tracking-widest hover:bg-[#16A34A] transition-all shadow-[0_8px_30px_rgba(34,197,94,0.25)]"
            >
              <MessageCircle size={16} /> Conversar pelo WhatsApp
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
          WeGrow CRM · Parceria válida por 30 dias · Abril 2026
        </p>

      </div>
    </div>
  );
}
