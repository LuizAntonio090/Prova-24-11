/**
 * Cálculo de frete por região (primeiro dígito do CEP) e peso.
 * A tabela-base fica nas configurações da loja (painel > Configurações).
 * Para cotação em tempo real com transportadoras, substitua `quoteShipping`
 * por uma integração (ex.: Melhor Envio) mantendo o mesmo formato de retorno.
 */
const REGIONS = {
  0: { name: 'Grande São Paulo', factor: 1, days: [2, 4] },
  1: { name: 'Interior de SP', factor: 1.05, days: [3, 5] },
  2: { name: 'RJ e ES', factor: 1.15, days: [3, 6] },
  3: { name: 'Minas Gerais', factor: 1.15, days: [3, 6] },
  4: { name: 'BA e SE', factor: 1.45, days: [5, 9] },
  5: { name: 'PE, AL, PB e RN', factor: 1.6, days: [6, 10] },
  6: { name: 'Norte e CE, PI, MA', factor: 1.9, days: [7, 12] },
  7: { name: 'Centro-Oeste, TO e RO', factor: 1.45, days: [5, 9] },
  8: { name: 'PR e SC', factor: 1.2, days: [3, 6] },
  9: { name: 'Rio Grande do Sul', factor: 1.3, days: [4, 7] },
};

export const isValidCep = (cep) => /^\d{8}$/.test(String(cep || '').replace(/\D/g, ''));

export function quoteShipping(cepRaw, weightGrams, merchandiseCents, cfg) {
  const cep = String(cepRaw).replace(/\D/g, '');
  if (!isValidCep(cep)) return [];
  const region = REGIONS[Number(cep[0])];
  const kg = Math.max(1, Math.ceil(weightGrams / 1000));
  const extraKg = kg - 1;

  let economy = Math.round((cfg.economyBaseCents + extraKg * cfg.perKgCents) * region.factor);
  const express = Math.round((cfg.expressBaseCents + extraKg * cfg.perKgCents * 1.5) * region.factor);
  const free = cfg.freeShippingMinCents > 0 && merchandiseCents >= cfg.freeShippingMinCents;
  if (free) economy = 0;

  const [min, max] = region.days;
  const expressMin = Math.max(1, Math.ceil(min / 2));
  const expressMax = Math.max(2, Math.ceil(max / 2));
  return [
    { id: 'economica', label: 'Econômica', priceCents: economy, days: `${min} a ${max} dias úteis`, free },
    { id: 'expressa', label: 'Expressa', priceCents: express, days: `${expressMin} a ${expressMax} dias úteis`, free: false },
  ];
}
