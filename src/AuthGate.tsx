import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, Cloud, LockKeyhole, ShieldCheck } from "lucide-react";
import { supabase } from "./lib/supabase";

export default function AuthGate({ onPreview }: { onPreview: () => void }) {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    try {
      const result = register
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
      setMessage(result.error?.message ?? (register ? "Check your email to confirm your account." : ""));
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Authentication could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-lockup"><span className="brand-icon"><Cloud size={22} /></span><span>cloud<span className="brand-accent">vault</span></span></div>
        <div className="auth-copy">
          <div className="eyebrow">SECURE CLOUD WORKSPACE</div>
          <h1>{supabase ? "Your files, thoughtfully protected." : "Your cloud workspace starts here."}</h1>
          <p>{supabase ? "Sign in to manage encrypted files, publish static sites, and monitor your cloud infrastructure." : "Connect Supabase, AWS S3, and CloudFront to unlock real cloud storage and publishing."}</p>
        </div>
        {supabase ? (
          <form className="auth-form" onSubmit={submit}>
            <label>Email address<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
            <label>Password<input type="password" required minLength={8} autoComplete={register ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>
            {message && <div className="inline-message">{message}</div>}
            <button className="button primary full" disabled={busy}>{busy ? "Please wait..." : register ? "Create account" : "Sign in"}<ArrowRight size={16} /></button>
            <p className="auth-switch">{register ? "Already have an account?" : "New to CloudVault?"} <button type="button" className="text-button" onClick={() => { setRegister(!register); setMessage(""); }}>{register ? "Sign in" : "Create an account"}</button></p>
          </form>
        ) : (
          <div className="setup-notice">
            <div className="setup-notice-icon"><LockKeyhole size={18} /></div>
            <div><strong>Configuration required</strong><p>Copy <code>.env.example</code> to <code>.env</code>, add your Supabase credentials, then restart the server. AWS operations stay unavailable until their credentials are set.</p></div>
          </div>
        )}
        {!supabase && <button className="button secondary full preview-button" onClick={onPreview}>Preview empty dashboard <ArrowRight size={16} /></button>}
        <div className="auth-foot"><ShieldCheck size={15} /> Credentials stay on your server. Encryption keys are never sent to the browser.</div>
      </section>
      <div className="auth-art">
        <div className="art-glow" />
        <div className="art-caption"><span>ILLUSTRATIVE WORKFLOW</span><p>One secure home for your files and the websites you publish.</p></div>
        <div className="floating-file"><div className="file-symbol">PDF</div><div><b>Example file</b><small>Encryption happens on the backend</small></div><ShieldCheck size={18} className="art-check" /></div>
        <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
      </div>
    </main>
  );
}
