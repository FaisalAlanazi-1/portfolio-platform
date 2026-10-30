# Portfolio launcher

From the `portfolio` folder:

```powershell
npm start
```

Then open <http://localhost:4000>. Press Ctrl+C to stop; only the processes started by the launcher are stopped.

| URL | What it serves |
| --- | --- |
| http://localhost:4000 | The launcher |
| http://localhost:4001 | Version A opened from the launcher (adds a floating "Back to launcher" link) |
| http://localhost:4002 | Version B opened from the launcher (same) |
| http://localhost:4101 | Version A on its own (static files, no launcher UI) |
| http://localhost:4102 | Version B on its own (Next.js dev server, no launcher UI) |

The launcher cards link straight to ports 4001 and 4002, so each version opens as a normal top-level website. Those ports are small reverse proxies owned by the launcher: they forward everything unchanged and only insert one `<script>` tag into HTML pages, which adds the return link. Neither portfolio's source files are touched.

On the first run the launcher installs Version B's dependencies with `npm ci`. If a port is busy, it reports which one and exits without touching other processes. Next.js writes an `AGENTS.md` file into `version-b` while it runs; the launcher removes it on exit if it created it.

Preview images in `site/assets/previews` are real 1440×810 captures of each version's first screen. The decorative controller is an inline SVG in `site/index.html`; the text, previews and controls are plain HTML.
