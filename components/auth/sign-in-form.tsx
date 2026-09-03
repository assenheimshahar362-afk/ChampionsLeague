"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { signInWithPassword, type SignInState } from "@/lib/auth/actions";
import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";

function SubmitButton() {
  const t = useTranslations("auth");
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending}>
      {pending ? (
        <>
          {/* 600ms rather than Tailwind's 1s. A faster spinner makes the wait
              feel shorter even though the request takes exactly as long — and
              this one is blocking the only thing on the page. */}
          <Loader2
            className="size-4 animate-spin [animation-duration:600ms]"
            aria-hidden="true"
          />
          {t("signingIn")}
        </>
      ) : (
        t("signInAction")
      )}
    </Button>
  );
}

const initialState: SignInState = { status: "idle" };

/**
 * next-intl keys must be literals for the message types to check, so this maps
 * codes explicitly rather than interpolating into `t()`.
 */
function useErrorMessage(code: string | undefined): string | null {
  const t = useTranslations("auth.errors");
  if (!code) return null;
  switch (code) {
    case "invalidEmail":
      return t("invalidEmail");
    case "invalidCredentials":
      return t("invalidCredentials");
    case "emailNotConfirmed":
      return t("emailNotConfirmed");
    case "rateLimited":
      return t("rateLimited");
    case "exchangeFailed":
      return t("exchangeFailed");
    default:
      return t("generic");
  }
}

export function SignInForm({
  next,
  initialError,
}: {
  next: string;
  initialError?: string;
}) {
  const t = useTranslations("auth");
  const [state, formAction] = useActionState(signInWithPassword, initialState);

  const errorCode = state.status === "error" ? state.code : initialError;
  const errorMessage = useErrorMessage(errorCode);

  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />

        <div className="space-y-2">
          <Label htmlFor="email">{t("emailLabel")}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            dir="ltr"
            placeholder={t("emailPlaceholder")}
            aria-describedby={errorMessage ? "sign-in-error" : undefined}
            aria-invalid={errorMessage ? true : undefined}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{t("passwordLabel")}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            dir="ltr"
            aria-describedby={errorMessage ? "sign-in-error" : undefined}
            aria-invalid={errorMessage ? true : undefined}
          />
        </div>

        {errorMessage ? (
          <p
            id="sign-in-error"
            role="alert"
            className="text-destructive text-sm"
          >
            {errorMessage}
          </p>
        ) : null}

        <SubmitButton />
      </form>

      <GoogleSignIn next={next} />

      <p className="text-muted-foreground text-center text-sm">
        {t("noAccount")}{" "}
        <Link
          href={{ pathname: "/sign-up", query: { next } }}
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          {t("signUpLink")}
        </Link>
      </p>
    </div>
  );
}
