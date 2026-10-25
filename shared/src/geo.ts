import type { Point } from './types';

export interface City extends Point {
  name: string;
  state: string;
  /** 1 = metro, 2 = large city, 3 = smaller city/town. Used by ETA and RTO risk. */
  tier: 1 | 2 | 3;
  pincode: string;
  /** Hindi name, so the copilot understands "जयपुर" as well as "Jaipur". */
  hi?: string;
}

/**
 * A starter catalogue of Indian freight cities. In production this comes from a
 * pincode master (about 19,000 serviceable pincodes) with PostGIS.
 */
export const CITIES: City[] = [
  { name: 'Delhi', state: 'Delhi', tier: 1, pincode: '110001', lat: 28.6139, lng: 77.209, hi: 'दिल्ली' },
  { name: 'Gurugram', state: 'Haryana', tier: 1, pincode: '122001', lat: 28.4595, lng: 77.0266, hi: 'गुरुग्राम' },
  { name: 'Noida', state: 'Uttar Pradesh', tier: 1, pincode: '201301', lat: 28.5355, lng: 77.391, hi: 'नोएडा' },
  { name: 'Jaipur', state: 'Rajasthan', tier: 2, pincode: '302001', lat: 26.9124, lng: 75.7873, hi: 'जयपुर' },
  { name: 'Ajmer', state: 'Rajasthan', tier: 3, pincode: '305001', lat: 26.4499, lng: 74.6399, hi: 'अजमेर' },
  { name: 'Udaipur', state: 'Rajasthan', tier: 3, pincode: '313001', lat: 24.5854, lng: 73.7125, hi: 'उदयपुर' },
  { name: 'Jodhpur', state: 'Rajasthan', tier: 2, pincode: '342001', lat: 26.2389, lng: 73.0243, hi: 'जोधपुर' },
  { name: 'Kota', state: 'Rajasthan', tier: 3, pincode: '324001', lat: 25.2138, lng: 75.8648, hi: 'कोटा' },
  { name: 'Bhilwara', state: 'Rajasthan', tier: 3, pincode: '311001', lat: 25.3407, lng: 74.6313, hi: 'भीलवाड़ा' },
  { name: 'Chittorgarh', state: 'Rajasthan', tier: 3, pincode: '312001', lat: 24.8887, lng: 74.6269, hi: 'चित्तौड़गढ़' },
  { name: 'Ratlam', state: 'Madhya Pradesh', tier: 3, pincode: '457001', lat: 23.3315, lng: 75.0367, hi: 'रतलाम' },
  { name: 'Mandsaur', state: 'Madhya Pradesh', tier: 3, pincode: '458001', lat: 24.0734, lng: 75.07, hi: 'मंदसौर' },
  { name: 'Neemuch', state: 'Madhya Pradesh', tier: 3, pincode: '458441', lat: 24.4764, lng: 74.8624, hi: 'नीमच' },
  { name: 'Indore', state: 'Madhya Pradesh', tier: 2, pincode: '452001', lat: 22.7196, lng: 75.8577, hi: 'इंदौर' },
  { name: 'Dewas', state: 'Madhya Pradesh', tier: 3, pincode: '455001', lat: 22.9676, lng: 76.0534, hi: 'देवास' },
  { name: 'Ujjain', state: 'Madhya Pradesh', tier: 3, pincode: '456001', lat: 23.1765, lng: 75.7885, hi: 'उज्जैन' },
  { name: 'Bhopal', state: 'Madhya Pradesh', tier: 2, pincode: '462001', lat: 23.2599, lng: 77.4126, hi: 'भोपाल' },
  { name: 'Ahmedabad', state: 'Gujarat', tier: 1, pincode: '380001', lat: 23.0225, lng: 72.5714, hi: 'अहमदाबाद' },
  { name: 'Vadodara', state: 'Gujarat', tier: 2, pincode: '390001', lat: 22.3072, lng: 73.1812, hi: 'वडोदरा' },
  { name: 'Surat', state: 'Gujarat', tier: 1, pincode: '395003', lat: 21.1702, lng: 72.8311, hi: 'सूरत' },
  { name: 'Rajkot', state: 'Gujarat', tier: 2, pincode: '360001', lat: 22.3039, lng: 70.8022, hi: 'राजकोट' },
  { name: 'Mumbai', state: 'Maharashtra', tier: 1, pincode: '400001', lat: 19.076, lng: 72.8777, hi: 'मुंबई' },
  { name: 'Pune', state: 'Maharashtra', tier: 1, pincode: '411001', lat: 18.5204, lng: 73.8567, hi: 'पुणे' },
  { name: 'Nashik', state: 'Maharashtra', tier: 2, pincode: '422001', lat: 19.9975, lng: 73.7898, hi: 'नासिक' },
  { name: 'Nagpur', state: 'Maharashtra', tier: 2, pincode: '440001', lat: 21.1458, lng: 79.0882, hi: 'नागपुर' },
  { name: 'Raipur', state: 'Chhattisgarh', tier: 2, pincode: '492001', lat: 21.2514, lng: 81.6296, hi: 'रायपुर' },
  { name: 'Hyderabad', state: 'Telangana', tier: 1, pincode: '500001', lat: 17.385, lng: 78.4867, hi: 'हैदराबाद' },
  { name: 'Vijayawada', state: 'Andhra Pradesh', tier: 2, pincode: '520001', lat: 16.5062, lng: 80.648, hi: 'विजयवाड़ा' },
  { name: 'Visakhapatnam', state: 'Andhra Pradesh', tier: 2, pincode: '530001', lat: 17.6868, lng: 83.2185, hi: 'विशाखापत्तनम' },
  { name: 'Bengaluru', state: 'Karnataka', tier: 1, pincode: '560001', lat: 12.9716, lng: 77.5946, hi: 'बेंगलुरु' },
  { name: 'Mysuru', state: 'Karnataka', tier: 3, pincode: '570001', lat: 12.2958, lng: 76.6394, hi: 'मैसूर' },
  { name: 'Chennai', state: 'Tamil Nadu', tier: 1, pincode: '600001', lat: 13.0827, lng: 80.2707, hi: 'चेन्नई' },
  { name: 'Coimbatore', state: 'Tamil Nadu', tier: 2, pincode: '641001', lat: 11.0168, lng: 76.9558, hi: 'कोयंबटूर' },
  { name: 'Kochi', state: 'Kerala', tier: 2, pincode: '682001', lat: 9.9312, lng: 76.2673, hi: 'कोच्चि' },
  { name: 'Kolkata', state: 'West Bengal', tier: 1, pincode: '700001', lat: 22.5726, lng: 88.3639, hi: 'कोलकाता' },
  { name: 'Bhubaneswar', state: 'Odisha', tier: 2, pincode: '751001', lat: 20.2961, lng: 85.8245, hi: 'भुवनेश्वर' },
  { name: 'Patna', state: 'Bihar', tier: 2, pincode: '800001', lat: 25.5941, lng: 85.1376, hi: 'पटना' },
  { name: 'Lucknow', state: 'Uttar Pradesh', tier: 2, pincode: '226001', lat: 26.8467, lng: 80.9462, hi: 'लखनऊ' },
  { name: 'Kanpur', state: 'Uttar Pradesh', tier: 2, pincode: '208001', lat: 26.4499, lng: 80.3319, hi: 'कानपुर' },
  { name: 'Agra', state: 'Uttar Pradesh', tier: 2, pincode: '282001', lat: 27.1767, lng: 78.0081, hi: 'आगरा' },
  { name: 'Ludhiana', state: 'Punjab', tier: 2, pincode: '141001', lat: 30.901, lng: 75.8573, hi: 'लुधियाना' },
  { name: 'Chandigarh', state: 'Chandigarh', tier: 2, pincode: '160017', lat: 30.7333, lng: 76.7794, hi: 'चंडीगढ़' },
  { name: 'Amritsar', state: 'Punjab', tier: 2, pincode: '143001', lat: 31.634, lng: 74.8723, hi: 'अमृतसर' },
  { name: 'Dehradun', state: 'Uttarakhand', tier: 2, pincode: '248001', lat: 30.3165, lng: 78.0322, hi: 'देहरादून' },
  { name: 'Guwahati', state: 'Assam', tier: 2, pincode: '781001', lat: 26.1445, lng: 91.7362, hi: 'गुवाहाटी' },
];

const NORTH_EAST = new Set(['Assam', 'Meghalaya', 'Manipur', 'Mizoram', 'Nagaland', 'Tripura', 'Arunachal Pradesh', 'Sikkim']);

export function findCity(name: string | undefined | null): City | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  return CITIES.find((c) => c.name.toLowerCase() === n || c.hi === name.trim());
}

export function requireCity(name: string): City {
  const c = findCity(name);
  if (!c) throw new Error(`Unknown city: ${name}`);
  return c;
}

const R = 6371; // km
const toRad = (d: number) => (d * Math.PI) / 180;

/** Straight-line distance in km. */
export function haversineKm(a: Point, b: Point): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Estimated road distance. Indian highway routes run about 1.25x the straight line
 * on average; short urban hops wind more. Replace with OSRM / map API in production.
 */
export function roadKm(a: Point, b: Point): number {
  const d = haversineKm(a, b);
  if (d < 1) return Math.max(1, Math.round(d * 10) / 10);
  const factor = d < 50 ? 1.4 : d < 300 ? 1.28 : 1.22;
  return Math.round(d * factor);
}

export function nearestCity(p: Point): City {
  let best = CITIES[0]!;
  let bestD = Infinity;
  for (const c of CITIES) {
    const d = haversineKm(p, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

export function isNorthEast(c: City): boolean {
  return NORTH_EAST.has(c.state);
}

/** Courier zone, the way Indian parcel rate cards are usually built. */
export type Zone = 'A' | 'B' | 'C' | 'D' | 'E';
export function courierZone(from: City, to: City): Zone {
  if (isNorthEast(from) || isNorthEast(to)) return 'E';
  if (from.name === to.name) return 'A';
  const km = roadKm(from, to);
  if (km <= 500) return 'B';
  if (km <= 1000) return 'C';
  if (km <= 1800) return 'D';
  return 'E';
}

/** Linear interpolation between two points — used to simulate a truck moving along a lane. */
export function lerpPoint(a: Point, b: Point, t: number): Point {
  const k = Math.min(1, Math.max(0, t));
  return { lat: a.lat + (b.lat - a.lat) * k, lng: a.lng + (b.lng - a.lng) * k };
}
