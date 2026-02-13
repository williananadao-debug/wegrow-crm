import { ReactNode } from 'react';

interface KpiCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
  color?: 'green' | 'blue' | 'yellow' | 'red';
}

export function KpiCard({ title, value, subtitle, icon, color = 'green' }: KpiCardProps) {
  // Mapeamento de gradientes sutil conforme o Brand Kit
  const variants = {
    green: "from-wg-green/10 to-transparent border-wg-green/20",
    blue: "from-blue-500/10 to-transparent border-blue-500/20",
    yellow: "from-wg-yellow/10 to-transparent border-wg-yellow/20",
    red: "from-wg-red/10 to-transparent border-wg-red/20",
  };

  return (
    <div className={`wg-card bg-gradient-to-br ${variants[color]} p-6 rounded-[22px] border relative overflow-hidden`}>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-black/20 rounded-lg text-wg-text">
          {icon}
        </div>
        <span className="text-xs font-bold uppercase tracking-widest text-wg-muted">{title}</span>
      </div>
      
      <div className="relative z-10">
        <h2 className="text-3xl font-black text-wg-text tracking-tighter">{value}</h2>
        <p className="text-sm text-wg-muted mt-1">{subtitle}</p>
      </div>

      {/* Brilho decorativo de fundo */}
      <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/5 blur-3xl rounded-full" />
    </div>
  );
}