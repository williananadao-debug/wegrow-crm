"use client";
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BrowserMultiFormatReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import { QrCode, ArrowLeft, X } from 'lucide-react';

// Chão de fábrica: um botão, aponta a câmera pra etiqueta QR da produção e já cai no processo
// dela (/pulse/producao?abrir=<id>), sem procurar o card no quadro. Aceita também o número
// digitado (39 ou #39) pra quando a etiqueta estiver suja/rasgada.
function idDoCodigo(texto: string): number | null {
  const t = texto.trim();
  const daUrl = t.match(/[?&]abrir=(\d+)/);
  if (daUrl) return Number(daUrl[1]);
  const numero = t.match(/^#?\s*(\d+)$/);
  return numero ? Number(numero[1]) : null;
}

export default function LerQrProducao() {
  const router = useRouter();
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [digitado, setDigitado] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  const abrir = (id: number) => router.push(`/pulse/producao?abrir=${id}`);

  useEffect(() => {
    if (!lendo) return;
    let cancelado = false;
    setErro(null);
    new BrowserMultiFormatReader().decodeFromConstraints(
      { video: { facingMode: 'environment' } },
      videoRef.current!,
      (resultado) => {
        if (cancelado || !resultado) return;
        const id = idDoCodigo(resultado.getText());
        if (!id) { setErro('Esse código não é uma etiqueta de produção.'); return; }
        cancelado = true;
        controlsRef.current?.stop();
        abrir(id);
      },
    ).then(controls => { if (!cancelado) controlsRef.current = controls; else controls.stop(); })
      .catch(err => {
        setLendo(false);
        setErro(err?.message?.includes('Permission') || err?.name === 'NotAllowedError'
          ? 'Permissão de câmera negada — habilite o acesso à câmera nas configurações do navegador.'
          : 'Não foi possível acessar a câmera neste dispositivo/navegador.');
      });
    return () => {
      cancelado = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lendo]);

  const abrirDigitado = (e: React.FormEvent) => {
    e.preventDefault();
    const id = idDoCodigo(digitado);
    if (id) abrir(id); else setErro('Digite o número da etiqueta (ex.: 39).');
  };

  return (
    <div className="md:p-8 pb-20 text-white max-w-md mx-auto">
      <Link href="/pulse/producao" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-white text-xs font-bold uppercase tracking-widest mb-4">
        <ArrowLeft size={14} /> Quadro de produção
      </Link>

      {lendo ? (
        <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-black aspect-square">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          <div className="absolute inset-10 border-4 border-amber-400/80 rounded-2xl pointer-events-none" />
          <button onClick={() => setLendo(false)} className="absolute top-3 right-3 bg-black/60 rounded-full p-2 text-white"><X size={18} /></button>
          <p className="absolute bottom-3 inset-x-0 text-center text-xs font-bold text-white/90">Aponte para a etiqueta</p>
        </div>
      ) : (
        <button onClick={() => setLendo(true)}
          className="w-full aspect-square rounded-3xl bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-[#0B1120] flex flex-col items-center justify-center gap-4 transition-all">
          <QrCode size={96} strokeWidth={1.5} />
          <span className="text-2xl font-black uppercase tracking-wide">Ler QR code</span>
        </button>
      )}

      {erro && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl mt-4">{erro}</div>}

      <form onSubmit={abrirDigitado} className="mt-6 flex gap-2">
        <input value={digitado} onChange={e => setDigitado(e.target.value)} inputMode="numeric" placeholder="Ou digite o nº da etiqueta"
          className="flex-1 min-w-0 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-amber-400" />
        <button type="submit" className="bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl px-5 text-xs font-black uppercase tracking-widest">Abrir</button>
      </form>
    </div>
  );
}
