"use client";
import { useState, useEffect } from 'react';
import { Bell, X, Check, Zap, Target, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';

export default function NotificationBell() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);

  // Busca notificações em tempo real
  useEffect(() => {
    if (!user) return;

    const fetchNotifications = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (data) setNotifications(data);
    };

    fetchNotifications();

    // ESCUTA O BANCO EM TEMPO REAL (Realtime)
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          setNotifications(prev => [payload.new, ...prev]);
          // Opcional: Tocar um som de alerta aqui
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markAsRead = async (id: number) => {
    await supabase.from('notifications').update({ lida: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n));
  };

  const unreadCount = notifications.filter(n => !n.lida).length;

  return (
    <div className="relative">
      {/* ÍCONE DO SINO */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-400 hover:text-white transition-colors"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center animate-bounce">
            {unreadCount}
          </span>
        )}
      </button>

      {/* MENU DROP DOWN */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-3 w-80 bg-[#0B1120] border border-white/10 rounded-[24px] shadow-2xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Alertas do Sistema</h4>
              <button onClick={() => setIsOpen(false)}><X size={14} className="text-slate-600" /></button>
            </div>

            <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
              {notifications.length > 0 ? (
                notifications.map((n) => (
                  <div 
                    key={n.id} 
                    onClick={() => markAsRead(n.id)}
                    className={`p-4 border-b border-white/5 hover:bg-white/[0.02] transition-all cursor-pointer relative group ${!n.lida ? 'bg-blue-500/5' : ''}`}
                  >
                    {!n.lida && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />}
                    <div className="flex gap-3">
                      <div className="mt-1">
                        {n.titulo.includes('Venda') ? <Zap size={14} className="text-[#22C55E]" /> : <Target size={14} className="text-blue-400" />}
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-white leading-tight uppercase mb-1">{n.titulo}</p>
                        <p className="text-[10px] text-slate-500 leading-relaxed">{n.mensagem}</p>
                        <p className="text-[8px] text-slate-700 font-bold mt-2 uppercase">
                          {new Date(n.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-10 text-center text-slate-600">
                  <Bell size={24} className="mx-auto mb-2 opacity-20" />
                  <p className="text-[10px] font-bold uppercase">Nenhum alerta novo</p>
                </div>
              )}
            </div>
            
            <button className="w-full py-3 bg-white/[0.02] text-[9px] font-black text-slate-500 uppercase hover:text-white transition-colors">
              Ver todos os registros
            </button>
          </div>
        </>
      )}
    </div>
  );
}