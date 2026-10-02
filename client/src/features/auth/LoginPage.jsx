import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useAnimate, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { CircleAlert, Eye, EyeOff, Lock, LogIn, TriangleAlert, UserRound } from "lucide-react";
import { BrandLogo } from "../../components/ui/BrandLogo";
import { Button, IconButton } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Field, Input } from "../../components/ui/Input";
import { APP_NAME, INSURER_NAME } from "../../config/app";
import { api, ApiError } from "../../lib/api";
import { EASE } from "../../lib/motion";
import { useAuthStore } from "../../store/authStore";
import { DemoTiles } from "./DemoTiles";
import { FlowLines } from "./FlowLines";
import { LiveClaimCard } from "./LiveClaimCard";
import "./login.css";

const schema = z.object({
  username: z.string().trim().min(1, "Enter your username"),
  password: z.string().min(1, "Enter your password"),
  remember: z.boolean(),
});
const LAST_USER_KEY = "amc:last-username";
const TYPE_MS = 420; // total time to "type" a username from a demo tile (≈600 ms with the password fill)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readLastUser() {
  try {
    return localStorage.getItem(LAST_USER_KEY) || "";
  } catch {
    return "";
  }
}

function BrandPanel() {
  return (
    <section className="login-brand relative hidden overflow-hidden px-12 py-10 text-on-dark lg:flex lg:flex-col">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center">
        <span className="inline-flex self-start rounded-md bg-on-dark px-3.5 py-2 shadow-sm">
          <BrandLogo imgClassName="w-55! h-auto!" />
        </span>
        <h1 className="brand-headline mt-10 text-4xl">Motor claims, decided in minutes.</h1>
        <p className="brand-tagline mt-4 max-w-lg text-base text-on-dark">
          Seven AI agents verify vehicles through India's digital infrastructure, assess damage from photos and score
          fraud with explainable evidence.
        </p>
        <div className="brand-live mt-8">
          <LiveClaimCard />
        </div>
        <ul className="brand-chips mt-5 flex flex-wrap gap-2">
          {["7 AI agents", "< 60 s average decision", "Explainable fraud scoring"].map((chip) => (
            <li key={chip} className="rounded-full border border-on-dark/25 px-3 py-1 text-caption text-on-dark">{chip}</li>
          ))}
        </ul>
        <p className="brand-meta mt-4 text-caption text-on-dark">Connected to Vahan · FASTag · IIB · Gemini</p>
      </div>
      <p className="mx-auto w-full max-w-xl text-caption text-on-dark">© 2026 AutomationEdge · Demo for {INSURER_NAME}</p>
    </section>
  );
}

export function LoginPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reduced = useReducedMotion();
  const [scope, animate] = useAnimate();
  const submitRef = useRef(null);
  const fillToken = useRef(0);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [formError, setFormError] = useState("");
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [filling, setFilling] = useState(null);

  const { register, handleSubmit, setValue, setFocus, getValues, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { username: readLastUser(), password: "", remember: true },
  });

  useEffect(() => setFocus(getValues("username") ? "password" : "username"), [setFocus, getValues]);

  // Lockout countdown (§9.1): 1 s ticks only while locked.
  const secondsLeft = Math.max(0, Math.ceil((lockedUntil - now) / 1000));
  useEffect(() => {
    if (!lockedUntil) return undefined;
    const id = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= lockedUntil) {
        setLockedUntil(0);
        setFormError("");
      }
    }, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const shake = () => {
    if (reduced || !scope.current) return;
    animate(scope.current, { transform: ["translateX(0px)", "translateX(-8px)", "translateX(8px)", "translateX(-6px)", "translateX(6px)", "translateX(-3px)", "translateX(0px)"] },
      { duration: 0.45, ease: "easeInOut" });
  };

  const login = useMutation({
    mutationFn: (values) => api("/auth/login", { method: "POST", body: values }),
    onSuccess: async (data, values) => {
      try {
        if (values.remember) localStorage.setItem(LAST_USER_KEY, values.username.trim());
        else localStorage.removeItem(LAST_USER_KEY);
      } catch { /* storage unavailable — nothing to remember */ }
      if (scope.current) await animate(scope.current, { opacity: 0 }, { duration: reduced ? 0.1 : 0.2, ease: EASE });
      setUser(data.user);
      navigate(params.get("next") || "/", { replace: true });
    },
    onError: (err) => {
      if (!(err instanceof ApiError)) {
        toast.error("Couldn't sign in — the server is not reachable.");
        return;
      }
      if (err.status === 429) {
        const retry = err.body?.detail?.retry_after ?? 60;
        setLockedUntil(Date.now() + retry * 1000);
        setNow(Date.now());
        setFormError("Too many attempts.");
      } else {
        const left = err.body?.detail?.attempts_left;
        setFormError(left != null && left <= 2 ? `${err.message}. ${left} attempt${left === 1 ? "" : "s"} left before a short lockout.` : err.message);
      }
      setValue("password", "");
      setFocus("password");
      shake();
    },
  });

  const onSubmit = (values) => {
    if (login.isPending || Date.now() < lockedUntil || filling) return; // Enter still submits an aria-disabled button
    setFormError("");
    login.mutate(values);
  };

  // Demo tile: animate typing the username, fill the masked password, focus Sign in. Never submits.
  const fillDemo = async (account) => {
    const token = ++fillToken.current;
    setFilling(account.username);
    setFormError("");
    setValue("username", "", { shouldValidate: false });
    setValue("password", "", { shouldValidate: false });
    if (!reduced) {
      const per = TYPE_MS / account.username.length;
      for (let i = 1; i <= account.username.length; i += 1) {
        await sleep(per);
        if (token !== fillToken.current) return;
        setValue("username", account.username.slice(0, i));
      }
      await sleep(120);
    }
    if (token !== fillToken.current) return;
    setValue("username", account.username, { shouldValidate: true });
    setValue("password", account.password, { shouldValidate: true });
    setShowPassword(false);
    setFilling(null);
    submitRef.current?.focus();
  };

  if (user) return <Navigate to={params.get("next") || "/"} replace />;

  const locked = secondsLeft > 0;
  const passwordField = register("password");

  return (
    <div className="login-page bg-bg text-text">
      <div className="brand-accent-line" />
      <BrandPanel />
      <main className="relative flex items-center justify-center overflow-hidden px-6 py-4">
        <FlowLines />
        <div ref={scope} className="login-card relative z-10 w-full max-w-100 rounded-xl border border-border bg-surface p-8 shadow-lg">
          <span className="mb-6 inline-flex lg:hidden"><BrandLogo imgClassName="w-40! h-auto!" /></span>
          <h2 className="login-card-title text-2xl">Welcome back</h2>
          <p className="login-card-sub mt-1 text-sm text-muted">Sign in to continue to {APP_NAME}</p>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="login-form login-stack mt-6 flex flex-col gap-4">
            {formError && (
              <div role="alert" className="flex items-start gap-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
                <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
                <span>{formError}{locked && ` Try again in ${secondsLeft} s.`}</span>
              </div>
            )}
            <Field label="Username" error={errors.username?.message}>
              {(p) => <Input {...p} {...register("username")} icon={UserRound} autoComplete="username" spellCheck={false} />}
            </Field>
            <Field label="Password" error={errors.password?.message}>
              {(p) => (
                <Input
                  {...p}
                  {...passwordField}
                  type={showPassword ? "text" : "password"}
                  icon={Lock}
                  autoComplete="current-password"
                  onKeyDown={(e) => setCapsLock(e.getModifierState?.("CapsLock") ?? false)}
                  onKeyUp={(e) => setCapsLock(e.getModifierState?.("CapsLock") ?? false)}
                  onBlur={(e) => { setCapsLock(false); passwordField.onBlur(e); }}
                  trailing={
                    <IconButton
                      icon={showPassword ? EyeOff : Eye}
                      label={showPassword ? "Hide password" : "Show password"}
                      size="sm"
                      iconSize={16}
                      tooltip={false}
                      onClick={() => setShowPassword((v) => !v)}
                    />
                  }
                />
              )}
            </Field>
            {capsLock && (
              <p className="-mt-2 flex items-center gap-1 text-caption text-warning" role="status">
                <TriangleAlert size={14} aria-hidden="true" /> Caps Lock is on
              </p>
            )}
            <Checkbox label="Remember me" checked={watch("remember")} onChange={(checked) => setValue("remember", checked)} />
            <Button ref={submitRef} type="submit" size="lg" fullWidth icon={LogIn} loading={login.isPending}
              disabled={locked || Boolean(filling)}>
              {locked ? `Try again in ${secondsLeft} s` : "Sign in"}
            </Button>
          </form>

          <DemoTiles onPick={fillDemo} disabled={login.isPending} activeUsername={filling} />
        </div>
      </main>
    </div>
  );
}
