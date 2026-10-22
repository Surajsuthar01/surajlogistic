import { EventEmitter } from 'node:events';

export interface LiveEvent {
  orgId: string;
  type: 'shipment.status' | 'shipment.created' | 'trip.ping' | 'trip.status' | 'load.created' | 'load.bid' | 'load.booked' | 'stock.moved' | 'notification';
  payload: Record<string, unknown>;
  at: string;
}

/**
 * In-process event bus behind the live control tower (Server-Sent Events).
 * Swap for Redis pub/sub when running more than one API instance.
 */
export class Bus {
  private ee = new EventEmitter();
  constructor() {
    this.ee.setMaxListeners(1000);
  }
  emit(orgId: string, type: LiveEvent['type'], payload: Record<string, unknown>) {
    const ev: LiveEvent = { orgId, type, payload, at: new Date().toISOString() };
    this.ee.emit('event', ev);
    return ev;
  }
  subscribe(orgId: string, fn: (e: LiveEvent) => void) {
    const h = (e: LiveEvent) => e.orgId === orgId && fn(e);
    this.ee.on('event', h);
    return () => this.ee.off('event', h);
  }
}
