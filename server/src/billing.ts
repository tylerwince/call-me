/**
 * Billing and Pricing Configuration
 */

export interface PricingConfig {
  twilioCostPerMin: number;   // cents
  whisperCostPerMin: number;  // cents
  ttsCostPerMin: number;      // cents
  priceMultiplier: number;    // markup multiplier
}

let pricingConfig: PricingConfig = {
  twilioCostPerMin: 2,
  whisperCostPerMin: 1,
  ttsCostPerMin: 5,
  priceMultiplier: 2.0,
};

export function loadPricingConfig(): void {
  pricingConfig = {
    twilioCostPerMin: parseFloat(process.env.TWILIO_COST_PER_MIN || '2'),
    whisperCostPerMin: parseFloat(process.env.WHISPER_COST_PER_MIN || '1'),
    ttsCostPerMin: parseFloat(process.env.TTS_COST_PER_MIN || '5'),
    priceMultiplier: parseFloat(process.env.PRICE_MULTIPLIER || '2.0'),
  };

  console.error(`Pricing: ${getBaseCostPerMin()}¢ base × ${pricingConfig.priceMultiplier} = ${getPricePerMin()}¢/min`);
}

export function getPricingConfig(): PricingConfig {
  return { ...pricingConfig };
}

export function getBaseCostPerMin(): number {
  return pricingConfig.twilioCostPerMin + pricingConfig.whisperCostPerMin + pricingConfig.ttsCostPerMin;
}

export function getPricePerMin(): number {
  return Math.ceil(getBaseCostPerMin() * pricingConfig.priceMultiplier);
}

export function calculateCallCost(durationSeconds: number): number {
  const minutes = Math.ceil(durationSeconds / 60);
  return minutes * getPricePerMin();
}
