export default function Contact() {
  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl font-bold">Contact</h1>
      <p className="text-slate-600 dark:text-slate-300">
        Need support, sales help, or onboarding? Reach out and we will get back shortly.
      </p>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-2">
        <p>
          <span className="font-semibold">Email:</span> support@wapilot.in
        </p>
        <p>
          <span className="font-semibold">Phone:</span> +91 90000 00000
        </p>
        <p>
          <span className="font-semibold">Business hours:</span> Mon-Sat, 10:00 AM - 7:00 PM IST
        </p>
      </div>
    </div>
  );
}
