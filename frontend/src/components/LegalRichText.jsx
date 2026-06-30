import { Link } from 'react-router-dom';

const TOKEN_RE = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g;
const LINK_RE = /^\[([^\]]+)\]\(([^)]+)\)$/;
const BOLD_RE = /^\*\*([^*]+)\*\*$/;
const linkClass = 'text-brand-600 hover:text-brand-700 dark:text-brand-400';

function renderToken(token, key) {
  const linkMatch = token.match(LINK_RE);
  if (linkMatch) {
    const [, label, href] = linkMatch;
    if (href.startsWith('/') && !href.startsWith('//')) {
      return (
        <Link key={key} to={href} className={linkClass}>
          {label}
        </Link>
      );
    }
    return (
      <a
        key={key}
        href={href}
        className={linkClass}
        rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
        target={href.startsWith('http') ? '_blank' : undefined}
      >
        {label}
      </a>
    );
  }

  const boldMatch = token.match(BOLD_RE);
  if (boldMatch) {
    return (
      <strong key={key} className="font-semibold text-slate-800 dark:text-slate-100">
        {boldMatch[1]}
      </strong>
    );
  }

  return token;
}

function renderInlineText(text, keyPrefix) {
  const parts = String(text || '').split(TOKEN_RE).filter((part) => part.length > 0);
  if (!parts.length) return text;

  return parts.map((part, index) => {
    if (part.match(LINK_RE) || part.match(BOLD_RE)) {
      return renderToken(part, `${keyPrefix}-${index}`);
    }
    return part;
  });
}

export function LegalRichText({ children }) {
  return <>{renderInlineText(children, 'rich')}</>;
}

export function LegalSectionContent({ section }) {
  return (
    <>
      {section.paragraphs?.map((paragraph, index) => (
        <p key={`p-${index}`}>
          <LegalRichText>{paragraph}</LegalRichText>
        </p>
      ))}
      {section.listItems?.length > 0 && (
        <ul className="list-disc pl-6 space-y-2">
          {section.listItems.map((item, index) => (
            <li key={`li-${index}`}>
              <LegalRichText>{item}</LegalRichText>
            </li>
          ))}
        </ul>
      )}
      {section.trailingParagraphs?.map((paragraph, index) => (
        <p key={`tp-${index}`}>
          <LegalRichText>{paragraph}</LegalRichText>
        </p>
      ))}
    </>
  );
}
