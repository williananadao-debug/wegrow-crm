"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Cena 3D do topo do site: núcleo WeGrow com os módulos (CRM, Nexus, Pulse, THOR + verticais)
// orbitando, ligados ao centro por linhas de energia. Reage ao mouse (parallax) e ao scroll
// (gira/afasta). Só é carregada no navegador (next/dynamic sem SSR) e pausa quando sai da tela.

export type ModuloOrbita = { nome: string; hex: string };

type Props = { modulos: ModuloOrbita[]; leve?: boolean };

function Nucleo() {
  const casca = useRef<THREE.Mesh>(null);
  const anel1 = useRef<THREE.Mesh>(null);
  const anel2 = useRef<THREE.Mesh>(null);
  const brilho = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (casca.current) { casca.current.rotation.y = t * 0.25; casca.current.rotation.x = t * 0.12; }
    if (anel1.current) anel1.current.rotation.z = t * 0.4;
    if (anel2.current) anel2.current.rotation.z = -t * 0.3;
    if (brilho.current) {
      const s = 1 + Math.sin(t * 2) * 0.05;
      brilho.current.scale.setScalar(s);
    }
  });
  return (
    <group>
      {/* coração brilhante */}
      <mesh ref={brilho}>
        <sphereGeometry args={[0.75, 48, 48]} />
        <meshStandardMaterial color="#22C55E" emissive="#22C55E" emissiveIntensity={1.6} roughness={0.25} metalness={0.2} />
      </mesh>
      {/* casca geométrica */}
      <mesh ref={casca}>
        <icosahedronGeometry args={[1.25, 1]} />
        <meshStandardMaterial color="#86efac" wireframe transparent opacity={0.55} />
      </mesh>
      <mesh ref={anel1} rotation={[Math.PI / 2.3, 0, 0]}>
        <torusGeometry args={[1.75, 0.018, 16, 120]} />
        <meshBasicMaterial color="#22C55E" transparent opacity={0.7} />
      </mesh>
      <mesh ref={anel2} rotation={[Math.PI / 1.7, Math.PI / 5, 0]}>
        <torusGeometry args={[2.05, 0.012, 16, 120]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.45} />
      </mesh>
    </group>
  );
}

function Orbitas({ modulos }: { modulos: ModuloOrbita[] }) {
  const grupo = useRef<THREE.Group>(null);
  const esferas = useRef<(THREE.Mesh | null)[]>([]);
  const n = modulos.length;
  // Metade num anel interno (core), metade no externo (verticais), cada anel inclinado.
  const config = useMemo(() => modulos.map((m, i) => {
    const interno = i < Math.ceil(n / 2);
    const idxNoAnel = interno ? i : i - Math.ceil(n / 2);
    const qtdNoAnel = interno ? Math.ceil(n / 2) : Math.floor(n / 2);
    return {
      cor: new THREE.Color(m.hex),
      raio: interno ? 3.0 : 4.2,
      fase: (idxNoAnel / qtdNoAnel) * Math.PI * 2,
      vel: interno ? 0.32 : -0.22,
      incl: interno ? 0.35 : -0.5,
    };
  }), [modulos, n]);

  const linhas = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    return geo;
  }, [n]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pos = linhas.getAttribute('position') as THREE.BufferAttribute;
    config.forEach((c, i) => {
      const a = c.fase + t * c.vel;
      const x = Math.cos(a) * c.raio;
      const z = Math.sin(a) * c.raio;
      const y = Math.sin(a) * c.raio * c.incl * 0.5;
      const m = esferas.current[i];
      if (m) { m.position.set(x, y, z); m.rotation.y = t; }
      pos.setXYZ(i * 2, 0, 0, 0);
      pos.setXYZ(i * 2 + 1, x, y, z);
    });
    pos.needsUpdate = true;
  });

  return (
    <group ref={grupo}>
      <lineSegments geometry={linhas}>
        <lineBasicMaterial color="#22C55E" transparent opacity={0.22} />
      </lineSegments>
      {config.map((c, i) => (
        <mesh key={modulos[i].nome} ref={el => { esferas.current[i] = el; }}>
          <octahedronGeometry args={[0.32, 0]} />
          <meshStandardMaterial color={c.cor} emissive={c.cor} emissiveIntensity={0.9} roughness={0.3} metalness={0.4} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Particulas({ qtd }: { qtd: number }) {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(qtd * 3);
    // Pseudo-aleatório com semente fixa (mulberry32): mesma nuvem a cada render, sem Math.random.
    let semente = 20261013;
    const aleatorio = () => {
      semente = (semente + 0x6D2B79F5) | 0;
      let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < qtd; i++) {
      // casca esférica entre raio 5 e 11
      const r = 5 + aleatorio() * 6;
      const th = aleatorio() * Math.PI * 2;
      const ph = Math.acos(2 * aleatorio() - 1);
      arr[i * 3] = r * Math.sin(ph) * Math.cos(th);
      arr[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      arr[i * 3 + 2] = r * Math.cos(ph);
    }
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return g;
  }, [qtd]);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.02; });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial color="#86efac" size={0.035} sizeAttenuation transparent opacity={0.7} />
    </points>
  );
}

// Câmera se afasta conforme o scroll (o giro/parallax fica no grupo da cena).
function Camera({ alvo }: { alvo: React.MutableRefObject<{ x: number; y: number; scroll: number }> }) {
  useFrame(({ camera }) => {
    camera.position.z += ((10 + alvo.current.scroll * 4) - camera.position.z) * 0.05;
  });
  return null;
}

function Cena({ modulos, leve, alvo }: Props & { alvo: React.MutableRefObject<{ x: number; y: number; scroll: number }> }) {
  const grupo = useRef<THREE.Group>(null);
  useFrame(() => {
    const { x, y, scroll } = alvo.current;
    if (!grupo.current) return;
    grupo.current.rotation.y += ((x * 0.4 + scroll * 1.4) - grupo.current.rotation.y) * 0.05;
    grupo.current.rotation.x += ((-y * 0.25 + 0.3) - grupo.current.rotation.x) * 0.05;
  });
  return (
    <>
      <ambientLight intensity={0.35} />
      <pointLight position={[0, 0, 0]} intensity={30} color="#22C55E" distance={12} />
      <pointLight position={[6, 5, 6]} intensity={60} color="#38bdf8" />
      <pointLight position={[-6, -4, 4]} intensity={40} color="#a78bfa" />
      <group ref={grupo}>
        <Nucleo />
        <Orbitas modulos={modulos} />
      </group>
      <Particulas qtd={leve ? 250 : 700} />
      <Camera alvo={alvo} />
    </>
  );
}

export default function Hero3D({ modulos, leve = false }: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const alvo = useRef({ x: 0, y: 0, scroll: 0 });
  const [visivel, setVisivel] = useState(true);

  useEffect(() => {
    const mover = (e: PointerEvent) => {
      alvo.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      alvo.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const rolar = () => { alvo.current.scroll = Math.min(1, window.scrollY / (window.innerHeight * 1.2)); };
    window.addEventListener('pointermove', mover, { passive: true });
    window.addEventListener('scroll', rolar, { passive: true });
    // Fora da tela = não renderiza (economiza bateria/CPU no celular).
    const obs = new IntersectionObserver(([e]) => setVisivel(e.isIntersecting), { threshold: 0 });
    if (caixa.current) obs.observe(caixa.current);
    return () => { window.removeEventListener('pointermove', mover); window.removeEventListener('scroll', rolar); obs.disconnect(); };
  }, []);

  return (
    <div ref={caixa} className="absolute inset-0">
      <Canvas
        frameloop={visivel ? 'always' : 'never'}
        dpr={leve ? 1 : [1, 1.75]}
        camera={{ position: [0, 0, 10], fov: 45 }}
        gl={{ antialias: !leve, alpha: true, powerPreference: 'high-performance' }}
      >
        <Cena modulos={modulos} leve={leve} alvo={alvo} />
      </Canvas>
    </div>
  );
}
