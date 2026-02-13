"use client";
import { useState } from 'react';
import Link from 'next/link';
import { Menu, X, LayoutDashboard, DollarSign, Users, Target, Package } from 'lucide-react';

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);

  const menuItems = [
    { name: 'Dashboard', icon: <LayoutDashboard />, path: '/' },
    { name: 'Vendas', icon: <DollarSign />, path: '/vendas' },
    { name: 'Financeiro', icon: <DollarSign />, path: '/financeiro' },
    { name: 'Clientes', icon: <Users />, path: '/clientes' },
    { name: 'Metas', icon: <Target />, path: '/metas' },
    { name: 'Produção', icon: <Package />, path: '/producao' },
  ];

  return (
    <>
      {/* Botão para abrir no Celular */}
      <button 
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-blue-600 text-white rounded-md"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X /> : <Menu />}
      </button>

      {/* Menu Lateral */}
      <div className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-white transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:inset-0
      `}>
        <div className="p-6 text-2xl font-bold border-b border-slate-800">
          WeGrow CRM
        </div>
        <nav className="mt-6">
          {menuItems.map((item) => (
            <Link 
              key={item.name} 
              href={item.path}
              onClick={() => setIsOpen(false)} // Fecha ao clicar no item (celular)
              className="flex items-center gap-3 px-6 py-4 hover:bg-slate-800 transition-colors"
            >
              {item.icon}
              {item.name}
            </Link>
          ))}
        </nav>
      </div>

      {/* Fundo escuro quando o menu abre no celular */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setIsOpen(false)}
        ></div>
      )}
    </>
  );
}