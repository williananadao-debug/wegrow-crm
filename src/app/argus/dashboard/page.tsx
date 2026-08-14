"use client";
import { useAuth } from '@/lib/contexts/AuthContext';
import ArgusTopNav from '../ArgusTopNav';
import DashboardPage from '@/app/dashboard/page';

// Reaproveita o componente real do Dashboard (não é link nem redirect — os
// dados, filtros, drill-down, tudo funciona igual) só trocando a casca em
// volta pela navegação do Argus. O corpo do dashboard continua no tema navy
// dele mesmo (reskinar as ~700 linhas de gráficos/lógica de agregação pro
// visual claro do Argus seria um retrabalho grande sem ganho real — o pedido
// era "nativo, não link", que isso já resolve).
export default function ArgusDashboardPage() {
  const auth = useAuth() || {};
  const empresa = auth.empresa;
  const isVeiculos = (empresa?.modulos?.argus_vertical || 'licitacao') === 'veiculos';

  // Vertical veículos já ganha o shell padrão (Navbar/Topbar) por fora — a
  // ArgusTopNav é só da vertical licitação, com visual próprio.
  if (isVeiculos) return <DashboardPage />;

  return (
    <div>
      <ArgusTopNav nomeEmpresa={empresa?.nome} />
      <div className="bg-[#0B1120] min-h-screen p-4 md:p-8">
        <DashboardPage />
      </div>
    </div>
  );
}
