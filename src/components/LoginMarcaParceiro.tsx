import type { ReactNode } from 'react';

// Tela de login da marca dupla (ex.: "WeGrow for Manager" pras rádios da YoungTech), aberta por
// /entrar/<slug> ou por quem já entrou por ela neste aparelho (app/login). Sóbria de propósito:
// as duas marcas e o formulário num único painel de vidro, sem frase de efeito nem enfeites.

type Marca = { produto: string; logo_url: string | null; parceiro: string };

export default function LoginMarcaParceiro({ marca, children }: { marca: Marca; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white flex flex-col relative overflow-hidden">
      {/* Luz atrás do painel: é o que o vidro desfoca */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-[70%] -translate-y-[65%] w-[460px] h-[460px] rounded-full bg-[#22C55E]/[0.16] blur-[110px]" aria-hidden/>
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-[20%] -translate-y-[5%] w-[380px] h-[380px] rounded-full bg-[#84CC16]/[0.10] blur-[110px]" aria-hidden/>

      <main className="relative flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[420px] rounded-[28px] border border-white/[0.09] bg-white/[0.035] backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_30px_80px_-20px_rgba(0,0,0,0.7)] px-6 sm:px-9 pt-10 pb-8">
          <div className="flex items-center justify-center gap-5">
            <img src="/logo.png" alt="WeGrow" className="w-10 h-10"/>
            <span className="w-px h-7 bg-white/15" aria-hidden/>
            {marca.logo_url
              ? <img src={marca.logo_url} alt={marca.produto} className="w-11 h-11 object-contain"/>
              : <span className="text-lg font-semibold">{marca.produto}</span>}
          </div>
          <h1 className="mt-5 text-center text-[22px] font-semibold tracking-[-0.02em]">
            WeGrow <span className="font-normal text-[#71717A]">for</span> {marca.produto}
          </h1>

          <div className="mt-9">{children}</div>

          <p className="mt-7 pt-6 border-t border-white/[0.06] text-center text-[13px] leading-relaxed text-[#71717A]">
            Implantação, treinamento e suporte com a {marca.parceiro}.
          </p>
        </div>
      </main>

      <footer className="relative pb-8 px-4 text-center text-[12px] text-[#52525B]">
        Funil de anunciantes · Contrato eletrônico · Visitas · Metas e comissão
      </footer>
    </div>
  );
}
