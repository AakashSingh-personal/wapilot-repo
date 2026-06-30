import { useEffect, useState } from 'react';
import { ExternalLink, FileText, Plus, Save, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { Card } from './ui/Card.jsx';
import { Button } from './ui/Button.jsx';
import { Input } from './ui/Input.jsx';
import { Textarea } from './ui/Textarea.jsx';
import { Tabs } from './ui/Tabs.jsx';

const DOCUMENT_TABS = [
  { value: 'privacy-policy', label: 'Privacy Policy', path: '/privacy-policy' },
  { value: 'terms-of-service', label: 'Terms of Service', path: '/terms-of-service' },
  { value: 'refund-policy', label: 'Refund Policy', path: '/refund-policy' },
];

function emptySection() {
  return {
    title: '',
    paragraphs: [''],
    listItems: [],
    trailingParagraphs: [],
  };
}

function normalizeSection(section) {
  return {
    title: section?.title || '',
    paragraphs: section?.paragraphs?.length ? [...section.paragraphs] : [''],
    listItems: section?.listItems || [],
    trailingParagraphs: section?.trailingParagraphs || [],
  };
}

function linesToList(value) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function listToLines(items) {
  return (items || []).join('\n');
}

export default function LegalPagesAdmin() {
  const [slug, setSlug] = useState('privacy-policy');
  const [title, setTitle] = useState('');
  const [intro, setIntro] = useState('');
  const [sections, setSections] = useState([emptySection()]);
  const [published, setPublished] = useState(true);
  const [updatedAt, setUpdatedAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const activeTab = DOCUMENT_TABS.find((tab) => tab.value === slug);

  async function loadDocument(nextSlug) {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.get(`/admin/legal/${nextSlug}`);
      setTitle(data.title || '');
      setIntro(data.intro || '');
      setSections(
        data.sections?.length
          ? data.sections.map(normalizeSection)
          : [emptySection()],
      );
      setPublished(data.published !== false);
      setUpdatedAt(data.updatedAt || '');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load legal document');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDocument(slug);
  }, [slug]);

  function updateSection(index, patch) {
    setSections((current) => current.map((section, i) => (i === index ? { ...section, ...patch } : section)));
  }

  function updateParagraph(sectionIndex, paragraphIndex, value) {
    setSections((current) =>
      current.map((section, i) => {
        if (i !== sectionIndex) return section;
        const paragraphs = [...section.paragraphs];
        paragraphs[paragraphIndex] = value;
        return { ...section, paragraphs };
      }),
    );
  }

  function addParagraph(sectionIndex) {
    setSections((current) =>
      current.map((section, i) =>
        i === sectionIndex ? { ...section, paragraphs: [...section.paragraphs, ''] } : section,
      ),
    );
  }

  function removeParagraph(sectionIndex, paragraphIndex) {
    setSections((current) =>
      current.map((section, i) => {
        if (i !== sectionIndex) return section;
        const paragraphs = section.paragraphs.filter((_, idx) => idx !== paragraphIndex);
        return { ...section, paragraphs: paragraphs.length ? paragraphs : [''] };
      }),
    );
  }

  function addSection() {
    setSections((current) => [...current, emptySection()]);
  }

  function removeSection(index) {
    setSections((current) => {
      if (current.length === 1) return [emptySection()];
      return current.filter((_, i) => i !== index);
    });
  }

  async function saveDocument(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        title: title.trim(),
        intro: intro.trim(),
        published,
        sections: sections.map((section) => ({
          title: section.title.trim(),
          paragraphs: section.paragraphs.map((p) => p.trim()).filter(Boolean),
          listItems: section.listItems,
          trailingParagraphs: section.trailingParagraphs,
        })).filter((section) => section.title),
      };

      const { data } = await api.put(`/admin/legal/${slug}`, payload);
      setUpdatedAt(data.updatedAt || '');
      setMessage('Legal page saved successfully.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save legal document');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <Card.Header
          title="Legal pages"
          subtitle="Edit Privacy Policy, Terms of Service, and Refund Policy content stored in the database"
        />
        <Card.Body className="space-y-5">
          <Tabs
            value={slug}
            onChange={setSlug}
            items={DOCUMENT_TABS.map(({ value, label }) => ({ value, label }))}
          />

          {activeTab && (
            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="text-neutral-500">
                {updatedAt
                  ? `Last updated ${new Date(updatedAt).toLocaleString()}`
                  : 'Not saved yet'}
              </p>
              <Link
                to={activeTab.path}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                Preview page
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-error-200 dark:border-error-800 bg-error-50 dark:bg-error-950/30 px-4 py-3 text-sm text-error-700 dark:text-error-300">
              {error}
            </div>
          )}

          {message && (
            <div className="rounded-lg border border-success-200 dark:border-success-800 bg-success-50 dark:bg-success-950/30 px-4 py-3 text-sm text-success-700 dark:text-success-300">
              {message}
            </div>
          )}

          {loading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-10 rounded-lg bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-24 rounded-lg bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-40 rounded-lg bg-neutral-200 dark:bg-neutral-800" />
            </div>
          ) : (
            <form onSubmit={saveDocument} className="space-y-6">
              <Input
                label="Page title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                prefix={<FileText className="w-4 h-4" />}
              />

              <Textarea
                label="Introduction"
                value={intro}
                onChange={(e) => setIntro(e.target.value)}
                rows={4}
                helper="Shown below the page title on the public page."
              />

              <label className="inline-flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={published}
                  onChange={(e) => setPublished(e.target.checked)}
                  className="rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
                />
                Published on public site
              </label>

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Sections</h3>
                  <Button type="button" variant="ghost" size="sm" iconLeft={<Plus className="w-4 h-4" />} onClick={addSection}>
                    Add section
                  </Button>
                </div>

                {sections.map((section, sectionIndex) => (
                  <div
                    key={`section-${sectionIndex}`}
                    className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 space-y-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <Input
                          label={`Section ${sectionIndex + 1} title`}
                          value={section.title}
                          onChange={(e) => updateSection(sectionIndex, { title: e.target.value })}
                          required
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-7"
                        iconLeft={<Trash2 className="w-4 h-4" />}
                        onClick={() => removeSection(sectionIndex)}
                      >
                        Remove
                      </Button>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Paragraphs</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          iconLeft={<Plus className="w-4 h-4" />}
                          onClick={() => addParagraph(sectionIndex)}
                        >
                          Add paragraph
                        </Button>
                      </div>
                      {section.paragraphs.map((paragraph, paragraphIndex) => (
                        <div key={`paragraph-${sectionIndex}-${paragraphIndex}`} className="flex gap-2">
                          <Textarea
                            value={paragraph}
                            onChange={(e) => updateParagraph(sectionIndex, paragraphIndex, e.target.value)}
                            rows={3}
                            helper={
                              paragraphIndex === 0
                                ? 'Use [link text](/path) for internal links and [text](mailto:email) for email links. Use **bold** for emphasis.'
                                : undefined
                            }
                            containerClassName="flex-1"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="self-start mt-2"
                            iconLeft={<Trash2 className="w-4 h-4" />}
                            onClick={() => removeParagraph(sectionIndex, paragraphIndex)}
                          />
                        </div>
                      ))}
                    </div>

                    <Textarea
                      label="Bullet list items (optional)"
                      value={listToLines(section.listItems)}
                      onChange={(e) => updateSection(sectionIndex, { listItems: linesToList(e.target.value) })}
                      rows={4}
                      helper="One item per line. Shown between paragraphs and trailing paragraphs."
                    />

                    <Textarea
                      label="Trailing paragraphs (optional)"
                      value={listToLines(section.trailingParagraphs)}
                      onChange={(e) => updateSection(sectionIndex, { trailingParagraphs: linesToList(e.target.value) })}
                      rows={3}
                      helper="One paragraph per line. Shown after the bullet list."
                    />
                  </div>
                ))}
              </div>

              <Button type="submit" variant="primary" loading={saving} iconLeft={<Save className="w-4 h-4" />}>
                Save legal page
              </Button>
            </form>
          )}
        </Card.Body>
      </Card>
    </div>
  );
}
