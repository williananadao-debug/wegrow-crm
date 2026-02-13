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

    const [d, s] = await Promise.all([
      fetch(`${API}/deals`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API}/pipelines/stages`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);

    setDeals(await d.json());
    setStages((await s.json()).sort((a: any, b: any) => a.position - b.position));
  };

  useEffect(() => {
    loadData();
  }, []);

  const getNextStage = (id: string) => {
    const i = stages.findIndex(s => s.id === id);
    return stages[i + 1]?.id;
  };

  const moveDeal = async (dealId: string, stageId: string) => {
    const token = getToken();
    if (!token) return;

    setDeals(prev =>
      prev.map(d => (d.id === dealId ? { ...d, stage_id: stageId } : d))
    );

    await fetch(`${API}/deals/${dealId}/move`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ stage_id: stageId }),
    });

    loadData();
  };

  const openTotal = deals
    .filter(d => d.status === 'OPEN')
    .reduce((s, d) => s + Number(d.value_amount || 0), 0);

  const wonTotal = deals
    .filter(d => d.status === 'WON')
    .reduce((s, d) => s + Number(d.value_amount || 0), 0);

  return (
    <div style={{ padding: 24, background: '#020617', minHeight: '100vh', color: 'white' }}>
      {/* RESUMO */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <div style={box}>
          <div>Em aberto</div>
          <strong style={{ fontSize: 22, color: '#3b82f6' }}>R$ {openTotal}</strong>
        </div>

        <div style={box}>
          <div>Ganhos</div>
          <strong style={{ fontSize: 22, color: '#22c55e' }}>R$ {wonTotal}</strong>
        </div>
      </div>

      <h1 style={{ fontSize: 28, marginBottom: 20 }}>Funil de Vendas</h1>

      <div style={{ display: 'flex', gap: 20, overflowX: 'auto' }}>
        {stages.map(stage => {
          const list = deals.filter(d => d.stage_id === stage.id);

          return (
            <div key={stage.id} style={column}>
              <h3>{stage.name}</h3>

              {list.map(deal => {
                const next = getNextStage(deal.stage_id);

                return (
                  <div key={deal.id} style={card}>
                    <strong>{deal.title}</strong>
                    <div style={{ opacity: .7 }}>R$ {deal.value_amount}</div>

                    <select
                      value={deal.stage_id}
                      onChange={e => moveDeal(deal.id, e.target.value)}
                      style={select}
                    >
                      {stages.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>

                    {next && (
                      <button onClick={() => moveDeal(deal.id, next)} style={primary}>
                        Próxima etapa →
                      </button>
                    )}

                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        onClick={() => moveDeal(deal.id, stage.id)}
                        style={win}
                      >
                        Ganho
                      </button>

                      <button
                        onClick={() => moveDeal(deal.id, stage.id)}
                        style={lost}
                      >
                        Perdido
                      </button>
                    </div>
                  </div>
                );
              })}

              {list.length === 0 && <div style={{ opacity: .4 }}>—</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* estilos */

const box = {
  background: '#0f172a',
  padding: 16,
  borderRadius: 12,
  minWidth: 160,
};

const column = {
  minWidth: 300,
  background: '#0f172a',
  padding: 14,
  borderRadius: 16,
};

const card = {
  background: '#020617',
  padding: 12,
  borderRadius: 12,
  marginBottom: 12,
};

const select = {
  width: '100%',
  marginTop: 8,
  padding: 10,
  borderRadius: 10,
  background: '#020617',
  color: 'white',
  border: '1px solid #1e293b',
};

const primary = {
  marginTop: 8,
  width: '100%',
  padding: 12,
  borderRadius: 10,
  background: '#2563eb',
  color: 'white',
  border: 'none',
  fontWeight: 600,
};

const win = {
  flex: 1,
  marginTop: 8,
  padding: 12,
  borderRadius: 10,
  background: '#16a34a',
  color: 'white',
  border: 'none',
};

const lost = {
  flex: 1,
  marginTop: 8,
  padding: 12,
  borderRadius: 10,
  background: '#991b1b',
  color: 'white',
  border: 'none',
};
