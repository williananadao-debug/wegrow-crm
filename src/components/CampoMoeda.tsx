"use client";
import { useState, useEffect } from 'react';

// Input de valor em reais formatado enquanto digita (1.234,56 — separador de milhar "." e
// decimal ",", igual qualquer valor em R$ no Brasil), em vez de <input type="number"> cru
// (sem separador nenhum, difícil de ler um valor grande tipo "19590000"). Mesmo jeito de
// digitar de app de banco/maquininha: os dígitos entram da direita pra esquerda, sempre como
// centavos — não tem como digitar errado o separador decimal.
export default function CampoMoeda({
  value, onChange, className, placeholder, autoFocus, disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const formatar = (v: number) => v === 0 ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [texto, setTexto] = useState(formatar(value));

  // Sincroniza se o valor mudar por fora (ex: "Gerar Nx iguais" preenchendo o campo
  // programaticamente) — não interfere na digitação porque o onChange abaixo já deixa
  // `value` igual ao que o próprio texto formatado representa.
  useEffect(() => { setTexto(formatar(value)); }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitos = e.target.value.replace(/\D/g, '');
    const numero = digitos ? Number(digitos) / 100 : 0;
    setTexto(formatar(numero));
    onChange(numero);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={texto}
      onChange={handleChange}
      className={className}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
    />
  );
}
