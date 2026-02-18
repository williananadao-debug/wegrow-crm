'use client';

import { useEffect, useState } from 'react';

const API = 'http://localhost:3000';
const TOKEN_KEY = 'token';

export default function Home() {
  const [deals, setDeals] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);

  const getToken = () => localStorage.getItem(TOKEN_KEY);

  const loadData = async () => {
    const token = getToken();
    if (!token) return;

    try {
      const [d, s] = await Promise.all([
        fetch(`${API}/deals`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/pipelines/stages`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      setDeals(await d.json());
      setStages((await s.json()).sort((a: any, b: any) => a.position - b.position));
    } catch (error) {
      console.error("Erro ao carregar (silencioso)", error);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Mantive as funções caso queira usar no futuro, mas elas não farão nada visual agora
  const moveDeal = async (dealId: string, stageId: string) => {
    // Lógica mantida...
  };

  return (
    // AQUI ESTÁ O AJUSTE: Apenas a div com o fundo escuro e altura total
    <div style={{ background: '#020617', minHeight: '100vh', width: '100%' }}>
      {/* Nada aqui dentro */}
    </div>
  );
}