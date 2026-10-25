import { CITIES } from './geo';
import type { Service } from './types';

export type CopilotIntent =
  | 'TRACK'
  | 'QUOTE'
  | 'RETURN_LOADS'
  | 'IDLE_VEHICLES'
  | 'DELAYED_SHIPMENTS'
  | 'COD_OUTSTANDING'
  | 'RTO_RISK'
  | 'DOC_EXPIRY'
  | 'REVENUE'
  | 'FLEET_STATUS'
  | 'TODAY_SUMMARY'
  | 'HELP';

export interface ParsedQuery {
  intent: CopilotIntent;
  text: string;
  lang: 'hi' | 'en';
  cities: string[];
  city?: string;
  awb?: string;
  weightKg?: number;
  service?: Service;
  period: 'today' | 'week' | 'month' | 'all';
}

const has = (t: string, words: string[]) => words.some((w) => t.includes(w));

const HINGLISH = [' hai', ' kya', 'kitne', 'kitna', 'kaun', 'kahan', 'kaha ', ' ke ', ' mein', 'aaj', ' paas', 'batao', 'dikhao', 'wala', 'gaadi', 'gadi'];

/**
 * Turns a dispatcher's question — English, Hindi or Hinglish — into an intent the
 * API can answer from live data. Deterministic, fast and free; the API can hand the
 * result to an LLM for a more natural reply when a key is configured.
 */
export function parseQuery(raw: string): ParsedQuery {
  const text = raw.trim();
  const t = ` ${text.toLowerCase()} `;
  const lang: 'hi' | 'en' = /[ऀ-ॿ]/.test(text) || has(t, HINGLISH) ? 'hi' : 'en';

  // Cities in the order they appear.
  const found: { name: string; at: number }[] = [];
  for (const c of CITIES) {
    const i = t.indexOf(c.name.toLowerCase());
    const j = c.hi ? text.indexOf(c.hi) : -1;
    const at = i >= 0 ? i : j >= 0 ? j : -1;
    if (at >= 0) found.push({ name: c.name, at });
  }
  found.sort((a, b) => a.at - b.at);
  const cities = found.map((f) => f.name);

  const awbMatch = /SL\d{11}/i.exec(text);
  const w = /(\d+(?:\.\d+)?)\s*(kg|kilo|kgs|ton|tonne|tons|t)\b/i.exec(text);
  let weightKg: number | undefined;
  if (w) weightKg = Number(w[1]) * (/^t/i.test(w[2]!) ? 1000 : 1);

  let service: Service | undefined;
  if (has(t, ['courier', 'parcel', 'packet'])) service = 'COURIER';
  else if (has(t, ['ptl', 'part load', 'part truck'])) service = 'PTL';
  else if (has(t, ['ftl', 'full truck', 'full load', 'pura truck'])) service = 'FTL';

  const period: ParsedQuery['period'] = has(t, ['week', 'hafte', 'हफ्ते', '7 din'])
    ? 'week'
    : has(t, ['month', 'mahine', 'महीने'])
      ? 'month'
      : has(t, ['today', 'aaj', 'आज'])
        ? 'today'
        : 'all';

  let intent: CopilotIntent = 'HELP';
  if (awbMatch || has(t, ['track', 'kahan hai', 'kaha hai', 'where is', 'कहाँ है'])) intent = 'TRACK';
  else if (has(t, ['price', 'rate', 'quote', 'kiraya', 'bhada', 'bhaada', 'भाड़ा', 'kitne ka', 'cost to', 'charges'])) intent = 'QUOTE';
  else if (has(t, ['return load', 'back load', 'wapsi', 'vapsi', 'वापसी', 'return trip'])) intent = 'RETURN_LOADS';
  else if (has(t, ['idle', 'empty', 'khali', 'khaali', 'खाली', 'free truck', 'available truck', 'free gaadi'])) intent = 'IDLE_VEHICLES';
  else if (has(t, ['delay', 'late', ' der ', 'देर', 'at risk', 'stuck', 'atka', 'अटका'])) intent = 'DELAYED_SHIPMENTS';
  else if (has(t, ['rto', 'risky', 'return to origin', 'risk'])) intent = 'RTO_RISK';
  else if (has(t, [' cod', 'cash on delivery', 'cash collect', 'nakad'])) intent = 'COD_OUTSTANDING';
  else if (has(t, ['expir', 'insurance', 'permit', 'fitness', ' puc', 'document', 'kagaz', 'कागज', 'licence', 'license'])) intent = 'DOC_EXPIRY';
  else if (has(t, ['revenue', 'earning', 'kamai', 'कमाई', 'income', 'sales', 'profit', 'munafa', 'मुनाफा', 'billing'])) intent = 'REVENUE';
  else if (has(t, ['fleet', 'utilisation', 'utilization', 'kitne truck', 'trucks status', 'gaadiyan', 'vehicles'])) intent = 'FLEET_STATUS';
  else if (has(t, ['summary', 'overview', 'dashboard', 'report', 'aaj ka', 'today', 'हाल', 'status'])) intent = 'TODAY_SUMMARY';

  return {
    intent,
    text,
    lang,
    cities,
    city: cities[0],
    awb: awbMatch?.[0]?.toUpperCase(),
    weightKg,
    service,
    period,
  };
}

export const COPILOT_SUGGESTIONS = [
  'Aaj ka summary batao',
  'Which trucks are idle near Jaipur?',
  'Delayed shipments',
  'Indore se Mumbai 5 ton ka bhada kitna?',
  'Return load for trucks unloading in Ahmedabad',
  'Documents expiring this month',
  'COD outstanding',
  'Risky COD parcels',
];

export function periodStart(period: ParsedQuery['period'], now = new Date()): Date | undefined {
  const d = new Date(now);
  if (period === 'today') {
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === 'week') return new Date(now.getTime() - 7 * 86400_000);
  if (period === 'month') return new Date(now.getTime() - 30 * 86400_000);
  return undefined;
}
