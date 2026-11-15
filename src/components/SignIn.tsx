import { Field } from "@ark-ui/solid/field";
import { ark } from "@ark-ui/solid/factory";
import { useSubmission } from "@solidjs/router";
import { GitBranch, Layers } from "lucide-solid";
import { Show, createSignal, onMount } from "solid-js";
import { formLogin, formSignup } from "~/auth";
import { getAuthClient } from "~/auth/client";

export default function SignIn() {
  const login = useSubmission(formLogin);
  const signup = useSubmission(formSignup);
  const [creating, setCreating] = createSignal(false);
  const [socialError, setSocialError] = createSignal("");
  const [socialPending, setSocialPending] = createSignal(false);
  const [ready, setReady] = createSignal(false);
  onMount(() => setReady(true));
  const submission = () => creating() ? signup : login;

  async function githubLogin() {
    setSocialError(""); setSocialPending(true);
    try {
      const { error } = await getAuthClient().signIn.social({
        provider: "github",
        callbackURL: new URL("/auth/callback", window.location.origin).href
      });
      if (error) throw new Error(error.message || "GitHub sign-in is unavailable.");
    } catch (error) {
      setSocialError(error instanceof Error ? error.message : "GitHub sign-in is unavailable.");
    } finally { setSocialPending(false); }
  }

  return (
    <ark.main class="signin-page">
      <ark.div class="signin-panel">
        <ark.div class="brand-mark"><Layers size={22} /></ark.div>
        <ark.p class="signin-brand">Workspace</ark.p>
        <ark.h1>{creating() ? "Create account" : "Sign in"}</ark.h1>
        <ark.p class="muted">Your projects, issues, and documents. Together.</ark.p>
        <ark.form action={creating() ? formSignup : formLogin} method="post" class="signin-form">
          <Show when={creating()}>
            <Field.Root required>
              <Field.Label>Name</Field.Label>
              <Field.Input disabled={!ready()} name="name" autocomplete="name" maxLength={100} />
            </Field.Root>
          </Show>
          <Field.Root required>
            <Field.Label>Email</Field.Label>
            <Field.Input disabled={!ready()} name="email" type="email" autocomplete="email" placeholder="you@company.com" />
          </Field.Root>
          <Field.Root required>
            <Field.Label>Password</Field.Label>
            <Field.Input disabled={!ready()} name="password" type="password" autocomplete={creating() ? "new-password" : "current-password"} placeholder="Enter your password" minLength={8} maxLength={128} />
          </Field.Root>
          <ark.button type="submit" class="button primary signin-submit" disabled={!ready() || submission().pending}>
            {submission().pending ? "Please wait…" : creating() ? "Create account" : "Sign in"}
          </ark.button>
          <Show when={submission().error} keyed>
            {error => <ark.p class="form-error" role="alert">{error.message || "Unable to authenticate. Please try again."}</ark.p>}
          </Show>
        </ark.form>
        <ark.button type="button" disabled={!ready()} class="button oauth-button" onClick={() => setCreating(!creating())}>
          {creating() ? "Already have an account? Sign in" : "Create a new account"}
        </ark.button>
        <ark.div class="signin-divider"><ark.span>Or continue with</ark.span></ark.div>
        <ark.button type="button" onClick={githubLogin} disabled={!ready() || socialPending()} class="button oauth-button">
          <GitBranch size={18} /> {socialPending() ? "Connecting…" : "Sign in with GitHub"}
        </ark.button>
        <Show when={socialError()}><ark.p class="form-error" role="alert">{socialError()}</ark.p></Show>
      </ark.div>
      <ark.p class="signin-footer">A little clarity for your team's next big thing.</ark.p>
    </ark.main>
  );
}
