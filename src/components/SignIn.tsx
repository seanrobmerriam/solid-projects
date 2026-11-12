import { Field } from "@ark-ui/solid/field";
import { ark } from "@ark-ui/solid/factory";
import { useSubmission } from "@solidjs/router";
import { Layers } from "lucide-solid";
import { Show, createSignal } from "solid-js";
import { useOAuthLogin } from "start-oauth";
import { formLogin } from "~/auth";
import { Discord } from "~/components/Icons";

export default function SignIn() {
  const login = useOAuthLogin();
  const submission = useSubmission(formLogin);
  const [email, setEmail] = createSignal(submission.input?.[0]?.get("email")?.toString() ?? "");

  return (
    <ark.main class="signin-page">
      <ark.div class="signin-panel">
        <ark.div class="brand-mark"><Layers size={22} /></ark.div>
        <ark.p class="signin-brand">Workspace</ark.p>
        <ark.h1>Sign in</ark.h1>
        <ark.p class="muted">Your projects, issues, and documents. Together.</ark.p>
        <ark.form action={formLogin} method="post" class="signin-form">
          <Field.Root required>
            <Field.Label>Email</Field.Label>
            <Field.Input name="email" type="email" autocomplete="email" placeholder="you@company.com" value={email()} onInput={event => setEmail(event.currentTarget.value)} />
          </Field.Root>
          <Field.Root required>
            <Field.Label>Password</Field.Label>
            <Field.Input name="password" type="password" autocomplete="current-password" placeholder="Enter your password" minLength={6} />
          </Field.Root>
          <ark.button type="submit" class="button primary signin-submit" disabled={submission.pending}>
            {submission.pending ? "Signing in…" : "Sign in"}
          </ark.button>
          <Show when={submission.error} keyed>
            {error => <ark.p class="form-error" role="alert">{error.message || "Unable to sign in. Please try again."}</ark.p>}
          </Show>
        </ark.form>
        <ark.div class="signin-divider"><ark.span>Or continue with</ark.span></ark.div>
        <ark.a href={login("discord")} rel="external" class="button oauth-button">
          <Discord class="discord-icon" /> Sign in with Discord
        </ark.a>
      </ark.div>
      <ark.p class="signin-footer">A little clarity for your team's next big thing.</ark.p>
    </ark.main>
  );
}
