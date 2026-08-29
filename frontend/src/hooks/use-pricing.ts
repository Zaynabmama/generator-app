import { useEffect, useState } from 'react';
import { storage } from '@/src/utils/storage';

export const DEFAULT_KWH_RATE = 0.85;
export const DEFAULT_MONTHLY_FEE = 5.0;

const KWH_RATE_KEY = 'pricing_kwh_rate';
const MONTHLY_FEE_KEY = 'pricing_monthly_fee';

export async function getPricing() {
  const kwhRate = await storage.getItem<number>(KWH_RATE_KEY, DEFAULT_KWH_RATE);
  const monthlyFee = await storage.getItem<number>(MONTHLY_FEE_KEY, DEFAULT_MONTHLY_FEE);
  return {
    kwhRate: kwhRate ?? DEFAULT_KWH_RATE,
    monthlyFee: monthlyFee ?? DEFAULT_MONTHLY_FEE,
  };
}

export async function savePricing(kwhRate: number, monthlyFee: number) {
  await storage.setItem(KWH_RATE_KEY, kwhRate);
  await storage.setItem(MONTHLY_FEE_KEY, monthlyFee);
}

// Loads the saved kWh rate / monthly fee (falling back to the defaults above
// until storage resolves, then again if nothing was ever saved).
export function usePricing() {
  const [kwhRate, setKwhRate] = useState(DEFAULT_KWH_RATE);
  const [monthlyFee, setMonthlyFee] = useState(DEFAULT_MONTHLY_FEE);

  useEffect(() => {
    getPricing().then((p) => {
      setKwhRate(p.kwhRate);
      setMonthlyFee(p.monthlyFee);
    });
  }, []);

  return { kwhRate, monthlyFee };
}
