import { memo, useMemo } from 'react';
import { tokenize, type Token } from './highlight';

const CLASS: Record<Token['kind'], string> = {
  kw: 'tok-kw',
  str: 'tok-str',
  num: 'tok-num',
  com: 'tok-com',
  fn: 'tok-fn',
  punc: 'tok-punc',
  op: 'tok-op',
  txt: '',
};

export const Highlighted = memo(function Highlighted({
  source,
  lang,
}: {
  source: string;
  lang?: string;
}) {
  const tokens = useMemo(() => tokenize(source, lang), [source, lang]);
  return (
    <>
      {tokens.map((t, i) =>
        t.kind === 'txt' ? (
          <span key={i}>{t.text}</span>
        ) : (
          <span key={i} className={CLASS[t.kind]}>
            {t.text}
          </span>
        ),
      )}
    </>
  );
});

export function Code({
  source,
  lang,
  className = '',
  highlightLines,
  onLineClick,
}: {
  source: string;
  lang?: string;
  className?: string;
  highlightLines?: number[];
  onLineClick?: (line: number) => void;
}) {
  // Line-addressable mode is what spot-the-bug exercises click on.
  if (highlightLines || onLineClick) {
    const lines = source.split('\n');
    return (
      <div className={`codelines ${className}`}>
        {lines.map((line, idx) => {
          const n = idx + 1;
          const active = highlightLines?.includes(n);
          return (
            <div
              key={n}
              className={`codelines__row${active ? ' is-marked' : ''}${onLineClick ? ' is-clickable' : ''}`}
              onClick={onLineClick ? () => onLineClick(n) : undefined}
              role={onLineClick ? 'button' : undefined}
              tabIndex={onLineClick ? 0 : undefined}
              onKeyDown={
                onLineClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onLineClick(n);
                      }
                    }
                  : undefined
              }
            >
              <span className="codelines__no">{n}</span>
              <span className="codelines__code">
                <Highlighted source={line || ' '} lang={lang} />
              </span>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <pre className={`code ${className}`}>
      <Highlighted source={source} lang={lang} />
    </pre>
  );
}

export function InlineCode({ children }: { children: string }) {
  return <code className="code--inline">{children}</code>;
}
