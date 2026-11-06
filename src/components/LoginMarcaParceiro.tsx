import type { ReactNode } from 'react';
import { Radio, FileSignature, MapPin, Target, Sparkles, Headphones } from 'lucide-react';

// Tela de login da marca dupla (ex.: "WeGrow for Manager" pras rádios da YoungTech), aberta por
// /entrar/<slug> ou por quem já entrou por ela neste aparelho (app/login). Visual de campanha:
// as duas marcas lado a lado, o que a rádio ganha e o formulário de sempre à direita.

type Marca = { produto: string; logo_url: string | null; parceiro: string };

const BENEFICIOS = [
  { icone: Radio, titulo: 'Anunciantes e funil de vendas', texto: 'Cada cliente, proposta e renovação num lugar só.' },
  { icone: FileSignature, titulo: 'Proposta e contrato eletrônico', texto: 'O anunciante assina pelo celular, sem papel.' },
  { icone: MapPin, titulo: 'Visitas com GPS e agenda', texto: 'Você sabe onde o time esteve e o que vendeu.' },
  { icone: Target, titulo: 'Metas, comissão e IA comercial', texto: 'Ranking do time e próximos passos sugeridos.' },
];

function LogoMarca({ src, alt, tamanho }: { src: string | null; alt: string; tamanho: number }) {
  return (
    <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }}>
      <div className="absolute inset-0 rounded-full bg-[#4ADE80]/25 blur-2xl" aria-hidden />
      {src
        ? <img src={src} alt={alt} className="relative w-full h-full object-contain drop-shadow-[0_0_18px_rgba(74,222,128,0.45)]"/>
        : <div className="relative w-full h-full rounded-full bg-[#22C55E] flex items-center justify-center text-[#0B1120] font-black text-2xl">{alt.charAt(0)}</div>}
    </div>
  );
}

function Assinatura({ marca, grande = false }: { marca: Marca; grande?: boolean }) {
  return (
    <div className={`flex items-center ${grande ? 'gap-4' : 'gap-3'}`}>
      <div className="flex items-center gap-2.5">
        <img src="/logo.png" alt="WeGrow" className={grande ? 'w-12 h-12' : 'w-9 h-9'}/>
        <span className={`font-black italic text-white tracking-tighter ${grande ? 'text-3xl' : 'text-xl'}`}>WeGrow</span>
      </div>
      <span className={`font-light italic text-[#4ADE80] ${grande ? 'text-2xl' : 'text-lg'}`}>for</span>
      <div className="flex items-center gap-2.5">
        <LogoMarca src={marca.logo_url} alt={marca.produto} tamanho={grande ? 64 : 40}/>
        <span className={`font-black text-white tracking-tight ${grande ? 'text-3xl' : 'text-xl'}`}>{marca.produto}</span>
      </div>
    </div>
  );
}

export default function LoginMarcaParceiro({ marca, children }: { marca: Marca; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#060A12] text-white relative overflow-hidden">
      {/* Luzes e grade do fundo */}
      <div className="pointer-events-none absolute -top-40 -left-32 w-[560px] h-[560px] rounded-full bg-[#22C55E]/20 blur-[120px]" aria-hidden/>
      <div className="pointer-events-none absolute -bottom-48 right-[-120px] w-[620px] h-[620px] rounded-full bg-[#4ADE80]/10 blur-[140px]" aria-hidden/>
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.5)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" aria-hidden/>

      <div className="relative min-h-screen max-w-6xl mx-auto px-4 sm:px-6 py-10 lg:py-0 grid lg:grid-cols-[1.15fr_1fr] gap-10 lg:gap-16 items-center">
        {/* Campanha */}
        <section className="min-w-0">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#4ADE80]/30 bg-[#4ADE80]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#86EFAC]">
            <Sparkles size={12}/> Parceria WeGrow × {marca.parceiro}
          </span>

          <div className="mt-6 hidden sm:block"><Assinatura marca={marca} grande/></div>
          <div className="mt-6 sm:hidden"><Assinatura marca={marca}/></div>

          <h1 className="mt-8 text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-[1.05] [text-wrap:balance]">
            O comercial da sua rádio,{' '}
            <span className="bg-gradient-to-r from-[#4ADE80] via-[#22C55E] to-[#A3E635] bg-clip-text text-transparent">conectado ao {marca.produto}.</span>
          </h1>
          <p className="mt-4 text-slate-400 text-sm sm:text-base max-w-xl leading-relaxed">
            Do primeiro contato com o anunciante até a veiculação no ar: proposta, contrato, metas e time comercial no mesmo ritmo da sua operação.
          </p>

          <ul className="mt-8 grid sm:grid-cols-2 gap-3 max-w-2xl">
            {BENEFICIOS.map(({ icone: Icone, titulo, texto }) => (
              <li key={titulo} className="flex gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
                <div className="w-9 h-9 shrink-0 rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/25 flex items-center justify-center"><Icone size={16} className="text-[#4ADE80]"/></div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white leading-tight">{titulo}</p>
                  <p className="text-xs text-slate-500 mt-1 leading-snug">{texto}</p>
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-6 flex items-center gap-2 text-xs text-slate-500">
            <Headphones size={14} className="text-[#4ADE80]"/> Implantação, treinamento e suporte com a {marca.parceiro}.
          </p>
        </section>

        {/* Acesso */}
        <section className="w-full max-w-md mx-auto lg:mx-0 lg:justify-self-end">
          <div className="relative rounded-[32px] border border-white/10 bg-[#0B1120]/80 backdrop-blur-xl p-8 shadow-[0_0_60px_-15px_rgba(34,197,94,0.35)] overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#4ADE80] to-transparent" aria-hidden/>
            <div className="flex items-center justify-center gap-3 mb-2">
              <img src="/logo.png" alt="WeGrow" className="w-8 h-8"/>
              <span className="text-slate-600">×</span>
              <LogoMarca src={marca.logo_url} alt={marca.produto} tamanho={34}/>
            </div>
            <h2 className="text-center text-xl font-bold text-white">Acesse sua conta</h2>
            <p className="text-center text-xs text-slate-500 mt-1 mb-7">WeGrow <span className="italic">for</span> {marca.produto}</p>
            {children}
            <p className="text-center text-[10px] text-slate-600 font-bold uppercase mt-8">Apenas para colaboradores autorizados.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
