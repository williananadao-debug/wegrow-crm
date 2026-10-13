"use client";
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';

// Efeitos do site institucional — sem biblioteca de animação: IntersectionObserver + CSS
// (transform/opacity, que o navegador anima na GPU). Quem pediu "menos movimento" no sistema
// operacional vê tudo parado e já visível.

function prefereMenosMovimento() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function useVisivel<T extends Element>(margem = '0px 0px -10% 0px') {
  const ref = useRef<T>(null);
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisivel(true); obs.disconnect(); } }, { rootMargin: margem });
    obs.observe(el);
    return () => obs.disconnect();
  }, [margem]);
  return { ref, visivel };
}

// Entra subindo e aparecendo quando chega na tela.
export function Reveal({ children, delay = 0, className = '', de = 'baixo' }: { children: ReactNode; delay?: number; className?: string; de?: 'baixo' | 'esquerda' | 'direita' | 'zoom' }) {
  const { ref, visivel } = useVisivel<HTMLDivElement>();
  const inicial = { baixo: 'translate-y-10', esquerda: '-translate-x-10', direita: 'translate-x-10', zoom: 'scale-95' }[de];
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      // motion-reduce: quem pediu menos movimento no sistema vê tudo parado e já visível.
      className={`transition-all duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:transform-none ${visivel ? 'opacity-100 translate-x-0 translate-y-0 scale-100' : `opacity-0 ${inicial}`} ${className}`}
    >
      {children}
    </div>
  );
}

// Card que inclina em 3D seguindo o mouse, com reflexo de luz. Em toque, fica parado.
export function TiltCard({ children, className = '', intensidade = 10, cor = '#22C55E' }: { children: ReactNode; className?: string; intensidade?: number; cor?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [estilo, setEstilo] = useState<CSSProperties>({});
  const [luz, setLuz] = useState<{ x: number; y: number } | null>(null);
  const mover = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || prefereMenosMovimento()) return;
    const r = ref.current!.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setEstilo({ transform: `perspective(900px) rotateX(${(0.5 - py) * intensidade}deg) rotateY(${(px - 0.5) * intensidade}deg) translateZ(0)` });
    setLuz({ x: px * 100, y: py * 100 });
  };
  const sair = () => { setEstilo({ transform: 'perspective(900px) rotateX(0deg) rotateY(0deg)' }); setLuz(null); };
  return (
    <div
      ref={ref}
      onPointerMove={mover}
      onPointerLeave={sair}
      style={{ ...estilo, transformStyle: 'preserve-3d' }}
      className={`relative transition-transform duration-200 ease-out will-change-transform ${className}`}
    >
      {children}
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
        style={{ opacity: luz ? 1 : 0, background: luz ? `radial-gradient(420px circle at ${luz.x}% ${luz.y}%, ${cor}22, transparent 45%)` : undefined }}
      />
    </div>
  );
}

// Conta de 0 até o valor quando aparece. Aceita "3x", "40%", "2min".
export function Contador({ valor, className = '' }: { valor: string; className?: string }) {
  const m = valor.match(/^(\d+)(.*)$/);
  const alvo = m ? Number(m[1]) : 0;
  const sufixo = m ? m[2] : valor;
  const { ref, visivel } = useVisivel<HTMLSpanElement>();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!visivel || !m) return;
    if (prefereMenosMovimento()) { setN(alvo); return; }
    let raf = 0;
    const inicio = performance.now();
    const passo = (agora: number) => {
      const p = Math.min(1, (agora - inicio) / 1400);
      setN(Math.round(alvo * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visivel, alvo]);
  return <span ref={ref} className={className}>{m ? `${n}${sufixo}` : valor}</span>;
}

// Versão leve do 3D (sem WebGL): núcleo + módulos girando em CSS, com profundidade.
export function OrbitaLeve({ modulos }: { modulos: { nome: string; hex: string; icon: ReactNode }[] }) {
  const n = modulos.length;
  return (
    <div className="absolute inset-0 flex items-center justify-center [perspective:1200px]">
      <div className="relative w-[78%] aspect-square [transform:rotateX(58deg)] [transform-style:preserve-3d]">
        <div className="absolute inset-0 rounded-full border border-[#22C55E]/20 animate-[girar_40s_linear_infinite] [transform-style:preserve-3d] will-change-transform">
          {modulos.map((m, i) => {
            const a = (i / n) * 360;
            return (
              <div key={m.nome} className="absolute left-1/2 top-1/2 [transform-style:preserve-3d]"
                style={{ transform: `rotate(${a}deg) translateX(min(39vw, 230px)) rotate(-${a}deg)` }}>
                {/* contra-gira pra o ícone ficar de pé */}
                <div className="-translate-x-1/2 -translate-y-1/2 [transform:rotateX(-58deg)] animate-[girar-reverso_40s_linear_infinite]">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-[#020617] border" style={{ borderColor: `${m.hex}55`, color: m.hex }}>
                    {m.icon}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="absolute inset-[18%] rounded-full border border-sky-400/15" />
      </div>
      <div className="absolute w-24 h-24 rounded-[28px] bg-[#22C55E] flex items-center justify-center font-black text-[#0F172A] text-4xl shadow-[0_0_80px_rgba(34,197,94,0.6)] animate-[flutuar_5s_ease-in-out_infinite]">W</div>
    </div>
  );
}

// "Print" do sistema montado em HTML (sempre nítido, sem imagem pesada), flutuando em perspectiva.
export function TelaSistema({ className = '' }: { className?: string }) {
  const colunas = [
    { t: 'Novo lead', cor: '#64748b', cards: [['Padaria Sol', 'R$ 3.200'], ['Auto Peças RX', 'R$ 8.900']] },
    { t: 'Proposta', cor: '#38bdf8', cards: [['Clínica Vida', 'R$ 12.400'], ['Grupo Max', 'R$ 31.000']] },
    { t: 'Negociação', cor: '#fbbf24', cards: [['Construtora Alfa', 'R$ 54.000']] },
    { t: 'Ganho', cor: '#22C55E', cards: [['Rede Bom Preço', 'R$ 22.700'], ['Hotel Mar Azul', 'R$ 9.800']] },
  ];
  return (
    <div className={`[perspective:1600px] ${className}`}>
      <div className="rounded-2xl border border-white/10 bg-[#0B1120]/95 shadow-[0_40px_120px_-20px_rgba(34,197,94,0.35)] overflow-hidden [transform:rotateX(14deg)_rotateY(-12deg)_rotateZ(1deg)] animate-[flutuar_7s_ease-in-out_infinite]">
        <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/5 bg-white/[0.02]">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" /><span className="w-2.5 h-2.5 rounded-full bg-amber-400/70" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
          <span className="ml-3 text-[10px] font-bold text-slate-500 tracking-widest">wegrow.app.br/deals</span>
        </div>
        <div className="grid grid-cols-4 gap-2.5 p-4">
          {colunas.map((c, ci) => (
            <div key={c.t} className="space-y-2">
              <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest" style={{ color: c.cor }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.cor }} /> {c.t}
              </div>
              {c.cards.map(([nome, valor], i) => (
                <div key={nome} className="rounded-lg border border-white/5 bg-white/[0.04] p-2 animate-[surgir_0.8s_ease-out_both]" style={{ animationDelay: `${(ci * 2 + i) * 120 + 300}ms` }}>
                  <p className="text-[9px] font-bold text-slate-200 truncate">{nome}</p>
                  <p className="text-[9px] font-black mt-0.5" style={{ color: c.cor }}>{valor}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Tela do Pulse (estoque) montada em HTML, flutuando em perspectiva do lado oposto da do CRM.
export function TelaEstoque({ className = '' }: { className?: string }) {
  const itens = [
    { nome: 'Chapa ACM 3mm', sku: 'ACM-003', qtd: 42, min: 20, cor: '#22C55E' },
    { nome: 'Perfil alumínio 40x40', sku: 'PRF-440', qtd: 18, min: 25, cor: '#fbbf24' },
    { nome: 'Parafuso inox 6mm', sku: 'PAR-606', qtd: 1250, min: 300, cor: '#22C55E' },
    { nome: 'Janela acrílico 60x40', sku: 'JAN-604', qtd: 3, min: 8, cor: '#f87171' },
  ];
  return (
    <div className={`[perspective:1600px] ${className}`}>
      <div className="rounded-2xl border border-white/10 bg-[#0B1120]/95 shadow-[0_40px_120px_-20px_rgba(251,191,36,0.3)] overflow-hidden [transform:rotateX(12deg)_rotateY(12deg)_rotateZ(-1deg)] animate-[flutuar_8s_ease-in-out_infinite]">
        <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/5 bg-white/[0.02]">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" /><span className="w-2.5 h-2.5 rounded-full bg-amber-400/70" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
          <span className="ml-3 text-[10px] font-bold text-slate-500 tracking-widest">wegrow.app.br/pulse/estoque</span>
        </div>
        <div className="p-4 space-y-2.5">
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 animate-[surgir_0.8s_ease-out_both]">
            <span className="text-[9px] font-black uppercase tracking-widest text-amber-300">Reposição</span>
            <span className="text-[10px] text-amber-200/80 truncate">2 itens abaixo do mínimo — sugestão de compra pronta</span>
          </div>
          {itens.map((it, i) => {
            const pct = Math.min(100, Math.round((it.qtd / (it.min * 2.5)) * 100));
            return (
              <div key={it.sku} className="rounded-lg border border-white/5 bg-white/[0.03] p-2.5 animate-[surgir_0.8s_ease-out_both]" style={{ animationDelay: `${i * 140 + 300}ms` }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-200 truncate">{it.nome}</p>
                    <p className="text-[8px] font-mono text-slate-500">{it.sku}</p>
                  </div>
                  <p className="text-[11px] font-black" style={{ color: it.cor }}>{it.qtd.toLocaleString('pt-BR')}</p>
                </div>
                <div className="mt-1.5 h-1 rounded-full bg-white/5 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: it.cor }} /></div>
              </div>
            );
          })}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2 text-center"><p className="text-[8px] uppercase tracking-widest text-slate-500 font-black">Entrada por NF</p><p className="text-[11px] font-black text-sky-300">lida por IA</p></div>
            <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2 text-center"><p className="text-[8px] uppercase tracking-widest text-slate-500 font-black">Saída</p><p className="text-[11px] font-black text-[#22C55E]">pela câmera</p></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Depoimento em vídeo: mostra a capa e só carrega o player do YouTube no clique (não pesa a página).
export function VideoDepoimento({ youtubeId, mp4, capa, titulo }: { youtubeId?: string; mp4?: string; capa?: string; titulo: string }) {
  const [tocando, setTocando] = useState(false);
  const capaUrl = capa || (youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : undefined);
  if (tocando) {
    return youtubeId ? (
      <iframe className="absolute inset-0 w-full h-full" src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0`} title={titulo} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
    ) : (
      <video className="absolute inset-0 w-full h-full object-cover" src={mp4} controls autoPlay playsInline />
    );
  }
  return (
    <button onClick={() => setTocando(true)} className="group absolute inset-0 w-full h-full" aria-label={`Assistir: ${titulo}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {capaUrl && <img src={capaUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700" />}
      <span className="absolute inset-0 bg-gradient-to-t from-[#020617] via-[#020617]/30 to-transparent" />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="relative w-20 h-20 rounded-full bg-[#22C55E] flex items-center justify-center shadow-[0_0_60px_rgba(34,197,94,0.6)] group-hover:scale-110 transition-transform">
          <span className="absolute inset-0 rounded-full border-2 border-[#22C55E] animate-[pulso-anel_2s_ease-out_infinite]" />
          <svg viewBox="0 0 24 24" className="w-8 h-8 ml-1 fill-[#0F172A]"><path d="M8 5v14l11-7z" /></svg>
        </span>
      </span>
    </button>
  );
}
