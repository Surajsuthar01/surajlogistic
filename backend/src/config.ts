/*
  Every setting the backend reads, in one place, checked once at start.
  In production (NODE_ENV=production) a missing or placeholder secret, or a database that is
  not PostgreSQL, stops the server with a plain message instead of starting half-safe.
*/

const PLACEHOLDER = /change-?me|example|placeholder|your-|xxxx|dev-only/i;

export interface Config {
  production: boolean;
  port: number;
  host: string;
  databaseUrl: string | undefined;
  jwtSecret: string;
  publicUrl: string;
  corsOrigin: string[] | boolean;
  homeOrgSlug: string | undefined;
  allowCompanySignup: boolean;
  trustProxy: string | undefined;
  seedDemo: boolean;
  simulate: boolean;
  logRequests: boolean;
  /** First start of an empty database: the company and its owner login. */
  bootstrap: {
    companyName: string;
    adminName: string;
    adminEmail: string | undefined;
    adminPassword: string | undefined;
    adminPhone: string | undefined;
    companyPhone: string | undefined;
    companyCity: string | undefined;
    companyAddress: string | undefined;
    companyGstin: string | undefined;
  };
}

const on = (v: string | undefined) => v === '1' || v === 'true' || v === 'yes';
const blank = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): { config: Config; problems: string[] } {
  const production = env.NODE_ENV === 'production';
  const problems: string[] = [];

  const jwtSecret = env.JWT_SECRET ?? (production ? '' : 'dev-only-secret-change-me-dev-only-secret');
  if (production) {
    if (jwtSecret.length < 32) problems.push('JWT_SECRET must be at least 32 characters. Make one with: openssl rand -hex 32');
    else if (PLACEHOLDER.test(jwtSecret)) problems.push('JWT_SECRET is still the example value. Make a real one with: openssl rand -hex 32');
  }

  const databaseUrl = blank(env.DATABASE_URL);
  if (production && !(databaseUrl && /^postgres(ql)?:\/\//.test(databaseUrl))) {
    problems.push('DATABASE_URL must point to PostgreSQL in production, e.g. postgres://suraj:password@db:5432/surajlogistic');
  } else if (databaseUrl && /^postgres(ql)?:\/\//.test(databaseUrl)) {
    try {
      new URL(databaseUrl);
    } catch {
      problems.push('DATABASE_URL is not a valid address. Use only letters and numbers in POSTGRES_PASSWORD.');
    }
  }

  const publicUrl = (blank(env.PUBLIC_URL) ?? 'http://localhost:5173').replace(/\/$/, '');
  if (!/^https?:\/\//.test(publicUrl)) problems.push('PUBLIC_URL must start with http:// or https://');

  // Blank counts as unset, so a compose file can pass the variables through untouched.
  const seedDemo = blank(env.SEED_DEMO) === undefined ? !production : on(env.SEED_DEMO);
  // Moving trucks on fake GPS only makes sense on demo data; real trucks report their own position.
  const simulate = blank(env.SIMULATE) === undefined ? seedDemo : on(env.SIMULATE);

  const adminPassword = blank(env.ADMIN_PASSWORD);
  if (adminPassword && adminPassword.length < 8) problems.push('ADMIN_PASSWORD must be at least 8 characters');
  if (production && adminPassword && PLACEHOLDER.test(adminPassword)) problems.push('ADMIN_PASSWORD is still the example value; choose a real password');
  const adminEmail = blank(env.ADMIN_EMAIL)?.toLowerCase();
  if (adminEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) problems.push('ADMIN_EMAIL is not a valid email address');

  const cors = blank(env.CORS_ORIGIN);
  const config: Config = {
    production,
    port: Number(env.PORT ?? 4000),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl,
    jwtSecret,
    publicUrl,
    // Same-origin by default in production (the frontend's nginx proxies /api); any origin in development.
    corsOrigin: cors ? cors.split(',').map((s) => s.trim()) : production ? [new URL(publicUrl).origin] : true,
    homeOrgSlug: blank(env.PUBLIC_ORG_SLUG),
    allowCompanySignup: on(env.ALLOW_COMPANY_SIGNUP),
    trustProxy: blank(env.TRUST_PROXY),
    seedDemo,
    simulate,
    logRequests: env.LOG !== '0',
    bootstrap: {
      companyName: blank(env.COMPANY_NAME) ?? 'Suraj Logistic',
      adminName: blank(env.ADMIN_NAME) ?? 'Owner',
      adminEmail,
      adminPassword,
      adminPhone: blank(env.ADMIN_PHONE)?.replace(/\D/g, '').slice(-10),
      companyPhone: blank(env.COMPANY_PHONE),
      companyCity: blank(env.COMPANY_CITY),
      companyAddress: blank(env.COMPANY_ADDRESS),
      companyGstin: blank(env.COMPANY_GSTIN)?.toUpperCase(),
    },
  };
  return { config, problems };
}
