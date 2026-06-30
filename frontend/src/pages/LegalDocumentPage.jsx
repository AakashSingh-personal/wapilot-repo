import { useEffect, useState } from 'react';
import axios from 'axios';
import LegalPage, { LegalSection } from '../components/LegalPage.jsx';
import { LegalSectionContent } from '../components/LegalRichText.jsx';

const baseURL = import.meta.env.VITE_API_URL ?? '';

function formatLastUpdated(value) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function LegalDocumentPage({ slug }) {
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const { data } = await axios.get(`${baseURL}/public/legal/${slug}`);
        if (!cancelled) setDocument(data);
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.error || 'Failed to load this page. Please try again later.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="max-w-3xl space-y-4 animate-pulse">
        <div className="h-9 w-64 rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="h-4 w-40 rounded bg-slate-200 dark:bg-slate-800" />
        <div className="space-y-3 pt-4">
          <div className="h-4 w-full rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-4 w-5/6 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-4 w-4/6 rounded bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="max-w-3xl rounded-2xl border border-error-200 dark:border-error-800 bg-error-50 dark:bg-error-950/30 p-6 text-error-700 dark:text-error-300">
        {error || 'This page is currently unavailable.'}
      </div>
    );
  }

  return (
    <LegalPage
      title={document.title}
      lastUpdated={formatLastUpdated(document.updatedAt)}
      intro={document.intro}
    >
      {document.sections.map((section) => (
        <LegalSection key={section.title} title={section.title}>
          <LegalSectionContent section={section} />
        </LegalSection>
      ))}
    </LegalPage>
  );
}
