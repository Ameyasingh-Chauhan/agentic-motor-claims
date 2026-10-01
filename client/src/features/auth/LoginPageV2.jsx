import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { motion } from "motion/react";
import { ShieldCheck, CodeXml, UserRound, ChevronRight, Check, Circle } from "lucide-react";
import { BrandLogo } from "../../components/ui/BrandLogo";
import { Avatar } from "../../components/ui/Avatar";
import { useAuthStore } from "../../store/authStore";
import { toast } from "sonner";

const DEMOS = [
  { name: "Santosh Kute", password: "Admin@123", role: "Admin", icon: ShieldCheck },
  { name: "Ameya Chauhan", password: "0376", role: "Admin · Developer", icon: CodeXml },
  { name: "Rahul Sharma", password: "Pass@123", role: "Customer", icon: UserRound },
];
const AGENTS = ["Intake", "Document", "Verification", "Damage", "Fraud", "Adjudication", "Communication"];

function FlowLines() {
  return <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 800 900" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="login-flow-gradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#F97316"/><stop offset="1" stopColor="#1668DC"/></linearGradient><linearGradient id="login-flow-gradient-reverse" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#1668DC"/><stop offset="1" stopColor="#F97316"/></linearGradient><linearGradient id="login-flow-gradient-dark" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#FB8A3C"/><stop offset="1" stopColor="#4F9BFF"/></linearGradient><linearGradient id="login-flow-gradient-dark-reverse" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#4F9BFF"/><stop offset="1" stopColor="#FB8A3C"/></linearGradient><filter id="login-flow-glow"><feGaussianBlur stdDeviation="2"/></filter></defs>
    {[0, 1, 2, 3, 4, 5, 6].map((i) => { const d = `M${-80 + i * 40} ${80 + i * 120} C${240 + i * 30} ${20 + i * 80}, ${420 + i * 20} ${780 - i * 60}, 880 ${320 + i * 70}`; return <g key={i}><path className="login-flow-line" d={d}/><path className="login-flow-highlight" d={d} style={{ animationDelay: `${-i * 2}s` }}/></g>; })}
  </svg>;
}

function LiveClaimCard() {
  const [second, setSecond] = useState(false);
  const [step, setStep] = useState(AGENTS.length);
  useEffect(() => {
    const onVisibility = () => {};
    const interval = window.setInterval(() => { if (!document.hidden) setSecond((value) => !value); }, 9000);
    const tick = window.setInterval(() => { if (!document.hidden) setStep((value) => (value >= AGENTS.length ? 0 : value + 1)); }, 600);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { clearInterval(interval); clearInterval(tick); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);
  return <motion.div animate={{ y: [0, -4, 0, 4, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }} className="rounded-2xl bg-white p-5 text-text shadow-xl dark:bg-surface dark:shadow-none">
    <div className="font-mono text-xs text-text-muted">{second ? "ABC-MC-2026-000893" : "ABC-MC-2026-000892"}</div>
    <div className="mt-1 text-sm font-semibold">{second ? "Maruti Baleno · Basement scrape · Kochi" : "Hyundai Creta · MH 12 AB 1234"}</div>
    {!second && <div className="text-xs text-text-muted">Rear-end collision · Pune</div>}
    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">{AGENTS.map((agent, index) => <div key={agent} className="flex items-center gap-2 text-xs"><span className={index < step ? "text-success" : index === step ? "animate-pulse text-blue-600" : "text-text-subtle"}>{index < step ? <Check size={14}/> : <Circle size={10}/>}</span><span>{agent}</span></div>)}</div>
    <div className={`mt-4 rounded-lg px-3 py-2 text-xs font-semibold ${second ? "bg-warning-bg text-warning" : "bg-success-bg text-success"}`}>{second ? "Sent for review · garage quote 34% above estimate" : "Approved · ₹24,130 · processed in 38 s"}</div>
  </motion.div>;
}

export function LoginPage() {
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const setUser = useAuthStore((state) => state.setUser); const nav = useNavigate(); const [params] = useSearchParams();
  const stats = useMemo(() => ["7 AI agents", "< 60 s average decision", "Explainable fraud scoring"], []);
  async function submit(event, demo = false) {
    event?.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(demo ? "/api/auth/demo-login" : "/api/auth/login", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(demo ? { username: username.trim() } : { username, password }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.detail?.message || data.detail || "Invalid username or password");
      setUser(data.user); nav(params.get("next") || "/", { replace: true });
    } catch (cause) { if (cause instanceof TypeError) toast.error("Couldn't sign in — server not reachable"); else setError(cause.message); } finally { setBusy(false); }
  }
  async function quickLogin(demo) { setError(""); setUsername(""); setPassword(""); await new Promise((resolve) => setTimeout(resolve, 300)); setUsername(demo.name); setPassword(demo.password); await new Promise((resolve) => setTimeout(resolve, 300)); submit(null, true); }
  return <div className="min-h-screen bg-bg text-text"><div className="brand-accent-line"/><div className="grid min-h-screen lg:grid-cols-[45%_55%]"><section className="hidden bg-login-gradient p-10 text-white lg:flex lg:flex-col lg:justify-between"><div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col justify-center"><BrandLogo variant="onDark" imgClassName="h-9"/><h1 className="mt-10 text-4xl font-bold leading-tight">Motor claims, decided in minutes.</h1><p className="mt-5 text-base text-white/85">Seven AI agents verify vehicles through India's digital infrastructure, assess damage from photos, and score fraud with explainable evidence.</p><div className="mt-8"><LiveClaimCard/></div><div className="mt-5 flex flex-wrap gap-2">{stats.map((stat)=><span key={stat} className="rounded-full bg-white/12 px-3 py-1.5 text-xs text-white">{stat}</span>)}</div><p className="mt-4 text-xs text-white/70">Connected to Vahan · FASTag · IIB · Gemini</p></div><p className="mx-auto w-full max-w-[520px] text-sm text-white/70">© 2026 AutomationEdge · Demo for ABC General Insurance</p></section><main className="relative flex min-h-screen items-center justify-center overflow-hidden p-6 sm:p-10"><FlowLines/><div className="relative z-10 w-full max-w-[400px] rounded-2xl border border-border bg-surface p-8 shadow-lg dark:shadow-none"><BrandLogo className="mb-7 lg:hidden" imgClassName="h-8"/><h2 className="text-2xl font-bold">Welcome back</h2><p className="mt-2 text-text-muted">Sign in to continue to Agentic Motor Claims</p><form onSubmit={submit} className={`mt-7 space-y-4 ${error ? "shake" : ""}`}><label className="block text-sm font-medium">Username<input className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username"/></label><label className="block text-sm font-medium">Password<input type="password" className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password"/></label>{error&&<p className="text-sm text-danger">{error}</p>}<button disabled={busy} className="w-full rounded-md bg-primary px-4 py-2 font-semibold text-on-primary">{busy ? "Signing in…" : "Sign in"}</button></form><div className="mt-8"><p className="text-sm font-semibold">Quick demo login</p><div className="mt-3 space-y-2">{DEMOS.map((demo) => { const Icon = demo.icon; return <button type="button" key={demo.name} onClick={() => quickLogin(demo)} className="group flex h-14 w-full items-center gap-3 rounded-[10px] border border-border bg-surface px-3 text-left transition-colors hover:border-border-strong hover:bg-bg-muted active:scale-[.99] focus-visible:outline-2"><Avatar name={demo.name} size="md"/><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-text">{demo.name}</span><span className="mt-0.5 inline-flex rounded-full bg-bg-muted px-2 py-0.5 text-xs text-text-muted">{demo.role}</span></span><Icon size={17} className="text-text-muted" aria-hidden="true"/><ChevronRight size={17} className="text-text-muted opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden="true"/></button>; })}</div></div></div></main></div></div>;
}
