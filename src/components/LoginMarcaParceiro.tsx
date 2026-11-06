import type { ReactNode } from 'react';

// Tela de login da marca dupla (ex.: "WeGrow for Manager" pras rádios da YoungTech), aberta por
// /entrar/<slug> ou por quem já entrou por ela neste aparelho (app/login). Sóbria de propósito:
// as duas marcas e o formulário — sem frase de efeito, cartões, gradientes ou brilho.

type Marca = { produto: string; logo_url: string | null; parceiro: string };

export default function LoginMarcaParceiro({ marca, children }: { marca: Marca; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white flex flex-col relative">
      {/* Uma luz só, vinda de cima */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,rgba(34,197,94,0.09),transparent)]" aria-hidden/>

      <main className="relative flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-[380px]">
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

          <div className="mt-10">{children}</div>

          <p className="mt-8 text-center text-[13px] leading-relaxed text-[#71717A]">
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
