import { useId } from 'react';

/*
  The Surajlogistic mark: the sun (suraj) with arrows leaving it in all eight directions,
  which is the line under the name: to every direction. The arrows take the colour of the
  text around them (white on dark, ink on paper); the north-east arrow is always orange.
  Below 22 px the arrowheads drop and the rays get heavier, so it still reads in a browser tab.
*/

const RAYS =
  'M24 9.8V2.8M21.78 5.64L24 2.8L26.22 5.64' +
  'M38.2 24H45.2M42.36 21.78L45.2 24L42.36 26.22' +
  'M34.04 34.04L38.99 38.99M38.55 35.42L38.99 38.99L35.42 38.55' +
  'M24 38.2V45.2M26.22 42.36L24 45.2L21.78 42.36' +
  'M13.96 34.04L9.01 38.99M12.58 38.55L9.01 38.99L9.45 35.42' +
  'M9.8 24H2.8M5.64 26.22L2.8 24L5.64 21.78' +
  'M13.96 13.96L9.01 9.01M9.45 12.58L9.01 9.01L12.58 9.45';
const NORTH_EAST = 'M34.04 13.96L38.99 9.01M35.42 9.45L38.99 9.01L38.55 12.58';

const SMALL_RAYS = 'M24 8V3M24 40V45M8 24H3M40 24H45M12.7 12.7L9.2 9.2M35.3 35.3L38.8 38.8M12.7 35.3L9.2 38.8';
const SMALL_NORTH_EAST = 'M35.3 12.7L38.8 9.2';

export const BRAND = { name: 'Surajlogistic', line: 'To every direction', orange: '#ff8a1f' } as const;

/** The mark on its own. Arrows follow the text colour, so it sits on dark and light grounds alike. */
export function Mark({ size = 24, title }: { size?: number; title?: string }) {
  const id = useId().replace(/:/g, '');
  const small = size < 22;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title} className="shrink-0">
      <defs>
        <radialGradient id={`sun-${id}`} cx="0.38" cy="0.32" r="0.8">
          <stop offset="0" stopColor="#ffd66b" />
          <stop offset="0.6" stopColor="#ff8a1f" />
          <stop offset="1" stopColor="#f2541b" />
        </radialGradient>
      </defs>
      {small ? (
        <>
          <circle cx="24" cy="24" r="11.5" fill={`url(#sun-${id})`} />
          <path d={SMALL_RAYS} stroke="currentColor" strokeWidth="4" strokeLinecap="round" fill="none" />
          <path d={SMALL_NORTH_EAST} stroke="#ff8a1f" strokeWidth="4" strokeLinecap="round" fill="none" />
        </>
      ) : (
        <>
          <circle cx="24" cy="24" r="10" fill={`url(#sun-${id})`} />
          <path d={RAYS} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d={NORTH_EAST} stroke="#ff8a1f" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      )}
    </svg>
  );
}

/** The name, one word, semibold and tight. */
export function Wordmark({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <span className={`leading-none font-[600] whitespace-nowrap ${className}`} style={{ fontSize: size, letterSpacing: '-0.035em' }}>
      {BRAND.name}
    </span>
  );
}

/** Mark and name together, optionally with the line under the name. */
export function Brand({ tone = 'ink', small, size, line }: { tone?: 'ink' | 'white'; small?: boolean; size?: number; line?: boolean }) {
  const s = size ?? (small ? 17 : 20);
  return (
    <span className={`inline-flex items-center gap-2 ${tone === 'white' ? 'text-white' : 'text-ink'}`}>
      <Mark size={Math.round(s * (line ? 2 : 1.45))} />
      {line ? (
        <span className="flex flex-col gap-1">
          <Wordmark size={s} />
          <span className="leading-none font-[500] opacity-60" style={{ fontSize: Math.max(11, Math.round(s * 0.56)) }}>
            {BRAND.line}
          </span>
        </span>
      ) : (
        <Wordmark size={s} />
      )}
    </span>
  );
}

/** App icon: the mark on a near-black tile, for home screens and the browser tab. */
export function AppIcon({ size = 40 }: { size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-[22%] bg-[#0b0d12] text-white" style={{ width: size, height: size }}>
      <Mark size={Math.round(size * 0.8)} />
    </span>
  );
}
