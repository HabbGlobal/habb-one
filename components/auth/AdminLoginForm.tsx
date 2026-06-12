"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn, getSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { adminLoginSchema, type AdminLoginInput } from "@/lib/auth/schemas";

interface Labels {
  email: string;
  password: string;
  submit: string;
  failed: string;
  forgotPassword: string;
  rememberMe: string;
  showPassword: string;
  hidePassword: string;
  capsLockOn: string;
}

interface AdminLoginFormProps {
  callbackUrl?: string;
  initialErrorParam?: string;
  labels: Labels;
}

type Stage =
  | { kind: "credentials" }
  | { kind: "otp"; tokenId: string; maskedEmail: string; emailDelivered: boolean; expiresAt: string };

/**
 * Zweistufiger Login:
 *   Stufe 1 — Email + Passwort. Server validiert und entscheidet:
 *     - KIOSK_OPERATOR → directer signIn mit Passwort (kein OTP)
 *     - alle anderen → OTP-Mail wird verschickt, UI wechselt zur Stufe 2
 *   Stufe 2 — User trägt 6-stelligen Code ein, signIn mit { otpToken, otp }.
 */
export function AdminLoginForm({
  callbackUrl,
  initialErrorParam,
  labels,
}: AdminLoginFormProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [stage, setStage] = useState<Stage>({ kind: "credentials" });
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(
    initialErrorParam ? labels.failed : null,
  );
  const errorRegionRef = useRef<HTMLParagraphElement>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<AdminLoginInput>({
    resolver: zodResolver(adminLoginSchema),
    mode: "onTouched",
    defaultValues: { email: "", password: "", rememberMe: false },
  });

  useEffect(() => {
    if (submitError && errorRegionRef.current) {
      errorRegionRef.current.focus();
    }
  }, [submitError]);

  async function finishSignIn(args: Record<string, string>) {
    const res = await signIn("credentials", { ...args, redirect: false });
    if (res?.ok) {
      const session = await getSession();
      const role = session?.user?.role;
      const destination =
        callbackUrl ?? (role === "KIOSK_OPERATOR" ? "/kiosk" : "/admin");
      router.push(destination);
      router.refresh();
    } else {
      setSubmitError(labels.failed);
    }
  }

  const onSubmitCredentials = handleSubmit((data) => {
    setSubmitError(null);
    start(async () => {
      const res = await fetch("/api/auth/login-otp/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: data.email, password: data.password }),
      });
      if (!res.ok) {
        setSubmitError(labels.failed);
        return;
      }
      const payload = await res.json();
      if (payload.next === "DIRECT") {
        // KIOSK_OPERATOR → direkt einloggen
        await finishSignIn({ email: data.email, password: data.password });
        return;
      }
      // OTP-Stufe
      setStage({
        kind: "otp",
        tokenId: payload.tokenId,
        maskedEmail: payload.maskedEmail,
        emailDelivered: payload.emailDelivered,
        expiresAt: payload.expiresAt,
      });
    });
  });

  return (
    <>
      {stage.kind === "credentials" ? (
        <CredentialsStep
          register={register}
          errors={errors}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          capsLock={capsLock}
          setCapsLock={setCapsLock}
          submitError={submitError}
          errorRegionRef={errorRegionRef}
          onSubmit={onSubmitCredentials}
          pending={pending}
          labels={labels}
        />
      ) : (
        <OtpStep
          tokenId={stage.tokenId}
          maskedEmail={stage.maskedEmail}
          emailDelivered={stage.emailDelivered}
          expiresAt={stage.expiresAt}
          submitError={submitError}
          setSubmitError={setSubmitError}
          finishSignIn={finishSignIn}
          back={() => {
            setStage({ kind: "credentials" });
            setSubmitError(null);
          }}
          onResend={async () => {
            setSubmitError(null);
            const res = await fetch("/api/auth/login-otp/resend", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ tokenId: stage.tokenId }),
            });
            if (!res.ok) {
              setSubmitError("Failed to send a new code.");
              return;
            }
            const payload = await res.json();
            setStage({
              kind: "otp",
              tokenId: payload.tokenId,
              maskedEmail: payload.maskedEmail,
              emailDelivered: payload.emailDelivered,
              expiresAt: payload.expiresAt,
            });
          }}
          // Email wird für den hint im UI mitgegeben — sicherer als zu raten
          rawEmail={getValues("email")}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Stufe 1: Credentials
// ─────────────────────────────────────────────────────────────

function CredentialsStep({
  register,
  errors,
  showPassword,
  setShowPassword,
  capsLock,
  setCapsLock,
  submitError,
  errorRegionRef,
  onSubmit,
  pending,
  labels,
}: {
  register: ReturnType<typeof useForm<AdminLoginInput>>["register"];
  errors: ReturnType<typeof useForm<AdminLoginInput>>["formState"]["errors"];
  showPassword: boolean;
  setShowPassword: (v: boolean | ((p: boolean) => boolean)) => void;
  capsLock: boolean;
  setCapsLock: (v: boolean) => void;
  submitError: string | null;
  errorRegionRef: React.RefObject<HTMLParagraphElement>;
  onSubmit: (e?: React.BaseSyntheticEvent) => void;
  pending: boolean;
  labels: Labels;
}) {
  const handlePasswordKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === "function") {
      setCapsLock(e.getModifierState("CapsLock"));
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="space-y-5"
      aria-describedby={submitError ? "login-error" : undefined}
    >
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium text-habb-ink">
          {labels.email}
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          aria-invalid={errors.email ? "true" : "false"}
          aria-describedby={errors.email ? "email-error" : undefined}
          {...register("email")}
          className="block w-full rounded-md border border-habb-line bg-white px-3.5 py-2.5 text-sm text-habb-ink placeholder:text-habb-muted/60 transition-colors duration-150 ease-out focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-2 focus:ring-offset-white aria-[invalid=true]:border-habb-red motion-reduce:transition-none"
        />
        {errors.email && (
          <p id="email-error" className="text-xs text-habb-red">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="password" className="block text-sm font-medium text-habb-ink">
            {labels.password}
          </label>
          <Link
            href="/forgot-password"
            className="text-xs text-habb-muted transition-colors duration-150 ease-out hover:text-habb-red focus-visible:text-habb-red focus-visible:outline-none focus-visible:underline motion-reduce:transition-none"
          >
            {labels.forgotPassword}
          </Link>
        </div>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            onKeyUp={handlePasswordKey}
            onKeyDown={handlePasswordKey}
            aria-invalid={errors.password ? "true" : "false"}
            aria-describedby={
              [
                errors.password ? "password-error" : null,
                capsLock ? "caps-lock-hint" : null,
              ]
                .filter(Boolean)
                .join(" ") || undefined
            }
            {...register("password")}
            className="block w-full rounded-md border border-habb-line bg-white px-3.5 py-2.5 pr-11 text-sm text-habb-ink placeholder:text-habb-muted/60 transition-colors duration-150 ease-out focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-2 focus:ring-offset-white aria-[invalid=true]:border-habb-red motion-reduce:transition-none"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? labels.hidePassword : labels.showPassword}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center text-habb-muted transition-colors duration-150 ease-out hover:text-habb-black focus-visible:text-habb-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-habb-red focus-visible:ring-offset-2 focus-visible:ring-offset-white motion-reduce:transition-none"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.password && (
          <p id="password-error" className="text-xs text-habb-red">
            {errors.password.message}
          </p>
        )}
        {capsLock && (
          <p id="caps-lock-hint" className="text-xs text-habb-warning" aria-live="polite">
            {labels.capsLockOn}
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-habb-ink">
        <input
          type="checkbox"
          {...register("rememberMe")}
          className="h-4 w-4 rounded border-habb-line text-habb-black focus:ring-2 focus:ring-habb-red focus:ring-offset-2 focus:ring-offset-white"
        />
        {labels.rememberMe}
      </label>

      <p
        ref={errorRegionRef}
        id="login-error"
        tabIndex={-1}
        aria-live="polite"
        className={
          submitError
            ? "rounded-md border border-habb-red/30 bg-habb-red/5 px-3 py-2 text-sm text-habb-red"
            : "sr-only"
        }
      >
        {submitError ?? ""}
      </p>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-habb-black px-4 py-2.5 text-sm font-medium text-white transition-colors duration-150 ease-out hover:bg-habb-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-habb-red focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:hidden" />}
        {labels.submit}
      </button>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// Stufe 2: OTP
// ─────────────────────────────────────────────────────────────

function OtpStep({
  tokenId,
  maskedEmail,
  emailDelivered,
  expiresAt,
  submitError,
  setSubmitError,
  finishSignIn,
  back,
  onResend,
  rawEmail,
}: {
  tokenId: string;
  maskedEmail: string;
  emailDelivered: boolean;
  expiresAt: string;
  submitError: string | null;
  setSubmitError: (v: string | null) => void;
  finishSignIn: (args: Record<string, string>) => Promise<void>;
  back: () => void;
  onResend: () => Promise<void>;
  rawEmail: string;
}) {
  const [otp, setOtp] = useState("");
  const [pending, start] = useTransition();
  const [resending, startResend] = useTransition();

  const expiresInMin = Math.max(
    0,
    Math.round((new Date(expiresAt).getTime() - Date.now()) / 60_000),
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp)) {
      setSubmitError("Please enter the 6-digit code.");
      return;
    }
    setSubmitError(null);
    start(async () => {
      await finishSignIn({ otpToken: tokenId, otp });
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <button
        type="button"
        onClick={back}
        className="inline-flex items-center gap-1.5 text-xs text-habb-muted hover:text-habb-ink"
      >
        <ArrowLeft className="h-3 w-3" />
        Back
      </button>

      <div className="rounded-md border border-habb-line bg-habb-paper px-4 py-3 text-sm">
        <p className="font-medium text-habb-ink">Code sent via email</p>
        <p className="mt-1 text-habb-muted">
          {emailDelivered ? "We have sent a 6-digit code to" : "We are trying to send a code to"}{" "}
          <span className="font-mono text-habb-ink">{maskedEmail || rawEmail}</span>. Valid for{" "}
          {expiresInMin} {expiresInMin === 1 ? "minute" : "minutes"}.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="otp" className="block text-sm font-medium text-habb-ink">
          Confirmation code
        </label>
        <input
          id="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="block w-full rounded-md border border-habb-line bg-white px-3.5 py-3 text-center font-mono text-lg tracking-[0.4em] text-habb-ink focus:border-habb-black focus:outline-none focus:ring-2 focus:ring-habb-red focus:ring-offset-2 focus:ring-offset-white"
        />
      </div>

      {submitError && (
        <p
          aria-live="polite"
          className="rounded-md border border-habb-red/30 bg-habb-red/5 px-3 py-2 text-sm text-habb-red"
        >
          {submitError}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-habb-black px-4 py-2.5 text-sm font-medium text-white hover:bg-habb-ink disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        Sign in
      </button>

      <p className="text-center text-xs text-habb-muted">
        Didn&apos;t receive a code?{" "}
        <button
          type="button"
          disabled={resending}
          onClick={() => startResend(onResend)}
          className="font-medium text-habb-ink underline-offset-2 hover:underline hover:text-habb-red disabled:opacity-50"
        >
          {resending ? "Sending…" : "Request a new code"}
        </button>
      </p>
    </form>
  );
}
