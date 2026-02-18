"use client";
import { useState, useEffect } from 'react';
import { Bell, X, Zap, Target } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';

export default function NotificationBell() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);

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

    const channel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => setNotifications(prev => [payload.new, ...prev])
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
      <button onClick={() => setIsOpen(!isOpen)} className="relative p-2 text-slate-300 hover:text-white transition-colors">
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center animate-bounce">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 bg-[#0B1120] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden">
             <div className="p-3 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                <span className="text-[10px] font-black uppercase text-slate-500">Notificações</span>
                <button onClick={() => setIsOpen(false)}><X size={14} className="text-slate-500 hover:text-white"/></button>
             </div>
             <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                {notifications.length === 0 ? <p className="p-4 text-center text-xs text-slate-500">Sem notificações</p> : notifications.map(n => (
                  <div key={n.id} onClick={() => markAsRead(n.id)} className={`p-3 border-b border-white/5 cursor-pointer flex gap-3 ${!n.lida ? 'bg-blue-500/5' : ''}`}>
                    <div className="mt-1">{n.titulo.includes('Venda') ? <Zap size={14} className="text-[#22C55E]"/> : <Target size={14} className="text-blue-400"/>}</div>
                    <div><p className="text-[11px] font-bold text-white">{n.titulo}</p><p className="text-[10px] text-slate-400">{n.mensagem}</p></div>
                  </div>
                ))}
             </div>
          </div>
        </>
      )}
    </div>
  );
}