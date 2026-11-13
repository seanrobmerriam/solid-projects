import { createHandler, StartServer } from "@solidjs/start/server";

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="description" content="SolidStart with-auth example" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <script innerHTML={`(() => {
            let theme;
            try { theme = localStorage.getItem("workspace-theme"); } catch {}
            document.documentElement.dataset.theme = theme === "dark" || (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
          })();`} />
          <link rel="icon" type="image/svg" href="favicon.svg" />
          {assets}
        </head>
        <body>
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));
