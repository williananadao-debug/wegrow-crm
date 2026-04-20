"use client";
import { useState, useEffect, useRef } from 'react';
import { Bell, Zap, Target, Trash2, CalendarClock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';

export default function NotificationBell() {
  const auth = useAuth() || {};
  const user = auth.user;
  
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;

    // 1. Puxa o histórico de notificações ao abrir a tela
    const fetchNotifications = async () => {
      const { data, error } = await supabase
        .from('notifications') 
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) console.error('notifications fetch:', error.message);

      if (data) setNotifications(data);
    };
    fetchNotifications();

    // 2. Fica "escutando" o banco em tempo real! 
    const channel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
            // Quando chega notificação nova, coloca no topo da lista
            setNotifications(prev => [payload.new, ...prev]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Inteligência para fechar o menu se clicar fora dele
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAsRead = async (id: number | string) => {
    // Marca como lida no banco e na tela simultaneamente
    await supabase.from('notifications').update({ lida: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n));
  };

  const limparTodas = async () => {
    await supabase.from('notifications').delete().eq('user_id', user?.id);
    setNotifications([]);
    setIsOpen(false);
  };

  const unreadCount = notifications.filter(n => !n.lida).length;

  return (
    <div className="relative" ref={dropdownRef}>
      
      {/* O BOTÃO DO SININHO */}
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className={`relative flex items-center justify-center w-10 h-10 rounded-full transition-colors cursor-pointer ${isOpen ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-slate-400 hover:text-white'}`}
      >
        <Bell size={20} className={unreadCount > 0 ? 'animate-pulse text-white' : ''} />
        
        {/* A BOLINHA VERMELHA ANIMADA */}
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border border-[#0B1120] text-[8px] font-black items-center justify-center text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          </span>
        )}
      </button>

      {/* O MENU DROP-DOWN */}
      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 md:w-96 bg-[#0F172A] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200">
          
          <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/20">
            <h3 className="text-white font-black uppercase tracking-widest text-[10px]">Notificações</h3>
            {notifications.length > 0 && (
                <button onClick={limparTodas} className="text-[9px] font-bold text-slate-500 hover:text-red-400 uppercase flex items-center gap-1 transition-colors">
                    <Trash2 size={10}/> Limpar
                </button>
            )}
          </div>

          <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
            {notifications.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center">
                  <Bell size={32} className="text-slate-600 mb-2 opacity-50"/>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Nenhum aviso no radar</p>
              </div>
            ) : (
              notifications.map(n => (
                <div 
                    key={n.id} 
                    onClick={() => markAsRead(n.id)} 
                    className={`p-4 border-b border-white/5 cursor-pointer flex gap-3 transition-colors relative group ${!n.lida ? 'bg-blue-600/5 hover:bg-blue-600/10' : 'hover:bg-white/5 opacity-70'}`}
                >
                  {/* Ponto azul para indicar que não foi lida */}
                  {!n.lida && <div className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-blue-500 rounded-full shadow-[0_0_5px_rgba(59,130,246,0.8)]"></div>}
                  
                  <div className={`mt-0.5 shrink-0 ${!n.lida ? 'pl-2' : ''}`}>
                      {n.titulo?.includes('Venda') ? <Zap size={16} className="text-[#22C55E]"/> : n.titulo?.includes('Renovação') ? <CalendarClock size={16} className="text-orange-400"/> : <Target size={16} className="text-blue-400"/>}
                  </div>
                  <div>
                      <p className={`text-xs font-black uppercase tracking-wide mb-1 ${n.lida ? 'text-slate-400' : 'text-white'}`}>{n.titulo}</p>
                      <p className="text-[10px] text-slate-300 font-medium leading-relaxed">{n.mensagem}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}