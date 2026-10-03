import React from 'react';

interface FormattedTextProps {
  text?: string | null;
  className?: string;
}

/**
 * Parses inline markdown (*italic*, **bold**, `code`) into React elements
 * with formula-safe asterisk handling (multiplication * like in mM*TM or a*b is preserved).
 */
function renderInline(content: string): React.ReactNode {
  if (!content) return '';

  const parts: React.ReactNode[] = [];
  // Formula-safe regex:
  // 1. Code: `...`
  // 2. Bold: **...** or __...__
  // 3. Formula-safe Italic: *...* or _..._ only when flanked by word boundaries/spaces and not math operators
  const regex = /(`[^`\n]+`|\*\*[^*\n]+?\*\*|__[^_\n]+?__|(?<=^|[\s\(\[\{\"\',.;:!?])\*([a-zA-ZäöüÄÖÜß0-9][a-zA-ZäöüÄÖÜß0-9\s,.-]*?[a-zA-ZäöüÄÖÜß0-9]|[a-zA-ZäöüÄÖÜß0-9])\*(?=$|[\s\)\]\}\"\',.;:!?])|(?<=^|[\s\(\[\{\"\',.;:!?])_([a-zA-ZäöüÄÖÜß0-9][a-zA-ZäöüÄÖÜß0-9\s,.-]*?[a-zA-ZäöüÄÖÜß0-9]|[a-zA-ZäöüÄÖÜß0-9])_(?=$|[\s\)\]\}\"\',.;:!?]))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.substring(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith('`') && token.endsWith('`')) {
      const inner = token.slice(1, -1);
      parts.push(
        <code key={match.index} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 text-[0.9em] font-mono border border-slate-200/80">
          {inner}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      const inner = token.slice(2, -2);
      parts.push(
        <strong key={match.index} className="font-bold text-inherit">
          {inner}
        </strong>
      );
    } else if (token.startsWith('__') && token.endsWith('__')) {
      const inner = token.slice(2, -2);
      parts.push(
        <strong key={match.index} className="font-bold text-inherit">
          {inner}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      const inner = token.slice(1, -1);
      parts.push(
        <em key={match.index} className="italic text-inherit">
          {inner}
        </em>
      );
    } else if (token.startsWith('_') && token.endsWith('_')) {
      const inner = token.slice(1, -1);
      parts.push(
        <em key={match.index} className="italic text-inherit">
          {inner}
        </em>
      );
    } else {
      parts.push(token);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    parts.push(content.substring(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <React.Fragment>{parts}</React.Fragment>;
}

/**
 * Robust, cross-platform text renderer with Markdown support:
 * - Bold text (**fett** / __fett__)
 * - Italic text (*kursiv* / _kursiv_)
 * - Bullet lists (- Punkt / • Punkt / * Punkt)
 * - Numbered lists (1. Schritt / 2. Schritt)
 * - Paragraphs (\n\n) and line breaks (\n / <br/>)
 * - Inline formulas and code values (`code`)
 */
export function FormattedText({ text, className = '' }: FormattedTextProps) {
  if (text == null || text === '') return null;

  const raw = String(text);

  // Normalize all break variations to standard '\n'
  const normalized = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\\r\\n|\\n|\\r/g, '\n')
    .replace(/\r\n|\r/g, '\n');

  const lines = normalized.split('\n');

  // Check if content contains structured lists or headings
  const hasStructure = lines.some(l => {
    const t = l.trim();
    return (
      t.startsWith('• ') ||
      t.startsWith('- ') ||
      t.startsWith('* ') ||
      /^\d+[\.\)]\s/.test(t) ||
      t.startsWith('### ') ||
      t.startsWith('## ')
    );
  });

  if (!hasStructure) {
    // Standard line-by-line rendering with inline formatting and line break preservation
    return (
      <span
        className={`inline-block w-full break-words ${className}`}
        style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
        }}
      >
        {lines.map((line, index) => (
          <React.Fragment key={index}>
            {renderInline(line)}
            {index < lines.length - 1 && <br />}
          </React.Fragment>
        ))}
      </span>
    );
  }

  // Structured block rendering for lists, headings, and paragraphs
  const elements: React.ReactNode[] = [];
  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;

  const flushList = (keyPrefix: number) => {
    if (!currentList) return;
    if (currentList.type === 'ul') {
      elements.push(
        <ul key={`list-${keyPrefix}`} className="list-disc list-outside pl-5 my-1.5 space-y-1">
          {currentList.items.map((item, i) => (
            <li key={i} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
    } else {
      elements.push(
        <ol key={`list-${keyPrefix}`} className="list-decimal list-outside pl-5 my-1.5 space-y-1">
          {currentList.items.map((item, i) => (
            <li key={i} className="leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ol>
      );
    }
    currentList = null;
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Empty line / paragraph break
    if (!trimmed) {
      flushList(idx);
      elements.push(<div key={`gap-${idx}`} className="h-2" />);
      return;
    }

    // Unordered list item: '• ', '- ', '* '
    const bulletMatch = trimmed.match(/^([•\-\*])\s+(.+)$/);
    if (bulletMatch) {
      if (!currentList || currentList.type !== 'ul') {
        flushList(idx);
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(bulletMatch[2]);
      return;
    }

    // Ordered list item: '1. ', '1) '
    const numberMatch = trimmed.match(/^(\d+)[\.\)]\s+(.+)$/);
    if (numberMatch) {
      if (!currentList || currentList.type !== 'ol') {
        flushList(idx);
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(numberMatch[2]);
      return;
    }

    // Heading item: '### ' or '## '
    if (trimmed.startsWith('### ')) {
      flushList(idx);
      elements.push(
        <div key={`h3-${idx}`} className="font-bold text-sm text-slate-800 mt-2 mb-1">
          {renderInline(trimmed.slice(4))}
        </div>
      );
      return;
    }

    // Regular line
    flushList(idx);
    elements.push(
      <div key={`line-${idx}`} className="leading-relaxed">
        {renderInline(trimmed)}
      </div>
    );
  });

  flushList(lines.length);

  return (
    <div className={`w-full break-words text-left ${className}`}>
      {elements}
    </div>
  );
}

export default FormattedText;
