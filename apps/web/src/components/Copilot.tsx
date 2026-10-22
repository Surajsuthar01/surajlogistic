import { COPILOT_SUGGESTIONS, type CopilotAnswer } from '@suraj/core';
import { Send, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorText } from '../lib/api';
import { inr } from '../lib/format';
import { Button } from './ui';

interface Msg {
  role: 'user' | 'bot';
  text: string;
  answer?: Omit<CopilotAnswer, 'facts'>;
}

export function CopilotDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'bot', text: 'Namaste! Ask me about your trucks, shipments, prices or money — in English or Hinglish. Try one of these:' },
  ]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [msgs]);
  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 50);
  }, [open]);

  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    setMsgs((m) => [...m, { role: 'user', text: q }]);
    setText('');
    setBusy(true);
    try {
      const a = await api.post<Omit<CopilotAnswer, 'facts'>>('/api/copilot', { message: q });
      setMsgs((m) => [...m, { role: 'bot', text: a.text, answer: a }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'bot', text: errorText(e) }]);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  const last = msgs[msgs.length - 1];
  const chips = last?.role === 'bot' ? (last.answer?.suggestions ?? COPILOT_SUGGESTIONS.slice(0, 5)) : [];

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[440px] flex-col border-l border-line bg-panel" style={{ boxShadow: 'var(--shadow)', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)' }} aria-label="Suraj Copilot">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft text-accent-ink">
            <Sparkles size={17} />
          </span>
          <div>
            <h2 className="text-[17px] font-semibold">Suraj Copilot</h2>
            <p className="text-[12.5px] text-muted">Answers from your live data</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close copilot">
          <X size={18} />
        </Button>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
            <div className={`max-w-[92%] rounded-[14px] px-3.5 py-2.5 text-[14.5px] ${m.role === 'user' ? 'bg-ink text-panel' : 'bg-panel-2'}`}>
              <p>{m.text}</p>
              {m.answer?.table && (
                <div className="scroll-x mt-2 rounded-[10px] border border-line bg-panel">
                  <table className="data">
                    <thead>
                      <tr>{m.answer.table.columns.map((c) => <th key={c}>{c}</th>)}</tr>
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
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.answer.links.map((l) => (
                    <Link key={l.href} to={l.href} onClick={onClose} className="text-[13.5px] font-medium text-route underline underline-offset-2">
                      {l.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="text-[13.5px] text-muted">Checking your data…</p>}
        <div ref={end} />
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-line px-4 py-2.5">
          {chips.map((s) => (
            <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-line px-2.5 py-1 text-[13px] text-ink hover:bg-panel-2">
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(text);
        }}
      >
        <input
          ref={input}
          id="copilot-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Jaipur ke paas kaun se truck khali hain?"
          className="h-10 min-w-0 flex-1 rounded-[10px] border border-line bg-panel px-3 text-[14.5px] focus:border-route focus:outline-none"
        />
        <Button variant="primary" type="submit" disabled={busy || !text.trim()} aria-label="Ask">
          <Send size={16} />
        </Button>
      </form>
    </aside>
  );
}
