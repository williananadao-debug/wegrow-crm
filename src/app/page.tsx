"use client";
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ArrowRight, Sparkles, ShieldCheck, Target, Cpu,
  BarChart3, Users, Briefcase, CheckCircle,
  MapPin, Mail, Check, MessageCircle, PenLine, Wallet, ChevronDown,
  Loader2, Send, Brain, Activity, Bot, LayoutGrid, Link2,
  Radar, HardHat, Megaphone, Scale
} from 'lucide-react';
import { Reveal, TiltCard, Contador, OrbitaLeve, TelaSistema, TelaEstoque, VideoDepoimento } from '@/components/site/efeitos';
import { Barcode, Boxes, Factory, FileText, ScanLine, Truck, Quote } from 'lucide-react';

// Site institucional (wegrow.app.br). Visual com cena 3D no topo (components/site/Hero3D,
// carregada só no navegador) e animações de entrada/efeitos em components/site/efeitos.

const STATS = [
  { value: '3x', label: 'mais vendas fechadas' },
  { value: '40%', label: 'redução de inadimplência' },
  { value: '100%', label: 'adaptável ao seu negócio' },
  { value: '2min', label: 'para criar uma proposta' },
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

const PRODUTOS = [
  {
    nome: 'CRM',
    tagline: 'A base de todo mundo',
    desc: 'O motor de vendas que toda empresa usa, do jeito que seu processo já funciona.',
    icon: <LayoutGrid size={22} />,
    cor: 'text-[#22C55E] bg-[#22C55E]/10',
    borda: 'border-[#22C55E]/20',
    hex: '#22C55E',
    features: [
      'Funil visual (kanban) por etapas customizáveis',
      'Propostas e contratos com assinatura eletrônica',
      'Metas por vendedor e por equipe',
      'Semáforo de risco de crédito via CNPJ',
    ],
  },
  {
    nome: 'Nexus',
    tagline: 'Pra quem não vive de funil',
    desc: 'Memória de cliente pesquisável, pra times que atendem por telefone e WhatsApp, sem etapa de pipeline.',
    icon: <Brain size={22} />,
    cor: 'text-indigo-400 bg-indigo-400/10',
    borda: 'border-indigo-500/20',
    hex: '#818cf8',
    features: [
      'Fotos, documentos e layouts por cliente',
      'Histórico de manutenção pesquisável',
      'Atendimento direto, sem etapa de pipeline',
      'Busca central por telefone, nome ou documento',
    ],
  },
  {
    nome: 'Pulse',
    tagline: 'Venda rápida, com estoque',
    desc: 'Pedido chegou, fecha na hora — com catálogo, estoque e rota de entrega no mesmo lugar.',
    icon: <Activity size={22} />,
    cor: 'text-amber-400 bg-amber-400/10',
    borda: 'border-amber-500/20',
    hex: '#fbbf24',
    features: [
      'Catálogo com foto e controle de estoque',
      'Entrada de mercadoria lendo a nota fiscal por IA',
      'Rota do dia pro time de campo',
      'Venda fecha na hora, sem passar por funil',
    ],
  },
  {
    nome: 'THOR',
    tagline: 'Sua IA de vendas',
    desc: 'Assistente que trabalha por você — tudo num chat, sem sair do sistema.',
    icon: <Bot size={22} />,
    cor: 'text-purple-400 bg-purple-400/10',
    borda: 'border-purple-500/20',
    hex: '#c084fc',
    features: [
      'Gera sozinha lista de clientes pra resgatar',
      'Lê nota fiscal de fornecedor por foto',
      'Monta catálogo de vendas pra imprimir/exportar',
      'Tudo em chat, sem sair do sistema',
    ],
  },
];

// Diferente de PRODUTOS (horizontais, servem qualquer segmento), estes são módulos
// verticais — construídos pra um tipo de negócio específico, ativados só pra quem precisa.
const VERTICAIS = [
  {
    nome: 'Argus',
    tagline: 'Licitações públicas',
    desc: 'Torre de controle de licitações, do edital ao contrato assinado.',
    icon: <Radar size={22} />,
    cor: 'text-yellow-400 bg-yellow-400/10',
    borda: 'border-yellow-500/20',
    hex: '#facc15',
    features: [
      'Sincroniza ao vivo com o PNCP',
      'Alerta automático de prazo de proposta',
      'Contratos e financeiro por edital',
      'Agente de IA busca oportunidades novas',
    ],
  },
  {
    nome: 'Obras',
    tagline: 'Construção e engenharia',
    desc: 'Do canteiro ao financeiro, sem planilha solta.',
    icon: <HardHat size={22} />,
    cor: 'text-orange-400 bg-orange-400/10',
    borda: 'border-orange-500/20',
    hex: '#fb923c',
    features: [
      'Cronograma e diário de obra',
      'Medições e contratados',
      'Controle de suprimentos e estoque',
      'Financeiro por obra',
    ],
  },
  {
    nome: 'Mídia',
    tagline: 'Rádio e broadcasting',
    desc: 'Painel comercial pra emissoras, direto da API do parceiro de mídia.',
    icon: <Megaphone size={22} />,
    cor: 'text-pink-400 bg-pink-400/10',
    borda: 'border-pink-500/20',
    hex: '#f472b6',
    features: [
      'Audiência e redes sociais em tempo real',
      'Aniversário de cidade — oportunidade por praça',
      'Painel por emissora e por rede',
      'Indicadores comerciais por canal',
    ],
  },
  {
    nome: 'Advocacia',
    tagline: 'CRM jurídico',
    desc: 'Funil de processos e financeiro pra escritórios de advocacia.',
    icon: <Scale size={22} />,
    cor: 'text-amber-500 bg-amber-500/10',
    borda: 'border-amber-500/20',
    hex: '#f59e0b',
    features: [
      'Funil de processos, do lead ao contrato fechado',
      'Honorário fixo, recorrente ou êxito',
      'Contas a receber e fluxo de caixa',
      'IA narra os números do mês em português',
    ],
  },
];

const ADDONS = [
  { icon: <MessageCircle size={16}/>, label: 'WhatsApp Business', cor: 'text-green-400 bg-green-400/10' },
  { icon: <PenLine size={16}/>, label: 'Assinatura Digital', cor: 'text-blue-400 bg-blue-400/10' },
  { icon: <Wallet size={16}/>, label: 'Módulo Financeiro', cor: 'text-yellow-400 bg-yellow-400/10' },
  { icon: <Link2 size={16}/>, label: 'Integração com seus sistemas', cor: 'text-cyan-400 bg-cyan-400/10' },
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
    title: 'Integração com seus sistemas',
    desc: 'Job aprovado exporta sozinho pro sistema do seu setor — hoje já plugado no OPEC, do mercado de rádio — e a API pública conecta com qualquer outro sistema que sua empresa já usa.',
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

const MODULOS_3D = [...PRODUTOS, ...VERTICAIS];

// Os dois produtos carro-chefe ganham seção própria; os demais módulos ficam num bloco compacto.
const CRM_DESTAQUES = [
  { icon: <LayoutGrid size={18} />, t: 'Funil visual por etapas', d: 'Kanban arrasta-e-solta com as etapas do seu processo, filtros por vendedor, unidade e período.' },
  { icon: <PenLine size={18} />, t: 'Proposta e contrato com assinatura', d: 'Monta a proposta pelo catálogo, gera o contrato em PDF e manda pra assinar eletronicamente.' },
  { icon: <Target size={18} />, t: 'Metas e ranking', d: 'Meta por vendedor e por equipe, venda contada no mês em que foi fechada de verdade.' },
  { icon: <MapPin size={18} />, t: 'Visitas e agenda de campo', d: 'Registro de visitas com relatório por palavra-chave, check-in e app que funciona offline.' },
  { icon: <ShieldCheck size={18} />, t: 'Risco de crédito por CNPJ', d: 'Semáforo verde/amarelo/vermelho antes de fechar, com cadastro preenchido pelo CNPJ.' },
  { icon: <Bot size={18} />, t: 'IA de vendas (THOR)', d: 'Lista de clientes pra resgatar, alertas de churn e relatórios narrados em português.' },
];

const PULSE_DESTAQUES = [
  { icon: <Boxes size={18} />, t: 'Estoque com mínimo e reposição', d: 'Saldo em tempo real, alerta de estoque baixo e sugestão de compra pelo consumo dos últimos dias.' },
  { icon: <FileText size={18} />, t: 'Entrada pela nota fiscal', d: 'Notas de compra capturadas na SEFAZ ou lidas por IA pela foto — itens entram no estoque sem digitar.' },
  { icon: <ScanLine size={18} />, t: 'Saída pelo código de barras', d: 'O time de fábrica lê o SKU com a câmera do celular e escolhe a quantidade. Kardex completo.' },
  { icon: <Factory size={18} />, t: 'Produção com etapas e checklist', d: 'Venda vira ordem de produção, cada etapa tem checklist, fotos e contador de dias parado.' },
  { icon: <Barcode size={18} />, t: 'Ficha técnica e custo', d: 'Matéria-prima baixa sozinha pela ficha técnica do produto, com custo médio e margem.' },
  { icon: <Truck size={18} />, t: 'NF-e e portal do cliente', d: 'Emite a nota de faturamento e de entrega, e o cliente acompanha a produção com fotos aprovadas.' },
];

// Depoimento em vídeo. Preencher com o link do vídeo do Douglas — enquanto youtubeId/mp4
// estiverem vazios a seção não aparece no site.
// Vídeo em public/noprecache/ (fora do cache offline do app — senão todo celular com o app
// instalado baixaria os 10 MB). Frase = palavras do próprio Douglas no vídeo (legenda).
const DEPOIMENTO: { youtubeId?: string; mp4?: string; capa?: string; vertical?: boolean; nome: string; cargo: string; empresa: string; frase: string } = {
  mp4: '/noprecache/depoimento-douglas.mp4',
  capa: '/noprecache/depoimento-douglas.jpg',
  vertical: true,
  nome: 'Douglas Fernandes',
  cargo: 'Diretor Executivo',
  empresa: 'Rede Demais FM de Rádios',
  frase: 'Um sistema desenvolvido e modulado de acordo com as nossas necessidades. Faça como a Rede Demais FM: coloque na sua empresa o CRM WeGrow — a revolução em dados e informações pro seu time de vendas.',
};
const temDepoimento = !!(DEPOIMENTO.youtubeId || DEPOIMENTO.mp4);

const SEGMENTOS = ['Indústria', 'Comércio & Atacado', 'Serviços & Agências', 'Mídia & Broadcasting', 'Licitações', 'Construção', 'Advocacia', 'Fábricas sob encomenda', 'Distribuidoras', 'Representação comercial'];

const Hero3D = dynamic(() => import('@/components/site/Hero3D'), { ssr: false });

// Decide entre a cena WebGL e a órbita leve em CSS: sem WebGL ou com "menos movimento" ligado
// no sistema → versão leve. No celular a cena roda em modo leve (menos partículas, 1x de pixel).
// useSyncExternalStore: no servidor "carregando", no navegador lê o aparelho (sem setState em efeito).
const semAssinatura = () => () => {};
let modoCache: 'webgl' | 'leve' | null = null;
function modoDoAparelho(): 'webgl' | 'leve' {
  if (modoCache) return modoCache;
  let modo: 'webgl' | 'leve' = 'leve';
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    try { modo = document.createElement('canvas').getContext('webgl2') ? 'webgl' : 'leve'; } catch { modo = 'leve'; }
  }
  modoCache = modo;
  return modo;
}
function useModo3D() {
  const modo = useSyncExternalStore<'carregando' | 'webgl' | 'leve'>(semAssinatura, modoDoAparelho, () => 'carregando');
  const celular = useSyncExternalStore(semAssinatura, () => window.matchMedia('(max-width: 768px)').matches, () => false);
  return { modo, celular };
}

function Secao({ id, rotulo, titulo, subtitulo, children, className = '' }: { id?: string; rotulo: string; titulo: React.ReactNode; subtitulo?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`relative py-24 md:py-32 px-6 ${className}`}>
      <div className="max-w-7xl mx-auto">
        <Reveal className="text-center mb-14 md:mb-20">
          <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-[#22C55E] mb-4">
            <span className="h-px w-6 bg-[#22C55E]/60" /> {rotulo} <span className="h-px w-6 bg-[#22C55E]/60" />
          </div>
          <h2 className="text-3xl md:text-6xl font-black text-white tracking-tight leading-[1.02] max-w-4xl mx-auto">{titulo}</h2>
          {subtitulo && <p className="text-slate-400 text-base md:text-lg font-medium max-w-2xl mx-auto mt-5 leading-relaxed">{subtitulo}</p>}
        </Reveal>
        {children}
      </div>
    </section>
  );
}

function Destaque({ id, cor, rotulo, titulo, texto, itens, visual, invertido }: {
  id: string; cor: string; rotulo: string; titulo: React.ReactNode; texto: string;
  itens: { icon: React.ReactNode; t: string; d: string }[]; visual: React.ReactNode; invertido?: boolean;
}) {
  return (
    <section id={id} className="relative py-24 md:py-32 px-6 overflow-hidden">
      <div className="absolute top-1/2 -translate-y-1/2 w-[800px] h-[520px] rounded-full blur-[130px] pointer-events-none opacity-[0.09]" style={{ background: cor, [invertido ? 'right' : 'left']: '-10%' }} />
      <div className={`relative max-w-7xl mx-auto grid lg:grid-cols-2 gap-14 items-center ${invertido ? 'lg:[&>*:first-child]:order-2' : ''}`}>
        <div>
          <Reveal de={invertido ? 'direita' : 'esquerda'}>
            <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] mb-4" style={{ color: cor }}>
              <span className="h-px w-6" style={{ background: cor }} /> {rotulo}
            </div>
            <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-[1.05] mb-5">{titulo}</h2>
            <p className="text-slate-400 text-base md:text-lg font-medium leading-relaxed mb-10 max-w-xl">{texto}</p>
          </Reveal>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-6">
            {itens.map((it, i) => (
              <Reveal key={it.t} delay={i * 70}>
                <div className="flex gap-3.5">
                  <div className="w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center border" style={{ color: cor, borderColor: `${cor}40`, background: `${cor}12` }}>{it.icon}</div>
                  <div>
                    <h3 className="text-white font-bold text-[15px] mb-1">{it.t}</h3>
                    <p className="text-slate-400 text-[13px] leading-relaxed">{it.d}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
        <Reveal de="zoom" delay={150}>{visual}</Reveal>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [faqAberta, setFaqAberta] = useState<number | null>(0);
  const [leadForm, setLeadForm] = useState({ nome: '', empresa: '', telefone: '', email: '' });
  const [enviandoLead, setEnviandoLead] = useState(false);
  const [leadEnviado, setLeadEnviado] = useState(false);
  const [erroLead, setErroLead] = useState('');
  const { modo, celular } = useModo3D();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler, { passive: true });
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

  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white text-sm font-medium outline-none focus:border-[#22C55E] focus:bg-white/[0.07] placeholder:text-slate-500 transition-colors';

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 selection:bg-[#22C55E]/30 overflow-x-hidden">

      {/* NAVBAR */}
      <nav className={`fixed top-0 w-full z-[100] transition-all duration-500 ${scrolled ? 'py-3' : 'py-5'}`}>
        <div className={`mx-auto px-4 md:px-6 transition-all duration-500 ${scrolled ? 'max-w-5xl' : 'max-w-7xl'}`}>
          <div className={`flex items-center justify-between rounded-2xl px-4 md:px-5 h-16 transition-all duration-500 ${scrolled ? 'bg-[#0B1120]/80 backdrop-blur-xl border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.4)]' : 'border border-transparent'}`}>
            <a href="#topo" className="flex items-center gap-3">
              <div className="w-9 h-9 bg-[#22C55E] rounded-xl flex items-center justify-center font-black text-[#0F172A] text-xl shadow-[0_0_24px_rgba(34,197,94,0.55)]">W</div>
              <span className="text-lg font-black tracking-tight text-white">WeGrow</span>
            </a>
            <div className="hidden lg:flex items-center gap-1">
              {[['#produtos', 'CRM'], ['#pulse', 'Pulse'], ['#funcionalidades', 'Funcionalidades'], ['#precos', 'Preços'], ['#duvidas', 'Dúvidas']].map(([h, l]) => (
                <a key={h} href={h} className="px-4 py-2 rounded-xl text-[13px] font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors">{l}</a>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Link href="/login" className="hidden sm:inline-flex px-4 py-2 rounded-xl text-[13px] font-semibold text-slate-300 hover:text-white transition-colors">Entrar</Link>
              <a href="#contato" className="bg-[#22C55E] hover:bg-[#16a34a] text-[#0F172A] px-5 py-2.5 rounded-xl text-[13px] font-black transition-all hover:shadow-[0_0_24px_rgba(34,197,94,0.45)]">
                Quero uma demo
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section id="topo" className="relative min-h-[100svh] flex items-center pt-28 pb-16 px-6 overflow-hidden">
        <div className="absolute inset-0 grade-fundo pointer-events-none" />
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1100px] h-[700px] bg-[#22C55E]/10 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-sky-500/10 rounded-full blur-[140px] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto w-full grid lg:grid-cols-[1.05fr_1fr] gap-10 items-center">
          <div className="text-center lg:text-left relative z-10">
            <Reveal>
              <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 backdrop-blur px-4 py-1.5 rounded-full text-slate-300 text-[11px] font-bold mb-8">
                <span className="relative flex w-2 h-2"><span className="absolute inset-0 rounded-full bg-[#22C55E] animate-ping" /><span className="relative w-2 h-2 rounded-full bg-[#22C55E]" /></span>
                Soluções tecnológicas inteligentes para o seu negócio
              </div>
            </Reveal>
            <Reveal delay={100}>
              <h1 className="text-5xl sm:text-6xl md:text-7xl xl:text-8xl font-black text-white tracking-tighter leading-[0.92] mb-7">
                Venda mais.<br />Entregue <span className="texto-gradiente">melhor.</span>
              </h1>
            </Reveal>
            <Reveal delay={200}>
              <p className="text-slate-400 text-lg md:text-xl max-w-xl mx-auto lg:mx-0 font-medium leading-relaxed mb-10">
                <b className="text-white">CRM</b> pra vender com processo e <b className="text-white">Pulse</b> pra controlar estoque, produção e notas fiscais — num sistema só, adaptável ao seu negócio. Sua equipe fecha mais, erra menos e entrega mais rápido.
              </p>
            </Reveal>
            <Reveal delay={300}>
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 mb-10">
                <a href="https://wa.me/5547997022381" target="_blank" rel="noopener noreferrer"
                  className="group w-full sm:w-auto relative overflow-hidden bg-[#22C55E] text-[#0F172A] px-8 py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.03] shadow-[0_0_40px_rgba(34,197,94,0.35)]">
                  <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                  <span className="relative">Ver demonstração</span> <ArrowRight size={18} className="relative group-hover:translate-x-1 transition-transform" />
                </a>
                <Link href="/login" className="w-full sm:w-auto bg-white/5 hover:bg-white/10 text-white px-8 py-4 rounded-2xl font-bold text-sm transition-all border border-white/10 text-center backdrop-blur">
                  Já tenho acesso
                </Link>
              </div>
            </Reveal>
            <Reveal delay={400}>
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-[12px] font-semibold text-slate-500">
                <span className="flex items-center gap-1.5"><Check size={14} className="text-[#22C55E]" /> Sem fidelidade</span>
                <span className="flex items-center gap-1.5"><Check size={14} className="text-[#22C55E]" /> Suporte direto do fundador</span>
                <span className="flex items-center gap-1.5"><Check size={14} className="text-[#22C55E]" /> Onboarding em dias</span>
              </div>
            </Reveal>
          </div>

          {/* Cena 3D */}
          <Reveal de="zoom" delay={150} className="relative">
            <div className="relative mx-auto w-full max-w-[640px] aspect-square">
              <div className="absolute inset-[12%] rounded-full bg-[#22C55E]/10 blur-3xl" />
              {modo === 'webgl' && <Hero3D modulos={MODULOS_3D.map(m => ({ nome: m.nome, hex: m.hex }))} leve={celular} />}
              {modo === 'leve' && <OrbitaLeve modulos={MODULOS_3D.map(m => ({ nome: m.nome, hex: m.hex, icon: m.icon }))} />}
              {/* rótulos dos módulos flutuando por cima da cena */}
              <div className="absolute inset-x-0 bottom-0 flex flex-wrap justify-center gap-1.5 px-4 pointer-events-none">
                {MODULOS_3D.map(m => (
                  <span key={m.nome} className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#020617]/70 backdrop-blur border" style={{ color: m.hex, borderColor: `${m.hex}35` }}>{m.nome}</span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>

        <a href="#numeros" aria-label="Rolar" className="hidden md:flex absolute bottom-6 left-1/2 -translate-x-1/2 w-6 h-10 rounded-full border-2 border-white/15 justify-center pt-2">
          <span className="w-1 h-2 rounded-full bg-[#22C55E] animate-bounce" />
        </a>
      </section>

      {/* NÚMEROS */}
      <section id="numeros" className="relative px-6 -mt-4">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 80}>
              <div className="relative rounded-3xl p-6 md:p-7 bg-gradient-to-b from-white/[0.06] to-transparent border border-white/10 overflow-hidden text-center">
                <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[#22C55E]/60 to-transparent" />
                <Contador valor={s.value} className="block text-4xl md:text-5xl font-black text-white tracking-tight" />
                <div className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-2">{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* SEGMENTOS (faixa rolando) */}
      <div className="relative py-14 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_15%,black_85%,transparent)]">
        <div className="flex w-max gap-3 animate-[marquee_40s_linear_infinite] hover:[animation-play-state:paused]">
          {[...SEGMENTOS, ...SEGMENTOS].map((s, i) => (
            <span key={i} className="flex items-center gap-2 whitespace-nowrap px-5 py-2.5 rounded-full border border-white/10 bg-white/[0.03] text-sm font-semibold text-slate-400">
              <Sparkles size={13} className="text-[#22C55E]" /> {s}
            </span>
          ))}
        </div>
      </div>

      {/* CRM */}
      <Destaque id="produtos" cor="#22C55E" rotulo="WeGrow CRM" visual={<TelaSistema />}
        titulo={<>Vendas com processo, <span className="texto-gradiente">do lead ao contrato.</span></>}
        texto="O motor comercial da sua empresa: cada oportunidade num funil visual, proposta e contrato saindo do próprio sistema, metas acompanhadas em tempo real — do jeito que o seu time já trabalha."
        itens={CRM_DESTAQUES} />

      {/* COMO FUNCIONA — faixa de 3 passos */}
      <section className="relative px-6 pb-8">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-4">
          {STEPS.map((step, i) => {
            const cor = step.color === 'blue' ? '#38bdf8' : step.color === 'green' ? '#22C55E' : '#c084fc';
            return (
              <Reveal key={step.n} delay={i * 110}>
                <div className="h-full rounded-3xl p-6 bg-white/[0.03] border border-white/10">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center border" style={{ color: cor, borderColor: `${cor}50`, background: `${cor}12` }}>{step.icon}</div>
                    <span className="text-[10px] font-black tracking-[0.25em]" style={{ color: cor }}>PASSO {step.n}</span>
                  </div>
                  <h3 className="text-white font-black mb-1.5">{step.title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">{step.desc}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* PULSE */}
      <Destaque id="pulse" cor="#fbbf24" rotulo="WeGrow Pulse" invertido visual={<TelaEstoque />}
        titulo={<>Estoque, produção e nota fiscal <span className="text-amber-400">no mesmo lugar.</span></>}
        texto="Para quem fabrica, revende ou entrega: o Pulse controla o material que entra e sai, transforma venda em ordem de produção e emite a nota — com o chão de fábrica usando o celular."
        itens={PULSE_DESTAQUES} />

      {/* DEPOIMENTO */}
      {temDepoimento && (
        <section className="relative py-24 md:py-28 px-6">
          <div className={`max-w-6xl mx-auto grid gap-10 md:gap-16 items-center ${DEPOIMENTO.vertical ? 'md:grid-cols-[minmax(0,360px)_1fr] justify-center' : 'lg:grid-cols-[1.2fr_1fr]'}`}>
            <Reveal de="zoom">
              <div className={`relative rounded-[28px] overflow-hidden border border-white/10 bg-[#0B1120] shadow-[0_40px_120px_-30px_rgba(34,197,94,0.4)] ${DEPOIMENTO.vertical ? 'aspect-[9/16] w-full max-w-[360px] mx-auto' : 'aspect-video'}`}>
                <VideoDepoimento youtubeId={DEPOIMENTO.youtubeId || undefined} mp4={DEPOIMENTO.mp4 || undefined} capa={DEPOIMENTO.capa} titulo={`Depoimento — ${DEPOIMENTO.nome}`} />
              </div>
            </Reveal>
            <Reveal de="direita" delay={150}>
              <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-[#22C55E] mb-5"><span className="h-px w-6 bg-[#22C55E]/60" /> Quem usa</div>
              <Quote size={40} className="text-[#22C55E]/40 mb-4" />
              {DEPOIMENTO.frase && <p className="text-2xl md:text-3xl font-bold text-white leading-snug mb-6">&ldquo;{DEPOIMENTO.frase}&rdquo;</p>}
              <p className="text-white font-black text-lg">{DEPOIMENTO.nome}</p>
              <p className="text-slate-400 text-sm">{[DEPOIMENTO.cargo, DEPOIMENTO.empresa].filter(Boolean).join(' · ')}</p>
            </Reveal>
          </div>
        </section>
      )}

      {/* MAIS MÓDULOS (compacto) */}
      <Secao rotulo="Mesmo login" titulo={<>E quando precisar, <span className="texto-gradiente">mais módulos.</span></>}
        subtitulo="Mesma base de clientes, mesmo login: ative só o que faz sentido pro seu time e integre com os sistemas que você já usa via API.">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[...PRODUTOS.filter(p => p.nome !== 'CRM' && p.nome !== 'Pulse'), ...VERTICAIS].map((m, i) => (
            <Reveal key={m.nome} delay={i * 60}>
              <TiltCard cor={m.hex} intensidade={8} className="h-full rounded-2xl">
                <div className="h-full rounded-2xl p-5 bg-white/[0.035] border border-white/10">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 border" style={{ color: m.hex, borderColor: `${m.hex}40`, background: `${m.hex}12` }}>{m.icon}</div>
                  <p className="text-white font-black">{m.nome}</p>
                  <p className="text-[11px] text-slate-500 font-semibold">{m.tagline}</p>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </Secao>

      {/* FUNCIONALIDADES (bento) */}
      <Secao id="funcionalidades" rotulo="Funcionalidades" titulo="O core serve qualquer negócio"
        subtitulo="Funil, clientes, metas e relatórios funcionam pra qualquer segmento. Os itens marcados como módulo são complementos que só aparecem pra quem precisa deles."
        className="bg-gradient-to-b from-transparent via-white/[0.02] to-transparent">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 90} className={f.span === 2 ? 'md:col-span-2' : ''}>
              <TiltCard intensidade={6} className="h-full rounded-[28px]">
                <div className="relative h-full rounded-[28px] p-8 bg-white/[0.035] border border-white/10 hover:border-white/20 transition-colors overflow-hidden">
                  {f.modulo && (
                    <span className="absolute top-6 right-6 text-[9px] font-black uppercase tracking-widest text-slate-400 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">Módulo {f.modulo}</span>
                  )}
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-6 ${f.color}`}>{f.icon}</div>
                  <h3 className="text-xl font-black text-white mb-3 tracking-tight">{f.title}</h3>
                  <p className="text-slate-400 text-sm font-medium leading-relaxed max-w-lg">{f.desc}</p>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </Secao>

      {/* POR QUE WEGROW */}
      <Secao rotulo="Por que WeGrow" titulo="Não é mais um SaaS genérico feito pra ficar bonito na demo.">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            { icon: <ShieldCheck size={22} />, title: 'Validado em operação real', desc: 'Construído e testado no dia a dia de uma operação de verdade, com pressão de prazo e cliente de verdade — não em uma planilha de investidor.' },
            { icon: <Target size={22} />, title: 'Se adapta a você, não o contrário', desc: 'Funil, catálogo, cargos e módulos configuráveis. Você não muda seu processo pra caber no sistema.' },
            { icon: <MessageCircle size={22} />, title: 'Suporte de quem construiu', desc: 'Sem fila de ticket genérica: onboarding e suporte direto de quem desenvolve o produto.' },
          ].map((d, i) => (
            <Reveal key={d.title} delay={i * 100}>
              <div className="h-full rounded-[28px] p-8 bg-gradient-to-br from-[#22C55E]/[0.08] to-transparent border border-white/10 hover:border-[#22C55E]/40 transition-colors">
                <div className="w-12 h-12 rounded-2xl bg-[#22C55E]/15 text-[#22C55E] flex items-center justify-center mb-6">{d.icon}</div>
                <h3 className="text-white font-black text-lg mb-2 tracking-tight">{d.title}</h3>
                <p className="text-slate-400 text-sm font-medium leading-relaxed">{d.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Secao>

      {/* PREÇOS */}
      <Secao id="precos" rotulo="Preços" titulo={<>Simples. Previsível.<br /><span className="texto-gradiente">Sem surpresas.</span></>}
        subtitulo="A partir de R$ 497/mês, por empresa — sem cobrar por usuário. Projetos maiores e integrações sob medida? Fale com a gente.">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 items-stretch">
          {PLANOS.map((plano, i) => (
            <Reveal key={plano.nome} delay={i * 110} className="h-full">
              <div className={`relative h-full rounded-[32px] p-[1.5px] ${plano.destaque ? 'bg-gradient-to-b from-[#22C55E] via-[#22C55E]/40 to-sky-500/40 md:-translate-y-3 shadow-[0_30px_80px_-20px_rgba(34,197,94,0.45)]' : 'bg-white/10'}`}>
                <div className="relative h-full bg-[#0B1120] rounded-[31px] p-8 flex flex-col">
                  {plano.destaque && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#22C55E] text-[#0B1120] text-[10px] font-black uppercase tracking-[0.2em] px-4 py-1.5 rounded-full whitespace-nowrap">Mais popular</div>
                  )}
                  <p className={`text-xs font-black uppercase tracking-[0.2em] mb-3 ${plano.destaque ? 'text-[#22C55E]' : 'text-slate-500'}`}>{plano.nome}</p>
                  <div className="flex items-end gap-1 mb-3">
                    {plano.preco === 'consultar' ? (
                      <span className="text-3xl font-black text-white">Sob consulta</span>
                    ) : (
                      <><span className="text-5xl font-black text-white tracking-tight">R$ {plano.preco.toLocaleString('pt-BR')}</span><span className="text-slate-500 text-sm font-bold pb-1.5">/mês</span></>
                    )}
                  </div>
                  <p className="text-slate-400 text-sm font-medium leading-relaxed mb-7">{plano.desc}</p>
                  <div className="space-y-3 flex-1 mb-8">
                    {plano.itens.map(item => (
                      <div key={item} className="flex items-start gap-2.5 text-sm text-slate-300">
                        <span className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${plano.destaque ? 'bg-[#22C55E]/20 text-[#22C55E]' : 'bg-white/5 text-slate-400'}`}><Check size={11} /></span>
                        {item}
                      </div>
                    ))}
                  </div>
                  <a href="https://wa.me/5547997022381" target="_blank" rel="noopener noreferrer"
                    className={`w-full py-4 rounded-2xl font-black text-sm text-center transition-all flex items-center justify-center gap-2 ${plano.destaque ? 'bg-[#22C55E] text-[#0B1120] hover:bg-[#16a34a] shadow-[0_10px_30px_rgba(34,197,94,0.3)]' : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'}`}>
                    Falar com consultor <ArrowRight size={15} />
                  </a>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <div className="rounded-[28px] p-7 md:p-8 bg-white/[0.03] border border-white/10">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 mb-5">Add-ons disponíveis em qualquer plano</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {ADDONS.map(a => (
                <div key={a.label} className="flex items-center gap-3 bg-white/[0.04] border border-white/10 rounded-2xl p-4 hover:border-white/20 transition-colors">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${a.cor}`}>{a.icon}</div>
                  <div className="min-w-0">
                    <p className="text-white text-[13px] font-bold leading-tight">{a.label}</p>
                    <p className="text-slate-500 text-[10px] font-bold mt-0.5 uppercase tracking-wide">Sob consulta</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
        <p className="text-center text-slate-600 text-[11px] uppercase tracking-widest font-bold mt-6">
          Todos os planos incluem usuários ilimitados · PWA offline · suporte por chat · sem taxa de setup
        </p>
      </Secao>

      {/* FAQ */}
      <Secao id="duvidas" rotulo="Dúvidas" titulo="Perguntas frequentes">
        <div className="max-w-3xl mx-auto space-y-3">
          {FAQ.map((item, i) => {
            const aberta = faqAberta === i;
            return (
              <Reveal key={item.q} delay={i * 60}>
                <div className={`rounded-2xl border transition-colors ${aberta ? 'bg-white/[0.05] border-[#22C55E]/30' : 'bg-white/[0.02] border-white/10 hover:border-white/20'}`}>
                  <button onClick={() => setFaqAberta(aberta ? null : i)} className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left">
                    <span className="text-base font-bold text-white">{item.q}</span>
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${aberta ? 'bg-[#22C55E] text-[#0F172A] rotate-180' : 'bg-white/5 text-[#22C55E]'}`}><ChevronDown size={16} /></span>
                  </button>
                  <div className={`grid transition-all duration-500 ease-out ${aberta ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                    <div className="overflow-hidden">
                      <p className="px-6 pb-6 text-[15px] text-slate-400 font-medium leading-relaxed">{item.a}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </Secao>

      {/* CTA FINAL */}
      <section className="py-24 md:py-32 px-6" id="contato">
        <Reveal de="zoom">
          <div className="max-w-6xl mx-auto relative rounded-[44px] overflow-hidden border border-[#22C55E]/30 bg-gradient-to-br from-[#22C55E]/25 via-[#0B1120] to-[#0B1120] p-8 md:p-16 shadow-[0_0_140px_-20px_rgba(34,197,94,0.35)]">
            <div className="absolute inset-0 grade-fundo opacity-60 pointer-events-none" />
            <div className="absolute -top-32 -left-32 w-96 h-96 bg-[#22C55E]/30 rounded-full blur-[120px] pointer-events-none" />
            <div className="relative grid md:grid-cols-2 gap-10 md:gap-14 items-center">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#22C55E] mb-4">Pronto para começar?</div>
                <h2 className="text-4xl md:text-6xl font-black text-white tracking-tighter mb-6 leading-[1.02]">
                  Escale sua operação <span className="texto-gradiente">comercial agora.</span>
                </h2>
                <p className="text-slate-300 font-medium mb-8 max-w-md text-lg">Deixe seus dados que a gente te chama, ou fale agora direto pelo WhatsApp.</p>
                <a href="https://wa.me/5547997022381" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 bg-white text-[#0F172A] px-7 py-4 rounded-2xl font-black text-sm hover:scale-[1.03] transition-all shadow-xl">
                  <MessageCircle size={18} /> Chamar no WhatsApp <ArrowRight size={16} />
                </a>
              </div>

              <div className="bg-[#020617]/80 backdrop-blur-xl rounded-[32px] p-6 md:p-8 border border-white/10 shadow-2xl">
                {leadEnviado ? (
                  <div className="text-center py-10">
                    <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-[#22C55E]/15 flex items-center justify-center"><CheckCircle className="text-[#22C55E]" size={34} /></div>
                    <p className="text-white font-black text-xl mb-2">Recebemos seu contato!</p>
                    <p className="text-slate-400 text-sm">Vamos te chamar em breve pelo WhatsApp ou e-mail.</p>
                  </div>
                ) : (
                  <form onSubmit={enviarLead} className="space-y-3">
                    <p className="text-white font-black text-lg mb-1">Quero uma demonstração</p>
                    <p className="text-slate-500 text-xs mb-4">Leva 1 minuto. Sem compromisso.</p>
                    <input required value={leadForm.nome} onChange={e => atualizarLead('nome', e.target.value)} placeholder="Seu nome" className={inputCls} />
                    <input required value={leadForm.empresa} onChange={e => atualizarLead('empresa', e.target.value)} placeholder="Sua empresa" className={inputCls} />
                    <input required value={leadForm.telefone} onChange={e => atualizarLead('telefone', e.target.value)} placeholder="WhatsApp" inputMode="tel" className={inputCls} />
                    <input type="email" value={leadForm.email} onChange={e => atualizarLead('email', e.target.value)} placeholder="E-mail (opcional)" className={inputCls} />
                    {erroLead && <p className="text-red-400 text-xs font-bold">{erroLead}</p>}
                    <button type="submit" disabled={enviandoLead}
                      className="w-full bg-[#22C55E] hover:bg-[#16a34a] text-[#0F172A] py-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60">
                      {enviandoLead ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                      Quero uma demonstração
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* FOOTER */}
      <footer className="py-10 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#22C55E] rounded-lg flex items-center justify-center font-black text-[#0F172A] text-sm">W</div>
            <span className="text-sm font-black tracking-tight text-white/70">WeGrow</span>
          </div>
          <p className="text-[11px] font-semibold text-slate-600 tracking-wide">
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
