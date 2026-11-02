import { redirect } from 'next/navigation';

// Login com a marca dupla do parceiro: /entrar/manager → tela de login "WeGrow for Manager".
// O parceiro divulga esse endereço pras rádios da carteira dele.
export default async function EntrarComMarca({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/login?marca=${encodeURIComponent(slug.toLowerCase())}`);
}
