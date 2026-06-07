import { useEffect, useState } from 'react';
import {
  Building2, Phone, User, HeadphonesIcon, Sparkles,
  Wrench, Clock, Bell, CreditCard, Save, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { api } from '../services/api.js';
import UserManagement from './UserManagement.jsx';
import { Card } from '../components/ui/Card.jsx';
import { PageHeader } from '../components/ui/PageHeader.jsx';
import { Tabs } from '../components/ui/Tabs.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Textarea } from '../components/ui/Textarea.jsx';
import { Toggle } from '../components/ui/Toggle.jsx';
import { Button } from '../components/ui/Button.jsx';

/* ─── Settings page ──────────────────────────────────────────────────────── */
export default function Settings() {
  const [activeTab, setActiveTab] = useState('general');
  const [businessName, setBusinessName] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [clientDetails, setClientDetails] = useState('');
  const [clientProfile, setClientProfile] = useState({
    business_name: '',
    business_phone: '',
    business_owner_name: '',
    business_support_number: '',
  });
  const [workingHours, setWorkingHours] = useState('{}');
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true);
  const [upiId, setUpiId] = useState('');
  const [saving, setSaving] = useState(false);
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
        setClientDetails(data.config?.clientDetails || '');
        setClientProfile({
          business_name: data.config?.clientProfile?.business_name || '',
          business_phone: data.config?.clientProfile?.business_phone || '',
          business_owner_name: data.config?.clientProfile?.business_owner_name || '',
          business_support_number: data.config?.clientProfile?.business_support_number || '',
        });
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
    return () => { cancelled = true; };
  }, []);

  async function save(e) {
    e.preventDefault();
    setError(''); setSaved('');
    let wh = workingHours;
    try {
      wh = JSON.stringify(JSON.parse(workingHours));
    } catch {
      setError('Working hours must be valid JSON (e.g. {"slots":["3 PM","5 PM"]})');
      return;
    }

    setSaving(true);
    try {
      await api.put('/config', {
        businessName,
        phoneNumberId: phoneNumberId || null,
        clientDetails: clientDetails || '',
        clientProfile: {
          business_name: clientProfile.business_name?.trim() || '',
          business_phone: clientProfile.business_phone?.trim() || '',
          business_owner_name: clientProfile.business_owner_name?.trim() || '',
          business_support_number: clientProfile.business_support_number?.trim() || '',
        },
        workingHours: wh,
        autoReplyEnabled,
        upiId: upiId || null,
      });
      setSaved('Settings saved successfully.');
      setTimeout(() => setSaved(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const tabs = [
    { value: 'general', label: 'General' },
    { value: 'users',   label: 'User Management' },
  ];

  return (
    <div className="space-y-5 max-w-4xl">
      <PageHeader title="Settings" subtitle="Configure your business profile, AI context, and team" />

      <Tabs value={activeTab} onChange={setActiveTab} items={tabs} />

      {activeTab === 'users' && <UserManagement embedded />}

      {activeTab === 'general' && (
        <form onSubmit={save} className="space-y-5">
          {error && (
            <div className="flex items-start gap-2.5 rounded-lg bg-error-50 dark:bg-error-950/40 border border-error-200 dark:border-error-800 text-error-700 dark:text-error-300 text-sm px-4 py-3">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          {saved && (
            <div className="flex items-center gap-2.5 rounded-lg bg-success-50 dark:bg-success-950/40 border border-success-200 dark:border-success-800 text-success-700 dark:text-success-400 text-sm px-4 py-3">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {saved}
            </div>
          )}

          {/* Business identity */}
          <Card>
            <Card.Header
              title="Business identity"
              subtitle="Core details used across the platform"
            />
            <Card.Body className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <Input
                  label="Business name"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  prefix={<Building2 className="w-4 h-4" />}
                />
                <Input
                  label="WhatsApp Phone Number ID (Meta)"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  placeholder="Matches webhook metadata"
                  prefix={<Phone className="w-4 h-4" />}
                  className="font-mono"
                />
              </div>
            </Card.Body>
          </Card>

          {/* Client profile */}
          <Card>
            <Card.Header
              title="Client profile"
              subtitle="Used in template variables like {{business_name}}, {{business_phone}}"
            />
            <Card.Body>
              <div className="grid sm:grid-cols-2 gap-4">
                <Input
                  label="Display business name"
                  value={clientProfile.business_name}
                  onChange={(e) => setClientProfile(p => ({ ...p, business_name: e.target.value }))}
                  placeholder="e.g. GlowCraft Salon"
                  prefix={<Building2 className="w-4 h-4" />}
                />
                <Input
                  label="Display business phone"
                  value={clientProfile.business_phone}
                  onChange={(e) => setClientProfile(p => ({ ...p, business_phone: e.target.value }))}
                  placeholder="+91…"
                  prefix={<Phone className="w-4 h-4" />}
                />
                <Input
                  label="Owner / public name"
                  value={clientProfile.business_owner_name}
                  onChange={(e) => setClientProfile(p => ({ ...p, business_owner_name: e.target.value }))}
                  placeholder="Name customers see"
                  prefix={<User className="w-4 h-4" />}
                />
                <Input
                  label="Support number"
                  value={clientProfile.business_support_number}
                  onChange={(e) => setClientProfile(p => ({ ...p, business_support_number: e.target.value }))}
                  placeholder="Support WhatsApp or phone"
                  prefix={<HeadphonesIcon className="w-4 h-4" />}
                />
              </div>
            </Card.Body>
          </Card>

          {/* AI context */}
          <Card>
            <Card.Header
              title="AI context"
              subtitle="Business details, tone, policies, and FAQs for the AI to reference"
            />
            <Card.Body>
              <Textarea
                rows={6}
                value={clientDetails}
                onChange={(e) => setClientDetails(e.target.value)}
                placeholder="Example: We are Glow Clinic in Jaipur. Friendly tone. 10am-8pm Mon–Sat. No refunds after 24 hours."
              />
            </Card.Body>
          </Card>

          {/* Operations */}
          <Card>
            <Card.Header title="Operations" />
            <Card.Body className="space-y-5">
              <Textarea
                label="Working hours / slots (JSON)"
                rows={4}
                value={workingHours}
                onChange={(e) => setWorkingHours(e.target.value)}
                className="font-mono text-xs"
                helper='Example: {"slots":["10 AM","12 PM","3 PM","5 PM"]}'
              />
              <Toggle
                checked={autoReplyEnabled}
                onChange={(e) => setAutoReplyEnabled(e.target.checked)}
                label="Auto-reply enabled on WhatsApp"
              />
              <Input
                label="Business UPI ID"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="salon@paytm"
                helper="Used for customer payment collections"
                prefix={<CreditCard className="w-4 h-4" />}
              />
            </Card.Body>
          </Card>

          <div className="flex justify-end">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={saving}
              iconLeft={<Save className="w-4 h-4" />}
            >
              Save settings
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
