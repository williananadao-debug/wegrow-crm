"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight, Sparkles, ShieldCheck, Target, Cpu,
  BarChart3, Zap, Radio, Users, Briefcase, CheckCircle,
  TrendingUp, MapPin, Mail, ChevronRight,
  Check, MessageCircle, PenLine, Wallet, ChevronDown,
  Loader2, Send, Factory, Building2
} from 'lucide-react';

const STATS = [
  { value: '3x', label: 'mais vendas fechadas' },
  { value: '40%', label: 'redução de inadimplência' },
  { value: '100%', label: 'adaptável ao seu negócio' },
  { value: '2min', label: 'para criar uma proposta' },
];

const CLIENTES = [
  { nome: 'Demais FM', logo: '/logo-demais.png', segmento: 'Broadcasting' },
];

const STEPS = [
  {
    n: '01',
    title: 'Cadastre o cliente',
    desc: 'CNPJ digitado? O WeGrow preenche empresa, endereço e já avalia o risco de crédito automaticamente.',
    icon: <Users size={22} />,
    color: 'blue',
  },
  {
    n: '02',
    title: 'Monte a proposta',
    desc: 'Escolha os itens do catálogo, aplique desconto, envie por e-mail e acompanhe no Kanban de vendas.',
    icon: <Mail size={22} />,
    color: 'green',
  },
  {
    n: '03',
    title: 'Contrato → Entrega → Resultado',
    desc: 'Ao fechar, o job entra automaticamente na fila de produção ou entrega. Tudo conectado, sem retrabalho manual.',
    icon: <Briefcase size={22} />,
    color: 'purple',
  },
];

const PLANOS = [
  {
    nome: 'Essencial',
    preco: 497,
    desc: 'Para PMEs saindo das planilhas e organizando o processo comercial.',
    cor: 'border-white/10',
    destaque: false,
    itens: [
      'Kanban de vendas (drag-and-drop)',
      'Dashboard 360° com KPIs',
      'Gestão de equipe + cargos',
      'Metas por vendedor',
      'Catálogo de serviços',
      'Portal público de leads',
      'PWA offline',
      'Usuários ilimitados',
    ],
  },
  {
    nome: 'Pro',
    preco: 'consultar' as const,
    desc: 'Para empresas em crescimento que querem IA, relatórios avançados e mais controle.',
    cor: 'border-[#22C55E]/40',
    destaque: true,
    itens: [
      'Tudo do Essencial +',
      'IA de prospecção (resgate, churn)',
      'Análise de risco de crédito CNPJ',
      'Relatórios avançados + exportação CSV',
      'Pipeline de produção',
      'Dashboard financeiro',
      'Multi-unidade / filiais',
      'Audit log e histórico completo',
    ],
  },
  {
    nome: 'Enterprise',
    preco: 'consultar' as const,
    desc: 'Para grupos, redes ou projetos maiores — múltiplos CNPJs, integrações e escopo sob medida.',
    cor: 'border-white/10',
    destaque: false,
    itens: [
      'Tudo do Pro +',
      'API pública documentada',
      'Onboarding dedicado',
      'Suporte prioritário (SLA 4h)',
      'Multi-empresa (múltiplos CNPJs)',
      'White-label parcial',
      'Integrações e desenvolvimento sob medida',
    ],
  },
];

const FAQ = [
  {
    q: 'Preciso mudar todo o processo comercial da empresa?',
    a: 'Não. O WeGrow se adapta ao funil que sua equipe já usa — você configura as etapas, o catálogo de serviços e os cargos do jeito que já funciona pra vocês, não o contrário.',
  },
  {
    q: 'Tem contrato de fidelidade?',
    a: 'Não. Cancelamento a qualquer momento, sem multa. Preferimos ganhar a permanência todo mês com o produto.',
  },
  {
    q: 'Quanto tempo leva pra colocar no ar?',
    a: 'Normalmente alguns dias: criação de usuários, configuração do catálogo/funil e importação da base de clientes. Onboarding com suporte direto do fundador.',
  },
  {
    q: 'Funciona pro meu segmento, mesmo não sendo rádio?',
    a: 'Sim. O core do WeGrow (Kanban, Agenda, Clientes, Relatórios) serve qualquer PME. O módulo de Produção/OPEC é um complemento específico pra broadcasting — só aparece pra quem precisa dele.',
  },
  {
    q: 'Meus dados ficam seguros?',
    a: 'Sim — infraestrutura na nuvem com backups automáticos e controle de acesso por cargo. Cada empresa só enxerga os próprios dados.',
  },
];

const ADDONS = [
  { icon: <MessageCircle size={16}/>, label: 'WhatsApp Business', cor: 'text-green-400 bg-green-400/10' },
  { icon: <PenLine size={16}/>, label: 'Assinatura Digital', cor: 'text-blue-400 bg-blue-400/10' },
  { icon: <Wallet size={16}/>, label: 'Módulo Financeiro', cor: 'text-yellow-400 bg-yellow-400/10' },
];

const FEATURES = [
  {
    icon: <ShieldCheck size={24} />,
    color: 'text-[#22C55E] bg-[#22C55E]/10',
    title: 'Semáforo de Risco',
    desc: 'Algoritmo avalia capital social e tempo de empresa via CNPJ e classifica cada cliente em Verde, Amarelo ou Vermelho antes de você fechar.',
    span: 1,
  },
  {
    icon: <Sparkles size={24} />,
    color: 'text-purple-400 bg-purple-400/10',
    title: 'Central de IA',
    desc: 'Identificação automática de clientes inativos há mais de 60 dias, sugestões de resgate personalizadas e alertas de churn por unidade.',
    span: 1,
  },
  {
    icon: <Target size={24} />,
    color: 'text-orange-400 bg-orange-400/10',
    title: 'Gestão de Metas',
    desc: 'Defina objetivos mensais e anuais por vendedor ou equipe. Acompanhe o progresso em tempo real no ranking e no dashboard.',
    span: 1,
  },
  {
    icon: <BarChart3 size={24} />,
    color: 'text-cyan-400 bg-cyan-400/10',
    title: 'Relatórios Estratégicos',
    desc: 'Ticket médio, ciclo de vendas, taxa de conversão por etapa, forecast ponderado por probabilidade e exportação em CSV.',
    span: 2,
  },
  {
    icon: <MapPin size={24} />,
    color: 'text-rose-400 bg-rose-400/10',
    title: 'Check-in GPS + Offline',
    desc: 'Equipe em campo? O app funciona sem internet. Quando reconectar, sincroniza tudo automaticamente.',
    span: 1,
  },
  {
    icon: <Cpu size={24} />,
    color: 'text-sky-400 bg-sky-400/10',
    title: 'Integração OPEC',
    desc: 'Job aprovado exporta automaticamente para o sistema de broadcast com toda a grade de veiculação. Exclusivo do módulo Broadcasting.',
    span: 2,
    modulo: 'Broadcasting',
  },
  {
    icon: <Briefcase size={24} />,
    color: 'text-amber-400 bg-amber-400/10',
    title: 'Kanban de Produção',
    desc: 'Acompanhe cada job da criação à entrega em etapas customizáveis — roteiro, gravação, edição, aprovação. Exclusivo do módulo Broadcasting.',
    span: 1,
    modulo: 'Broadcasting',
  },
];

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [faqAberta, setFaqAberta] = useState<number | null>(0);
  const [leadForm, setLeadForm] = useState({ nome: '', empresa: '', telefone: '', email: '' });
  const [enviandoLead, setEnviandoLead] = useState(false);
  const [leadEnviado, setLeadEnviado] = useState(false);
  const [erroLead, setErroLead] = useState('');

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const atualizarLead = (campo: keyof typeof leadForm, valor: string) => {
    setLeadForm(prev => ({ ...prev, [campo]: valor }));
  };

  const enviarLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadForm.nome || !leadForm.empresa || !leadForm.telefone) return;
    setEnviandoLead(true);
    setErroLead('');
    try {
      const res = await fetch('/api/site/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadForm),
      });
      if (!res.ok) throw new Error();
      setLeadEnviado(true);
    } catch {
      setErroLead('Não foi possível enviar. Tente de novo ou chame no WhatsApp.');
    } finally {
      setEnviandoLead(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 selection:bg-[#22C55E]/30 overflow-x-hidden">

      {/* NAVBAR */}
      <nav className={`fixed top-0 w-full z-[100] transition-all duration-300 ${scrolled ? 'border-b border-white/10 bg-[#020617]/90 backdrop-blur-xl' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#22C55E] rounded-xl flex items-center justify-center font-black text-[#0F172A] text-2xl shadow-[0_0_20px_rgba(34,197,94,0.5)]">W</div>
            <span className="text-xl font-black uppercase italic tracking-tighter text-white">WeGrow</span>
          </div>
          <div className="hidden lg:flex items-center gap-8">
            <a href="#funcionalidades" className="text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-white transition-colors">Funcionalidades</a>
            <a href="#precos" className="text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-white transition-colors">Preços</a>
            <a href="#duvidas" className="text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-white transition-colors">Dúvidas</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="bg-[#22C55E] hover:bg-[#16a34a] text-[#0F172A] px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all hover:shadow-[0_0_15px_rgba(34,197,94,0.4)]">
              Acessar
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative pt-44 pb-24 px-6 overflow-hidden">
        {/* glow bg */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-[#22C55E]/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-20 right-0 w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-5xl mx-auto text-center relative">
          <div className="inline-flex items-center gap-2 bg-[#22C55E]/10 border border-[#22C55E]/20 px-4 py-1.5 rounded-full text-[#22C55E] text-[10px] font-black uppercase tracking-[0.2em] mb-8">
            <Sparkles size={12} /> Soluções tecnológicas inteligentes para o seu negócio
          </div>

          <h1 className="text-5xl md:text-7xl font-black text-white uppercase italic tracking-tighter leading-[0.9] mb-6">
            Venda mais.<br />Entregue{' '}
            <span className="relative inline-block">
              <span className="text-[#22C55E] relative z-10">melhor.</span>
              <span className="absolute inset-0 bg-[#22C55E]/10 blur-2xl rounded-full" />
            </span>
          </h1>

          <p className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto font-medium leading-relaxed mb-12">
            Funil de vendas, gestão de clientes, metas, produção e relatórios num sistema só — adaptável a qualquer segmento. Sua equipe fecha mais, erra menos e entrega mais rápido.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
            <a
              href="https://wa.me/5547997022381"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto bg-[#22C55E] hover:bg-[#16a34a] text-[#0F172A] px-10 py-5 rounded-2xl font-black uppercase text-sm tracking-widest flex items-center justify-center gap-3 transition-all hover:scale-105 shadow-[0_0_30px_rgba(34,197,94,0.3)]"
            >
              Ver demonstração <ArrowRight size={18} />
            </a>
            <Link
              href="/login"
              className="w-full sm:w-auto bg-white/5 hover:bg-white/10 text-white px-10 py-5 rounded-2xl font-black uppercase text-sm tracking-widest transition-all border border-white/10 text-center"
            >
              Já tenho acesso
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mb-16 text-[11px] font-bold uppercase tracking-widest text-slate-500">
            <span className="flex items-center gap-1.5"><Check size={13} className="text-[#22C55E]"/> Sem fidelidade</span>
            <span className="flex items-center gap-1.5"><Check size={13} className="text-[#22C55E]"/> Suporte direto do fundador</span>
            <span className="flex items-center gap-1.5"><Check size={13} className="text-[#22C55E]"/> Onboarding em dias, não meses</span>
          </div>

          {/* STATS BAR */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {STATS.map((s) => (
              <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <div className="text-3xl font-black text-[#22C55E]">{s.value}</div>
                <div className="text-[11px] text-slate-500 font-semibold uppercase tracking-widest mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PROVA SOCIAL — CLIENTES */}
      <section className="py-16 px-6 border-y border-white/5 bg-white/[0.015]">
        <div className="max-w-4xl mx-auto text-center">
          <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[#22C55E] mb-3">Clientes</div>
          <h2 className="text-2xl md:text-4xl font-black text-white italic uppercase tracking-tight mb-4">
            Já em operação real.
          </h2>
          <p className="text-slate-400 text-sm md:text-base font-medium max-w-xl mx-auto mb-10">
            O core do WeGrow (funil, clientes, metas, relatórios) atende qualquer segmento — não é feito pra um mercado só.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            {CLIENTES.map((c) => (
              <div key={c.nome} className="group flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-5 py-4 hover:border-white/20 transition-all">
                <div className="w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center overflow-hidden flex-shrink-0">
                  <Image
                    src={c.logo}
                    alt={c.nome}
                    width={60}
                    height={60}
                    className="w-full h-full object-contain grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-300"
                  />
                </div>
                <div className="text-left">
                  <p className="text-white font-black text-xs uppercase italic">{c.nome}</p>
                  <p className="text-slate-500 text-[9px] font-bold uppercase tracking-widest mt-0.5">{c.segmento}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ADAPTABILITY CALLOUT */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="bg-gradient-to-r from-white/5 via-white/[0.03] to-transparent border border-white/10 rounded-[40px] p-10 md:p-14">
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[#22C55E] mb-4">Flexível por natureza</div>
            <h2 className="text-2xl md:text-3xl font-black text-white italic uppercase tracking-tight mb-4">
              Moldado para o seu segmento.
            </h2>
            <p className="text-slate-400 font-medium leading-relaxed max-w-2xl mb-8">
              O WeGrow se adapta ao fluxo do seu negócio — não o contrário. Configure seu catálogo de serviços, etapas do funil e equipe do jeito que faz sentido pra você.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { icon: <Factory size={16} />, label: 'Indústria' },
                { icon: <Building2 size={16} />, label: 'Comércio & Atacado' },
                { icon: <Briefcase size={16} />, label: 'Serviços & Agências' },
                { icon: <Radio size={16} />, label: 'Mídia & Broadcasting' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
                  <span className="text-[#22C55E]">{item.icon}</span>
                  <span className="text-sm font-semibold text-slate-300">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[#22C55E] mb-3">Como funciona</div>
            <h2 className="text-3xl md:text-5xl font-black text-white italic uppercase tracking-tight">
              Três etapas. Um sistema.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6 relative">
            <div className="hidden md:block absolute top-10 left-[calc(16.5%+32px)] right-[calc(16.5%+32px)] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            {STEPS.map((step, i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-[32px] p-8 hover:bg-white/[0.07] transition-all group">
                <div className="flex items-center gap-4 mb-6">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center
                    ${step.color === 'blue' ? 'bg-blue-500/10 text-blue-400' : ''}
                    ${step.color === 'green' ? 'bg-[#22C55E]/10 text-[#22C55E]' : ''}
                    ${step.color === 'purple' ? 'bg-purple-500/10 text-purple-400' : ''}
                  `}>
                    {step.icon}
                  </div>
                  <span className="text-4xl font-black text-white/10 group-hover:text-white/20 transition-colors">{step.n}</span>
                </div>
                <h3 className="text-lg font-black text-white uppercase italic mb-3">{step.title}</h3>
                <p className="text-slate-400 text-sm font-medium leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES BENTO */}
      <section className="py-16 px-6 bg-white/[0.015] border-y border-white/5" id="funcionalidades">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[#22C55E] mb-3">Funcionalidades</div>
            <h2 className="text-3xl md:text-5xl font-black text-white italic uppercase tracking-tight mb-4">
              O core serve qualquer negócio
            </h2>
            <p className="text-slate-400 text-sm font-medium max-w-xl mx-auto">
              Funil, clientes, metas e relatórios funcionam pra qualquer segmento. Os itens marcados como módulo são complementos que só aparecem pra quem precisa deles.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className={`relative bg-white/[0.04] border border-white/10 rounded-[32px] p-8 hover:bg-white/[0.07] hover:border-white/20 transition-all group ${f.span === 2 ? 'md:col-span-2' : ''}`}
              >
                {f.modulo && (
                  <span className="absolute top-6 right-6 text-[9px] font-black uppercase tracking-widest text-slate-500 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">
                    Módulo {f.modulo}
                  </span>
                )}
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-5 ${f.color}`}>
                  {f.icon}
                </div>
                <h3 className="text-xl font-black text-white uppercase italic mb-3">{f.title}</h3>
                <p className="text-slate-400 text-sm font-medium leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WORKFLOW VISUAL */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="bg-[#0B1120] border border-white/10 rounded-[40px] p-10 md:p-14 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-96 h-96 bg-[#22C55E]/5 rounded-full blur-[100px] pointer-events-none" />
            <div className="relative">
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[#22C55E] mb-3">Pipeline completo</div>
              <h2 className="text-2xl md:text-4xl font-black text-white italic uppercase tracking-tight mb-10">
                Da proposta à entrega em minutos
              </h2>

              <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
                {['Novo Lead', 'Proposta', 'Contrato', 'Produção', 'Entregue'].map((s, i, arr) => (
                  <React.Fragment key={s}>
                    <div className="flex md:flex-col items-center md:items-center gap-3 md:gap-2 flex-1">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-black border-2
                        ${i === 4 ? 'bg-[#22C55E] border-[#22C55E] text-[#0F172A] shadow-[0_0_20px_rgba(34,197,94,0.5)]' : 'border-white/20 text-white/60 bg-white/5'}`}>
                        {i + 1}
                      </div>
                      <span className={`text-xs font-bold uppercase tracking-wide ${i === 4 ? 'text-[#22C55E]' : 'text-slate-400'}`}>{s}</span>
                    </div>
                    {i < arr.length - 1 && (
                      <ChevronRight size={16} className="text-white/20 hidden md:block flex-shrink-0" />
                    )}
                  </React.Fragment>
                ))}
              </div>

              <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { icon: <CheckCircle size={16} />, text: 'Kanban visual drag & drop' },
                  { icon: <CheckCircle size={16} />, text: 'Aprovação de desconto' },
                  { icon: <CheckCircle size={16} />, text: 'Envio de proposta por e-mail' },
                  { icon: <CheckCircle size={16} />, text: 'Job direto na fila de produção' },
                ].map((item) => (
                  <div key={item.text} className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                    <span className="text-[#22C55E]">{item.icon}</span>
                    {item.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIFERENCIAIS */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[#22C55E] mb-3">Por que WeGrow</div>
            <h2 className="text-2xl md:text-4xl font-black text-white italic uppercase tracking-tight max-w-3xl mx-auto leading-tight">
              Não é mais um SaaS genérico feito pra bonito na demo.
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { icon: <ShieldCheck size={22}/>, title: 'Validado em operação real', desc: 'Construído e testado no dia a dia de uma operação de verdade, com pressão de prazo e cliente de verdade — não em uma planilha de investidor.' },
              { icon: <Target size={22}/>, title: 'Se adapta a você, não o contrário', desc: 'Funil, catálogo, cargos e módulos configuráveis. Você não muda seu processo pra caber no sistema.' },
              { icon: <MessageCircle size={22}/>, title: 'Suporte de quem construiu', desc: 'Sem fila de ticket genérica: onboarding e suporte direto de quem desenvolve o produto.' },
            ].map((d) => (
              <div key={d.title} className="bg-white/[0.04] border border-white/10 rounded-[28px] p-7 hover:border-[#22C55E]/30 transition-all">
                <div className="w-11 h-11 rounded-2xl bg-[#22C55E]/10 text-[#22C55E] flex items-center justify-center mb-5">{d.icon}</div>
                <h3 className="text-white font-black text-sm uppercase italic mb-2">{d.title}</h3>
                <p className="text-slate-400 text-xs font-medium leading-relaxed">{d.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PREÇOS */}
      <section className="py-24 px-6 bg-white/[0.015] border-y border-white/5" id="precos">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[#22C55E] mb-3">Preços</div>
            <h2 className="text-3xl md:text-5xl font-black text-white italic uppercase tracking-tight mb-4">
              Simples. Previsível. Sem surpresas.
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto text-sm font-medium">
              A partir de R$ 497/mês, por empresa — sem cobrar por usuário. Projetos maiores e integrações sob medida? Fale com a gente.
            </p>
          </div>

          {/* Cards de plano */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {PLANOS.map((plano) => (
              <div
                key={plano.nome}
                className={`relative bg-[#0B1120] border-2 ${plano.cor} rounded-[32px] p-8 flex flex-col transition-transform ${plano.destaque ? 'shadow-[0_0_60px_rgba(34,197,94,0.16)] md:scale-105 md:-translate-y-2' : ''}`}
              >
                {plano.destaque && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#22C55E] text-[#0B1120] text-[9px] font-black uppercase tracking-[0.2em] px-5 py-1.5 rounded-full whitespace-nowrap shadow-[0_4px_20px_rgba(34,197,94,0.3)]">
                    Mais popular
                  </div>
                )}

                <div className="mb-6">
                  <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-2 ${plano.destaque ? 'text-[#22C55E]' : 'text-slate-500'}`}>{plano.nome}</p>
                  <div className="flex items-end gap-1 mb-3">
                    {plano.preco === 'consultar' ? (
                      <span className="text-3xl font-black text-white">Sob consulta</span>
                    ) : (
                      <>
                        <span className="text-4xl font-black text-white">R$ {plano.preco.toLocaleString('pt-BR')}</span>
                        <span className="text-slate-500 text-sm font-bold pb-1">/mês</span>
                      </>
                    )}
                  </div>
                  <p className="text-slate-500 text-xs font-medium leading-relaxed">{plano.desc}</p>
                </div>

                <div className="space-y-2.5 flex-1 mb-8">
                  {plano.itens.map((item) => (
                    <div key={item} className="flex items-start gap-2.5 text-xs text-slate-300">
                      <Check size={13} className={`flex-shrink-0 mt-0.5 ${plano.destaque ? 'text-[#22C55E]' : 'text-slate-500'}`} />
                      {item}
                    </div>
                  ))}
                </div>

                <a
                  href="https://wa.me/5547997022381"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`w-full py-3.5 rounded-2xl font-black uppercase text-xs tracking-widest text-center transition-all flex items-center justify-center gap-2
                    ${plano.destaque
                      ? 'bg-[#22C55E] text-[#0B1120] hover:bg-[#16a34a] shadow-[0_8px_30px_rgba(34,197,94,0.25)]'
                      : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'
                    }`}
                >
                  Falar com consultor <ArrowRight size={13}/>
                </a>
              </div>
            ))}
          </div>

          {/* Add-ons */}
          <div className="bg-white/[0.03] border border-white/8 rounded-[32px] p-8">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-6">Add-ons disponíveis em qualquer plano</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {ADDONS.map((a) => (
                <div key={a.label} className="flex flex-col gap-3 bg-white/5 border border-white/10 rounded-2xl p-4">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${a.cor}`}>{a.icon}</div>
                  <div>
                    <p className="text-white text-xs font-black">{a.label}</p>
                    <p className="text-slate-500 text-[10px] font-bold mt-0.5 uppercase tracking-wide">Sob consulta</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Nota */}
          <p className="text-center text-slate-600 text-[10px] uppercase tracking-widest font-bold mt-6">
            Todos os planos incluem usuários ilimitados · PWA offline · suporte por chat · sem taxa de setup
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-6" id="duvidas">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[#22C55E] mb-3">Dúvidas</div>
            <h2 className="text-3xl md:text-5xl font-black text-white italic uppercase tracking-tight">
              Perguntas frequentes
            </h2>
          </div>

          <div className="space-y-3">
            {FAQ.map((item, i) => {
              const aberta = faqAberta === i;
              return (
                <div key={item.q} className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setFaqAberta(aberta ? null : i)}
                    className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
                  >
                    <span className="text-sm md:text-base font-bold text-white">{item.q}</span>
                    <ChevronDown size={18} className={`text-[#22C55E] flex-shrink-0 transition-transform ${aberta ? 'rotate-180' : ''}`} />
                  </button>
                  {aberta && (
                    <div className="px-6 pb-5 text-sm text-slate-400 font-medium leading-relaxed">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-32 px-6" id="contato">
        <div className="max-w-5xl mx-auto relative">
          <div className="bg-[#22C55E] rounded-[50px] p-8 md:p-16 overflow-hidden shadow-[0_0_120px_rgba(34,197,94,0.25)] relative">
            <div className="relative z-10 grid md:grid-cols-2 gap-10 md:gap-14 items-center">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[#0F172A]/60 mb-4">Pronto para começar?</div>
                <h2 className="text-4xl md:text-5xl font-black text-[#0F172A] uppercase italic tracking-tighter mb-6 leading-tight">
                  Escale sua operação<br />comercial agora.
                </h2>
                <p className="text-[#0F172A]/70 font-medium mb-8 max-w-md">
                  Deixe seus dados que a gente te chama, ou fale agora direto pelo WhatsApp.
                </p>
                <a
                  href="https://wa.me/5547997022381"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 bg-[#0F172A] text-white px-8 py-4 rounded-2xl font-black uppercase text-sm tracking-[0.15em] hover:scale-105 transition-all shadow-xl"
                >
                  Chamar no WhatsApp <ArrowRight size={18} />
                </a>
              </div>

              <div className="bg-[#0B1120] rounded-[32px] p-6 md:p-8 border border-black/10 shadow-2xl">
                {leadEnviado ? (
                  <div className="text-center py-10">
                    <CheckCircle className="text-[#22C55E] mx-auto mb-4" size={40} />
                    <p className="text-white font-black uppercase italic text-lg mb-2">Recebemos seu contato!</p>
                    <p className="text-slate-400 text-sm">Vamos te chamar em breve pelo WhatsApp ou e-mail.</p>
                  </div>
                ) : (
                  <form onSubmit={enviarLead} className="space-y-3">
                    <input
                      required
                      value={leadForm.nome}
                      onChange={(e) => atualizarLead('nome', e.target.value)}
                      placeholder="Seu nome"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white text-sm font-medium outline-none focus:border-[#22C55E] placeholder:text-slate-500 transition-colors"
                    />
                    <input
                      required
                      value={leadForm.empresa}
                      onChange={(e) => atualizarLead('empresa', e.target.value)}
                      placeholder="Sua empresa"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white text-sm font-medium outline-none focus:border-[#22C55E] placeholder:text-slate-500 transition-colors"
                    />
                    <input
                      required
                      value={leadForm.telefone}
                      onChange={(e) => atualizarLead('telefone', e.target.value)}
                      placeholder="WhatsApp"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white text-sm font-medium outline-none focus:border-[#22C55E] placeholder:text-slate-500 transition-colors"
                    />
                    <input
                      type="email"
                      value={leadForm.email}
                      onChange={(e) => atualizarLead('email', e.target.value)}
                      placeholder="E-mail (opcional)"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white text-sm font-medium outline-none focus:border-[#22C55E] placeholder:text-slate-500 transition-colors"
                    />
                    {erroLead && <p className="text-red-400 text-xs font-bold">{erroLead}</p>}
                    <button
                      type="submit"
                      disabled={enviandoLead}
                      className="w-full bg-[#22C55E] hover:bg-[#16a34a] text-[#0F172A] py-4 rounded-xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                    >
                      {enviandoLead ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                      Quero uma demonstração
                    </button>
                  </form>
                )}
              </div>
            </div>
            <Zap className="absolute top-[-60px] left-[-60px] text-[#0F172A]/10" size={320} />
            <TrendingUp className="absolute bottom-[-40px] right-[-40px] text-[#0F172A]/10" size={280} />
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-10 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-[#22C55E] rounded-lg flex items-center justify-center font-black text-[#0F172A] text-sm">W</div>
            <span className="text-sm font-black uppercase italic tracking-tighter text-white/60">WeGrow</span>
          </div>
          <p className="text-[10px] font-bold uppercase text-slate-600 tracking-[0.25em]">
            &copy; {new Date().getFullYear()} WeGrow Tecnologia · Todos os direitos reservados
          </p>
          <div className="flex gap-6">
            <Link href="/login" className="text-xs text-slate-500 hover:text-white transition-colors font-semibold">Login</Link>
            <a href="https://wa.me/5547997022381" target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-[#22C55E] transition-colors font-semibold">Contato</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
