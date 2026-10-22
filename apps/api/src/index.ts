import { buildApp } from './app';
import { openDatabase } from './db/client';
import { seedDemo } from './seed';
import { startSimulator } from './simulator';

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';
const jwtSecret = process.env.JWT_SECRET ?? 'dev-only-secret-change-me-dev-only-secret';
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  console.error('JWT_SECRET must be set to at least 32 characters in production');
  process.exit(1);
}

const database = await openDatabase();
if (process.env.SEED_DEMO !== '0') {
  const res = await seedDemo(database.db);
  if (res.seeded) console.log('Demo company "Suraj Logistic" created — log in as admin@surajlogistic.in / demo1234');
}

const app = await buildApp({
  db: database.db,
  jwtSecret,
  logger: process.env.LOG !== '0',
  corsOrigin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
  publicUrl: process.env.PUBLIC_URL ?? 'http://localhost:5173',
});

const stopSim = process.env.SIMULATE === '0' ? () => {} : startSimulator(app);

const shutdown = async () => {
  stopSim();
  await app.close();
  await database.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port, host });
console.log(`SurajLogistic API on http://localhost:${port} (database: ${database.kind})`);
