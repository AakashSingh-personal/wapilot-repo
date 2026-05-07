import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

function normalizeItems(input) {
  if (!Array.isArray(input)) return [];
  return input.map((item) => {
    if (item && typeof item === 'object') {
      return {
        name: item.name || item.title || '',
        price: item.price || '',
        description: item.description || item.details || '',
        imageUrl: item.imageUrl || item.image || '',
      };
    }
    return { name: String(item || ''), price: '', description: '', imageUrl: '' };
  });
}

function emptyItem() {
  return { name: '', price: '', description: '', imageUrl: '' };
}

function CatalogEditor({ title, items, onChange, addLabel }) {
  const [uploadingIndex, setUploadingIndex] = useState(-1);

  function updateAt(index, key, value) {
    const next = items.map((it, i) => (i === index ? { ...it, [key]: value } : it));
    onChange(next);
  }

  function removeAt(index) {
    onChange(items.filter((_, i) => i !== index));
  }

  function addOne() {
    onChange([...items, emptyItem()]);
  }

  function moveItem(index, direction) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const next = [...items];
    const current = next[index];
    next[index] = next[nextIndex];
    next[nextIndex] = current;
    onChange(next);
  }

  function duplicateAt(index) {
    const source = items[index];
    if (!source) return;
    const clone = { ...source };
    onChange([...items.slice(0, index + 1), clone, ...items.slice(index + 1)]);
  }

  async function uploadItemImage(index, file) {
    if (!file) return;
    setUploadingIndex(index);
    try {
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('File read failed'));
        reader.readAsDataURL(file);
      });
      const { data } = await api.post('/media/upload', {
        base64Data,
        mimeType: file.type || 'application/octet-stream',
        fileName: file.name,
      });
      updateAt(index, 'imageUrl', data.publicUrl || '');
    } catch {
      // Leave field unchanged on upload failure.
    } finally {
      setUploadingIndex(-1);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{title}</label>
        <button
          type="button"
          onClick={addOne}
          className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium"
        >
          {addLabel}
        </button>
      </div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div
            key={`${title}-${index}`}
            className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2"
          >
            <div className="grid sm:grid-cols-2 gap-2">
              <input
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                value={item.name}
                onChange={(e) => updateAt(index, 'name', e.target.value)}
                placeholder="Name"
              />
              <input
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                value={item.price}
                onChange={(e) => updateAt(index, 'price', e.target.value)}
                placeholder="Price (e.g. 499 or ₹499)"
              />
            </div>
            <textarea
              rows={2}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              value={item.description}
              onChange={(e) => updateAt(index, 'description', e.target.value)}
              placeholder="Short description"
            />
            <div className="space-y-2">
              <input
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                value={item.imageUrl || ''}
                onChange={(e) => updateAt(index, 'imageUrl', e.target.value)}
                placeholder="Image URL (optional)"
              />
              <div className="flex items-center gap-3 text-xs">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => uploadItemImage(index, e.target.files?.[0])}
                  className="text-xs"
                />
                {uploadingIndex === index && <span className="text-slate-500">Uploading image...</span>}
              </div>
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.name || `${title} image`}
                  className="h-20 w-20 rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                />
              ) : null}
            </div>
            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => moveItem(index, -1)}
                disabled={index === 0}
                className="font-medium text-slate-600 disabled:opacity-40 dark:text-slate-300"
              >
                Move up
              </button>
              <button
                type="button"
                onClick={() => moveItem(index, 1)}
                disabled={index === items.length - 1}
                className="font-medium text-slate-600 disabled:opacity-40 dark:text-slate-300"
              >
                Move down
              </button>
              <button
                type="button"
                onClick={() => duplicateAt(index)}
                className="font-medium text-brand-700 dark:text-brand-300"
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => removeAt(index)}
                className="font-medium text-red-600 dark:text-red-400"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      {!items.length && (
        <div className="text-xs text-slate-500 dark:text-slate-400">
          No items yet. Click “{addLabel}” to add.
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const [businessName, setBusinessName] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [services, setServices] = useState([]);
  const [products, setProducts] = useState([]);
  const [clientDetails, setClientDetails] = useState('');
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
        setServices(normalizeItems(data.config?.services ?? []));
        setProducts(normalizeItems(data.config?.products ?? []));
        setClientDetails(data.config?.clientDetails || '');
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
    let wh = workingHours;
    try {
      const parsed = JSON.parse(workingHours);
      wh = JSON.stringify(parsed);
    } catch {
      setError('Working hours must be valid JSON (e.g. {"slots":["3 PM","5 PM"]})');
      return;
    }

    const cleanServices = services
      .map((item) => ({
        name: item.name?.trim() || '',
        price: item.price?.trim() || '',
        description: item.description?.trim() || '',
        imageUrl: item.imageUrl?.trim() || '',
      }))
      .filter((item) => item.name || item.price || item.description || item.imageUrl);

    const cleanProducts = products
      .map((item) => ({
        name: item.name?.trim() || '',
        price: item.price?.trim() || '',
        description: item.description?.trim() || '',
        imageUrl: item.imageUrl?.trim() || '',
      }))
      .filter((item) => item.name || item.price || item.description || item.imageUrl);

    try {
      await api.put('/config', {
        businessName,
        phoneNumberId: phoneNumberId || null,
        services: cleanServices,
        products: cleanProducts,
        clientDetails: clientDetails || '',
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
          Add client profile details plus services/products so AI replies are specific to each business.
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
            Client details for AI (about business, tone, policies, FAQs)
          </label>
          <textarea
            rows={5}
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            value={clientDetails}
            onChange={(e) => setClientDetails(e.target.value)}
            placeholder="Example: We are Glow Clinic in Jaipur. Friendly tone. 10am-8pm support. No refunds after 24h."
          />
        </div>
        <div>
          <CatalogEditor
            title="Services"
            items={services}
            onChange={setServices}
            addLabel="Add Service"
          />
        </div>
        <div>
          <CatalogEditor
            title="Products"
            items={products}
            onChange={setProducts}
            addLabel="Add Product"
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
