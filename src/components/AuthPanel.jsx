import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, LockKeyhole, Mail, UserRound, X } from "lucide-react";

export default function AuthPanel({ mode: initialMode = "login", onClose, onSubmit, loading, error }) {
  const [mode, setMode] = useState(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [validationError, setValidationError] = useState("");
  const panelRef = useRef(null);

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const submit = (event) => {
    event.preventDefault();
    const name = form.name.trim();
    const email = form.email.trim();
    if (mode === "signup" && name.length < 2) {
      setValidationError("Enter your name (at least 2 characters).");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setValidationError("Enter a valid email address.");
      return;
    }
    if (form.password.length < 8) {
      setValidationError("Password must be at least 8 characters.");
      return;
    }
    if (mode === "signup" && form.password !== form.confirmPassword) {
      setValidationError("Passwords do not match.");
      return;
    }
    setValidationError("");
    onSubmit({ ...form, name, email, mode });
  };

  useEffect(() => {
    panelRef.current?.querySelector("input")?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="auth-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="auth-panel" ref={panelRef} role="dialog" aria-modal="true" aria-label="FoodScout account">
        <button className="auth-close" type="button" onClick={onClose} aria-label="Close authentication"><X size={20} /></button>
        <div className="auth-brand"><span className="auth-brand-mark">🍴</span><strong>food<span>scout</span></strong></div>
        <div className="auth-layout">
          <div className="auth-story">
            <p className="auth-eyebrow">YOUR TABLE AWAITS</p>
            <h2>Discover your next <em>craving.</em></h2>
            <p>Save favourite spots, pick up where you left off, and make every meal worth remembering.</p>
          </div>
          <form className="auth-form" onSubmit={submit}>
            <div className="auth-tabs">
              <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Login</button>
              <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Sign Up</button>
            </div>
            <h3>{mode === "login" ? "Welcome back" : "Create your account"}</h3>
            <p className="auth-subtitle">{mode === "login" ? "Continue your FoodScout journey." : "Keep your favourite discoveries close."}</p>
            {mode === "signup" && <label><UserRound size={17} /><input required value={form.name} onChange={update("name")} placeholder="Your name" autoComplete="name" /></label>}
            <label><Mail size={17} /><input required type="email" value={form.email} onChange={update("email")} placeholder="Email address" autoComplete="email" /></label>
            <label><LockKeyhole size={17} /><input required minLength={8} type={showPassword ? "text" : "password"} value={form.password} onChange={update("password")} placeholder="Password (8+ characters)" autoComplete={mode === "login" ? "current-password" : "new-password"} /><button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></label>
            {mode === "signup" && <label><LockKeyhole size={17} /><input required minLength={8} type={showPassword ? "text" : "password"} value={form.confirmPassword} onChange={update("confirmPassword")} placeholder="Confirm password" autoComplete="new-password" /></label>}
            {(validationError || error) && <p className="auth-error" role="alert">{validationError || error}</p>}
            <button className="auth-submit" type="submit" disabled={loading}>{loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}</button>
            <p className="auth-legal">Email and password only. No unsupported social login.</p>
          </form>
        </div>
      </section>
    </div>
  );
}
