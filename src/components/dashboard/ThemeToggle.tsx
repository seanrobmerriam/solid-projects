import { ark } from "@ark-ui/solid/factory";
import { Moon, Sun } from "lucide-solid";
import { Show, createSignal, onCleanup, onMount } from "solid-js";

export default function ThemeToggle() {
  const [dark, setDark] = createSignal(false);
  const [ready, setReady] = createSignal(false);
  let preference: string | null = null;
  onMount(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    try { preference = localStorage.getItem("workspace-theme"); } catch {}
    const apply = (value: boolean) => {
      setDark(value);
      document.documentElement.dataset.theme = value ? "dark" : "light";
    };
    apply(preference === "dark" || (preference !== "light" && media.matches));
    setReady(true);
    const systemChanged = () => { if (!preference) apply(media.matches); };
    const storageChanged = (event: StorageEvent) => {
      if (event.key !== "workspace-theme" && event.key !== null) return;
      preference = event.newValue;
      apply(preference === "dark" || (preference !== "light" && media.matches));
    };
    window.addEventListener("storage", storageChanged);
    media.addEventListener("change", systemChanged);
    onCleanup(() => {
      window.removeEventListener("storage", storageChanged);
      media.removeEventListener("change", systemChanged);
    });
  });
  const toggle = () => {
    const value = !dark();
    setDark(value);
    document.documentElement.dataset.theme = value ? "dark" : "light";
    preference = value ? "dark" : "light";
    try { localStorage.setItem("workspace-theme", preference); } catch {}
  };
  return <ark.button type="button" class="icon-button theme-toggle" disabled={!ready()} aria-label="Dark mode" aria-pressed={dark()} title={dark() ? "Switch to light mode" : "Switch to dark mode"} onClick={toggle}>
    <Show when={dark()} fallback={<Moon size={17} />}><Sun size={17} /></Show>
  </ark.button>;
}
