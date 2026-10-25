import { buildApp, parseTrustProxy } from './app';
import { ensureCompany } from './bootstrap';
import { loadConfig } from './config';
import { openDatabase, type Database } from './db/client';
import { seedDemo } from './seed';
import { startSimulator } from './simulator';

const { config, problems } = loadConfig();
if (problems.length) {
  console.error('The backend cannot start until these settings are fixed (see .env):');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

process.on('unhandledRejection', (err) => console.error('Unhandled promise rejection:', err));

/** PostgreSQL may still be starting when the backend container starts: wait for it, up to a minute. */
async function connect(): Promise<Database> {
  const RETRYABLE = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', '57P03']);
  for (let attempt = 1; ; attempt++) {
    try {
      return await openDatabase(config.databaseUrl);
    } catch (err) {
      const e = err as { code?: string; cause?: { code?: string }; message?: string };
      const code = e.code ?? e.cause?.code ?? '';
      if (!RETRYABLE.has(code) || attempt >= 30) {
        console.error('Could not open the database:', e.message ?? err);
        process.exit(1);
      }
      console.log(`Waiting for the database (${code}), attempt ${attempt} of 30`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

const database = await connect();

// A brand-new server: the company and its owner come from ADMIN_EMAIL / ADMIN_PASSWORD.
const boot = await ensureCompany(database.db, config.bootstrap, config.homeOrgSlug);
if (boot === 'created') console.log(`Created company "${config.bootstrap.companyName}". Owner login: ${config.bootstrap.adminEmail}`);

if (config.seedDemo) {
  const res = await seedDemo(database.db);
  if (res.seeded) console.log('Demo company "Suraj Logistic" created; log in as admin@surajlogistic.in / demo1234');
}
if (boot === 'missing' && !config.seedDemo) {
  console.warn('There is no company yet. Set ADMIN_EMAIL and ADMIN_PASSWORD (and COMPANY_NAME) in .env and restart, or run: npm run cli -- create-company');
}

const app = await buildApp({
  db: database.db,
  jwtSecret: config.jwtSecret,
  logger: config.logRequests,
  corsOrigin: config.corsOrigin,
  publicUrl: config.publicUrl,
  homeOrgSlug: config.homeOrgSlug,
  allowCompanySignup: config.allowCompanySignup,
  trustProxy: parseTrustProxy(config.trustProxy),
});

const stopSim = config.simulate ? startSimulator(app) : () => {};

let stopping = false;
const shutdown = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} received, finishing open requests`);
  stopSim();
  const force = setTimeout(() => process.exit(1), 10_000);
  await app.close().catch(() => undefined);
  await database.close().catch(() => undefined);
  clearTimeout(force);
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.port, host: config.host });
console.log(`Surajlogistic backend on port ${config.port} (database: ${database.kind}${config.production ? ', production' : ''}${config.simulate ? ', simulated GPS on' : ''})`);
