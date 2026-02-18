"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (user) {
        // Se já tem usuário, joga pro Dashboard
        router.push('/dashboard');
      } else {
        // Se não tem, joga pro Login
        router.push('/login');
      }
    }
  }, [user, loading, router]);

  // Enquanto ele pensa, mostra um loader bonitinho no centro
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#020617]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 bg-[#22C55E] rounded-xl flex items-center justify-center font-black text-[#0F172A] text-2xl animate-pulse">
          W
        </div>
        <div className="flex items-center text-[#22C55E] text-sm font-bold uppercase tracking-widest">
            <Loader2 className="animate-spin mr-2" size={16}/> Carregando Sistema...
        </div>
      </div>
    </div>
  );
}