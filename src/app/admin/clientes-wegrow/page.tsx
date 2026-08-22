import { redirect } from 'next/navigation';

// "Assinaturas" foi absorvido pelo painel único do God Mode — o toggle "Cobrança" na
// lista de empresas de /admin, mais as abas Faturamento/Portais/Contrato no painel de
// cada empresa, cobrem tudo que essa página fazia sozinha.
export default function ClientesWeGrowRedirect() {
  redirect('/admin');
}
