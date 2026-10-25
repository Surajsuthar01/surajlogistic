import { COPILOT_SUGGESTIONS, type CopilotAnswer } from '@suraj/shared';
import { ArrowUp, ArrowUpRight, Check, Clock3, Copy, IndianRupee, SquarePen, Sunrise, Truck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api, errorText } from '../lib/api';
import { useAuth } from '../lib/auth';
import { inr } from '../lib/format';
import { firstName } from './Person';

interface Msg {
  role: 'user' | 'bot';
  text: string;
  answer?: Omit<CopilotAnswer, 'facts'>;
  failed?: boolean;
}

/** Four ways in, shown before the first question. */
const STARTERS = [
  { icon: Sunrise, title: 'Today’s summary', sub: 'Aaj ka summary batao', q: 'Aaj ka summary batao' },
  { icon: Truck, title: 'Free trucks near Jaipur', sub: 'Which trucks are idle and where', q: 'Which trucks are idle near Jaipur?' },
  { icon: Clock3, title: 'What is running late', sub: 'Delayed shipments and trips', q: 'Delayed shipments' },
  { icon: IndianRupee, title: 'Price a full load', sub: 'Indore se Mumbai 5 ton ka bhada', q: 'Indore se Mumbai 5 ton ka bhada kitna?' },
];

function Orb({ size, thinking }: { size: number; thinking?: boolean }) {
  return <span aria-hidden="true" className={`orb inline-block shrink-0 ${thinking ? 'is-thinking' : ''}`} style={{ width: size, height: size }} />;
}

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/**
 * The copilot opens as its own window, like a chat app: a clean page with one question box,
 * answers from the company's own records, tables when numbers need a table.
 */
export function CopilotDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [msgs, busy]);
  useEffect(() => {
    if (!open) return;
    setTimeout(() => input.current?.focus(), 80);
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);

  const grow = () => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  };

  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    setMsgs((m) => [...m, { role: 'user', text: q.trim() }]);
    setText('');
    requestAnimationFrame(grow);
    setBusy(true);
    try {
      const a = await api.post<Omit<CopilotAnswer, 'facts'>>('/api/copilot', { message: q });
      setMsgs((m) => [...m, { role: 'bot', text: a.text, answer: a }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'bot', text: errorText(e), failed: true }]);
    } finally {
      setBusy(false);
      setTimeout(() => input.current?.focus(), 20);
    }
  };

  const copy = async (i: number, t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      setCopied(i);
      setTimeout(() => setCopied((c) => (c === i ? null : c)), 1500);
    } catch {
      /* the browser said no; nothing to do */
    }
  };

  if (!open) return null;
  const empty = msgs.length === 0;
  const first = user ? firstName(user.name) : '';
  const lastBot = [...msgs].reverse().find((m) => m.role === 'bot');
  const asked = new Set(msgs.filter((m) => m.role === 'user').map((m) => m.text.trim().toLowerCase()));
  const followUps = !busy && lastBot && !lastBot.failed ? [...(lastBot.answer?.suggestions ?? []), ...COPILOT_SUGGESTIONS].filter((x, i, all) => !asked.has(x.toLowerCase()) && all.indexOf(x) === i).slice(0, 4) : [];

  const composer = (
    <form
      className="rounded-[26px] border border-line-strong bg-sheet p-2 pl-4 transition-colors focus-within:border-accent"
      style={{ boxShadow: 'var(--shadow-sheet)' }}
      onSubmit={(e) => {
        e.preventDefault();
        void ask(text);
      }}
    >
      <textarea
        ref={input}
        id="copilot-input"
        rows={1}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          grow();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void ask(text);
          }
        }}
        placeholder={empty ? 'Ask about trucks, parcels or money' : 'Ask a follow-up'}
        aria-label="Ask the copilot"
        className="block max-h-[168px] min-h-11 w-full resize-none bg-transparent pt-2.5 pr-2 text-[16px] leading-relaxed placeholder:text-faint focus:outline-none"
      />
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="pl-0.5 font-display text-[12.5px] font-[560] text-faint">English or Hinglish</span>
        <button type="submit" disabled={busy || !text.trim()} aria-label="Ask" className="btn-primary grid h-9 w-9 shrink-0 place-items-center rounded-full transition-opacity disabled:opacity-30">
          <ArrowUp size={18} strokeWidth={2.2} />
        </button>
      </div>
    </form>
  );

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-center bg-black/55 backdrop-blur-[3px] sm:px-4 sm:py-[3vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside
        className="window-in relative flex h-full w-full flex-col overflow-hidden bg-ground sm:max-w-[880px] sm:rounded-[30px] sm:border sm:border-line"
        style={{ boxShadow: 'var(--shadow-pop)', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        aria-label="Suraj Copilot"
        role="dialog"
        aria-modal="true"
      >
        <header className="flex h-[60px] shrink-0 items-center justify-between gap-3 px-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Orb size={24} thinking={busy} />
            <h2 className="font-display text-[17px] leading-none font-[560]">Copilot</h2>
            <span className="ml-1 hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-display text-[12px] font-[560] text-muted sm:inline-flex">
              <span className="live-dot !h-1.5 !w-1.5 text-go" /> Live records
            </span>
          </div>
          <div className="flex items-center gap-1">
            {!empty && (
              <button
                type="button"
                onClick={() => {
                  setMsgs([]);
                  setText('');
                  setTimeout(() => input.current?.focus(), 20);
                }}
                className="flex h-9 items-center gap-2 rounded-full px-3 text-[14px] text-muted transition-colors hover:bg-[var(--hover)] hover:text-ink"
              >
                <SquarePen size={16} /> <span className="hidden sm:inline">New chat</span>
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="Close copilot" className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-[var(--hover)] hover:text-ink">
              <X size={19} />
            </button>
          </div>
        </header>

        {empty ? (
          <div className="flex flex-1 flex-col justify-center overflow-y-auto px-4 pb-8 sm:px-8">
            <div className="mx-auto w-full max-w-[680px]">
              <div className="rise flex flex-col items-center text-center">
                <Orb size={56} />
                <p className="eyebrow mt-6">
                  {greeting()}
                  {first ? `, ${first}` : ''}
                </p>
                <h3 className="mt-2 text-[clamp(26px,3.4vw,36px)] leading-[1.12] font-[600] tracking-[-0.025em]">What should we look at today?</h3>
                <p className="mt-3 max-w-[46ch] text-[15px] text-muted">Answers come from your own trucks, shipments and invoices, live. Ask the way you would ask your dispatcher.</p>
              </div>
              <div className="rise mt-8" style={{ animationDelay: '80ms' }}>
                {composer}
              </div>
              <div className="rise mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2" style={{ animationDelay: '140ms' }}>
                {STARTERS.map((s) => (
                  <button
                    key={s.q}
                    type="button"
                    onClick={() => ask(s.q)}
                    className="group flex items-start gap-3 rounded-[18px] border border-line bg-sheet p-3.5 text-left transition-colors hover:border-line-strong hover:bg-sheet-2"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-sign-soft text-sign">
                      <s.icon size={17} strokeWidth={1.9} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-[600]">{s.title}</span>
                      <span className="block truncate text-[13px] text-muted">{s.sub}</span>
                    </span>
                    <ArrowUpRight size={16} className="mt-0.5 shrink-0 text-faint transition-colors group-hover:text-ink" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 sm:px-8">
              <div className="mx-auto w-full max-w-[700px] space-y-7 py-6">
                {msgs.map((m, i) =>
                  m.role === 'user' ? (
                    <div key={i} className="pop-in flex justify-end">
                      <p className="max-w-[82%] rounded-[22px] rounded-br-[8px] bg-sheet-2 px-4 py-2.5 text-[15.5px] leading-relaxed whitespace-pre-line ring-1 ring-line">{m.text}</p>
                    </div>
                  ) : (
                    <div key={i} data-role="bot" className="pop-in flex gap-3.5">
                      <Orb size={26} />
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className={`text-[15.5px] leading-[1.7] whitespace-pre-line ${m.failed ? 'text-bad' : ''}`}>{m.text}</p>
                        {m.answer?.table && (
                          <div className="scroll-x mt-4 overflow-hidden rounded-[16px] border border-line bg-sheet">
                            <table className="data tight">
                              <thead>
                                <tr>
                                  {m.answer.table.columns.map((c) => (
                                    <th key={c}>{c}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {m.answer.table.rows.map((r, j) => (
                                  <tr key={j}>
                                    {r.map((cell, k) => (
                                      <td key={k} className="num whitespace-nowrap">
                                        {typeof cell === 'number' && m.answer!.table!.columns[k]!.includes('₹') ? inr(cell) : String(cell)}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {m.answer?.links && m.answer.links.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {m.answer.links.map((l) => (
                              <Link
                                key={l.href}
                                to={l.href}
                                onClick={onClose}
                                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong px-3.5 text-[13.5px] font-[560] transition-colors hover:border-ink"
                              >
                                {l.label} <ArrowUpRight size={14} />
                              </Link>
                            ))}
                          </div>
                        )}
                        {!m.failed && (
                          <div className="mt-2 flex items-center gap-1 text-faint">
                            <button type="button" onClick={() => copy(i, m.text)} aria-label="Copy answer" title="Copy" className="grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-[var(--hover)] hover:text-ink">
                              {copied === i ? <Check size={15} /> : <Copy size={15} />}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ),
                )}
                {busy && (
                  <div className="flex items-center gap-3.5">
                    <Orb size={26} thinking />
                    <span className="typing" aria-label="Thinking">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="text-[13.5px] text-faint">Reading your trips and shipments</span>
                  </div>
                )}
                {followUps.length > 0 && (
                  <div className="pl-[40px]">
                    <p className="eyebrow mb-2">Ask next</p>
                    <div className="flex flex-wrap gap-1.5">
                      {followUps.map((s) => (
                        <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-line bg-sheet px-3.5 py-1.5 text-[13.5px] text-muted transition-colors hover:border-line-strong hover:text-ink">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div ref={end} />
              </div>
            </div>
            <div className="shrink-0 px-4 pt-1 pb-3 sm:px-8 sm:pb-5">
              <div className="mx-auto w-full max-w-[700px]">
                {composer}
                <p className="mt-2 text-center text-[12px] text-faint">Copilot reads your company’s records. Check figures before you act on them.</p>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>,
    document.body,
  );
}
