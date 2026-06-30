import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MessageSquare, Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { loginRequest, useAuth } from '../context/AuthContext.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';

export default function Login() {
  const navigate = useNavigate();
  const { loginState } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await loginRequest({ email, password });
      loginState(data);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-neutral-50 dark:bg-neutral-950">
      {/* Left panel — branding (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-1/2 flex-col justify-between p-12 bg-brand-600 dark:bg-brand-700 relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-64 h-64 rounded-full bg-white/30 blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full bg-white/20 blur-3xl" />
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white">WaPilot</span>
        </div>

        <div className="relative z-10 space-y-4">
          <h2 className="text-3xl font-bold text-white leading-tight">
            Your WhatsApp-first business platform
          </h2>
          <p className="text-brand-100 text-base leading-relaxed max-w-sm">
            Manage conversations, schedule appointments, run campaigns, and collect payments — all from one dashboard.
          </p>

          <div className="flex flex-col gap-3 mt-8">
            {[
              'Multi-tenant CRM with AI-powered replies',
              'Appointment scheduling with staff management',
              'WhatsApp campaign broadcasts',
            ].map((feat) => (
              <div key={feat} className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-brand-100 text-sm">{feat}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-brand-200 text-xs">
          © {new Date().getFullYear()} WaPilot. All rights reserved.
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-xl bg-brand-600 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-neutral-900 dark:text-neutral-50">WaPilot</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
              Welcome back
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-500 mt-1">
              Sign in to your workspace to continue
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 rounded-lg bg-error-50 dark:bg-error-950/40 border border-error-200 dark:border-error-800 text-error-700 dark:text-error-300 text-sm px-3.5 py-3 mb-6">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <Input
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              prefix={<Mail className="w-4 h-4" />}
              required
              autoComplete="email"
              autoFocus
            />

            <Input
              label="Password"
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              prefix={<Lock className="w-4 h-4" />}
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
              required
              autoComplete="current-password"
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full mt-2"
            >
              Sign in
            </Button>
          </form>

          <p className="text-center text-sm text-neutral-500 mt-6">
            Need access?{' '}
            <Link
              to="/contact"
              className="font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 transition-colors"
            >
              Contact sales
            </Link>
          </p>

          <p className="text-center text-xs text-neutral-400 dark:text-neutral-500 mt-4">
            <Link to="/privacy-policy" className="hover:text-brand-600 dark:hover:text-brand-400">
              Privacy Policy
            </Link>
            <span className="mx-2">·</span>
            <Link to="/terms-of-service" className="hover:text-brand-600 dark:hover:text-brand-400">
              Terms of Service
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
