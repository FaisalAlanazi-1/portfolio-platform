# Portfolio platform

A launcher for two versions of Faisal Alanazi's portfolio.

- `launcher/` – the launcher page (static) plus the local development server.
- `version-a/` – Version A (plain static files).
- `version-b/` – Version B, a git submodule pointing at <https://github.com/FaisalAlanazi-1/Faisal-Portfolio>. It is never modified here.

## Run locally

```powershell
git submodule update --init
npm start
```

Open <http://localhost:4000>. See [launcher/README.md](launcher/README.md).

## Publish (GitHub Pages)

Pushing to `main` runs `.github/workflows/pages.yml`, which runs `scripts/build-pages.mjs`:

- the launcher becomes the site root,
- Version A is copied to `/version-a/`,
- Version B is built from a disposable copy with `output: "export"`, the repository base path and a static portrait,
- a small "Back to launcher" script is added to the published copies only.

Preview the Pages build locally: `BASE_PATH=/portfolio-platform SITE_URL=https://<user>.github.io node scripts/build-pages.mjs`, then serve `dist/` under `/portfolio-platform/`.
