"use client";
import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Botão de microfone para campos de texto livre: grava, manda para /api/ia/transcrever
// (Whisper na Groq) e devolve o texto. Quem usa decide como juntar — normalmente
// acrescentando ao que já foi digitado com juntarTexto().
const LIMITE_SEGUNDOS = 5 * 60;

export function juntarTexto(atual: string, novo: string) {
  const a = (atual || '').trimEnd();
  return a ? `${a}${/[.!?]$/.test(a) ? ' ' : '. '}${novo}` : novo;
}

function tipoSuportado() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

export default function BotaoDitado({ onTexto, className = '', disabled = false }: {
  onTexto: (texto: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  const [estado, setEstado] = useState<'parado' | 'gravando' | 'transcrevendo'>('parado');
  const [segundos, setSegundos] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    recorder.current?.stream.getTracks().forEach(t => t.stop());
  }, []);

  useEffect(() => {
    if (!erro) return;
    const t = setTimeout(() => setErro(null), 5000);
    return () => clearTimeout(t);
  }, [erro]);

  const enviar = async (blob: Blob, mime: string) => {
    setEstado('transcrevendo');
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Sem internet — a transcrição precisa de conexão.');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada, entre de novo.');
      const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
      const form = new FormData();
      form.append('audio', new File([blob], `ditado.${ext}`, { type: mime.split(';')[0] || 'audio/webm' }));
      const res = await fetch('/api/ia/transcrever', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Não foi possível transcrever.');
      if (json.texto) onTexto(json.texto);
      else setErro('Não deu para entender o áudio. Tente falar mais perto do microfone.');
    } catch (e: any) {
      setErro(e?.message || 'Erro ao transcrever.');
    } finally {
      setEstado('parado');
    }
  };

  const parar = () => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (recorder.current?.state === 'recording') recorder.current.stop();
  };

  const iniciar = async () => {
    setErro(null);
    const mime = tipoSuportado();
    if (mime === null || !navigator.mediaDevices?.getUserMedia) { setErro('Este navegador não grava áudio.'); return; }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setErro('Permita o uso do microfone para ditar.');
      return;
    }
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
    const partes: Blob[] = [];
    rec.ondataavailable = e => { if (e.data.size > 0) partes.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const tipo = rec.mimeType || mime || 'audio/webm';
      const blob = new Blob(partes, { type: tipo });
      if (blob.size < 2000) { setEstado('parado'); setErro('Gravação muito curta.'); return; }
      enviar(blob, tipo);
    };
    recorder.current = rec;
    rec.start(1000);
    setSegundos(0);
    setEstado('gravando');
    timer.current = setInterval(() => setSegundos(s => s + 1), 1000);
  };

  useEffect(() => {
    if (estado === 'gravando' && segundos >= LIMITE_SEGUNDOS) parar();
  }, [estado, segundos]);

  const mmss = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`;

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      {estado === 'gravando' ? (
        <button type="button" onClick={parar} title="Parar e transcrever" className="flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg px-2 py-1 text-[10px] font-black animate-pulse">
          <Square size={11} fill="currentColor" /> {mmss}
        </button>
      ) : estado === 'transcrevendo' ? (
        <span className="flex items-center gap-1.5 bg-white/5 text-slate-300 rounded-lg px-2 py-1 text-[10px] font-bold">
          <Loader2 size={12} className="animate-spin" /> Transcrevendo…
        </span>
      ) : (
        <button type="button" onClick={iniciar} disabled={disabled} title="Ditar por áudio" className="flex items-center gap-1 bg-white/5 hover:bg-[var(--cor-primaria,#3b82f6)] hover:text-white text-slate-400 rounded-lg px-2 py-1 text-[10px] font-bold transition-colors disabled:opacity-40 disabled:pointer-events-none">
          <Mic size={12} /> Ditar
        </button>
      )}
      {erro && <span className="absolute right-0 top-full mt-1 z-20 w-56 bg-[#0F172A] border border-red-500/30 text-red-300 text-[10px] font-medium rounded-lg px-2 py-1.5 shadow-xl">{erro}</span>}
    </span>
  );
}
