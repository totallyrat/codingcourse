import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Highlighted } from './Code';

/**
 * A small code editor: a transparent textarea sitting exactly on top of a
 * highlighted <pre>. That is the standard trick for syntax highlighting
 * without pulling in a full editor — the browser keeps native caret handling,
 * selection, IME and undo, and we only have to keep the two layers aligned.
 *
 * What it adds beyond a plain textarea: line numbers, Tab that indents instead
 * of leaving the field, auto-indent that follows the previous line, bracket
 * and quote completion, and Ctrl+Enter to run.
 */
export function CodeEditor({
  value,
  onChange,
  lang,
  readOnly,
  onRun,
  minLines = 8,
  ariaLabel = 'Code editor',
}: {
  value: string;
  onChange: (next: string) => void;
  lang?: string;
  readOnly?: boolean;
  onRun?: () => void;
  minLines?: number;
  ariaLabel?: string;
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);

  const lineCount = Math.max(minLines, value.split('\n').length);

  // Keep the highlighted layer and the gutter scrolled with the textarea.
  const syncScroll = useCallback(() => {
    const area = areaRef.current;
    if (!area) return;
    if (preRef.current) {
      preRef.current.scrollTop = area.scrollTop;
      preRef.current.scrollLeft = area.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = area.scrollTop;
  }, []);

  useLayoutEffect(syncScroll, [value, syncScroll]);

  useEffect(() => {
    if (!onRun) return;
    const area = areaRef.current;
    if (!area) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        onRun();
      }
    };
    area.addEventListener('keydown', handler);
    return () => area.removeEventListener('keydown', handler);
  }, [onRun]);

  const replaceSelection = (text: string, caretOffset = text.length) => {
    const area = areaRef.current;
    if (!area) return;
    const { selectionStart: start, selectionEnd: end } = area;
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      area.selectionStart = area.selectionEnd = start + caretOffset;
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const area = areaRef.current;
    if (!area || readOnly) return;
    const { selectionStart: start, selectionEnd: end } = area;

    if (e.key === 'Tab') {
      e.preventDefault();
      if (start !== end) {
        // Indent or outdent every touched line.
        const from = value.lastIndexOf('\n', start - 1) + 1;
        const block = value.slice(from, end);
        const shifted = e.shiftKey
          ? block.replace(/^ {1,4}/gm, '')
          : block.replace(/^/gm, '    ');
        onChange(value.slice(0, from) + shifted + value.slice(end));
        requestAnimationFrame(() => {
          area.selectionStart = from;
          area.selectionEnd = from + shifted.length;
        });
        return;
      }
      if (e.shiftKey) {
        const from = value.lastIndexOf('\n', start - 1) + 1;
        const removed = /^ {1,4}/.exec(value.slice(from))?.[0].length ?? 0;
        if (removed) {
          onChange(value.slice(0, from) + value.slice(from + removed));
          requestAnimationFrame(() => {
            area.selectionStart = area.selectionEnd = Math.max(from, start - removed);
          });
        }
        return;
      }
      replaceSelection('    ');
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const currentLine = value.slice(lineStart, start);
      const indent = /^[ \t]*/.exec(currentLine)![0];
      // A line ending in a block opener earns one more level.
      const opensBlock = /[:{([]\s*$/.test(currentLine);
      const extra = opensBlock ? '    ' : '';
      replaceSelection(`\n${indent}${extra}`);
      return;
    }

    if (e.key === 'Backspace' && start === end) {
      const before = value.slice(0, start);
      const indentOnly = /(^|\n)([ ]+)$/.exec(before);
      if (indentOnly && indentOnly[2].length % 4 === 0 && indentOnly[2].length > 0) {
        e.preventDefault();
        onChange(value.slice(0, start - 4) + value.slice(start));
        requestAnimationFrame(() => {
          area.selectionStart = area.selectionEnd = start - 4;
        });
        return;
      }
    }

    const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
    if (pairs[e.key] && start === end) {
      const nextChar = value[start] ?? '';
      // Only auto-close when the caret is at a natural boundary, otherwise
      // typing a quote mid-word inserts junk.
      if (/^$|[\s)\]},;]/.test(nextChar)) {
        e.preventDefault();
        replaceSelection(e.key + pairs[e.key], 1);
        return;
      }
    }
    // Typing the closing character that is already there just steps over it.
    if ([')', ']', '}', '"', "'", '`'].includes(e.key) && start === end && value[start] === e.key) {
      e.preventDefault();
      requestAnimationFrame(() => {
        area.selectionStart = area.selectionEnd = start + 1;
      });
    }
  };

  return (
    <div className={`editor${focused ? ' is-focused' : ''}${readOnly ? ' is-readonly' : ''}`}>
      <div className="editor__gutter" ref={gutterRef} aria-hidden="true">
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i} className="editor__lineno">
            {i + 1}
          </div>
        ))}
      </div>
      <div className="editor__body">
        <pre className="editor__highlight" ref={preRef} aria-hidden="true">
          <Highlighted source={value + '\n'} lang={lang} />
        </pre>
        <textarea
          ref={areaRef}
          className="editor__input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          readOnly={readOnly}
          aria-label={ariaLabel}
          rows={lineCount}
          wrap="off"
        />
      </div>
    </div>
  );
}
