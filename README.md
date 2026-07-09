# Zach Lewis B2B Writing Portfolio

Static GitHub Pages portfolio for Zach Lewis, focused on B2B technical writing for SaaS, cloud, AI, cybersecurity, identity, data platforms, and developer tools.

Final URL format:

```text
https://zachl111.github.io/b2b-writing-portfolio/
```

## Setup

```bash
npm install
```

The site is plain HTML, CSS, and JavaScript. There is no backend and no paid service dependency.

## Add Raw Samples Locally

Place private source files in:

```text
private-samples-raw/
```

Supported file types:

```text
.pdf, .docx, .md, .txt, .html
```

Use filenames that match portfolio sample IDs when replacing the included placeholder encrypted samples, for example:

```text
private-samples-raw/data-platform-automation.md
private-samples-raw/cloud-access-governance.pdf
```

If client names should stay private, place them in:

```text
private-samples-raw/client-metadata.json
```

That file is encrypted into `samples/encrypted/client-metadata.enc`. The deployed site should use anonymous public labels until the passphrase unlocks the encrypted metadata.

## Encrypt Samples

Run:

```bash
npm run encrypt
```

The script asks for a passphrase and encrypts each raw sample into:

```text
samples/encrypted/*.enc
```

It also updates `portfolio-data.js` and `samples/encrypted/manifest.json` with the metadata needed by the browser:

```text
title, public display label, original filename, MIME type, salt, IV, encrypted filename
```

The browser uses PBKDF2-SHA-256 and AES-GCM through the Web Crypto API. The passphrase is not stored in the repository or hardcoded in the frontend. The unlocked state is session-only.

## Deploy

```bash
git init
git branch -M main
git add .
git commit -m "Build encrypted B2B writing portfolio"
gh repo create ZachL111/b2b-writing-portfolio --public --source=. --remote=origin --push
gh api --method POST /repos/ZachL111/b2b-writing-portfolio/pages -f source[branch]=main -f source[path]=/
```

If GitHub Pages already exists, update it instead:

```bash
gh api --method PUT /repos/ZachL111/b2b-writing-portfolio/pages -f source[branch]=main -f source[path]=/
```

Check Pages status:

```bash
gh api /repos/ZachL111/b2b-writing-portfolio/pages
```

## Troubleshooting GitHub Pages

If Pages returns a 404 immediately after enabling, wait a minute and refresh. The first deployment can take a short time to build.

If the API returns a conflict when creating Pages, use the `PUT` command above.

If `gh` reports an authentication or permission error, run:

```bash
gh auth login
```

Then rerun the deploy commands.

## Security Warning

Do not commit raw client work. Only encrypted files should be deployed. A client-side passphrase gate alone is not secure; this project protects samples by encrypting the files before they are published.
