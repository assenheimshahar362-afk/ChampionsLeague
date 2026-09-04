"use client";

import { Loader2, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";

import { signUpWithPassword, type SignUpState } from "@/lib/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/constants";
import { GoogleSignUpButton } from "@/components/auth/google-sign-in";
import { LegalConsent } from "@/components/auth/legal-consent";
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
          <Loader2
            className="size-4 animate-spin [animation-duration:600ms]"
            aria-hidden="true"
          />
          {t("signingUp")}
        </>
      ) : (
        t("signUpAction")
      )}
    </Button>
  );
}

const initialState: SignUpState = { status: "idle" };

function useErrorMessage(code: string | undefined): string | null {
  const t = useTranslations("auth.errors");
  if (!code) return null;
  switch (code) {
    case "invalidEmail":
      return t("invalidEmail");
    case "weakPassword":
      return t("weakPassword", { min: MIN_PASSWORD_LENGTH });
    case "termsRequired":
      return t("termsRequired");
    case "emailTaken":
      return t("emailTaken");
    case "rateLimited":
      return t("rateLimited");
    default:
      return t("generic");
  }
}

/** Which field an error belongs under, so the message lands next to the fix. */
const ERROR_FIELD: Record<string, "email" | "password" | "terms"> = {
  invalidEmail: "email",
  emailTaken: "email",
  weakPassword: "password",
  termsRequired: "terms",
};

export function SignUpForm({ next }: { next: string }) {
  const t = useTranslations("auth");
  const [state, formAction] = useActionState(signUpWithPassword, initialState);
  const hintId = useId();
  const errorId = useId();

  const errorCode = state.status === "error" ? state.code : undefined;
  const errorMessage = useErrorMessage(errorCode);
  const errorField = errorCode ? ERROR_FIELD[errorCode] : undefined;

  // The account exists but is unusable until the link is clicked, so the form
  // is replaced rather than left sitting there inviting a second attempt.
  if (state.status === "confirm") {
    return (
      <div className="space-y-4 text-center">
        <div className="bg-accent text-accent-foreground mx-auto flex size-12 items-center justify-center rounded-full">
          <Mail className="size-5" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold">{t("checkInbox")}</h2>
          <p className="text-muted-foreground text-sm text-balance">
            {t("checkInboxBody", { email: state.email })}
          </p>
        </div>
      </div>
    );
  }

  const fieldError = (field: string) =>
    errorField === field ? errorMessage : null;

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
            aria-invalid={fieldError("email") ? true : undefined}
            aria-describedby={fieldError("email") ? errorId : undefined}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{t("passwordLabel")}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            dir="ltr"
            aria-invalid={fieldError("password") ? true : undefined}
            aria-describedby={
              fieldError("password") ? `${errorId} ${hintId}` : hintId
            }
          />
          <p id={hintId} className="text-muted-foreground text-xs">
            {t("passwordHint", { min: MIN_PASSWORD_LENGTH })}
          </p>
        </div>

        <LegalConsent id="terms" describedBy={fieldError("terms") ? errorId : undefined} />

        {errorMessage ? (
          <p id={errorId} role="alert" className="text-destructive text-sm">
            {errorMessage}
          </p>
        ) : null}

        <SubmitButton />

        <div className="flex items-center gap-3 pt-1">
          <span className="bg-border h-px flex-1" />
          <span className="text-muted-foreground text-xs uppercase tracking-wide">
            {t("or")}
          </span>
          <span className="bg-border h-px flex-1" />
        </div>

        <GoogleSignUpButton />
      </form>

      <p className="text-muted-foreground text-center text-sm">
        {t("haveAccount")}{" "}
        <Link
          href={{ pathname: "/sign-in", query: { next } }}
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          {t("signInLink")}
        </Link>
      </p>
    </div>
  );
}
