"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  
  // BLINDAGEM ANTI-VERCEL AQUI 👇
  const auth = useAuth() || {};
  const user = auth.user;
  const loading = auth.loading;

  useEffect(() => {
    if (loading === false) { // Só redireciona se já terminou de carregar
      if (user) {
        router.push('/dashboard');
      } else {
        router.push('/login');
      }
    }
  }, [user, loading, router]);

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