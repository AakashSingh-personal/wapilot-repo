import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

export default function Settings() {
  const [businessName, setBusinessName] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [servicesJson, setServicesJson] = useState('[]');
  const [workingHours, setWorkingHours] = useState('{}');
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true);
  const [upiId, setUpiId] = useState('');
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/config');
        if (cancelled) return;
        setBusinessName(data.business?.name || '');
        setPhoneNumberId(data.business?.phoneNumberId || '');
        setServicesJson(JSON.stringify(data.config?.services ?? [], null, 2));
        setWorkingHours(
          typeof data.config?.workingHours === 'string'
            ? data.config.workingHours
            : JSON.stringify(data.config?.workingHours ?? { slots: ['3 PM', '5 PM'] }, null, 2),
        );
        setAutoReplyEnabled(Boolean(data.config?.autoReplyEnabled));
        setUpiId(data.config?.upiId || '');
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.error || 'Failed to load config');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(e) {
    e.preventDefault();
    setError('');
    setSaved('');
    let services;
    let wh = workingHours;
    try {
      services = JSON.parse(servicesJson);
    } catch {
      setError('Services must be valid JSON');
      return;
    }
    try {
      const parsed = JSON.parse(workingHours);
      wh = JSON.stringify(parsed);
    } catch {
      setError('Working hours must be valid JSON (e.g. {"slots":["3 PM","5 PM"]})');
      return;
    }

    try {
      await api.put('/config', {
        businessName,
        phoneNumberId: phoneNumberId || null,
        services,
        workingHours: wh,
        autoReplyEnabled,
        upiId: upiId || null,
      });
      setSaved('Saved successfully.');
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Link Meta phone number id, tune services, and add your business UPI for customer payments.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm px-3 py-2">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-lg bg-brand-50 dark:bg-brand-900/30 text-brand-900 dark:text-brand-100 text-sm px-3 py-2">
          {saved}
        </div>
      )}

      <form onSubmit={save} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Business name</label>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            WhatsApp Phone Number ID (Meta)
          </label>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="Matches webhook metadata.phone_number_id"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Services (JSON array)
          </label>
          <textarea
            rows={6}
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono"
            value={servicesJson}
            onChange={(e) => setServicesJson(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Working hours / slots (JSON)
          </label>
          <textarea
            rows={4}
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono"
            value={workingHours}
            onChange={(e) => setWorkingHours(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="auto"
            type="checkbox"
            checked={autoReplyEnabled}
            onChange={(e) => setAutoReplyEnabled(e.target.checked)}
          />
          <label htmlFor="auto" className="text-sm text-slate-700 dark:text-slate-300">
            Auto-reply enabled on WhatsApp
          </label>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Business UPI ID (customer payments)
          </label>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
            placeholder="salon@paytm"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2.5 text-sm"
        >
          Save settings
        </button>
      </form>
    </div>
  );
}
