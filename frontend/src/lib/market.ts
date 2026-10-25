/**
 * Market research shown on the website. Every figure has a source; estimates differ by
 * research firm, so the copy says "about" and names who said it. Checked in October 2026.
 */
export interface Source {
  id: string;
  title: string;
  publisher: string;
  url: string;
}

export const SOURCES: Source[] = [
  { id: 'ncaer', title: 'India’s logistics cost estimated at 7.97% of GDP in 2023–24 (NCAER study for DPIIT)', publisher: 'Maritime Gateway', url: 'https://www.maritimegateway.com/indias-logistics-costs-fall-to-7-97-of-gdp-in-fy-2023-24-dpiit' },
  { id: 'bs', title: 'Confidence in India’s logistics cost: the story of economic transition', publisher: 'Business Standard', url: 'https://www.business-standard.com/amp/opinion/columns/confidence-in-india-s-logistics-cost-the-story-of-economic-transition-125112001452_1.html' },
  { id: 'redseer', title: 'Unlocking growth in India’s fragmented trucking sector', publisher: 'Redseer Strategy Consultants', url: 'https://redseer.com/articles/unlocking-growth-in-indias-fragmented-trucking-sector/' },
  { id: 'tribune', title: 'Lockdown slams brakes on truckers’ business (citing AIMTC)', publisher: 'The Tribune', url: 'https://m.tribuneindia.com/news/business/lockdown-slams-brakes-on-truckers-business-91535' },
  { id: 'drishti', title: 'Decarbonising India’s logistics sector', publisher: 'Drishti IAS', url: 'https://www.drishtiias.com/daily-updates/daily-news-analysis/decarbonising-india-s-logistics-sector/print_manually' },
  { id: 'dat', title: 'Trucking is the backbone of India’s economy', publisher: 'DAT', url: 'https://dat.com/blog/trucking-is-the-backbone-of-indias-economy' },
  { id: 'worldbank', title: 'Geographic imbalance, search frictions, and regulation: causes of empty miles in freight trucking (2024)', publisher: 'World Bank Policy Research Working Paper 10775', url: 'https://econpapers.repec.org/paper/wbkwbrwps/10775.htm' },
  { id: 'yourstory', title: 'Raaho: connecting shippers and carriers, digitising trucking', publisher: 'YourStory', url: 'https://yourstory.com/2021/05/raaho-connecting-shippers-carriers-digitising-trucking-logistics-startups/amp' },
  { id: 'nlp', title: 'National Logistics Policy 2022: aims and targets', publisher: 'NEXT IAS', url: 'https://www.nextias.com/current-affairs/19-09-2022/national-logistics-policy-2022' },
];

export interface Stat {
  value: string;
  label: string;
  detail: string;
  source: Source['id'];
}

/** The headline numbers. */
export const STATS: Stat[] = [
  { value: '7.97%', label: 'of GDP goes on logistics', detail: 'India’s logistics cost in 2023–24, in the first official study, by NCAER for the Department for Promotion of Industry and Internal Trade.', source: 'ncaer' },
  { value: '~2/3', label: 'of freight moves by road', detail: 'Estimates run from 64.5% to about 70% of India’s domestic freight, depending on who is counting.', source: 'drishti' },
  { value: '12.5 M', label: 'trucks on Indian roads', detail: 'Run by roughly 3.5 million truck operators.', source: 'redseer' },
  { value: '75%', label: 'of operators own fewer than five trucks', detail: 'Trucking is a business of small owners. Other surveys say about 85% run fewer than ten.', source: 'redseer' },
  { value: '18–20', label: 'days a month a typical truck runs', detail: 'The rest of the time it waits: 24–48 hours idle on average between loads.', source: 'redseer' },
  { value: '~80%', label: 'of an operator’s costs are fuel and tolls', detail: 'Which is why an empty kilometre hurts so much.', source: 'redseer' },
  { value: '29%', label: 'average share of empty truck kilometres', detail: 'From a World Bank meta-analysis across countries; lower-income countries tend to run more empty miles than rich ones.', source: 'worldbank' },
  { value: '<2%', label: 'of freight is booked digitally', detail: 'Most loads still move through phone calls and long broker chains.', source: 'redseer' },
];

/** What goes wrong today, and what the app does about it. */
export const PROBLEMS: { title: string; fact: string; source: Source['id']; answer: string }[] = [
  {
    title: 'Small owners work alone',
    fact: 'About three in four truck operators own fewer than five trucks, so most of India’s road freight is moved by people without an office, a sales team or software.',
    source: 'redseer',
    answer: 'Owners attach their trucks to Suraj Logistic and get trips from our customers, with the hire agreed before loading and shown on their own page in Hindi.',
  },
  {
    title: 'Trucks wait for loads',
    fact: 'A typical truck runs 18–20 days a month and waits 24–48 hours between loads.',
    source: 'redseer',
    answer: 'The load board and the return-load finder put an empty truck next to loads going its way, and owners can tell the office the moment a truck is free.',
  },
  {
    title: 'Empty kilometres cost the most',
    fact: 'Fuel and tolls are about 80% of an operator’s costs, and a World Bank review puts empty kilometres at 29% on average across countries.',
    source: 'worldbank',
    answer: 'Every trip is planned with its return in mind, and the control tower shows idle trucks beside open loads before they start back empty.',
  },
  {
    title: 'Paperwork and phone calls',
    fact: 'Less than 2% of freight is booked digitally; most bookings, tracking and payments still run on calls, WhatsApp groups and paper.',
    source: 'redseer',
    answer: 'One record per shipment: booking, e-way bill number, live tracking, OTP delivery with photo and signature, and a GST invoice at the end.',
  },
];
