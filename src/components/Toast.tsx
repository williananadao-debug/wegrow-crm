"use client";
import { useEffect } from 'react';
import { CheckCircle2, X } from 'lucide-react';

interface ToastProps {
  message: string;
  onClose: () => void;
  isVisible: boolean;
}

export function Toast({ message, onClose, isVisible }: ToastProps) {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000); // Some sozinho depois de 3 segundos
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  return (
    <div className="fixed top-6 right-6 z-[100] animate-in slide-in-from-right fade-in duration-500">
      <div className="bg-[#0B1120] border border-[#22C55E]/30 text-white pl-4 pr-6 py-4 rounded-2xl shadow-[0_10px_40px_-10px_rgba(34,197,94,0.3)] flex items-center gap-4 min-w-[320px] backdrop-blur-xl">
         
         {/* Ícone com brilho */}
         <div className="bg-[#22C55E]/10 p-3 rounded-xl text-[#22C55E] shadow-[0_0_15px_rgba(34,197,94,0.2)]">
            <CheckCircle2 size={24} strokeWidth={3} />
         </div>

         <div className="flex-1">
            <h4 className="font-black text-xs uppercase tracking-widest text-[#22C55E] mb-0.5">Sucesso</h4>
            <p className="text-sm font-bold text-slate-300">{message}</p>
         </div>

         <button 
            onClick={onClose} 
            className="text-slate-600 hover:text-white transition-colors p-1 hover:bg-white/5 rounded-lg"
         >
            <X size={18}/>
         </button>
      </div>
    </div>
  );
}