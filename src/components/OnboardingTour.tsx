"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { X, CheckCircle2, Circle, ChevronRight, Rocket, Settings, Users, Zap, Target, LayoutDashboard } from 'lucide-react';

const STORAGE_KEY = 'wegrow_onboarding_v1';

const STEPS = [
  {
    id: 'servicos',
    icon: <Settings size={18} />,
    title: 'Configure seus serviços',
    desc: 'Cadastre spots, programetes e outros produtos do seu catálogo com preços.',
    href: '/settings',
    cta: 'Ir para Configurações',
  },
  {
    id: 'cliente',
    icon: <Users size={18} />,
    title: 'Cadastre seu primeiro cliente',
    desc: 'Digite o CNPJ e o sistema preenche tudo automaticamente com análise de risco.',
    href: '/customers',
    cta: 'Ir para Clientes',
  },
  {
    id: 'lead',
    icon: <Zap size={18} />,
    title: 'Crie sua primeira oportunidade',
    desc: 'Abra um lead, adicione itens e envie a proposta por e-mail direto do sistema.',
    href: '/deals',
    cta: 'Ir para Vendas',
  },
  {
    id: 'meta',
    icon: <Target size={18} />,
    title: 'Defina metas da equipe',
    desc: 'Configure objetivos mensais por vendedor para acompanhar o progresso.',
    href: '/goals',
    cta: 'Ir para Metas',
  },
  {
    id: 'dashboard',
    icon: <LayoutDashboard size={18} />,
    title: 'Explore o dashboard',
    desc: 'Veja o funil, ranking e previsão de receita em tempo real.',
    href: '/dashboard',
    cta: 'Ver Dashboard',
  },
];

function loadState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveState(state: Record<string, boolean>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export default function OnboardingTour() {
  const [visible, setVisible] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const state = loadState();
    setCompleted(state);
    const allDone = STEPS.every((s) => state[s.id]);
    const dismissed = state['__dismissed__'];
    if (!allDone && !dismissed) {
      setTimeout(() => setVisible(true), 1200);
    }
  }, []);

  const toggle = (id: string) => {
    const next = { ...completed, [id]: !completed[id] };
    setCompleted(next);
    saveState(next);
  };

  const dismiss = () => {
    const next = { ...completed, __dismissed__: true };
    saveState(next);
    setVisible(false);
  };

  const doneCount = STEPS.filter((s) => completed[s.id]).length;
  const progress = Math.round((doneCount / STEPS.length) * 100);

  if (!visible) return null;

  return (
    <>
      {/* Floating trigger when minimized */}
      {minimized ? (
        <button
          onClick={() => setMinimized(false)}
          className="fixed bottom-6 right-6 z-[200] bg-[#22C55E] text-[#0F172A] rounded-2xl px-5 py-3 flex items-center gap-2 font-black text-xs uppercase tracking-widest shadow-[0_0_30px_rgba(34,197,94,0.4)] hover:scale-105 transition-all"
        >
          <Rocket size={16} />
          Guia de Início ({doneCount}/{STEPS.length})
        </button>
      ) : (
        <div className="fixed bottom-6 right-6 z-[200] w-[360px] max-w-[calc(100vw-24px)] bg-[#0F172A] border border-white/15 rounded-[28px] shadow-[0_0_60px_rgba(0,0,0,0.6)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-[#22C55E] rounded-xl flex items-center justify-center">
                <Rocket size={16} className="text-[#0F172A]" />
              </div>
              <div>
                <div className="text-[11px] font-black uppercase tracking-widest text-slate-500">Guia de início</div>
                <div className="text-sm font-black text-white">{doneCount} de {STEPS.length} concluídos</div>
              </div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => setMinimized(true)} className="p-2 text-slate-500 hover:text-white transition-colors rounded-lg hover:bg-white/5">
                <ChevronRight size={16} />
              </button>
              <button onClick={dismiss} className="p-2 text-slate-500 hover:text-white transition-colors rounded-lg hover:bg-white/5">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="px-6 pb-4">
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#22C55E] rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Steps */}
          <div className="px-4 pb-5 space-y-1 max-h-[360px] overflow-y-auto custom-scrollbar">
            {STEPS.map((step) => {
              const done = !!completed[step.id];
              return (
                <div
                  key={step.id}
                  className={`group rounded-2xl p-4 transition-all ${done ? 'opacity-50' : 'hover:bg-white/5'}`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggle(step.id)}
                      className={`mt-0.5 flex-shrink-0 transition-colors ${done ? 'text-[#22C55E]' : 'text-slate-600 hover:text-slate-400'}`}
                    >
                      {done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-sm font-bold ${done ? 'line-through text-slate-500' : 'text-white'}`}>
                          {step.title}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed mb-2">{step.desc}</p>
                      {!done && (
                        <Link
                          href={step.href}
                          className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-[#22C55E] hover:text-white transition-colors"
                        >
                          {step.cta} <ChevronRight size={12} />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          {doneCount === STEPS.length && (
            <div className="px-6 pb-5">
              <div className="bg-[#22C55E]/10 border border-[#22C55E]/20 rounded-2xl p-4 text-center">
                <div className="text-[#22C55E] font-black text-sm uppercase tracking-wide mb-1">Sistema pronto!</div>
                <p className="text-xs text-slate-400">Você concluiu o guia de início. Boas vendas!</p>
                <button onClick={dismiss} className="mt-3 text-[11px] text-slate-500 hover:text-white transition-colors font-semibold underline">
                  Fechar guia
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
