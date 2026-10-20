import type { Metadata } from 'next';
import PainelEleicao from './PainelEleicao';

export const metadata: Metadata = {
  title: 'Apuração 2º Turno 2026 · Ao vivo',
  description: 'Acompanhe a apuração do 2º turno em tempo real: presidente e governadores, com mapa por município.',
};

export default function Page() {
  return <PainelEleicao />;
}
