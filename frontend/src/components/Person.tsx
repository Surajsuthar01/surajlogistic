import type { Role } from '@suraj/shared';

export const ROLE_LABEL: Record<Role, string> = { admin: 'Owner', ops: 'Dispatcher', driver: 'Driver', customer: 'Customer', warehouse: 'Warehouse', partner: 'Truck owner' };

/** What each kind of login is for, in one line. */
export const ROLE_TEXT: Record<Role, string> = {
  admin: 'Runs the company account: every screen, logins, pricing and settings.',
  ops: 'Books and moves freight: shipments, trips, fleet, billing and the load board.',
  driver: 'Sees their own trip, updates status and takes proof of delivery.',
  customer: 'Books and tracks their own shipments and sees their invoices.',
  warehouse: 'Receives, stores and dispatches client stock.',
  partner: 'Owns trucks attached to the company: sees their trips, lorry hire and papers.',
};

export function initials(name: string) {
  return name
    .replace(/\(.*\)/, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function firstName(name: string) {
  return name.replace(/\(.*\)/, '').trim().split(/\s+/)[0] ?? name;
}

/** Round initials on the brand blue. */
export function Avatar({ name, size = 32, className = '' }: { name: string; size?: number; className?: string }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-[600] text-white ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.36, letterSpacing: '0.01em', background: 'linear-gradient(160deg, #5b93ff, #1f4fd0)', boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.3)' }}
    >
      {initials(name)}
    </span>
  );
}
