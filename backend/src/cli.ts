/*
  Admin commands for the server, for when nobody can log in to do it from the app.

    npm run cli -- reset-password <email or mobile> <new password>
    npm run cli -- create-admin <email> <password> [name]
    npm run cli -- create-company "<company name>" <owner email> <owner password> [owner name]
    npm run cli -- list-admins

  With Docker:  docker compose exec backend npm run cli -- reset-password owner@example.com 'NewPassw0rd'
*/
import bcrypt from 'bcryptjs';
import { and, asc, eq } from 'drizzle-orm';
import { openDatabase } from './db/client';
import { organizations, users } from './db/schema';
import { createCompany } from './lib/company';

const [cmd, ...args] = process.argv.slice(2);
const usage = `Commands:
  reset-password <email or mobile> <new password>
  create-admin <email> <password> [name]
  create-company "<company name>" <owner email> <owner password> [owner name]
  list-admins`;

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const database = await openDatabase();
const { db } = database;

async function homeOrg() {
  const slug = process.env.PUBLIC_ORG_SLUG?.trim();
  const [org] = slug
    ? await db.select().from(organizations).where(eq(organizations.slug, slug))
    : await db.select().from(organizations).orderBy(asc(organizations.createdAt)).limit(1);
  if (!org) fail('There is no company yet. Run create-company first.');
  return org;
}

try {
  switch (cmd) {
    case 'reset-password': {
      const [who, pw] = args;
      if (!who || !pw) fail('Usage: reset-password <email or mobile> <new password>');
      if (pw.length < 8) fail('Use at least 8 characters.');
      const digits = who.replace(/\D/g, '');
      const rows = who.includes('@') ? await db.select().from(users).where(eq(users.email, who.toLowerCase())) : await db.select().from(users).where(eq(users.phone, digits.slice(-10)));
      if (!rows.length) fail(`No login found for ${who}.`);
      if (rows.length > 1) fail('More than one login uses this mobile number; use the email instead.');
      await db.update(users).set({ passwordHash: await bcrypt.hash(pw, 10), passwordChangedAt: new Date() }).where(eq(users.id, rows[0]!.id));
      console.log(`Password changed for ${rows[0]!.name} (${rows[0]!.email}). Their other logins are signed out.`);
      break;
    }
    case 'create-admin': {
      const [email, pw, ...name] = args;
      if (!email || !pw) fail('Usage: create-admin <email> <password> [name]');
      if (pw.length < 8) fail('Use at least 8 characters.');
      const org = await homeOrg();
      const exists = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase()));
      if (exists.length) fail('A login with this email already exists. Use reset-password instead.');
      await db.insert(users).values({ orgId: org.id, name: name.join(' ') || 'Owner', email: email.toLowerCase(), role: 'admin', passwordHash: await bcrypt.hash(pw, 10) });
      console.log(`Owner login ${email} added to ${org.name}.`);
      break;
    }
    case 'create-company': {
      const [company, email, pw, ...name] = args;
      if (!company || !email || !pw) fail('Usage: create-company "<company name>" <owner email> <owner password> [owner name]');
      if (pw.length < 8) fail('Use at least 8 characters.');
      const exists = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase()));
      if (exists.length) fail('A login with this email already exists.');
      const { org } = await createCompany(db, { orgName: company, slug: process.env.PUBLIC_ORG_SLUG?.trim() || undefined, owner: { name: name.join(' ') || 'Owner', email, password: pw } });
      console.log(`Company "${org.name}" created (slug ${org.slug}). Log in as ${email}.`);
      break;
    }
    case 'list-admins': {
      const org = await homeOrg();
      const rows = await db.select({ name: users.name, email: users.email, phone: users.phone }).from(users).where(and(eq(users.orgId, org.id), eq(users.role, 'admin')));
      console.log(`${org.name} owners:`);
      for (const r of rows) console.log(`  ${r.name}  ${r.email}${r.phone ? `  ${r.phone}` : ''}`);
      break;
    }
    default:
      console.log(usage);
      if (cmd && cmd !== 'help') process.exitCode = 1;
  }
} finally {
  await database.close();
}
