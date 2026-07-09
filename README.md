# Zach Lewis — B2B Writing Portfolio

A responsive B2B technical writing portfolio for cloud, AI, cybersecurity,
identity, data infrastructure, secrets management, and developer-tool work.

The public experience uses NDA-safe sector labels. Real client names, document
titles, filenames, and writing samples are encrypted before publication and are
decrypted only in the visitor's browser after they enter the access phrase.

The GitHub Pages and Sites builds publish only the encrypted portfolio bundle.
The access phrase is never copied into source, committed, or sent to a server.

## Local development

Requirements: Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Useful checks:

```bash
npm run build:github
npm run portfolio:audit
```

## Add the private portfolio

Do not place raw writing samples anywhere under `public/`.

1. Create the ignored directory `private-samples-raw/`.
2. Copy `config/portfolio-manifest.example.json` to
   `private-samples-raw/manifest.private.json`.
3. Fill that private manifest with the real client names and approved document
   metadata.
4. Put each PDF or DOCX at the matching private path.
5. Add the five client names, one per line, to the ignored file
   `private-samples-raw/client-denylist.txt`.
6. Run `npm run portfolio:encrypt` and enter the access phrase twice. The phrase
   is hidden while typed and is never written to disk.
7. Run `npm run portfolio:audit` before publishing.

The encryption command writes only ciphertext and public envelope headers to
`public/samples/encrypted/`. It uses PBKDF2-HMAC-SHA-256 with 600,000 iterations,
a new random 16-byte salt per payload, AES-256-GCM, a new random 12-byte IV per
payload, and authenticated associated data.

The browser keeps its non-extractable phrase key in memory. Refreshing, closing
the page, or selecting **Lock portfolio** requires the phrase again. Decrypted
documents use temporary Blob URLs that are revoked after use.

## Privacy rules

- Never commit `private-samples-raw/` or a `*.private.json` file.
- Never publish raw PDF, DOCX, Markdown, or text samples.
- Do not put client names in source comments, filenames, IDs, alt text,
  metadata, commits, screenshots, analytics labels, or test fixtures.
- Use a high-entropy phrase. GitHub Pages makes encrypted files publicly
  downloadable, so a weak phrase can be guessed offline.
- Share decrypted material only with evaluators who are allowed to see it.

## Portfolio identity

- Owner: Zach Lewis
- GitHub: `ZachL111`
- Repository: `b2b-writing-portfolio`
- Intended Pages URL: `https://zachl111.github.io/b2b-writing-portfolio/`
