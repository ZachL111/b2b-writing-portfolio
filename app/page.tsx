"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  decryptDocument,
  PortfolioAccessError,
  type PrivateClient,
  type PrivateDocument,
  type PrivatePortfolio,
  unlockPrivatePortfolio,
} from "./portfolio-crypto";

type IconName =
  | "arrow"
  | "article"
  | "brief"
  | "check"
  | "close"
  | "code"
  | "document"
  | "download"
  | "eye"
  | "eyeOff"
  | "lock"
  | "menu"
  | "people"
  | "shield";

type PublicClient = {
  id: string;
  number: string;
  title: string;
  description: string;
  tags: string[];
  formats: string[];
};

const PUBLIC_CLIENTS: PublicClient[] = [
  {
    id: "client-01",
    number: "01",
    title: "AI database operations",
    description:
      "Technical content covering database performance, automated operations, observability, and cloud cost discipline.",
    tags: ["AI / ML", "Data infrastructure", "Cloud operations"],
    formats: ["Technical articles", "Solution content"],
  },
  {
    id: "client-02",
    number: "02",
    title: "Cloud access security",
    description:
      "Content on cloud authorization, least privilege, access paths, and identity-aware infrastructure security.",
    tags: ["Cloud security", "IAM", "Least privilege"],
    formats: ["Technical blogs", "SEO content"],
  },
  {
    id: "client-03",
    number: "03",
    title: "Machine identity security",
    description:
      "Technical writing on non-human identities, workload access, agent permissions, and identity risk.",
    tags: ["Cybersecurity", "Machine identity", "AI agents"],
    formats: ["Technical articles", "Buyer education"],
  },
  {
    id: "client-04",
    number: "04",
    title: "Secrets management",
    description:
      "Content covering credentials, encryption, access controls, and secure multi-cloud operations.",
    tags: ["Secrets", "Encryption", "Multi-cloud"],
    formats: ["White papers", "Technical blogs"],
  },
  {
    id: "client-05",
    number: "05",
    title: "AI developer infrastructure",
    description:
      "Technical content on software delivery, code quality, CI workflows, and engineering automation.",
    tags: ["Developer tools", "CI / CD", "Automation"],
    formats: ["Technical articles", "Product content"],
  },
];

const CAPABILITIES = [
  {
    number: "01",
    title: "Technical blogs",
    copy: "Explain the product, problem, and technical stakes without turning the article into documentation or marketing fog.",
  },
  {
    number: "02",
    title: "SEO articles",
    copy: "Answer real buyer questions with enough technical substance to deserve the reader's time and the search result.",
  },
  {
    number: "03",
    title: "White papers & briefs",
    copy: "Build a sustained, evidence-based argument and connect product capabilities to specific workflows and decisions.",
  },
  {
    number: "04",
    title: "Case studies",
    copy: "Turn customer evidence into a clear story about the starting point, implementation, and outcome without overstating it.",
  },
];

const PROCESS = [
  {
    number: "01",
    title: "Learn the product",
    copy: "Review the documentation, positioning, architecture, demos, and existing technical material.",
  },
  {
    number: "02",
    title: "Find the real question",
    copy: "Define the reader, what they already know, and the decision the piece should help them make.",
  },
  {
    number: "03",
    title: "Build the evidence",
    copy: "Research claims through primary and authoritative sources, then organize the argument before drafting.",
  },
  {
    number: "04",
    title: "Write for scrutiny",
    copy: "Keep the explanation clear without removing the mechanisms, caveats, or tradeoffs that create trust.",
  },
  {
    number: "05",
    title: "Refine with the team",
    copy: "Incorporate product, engineering, security, and editorial feedback while preserving readability and voice.",
  },
];

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    arrow: <path d="m5 12 14 0m-5-5 5 5-5 5" />,
    article: (
      <>
        <path d="M7 3h7l4 4v14H7z" />
        <path d="M14 3v5h5M10 12h5M10 16h5" />
      </>
    ),
    brief: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    code: <path d="m8 9-4 3 4 3m8-6 4 3-4 3m-2-9-4 12" />,
    document: (
      <>
        <path d="M6 2h8l5 5v15H6z" />
        <path d="M14 2v6h6M9 13h7M9 17h7" />
      </>
    ),
    download: <path d="M12 3v12m-5-5 5 5 5-5M5 21h14" />,
    eye: (
      <>
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    eyeOff: (
      <>
        <path d="M3 3l18 18M10.6 6.2A10 10 0 0 1 12 6c6 0 9.5 6 9.5 6a14 14 0 0 1-2.1 2.8M6.2 6.3C3.8 8 2.5 12 2.5 12s3.5 6 9.5 6a9.6 9.6 0 0 0 3.1-.5" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </>
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    people: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2M16 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5v1" />
      </>
    ),
    shield: <path d="M12 2 4.5 5v6.5c0 4.6 3.2 8.2 7.5 10.5 4.3-2.3 7.5-5.9 7.5-10.5V5zM9 12l2 2 4-5" />,
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [showPhrase, setShowPhrase] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [accessState, setAccessState] = useState<"locked" | "unlocked">("locked");
  const [unlockError, setUnlockError] = useState("");
  const [privatePortfolio, setPrivatePortfolio] =
    useState<PrivatePortfolio | null>(null);
  const [documentStatus, setDocumentStatus] = useState<Record<string, string>>(
    {},
  );
  const [liveMessage, setLiveMessage] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const phraseKeyRef = useRef<CryptoKey | null>(null);
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const unlockGenerationRef = useRef(0);

  const privateClients = useMemo(() => {
    const map = new Map<string, PrivateClient>();
    privatePortfolio?.clients.forEach((client) => map.set(client.publicId, client));
    return map;
  }, [privatePortfolio]);

  const unlocked = accessState === "unlocked" && Boolean(privatePortfolio);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (accessOpen && !dialog.open) {
      dialog.showModal();
      document.body.classList.add("modal-open");
    } else if (!accessOpen && dialog.open) {
      dialog.close();
      document.body.classList.remove("modal-open");
    }
  }, [accessOpen]);

  useEffect(() => {
    const blobUrls = blobUrlsRef.current;
    return () => {
      blobUrls.forEach((url) => URL.revokeObjectURL(url));
      document.body.classList.remove("modal-open");
    };
  }, []);

  const openAccess = () => {
    setMobileMenuOpen(false);
    setUnlockError("");
    setAccessOpen(true);
  };

  const closeAccess = () => {
    if (unlocking) return;
    setAccessOpen(false);
    setPhrase("");
    setUnlockError("");
    setShowPhrase(false);
  };

  const handleUnlock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!phrase) {
      setUnlockError("Enter the access phrase shared with you.");
      return;
    }

    setUnlocking(true);
    setUnlockError("");
    const generation = ++unlockGenerationRef.current;

    try {
      const { portfolio, phraseKey } = await unlockPrivatePortfolio(phrase);
      if (generation !== unlockGenerationRef.current) return;

      phraseKeyRef.current = phraseKey;
      setPrivatePortfolio(portfolio);
      setAccessState("unlocked");
      sessionStorage.setItem("zl-private-portfolio", "unlocked");
      setPhrase("");
      setAccessOpen(false);
      setLiveMessage("Private portfolio unlocked.");
    } catch (error) {
      if (generation !== unlockGenerationRef.current) return;
      if (error instanceof PortfolioAccessError && error.code === "unsupported") {
        setUnlockError(
          "Private decryption requires HTTPS. It will work on the published site.",
        );
      } else if (error instanceof PortfolioAccessError && error.code === "not-configured") {
        setUnlockError(
          "The encrypted sample files have not been added to this preview yet.",
        );
      } else {
        setUnlockError(
          "That phrase did not unlock the portfolio. Check it and try again.",
        );
      }
    } finally {
      if (generation === unlockGenerationRef.current) setUnlocking(false);
    }
  };

  const lockPortfolio = () => {
    unlockGenerationRef.current += 1;
    phraseKeyRef.current = null;
    setPrivatePortfolio(null);
    setAccessState("locked");
    setDocumentStatus({});
    blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    blobUrlsRef.current.clear();
    sessionStorage.removeItem("zl-private-portfolio");
    setLiveMessage("Private portfolio locked.");
  };

  const handleDocument = async (document: PrivateDocument) => {
    const phraseKey = phraseKeyRef.current;
    if (!phraseKey) {
      openAccess();
      return;
    }

    setDocumentStatus((current) => ({ ...current, [document.id]: "Decrypting…" }));
    try {
      const { blob, fileName } = await decryptDocument(document, phraseKey);
      const url = URL.createObjectURL(blob);
      blobUrlsRef.current.add(url);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.rel = "noopener";
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      setDocumentStatus((current) => ({ ...current, [document.id]: "Ready" }));
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
        blobUrlsRef.current.delete(url);
      }, 60_000);
    } catch {
      setDocumentStatus((current) => ({
        ...current,
        [document.id]: "Could not decrypt",
      }));
    }
  };

  const getClientName = (client: PublicClient) =>
    privateClients.get(client.id)?.realName ?? `Confidential client ${client.number}`;

  return (
    <main>
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />
      <div className="page-shell">
        <header className="site-header">
          <a className="brand" href="#top" aria-label="Zach Lewis, home">
            <span className="brand-mark">ZL</span>
            <span className="brand-copy">
              <strong>Zach Lewis</strong>
              <small>B2B technical writer</small>
            </span>
          </a>

          <nav className="desktop-nav" aria-label="Primary navigation">
            <a href="#work">Work</a>
            <a href="#capabilities">Capabilities</a>
            <a href="#process">Process</a>
            <a href="#about">About</a>
          </nav>

          <div className="header-actions">
            {unlocked ? (
              <button className="access-button access-button-unlocked" onClick={lockPortfolio}>
                <Icon name="check" size={17} />
                Lock portfolio
              </button>
            ) : (
              <button className="access-button" onClick={openAccess}>
                <Icon name="lock" size={17} />
                Private access
              </button>
            )}
            <button
              className="menu-button"
              aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              <Icon name={mobileMenuOpen ? "close" : "menu"} />
            </button>
          </div>

          {mobileMenuOpen && (
            <nav className="mobile-nav" aria-label="Mobile navigation">
              <a href="#work" onClick={() => setMobileMenuOpen(false)}>Work</a>
              <a href="#capabilities" onClick={() => setMobileMenuOpen(false)}>Capabilities</a>
              <a href="#process" onClick={() => setMobileMenuOpen(false)}>Process</a>
              <a href="#about" onClick={() => setMobileMenuOpen(false)}>About</a>
              <button onClick={unlocked ? lockPortfolio : openAccess}>
                <Icon name={unlocked ? "check" : "lock"} size={17} />
                {unlocked ? "Lock portfolio" : "Unlock private work"}
              </button>
            </nav>
          )}
        </header>

        <section className="hero" id="top">
          <div className="hero-copy">
            <p className="eyebrow">B2B technical writer + software engineer</p>
            <h1>Technical content that can hold up in a room full of engineers.</h1>
            <p className="hero-body">
              I write clear, technically grounded content for B2B teams working
              in cloud, AI, cybersecurity, identity, data infrastructure,
              secrets management, and developer tools.
            </p>
            <div className="hero-actions">
              <button className="button button-primary" onClick={openAccess}>
                Unlock writing samples
                <Icon name="arrow" />
              </button>
              <a className="button button-secondary" href="#capabilities">
                Explore capabilities
              </a>
            </div>
            <p className="hero-note">
              For teams selling complex products to engineers, security leaders,
              data teams, and enterprise buyers.
            </p>
            <div className="proof-strip" aria-label="Portfolio highlights">
              <div className="proof-item">
                <Icon name="article" size={26} />
                <span><strong>78</strong> technical articles</span>
              </div>
              <div className="proof-item">
                <Icon name="people" size={27} />
                <span><strong>5</strong> direct B2B clients</span>
              </div>
              <div className="proof-item">
                <Icon name="code" size={27} />
                <span><strong>2</strong> perspectives: writer + engineer</span>
              </div>
            </div>
          </div>

          <div className="work-stack-wrap" aria-label="Selected client work">
            <div className="stack-layer stack-layer-back" />
            <div className="stack-layer stack-layer-middle" />
            <div className="hero-work-panel">
              <div className="panel-heading">
                <div>
                  <span className="panel-kicker">Private portfolio</span>
                  <h2>Selected work</h2>
                </div>
                <span className={`status-pill ${unlocked ? "is-unlocked" : ""}`}>
                  <Icon name={unlocked ? "check" : "lock"} size={14} />
                  {unlocked ? "Unlocked" : "Encrypted"}
                </span>
              </div>
              <div className="hero-client-list">
                {PUBLIC_CLIENTS.map((client) => (
                  <button
                    className="hero-client-row"
                    key={client.id}
                    onClick={() => {
                      if (!unlocked) openAccess();
                      else document.getElementById(client.id)?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    <span className="client-index">{client.number}</span>
                    <span className="client-row-copy">
                      <strong>{getClientName(client)}</strong>
                      <small>{client.title}</small>
                    </span>
                    <span className="client-row-icon">
                      <Icon name={unlocked ? "arrow" : "lock"} size={17} />
                    </span>
                  </button>
                ))}
              </div>
              <div className="panel-footer">
                <Icon name="shield" size={18} />
                <span>Names and files decrypt locally in your browser.</span>
              </div>
            </div>
          </div>
        </section>

        <section className="work-section section" id="work">
          <div className="section-intro">
            <p className="eyebrow">Selected client work</p>
            <h2>Five technical markets. One private portfolio.</h2>
            <p>
              The public view uses sector labels instead of company names.
              Client identities, article details, and approved documents remain
              encrypted until the access phrase is entered.
            </p>
          </div>

          <div className="client-work-list">
            {PUBLIC_CLIENTS.map((client) => {
              const privateClient = privateClients.get(client.id);
              return (
                <article className="client-work-card" id={client.id} key={client.id}>
                  <div className="work-card-number">{client.number}</div>
                  <div className="work-card-copy">
                    <p className="confidential-label">
                      {privateClient ? "Verified client engagement" : `Confidential engagement ${client.number}`}
                    </p>
                    <h3>{privateClient?.realName ?? client.title}</h3>
                    {privateClient && <p className="revealed-sector">{client.title}</p>}
                    <p className="work-description">{client.description}</p>
                    <div className="tag-list">
                      {client.tags.map((tag) => <span key={tag}>{tag}</span>)}
                    </div>
                  </div>
                  <div className="sample-panel">
                    <div className="sample-panel-header">
                      <span>Protected samples</span>
                      <span>{privateClient?.documents.length ?? client.formats.length}</span>
                    </div>
                    {privateClient ? (
                      privateClient.documents.length ? (
                        privateClient.documents.map((document) => (
                          <button
                            className="sample-row sample-row-unlocked"
                            key={document.id}
                            onClick={() => handleDocument(document)}
                          >
                            <span className="sample-icon"><Icon name="document" size={19} /></span>
                            <span className="sample-copy">
                              <strong>{document.title}</strong>
                              <small>{document.formatLabel}</small>
                            </span>
                            <span className="sample-action">
                              {documentStatus[document.id] || "Download"}
                              <Icon name="download" size={16} />
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="sample-empty">
                          <Icon name="document" size={20} />
                          <span>Approved documents will be added to this client file.</span>
                        </div>
                      )
                    ) : (
                      client.formats.map((format, index) => (
                        <button className="sample-row" key={format} onClick={openAccess}>
                          <span className="sample-icon"><Icon name="lock" size={18} /></span>
                          <span className="sample-copy">
                            <strong>Protected writing sample {index + 1}</strong>
                            <small>{format}</small>
                          </span>
                          <span className="sample-action">Unlock <Icon name="arrow" size={16} /></span>
                        </button>
                      ))
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="cloud-section section">
          <div className="cloud-orbit" aria-hidden="true">
            <span className="orbit-ring orbit-ring-one" />
            <span className="orbit-ring orbit-ring-two" />
            <span className="orbit-core">AWS</span>
          </div>
          <div className="cloud-copy">
            <p className="eyebrow">Cloud content</p>
            <h2>Cloud writing needs more than a list of features.</h2>
            <p>
              Strong cloud content explains how a service fits into an
              architecture, what operational tradeoffs matter, and why an
              engineer or buyer should care.
            </p>
            <p>
              My software and IT systems background helps me work from technical
              documentation, architecture diagrams, product context, and
              engineering feedback without flattening the details that make the
              product credible.
            </p>
            <div className="cloud-fit">
              <Icon name="check" size={18} />
              <span>Strong fit for AWS-oriented content, cloud infrastructure, developer services, and enterprise technology.</span>
            </div>
          </div>
        </section>

        <section className="capabilities-section section" id="capabilities">
          <div className="section-intro section-intro-wide">
            <p className="eyebrow">Capabilities</p>
            <h2>Content built for technical scrutiny.</h2>
          </div>
          <div className="capability-grid">
            {CAPABILITIES.map((capability) => (
              <article className="capability-card" key={capability.number}>
                <span className="capability-number">{capability.number}</span>
                <h3>{capability.title}</h3>
                <p>{capability.copy}</p>
                <span className="capability-line" />
              </article>
            ))}
          </div>
        </section>

        <section className="process-section section" id="process">
          <div className="process-heading">
            <p className="eyebrow">How I work</p>
            <h2>Close enough to the product to write it properly.</h2>
          </div>
          <div className="process-list">
            {PROCESS.map((step) => (
              <article className="process-step" key={step.number}>
                <span>{step.number}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="about-section section" id="about">
          <div className="about-statement">
            <p className="eyebrow">About Zach</p>
            <blockquote>“Make a complex product easier to understand without making it sound simpler than it is.”</blockquote>
          </div>
          <div className="about-copy">
            <h2>I understand the systems behind the story.</h2>
            <p>
              I’m Zach Lewis, a B2B technical writer, software engineer, and IT
              systems professional. Because I have worked directly with software
              and business systems, I can follow technical architecture, ask
              product and engineering teams useful questions, and understand why
              a detail matters before deciding how to explain it.
            </p>
            <p>
              My strongest work sits where enterprise SaaS meets cloud
              infrastructure, AI/ML, cybersecurity, identity, data, secrets
              management, and developer tooling.
            </p>
            <div className="about-facts">
              <span><Icon name="code" size={18} /> Computer science background</span>
              <span><Icon name="brief" size={18} /> Direct B2B client work</span>
              <span><Icon name="shield" size={18} /> NDA-aware portfolio</span>
            </div>
          </div>
        </section>

        <section className="final-cta section">
          <div className="cta-glow" />
          <p className="eyebrow">Start a conversation</p>
          <h2>Need a writer who can keep up with the product?</h2>
          <p>
            Send me the audience, technical context, and content brief. I’ll tell
            you where I can help.
          </p>
          <div className="hero-actions final-actions">
            <a className="button button-primary" href="mailto:zachthinksmedia@gmail.com?subject=B2B%20writing%20project">
              Discuss a project <Icon name="arrow" />
            </a>
            <button className="button button-secondary" onClick={unlocked ? lockPortfolio : openAccess}>
              {unlocked ? "Lock private work" : "Unlock writing samples"}
            </button>
          </div>
        </section>

        <footer className="site-footer">
          <div>
            <a className="footer-brand" href="#top">Zach Lewis</a>
            <p>B2B technical writing for cloud, AI, security, data, and developer products.</p>
          </div>
          <div className="footer-links">
            <a href="mailto:zachthinksmedia@gmail.com">Email</a>
            <a href="https://www.linkedin.com/in/zach-lewis1/" target="_blank" rel="noreferrer">LinkedIn</a>
            <a href="https://github.com/ZachL111" target="_blank" rel="noreferrer">GitHub</a>
            <button onClick={unlocked ? lockPortfolio : openAccess}>{unlocked ? "Lock portfolio" : "Private portfolio"}</button>
          </div>
          <p className="footer-note">Selected client work is protected to respect confidentiality.</p>
        </footer>
      </div>

      <dialog
        className="access-dialog"
        ref={dialogRef}
        onCancel={(event) => {
          event.preventDefault();
          closeAccess();
        }}
        onClose={() => {
          setAccessOpen(false);
          document.body.classList.remove("modal-open");
        }}
      >
        <div className="dialog-topline" />
        <button className="dialog-close" onClick={closeAccess} aria-label="Close access dialog">
          <Icon name="close" />
        </button>
        <span className="dialog-icon"><Icon name="lock" size={25} /></span>
        <p className="dialog-kicker">Encrypted portfolio</p>
        <h2>Unlock private work</h2>
        <p className="dialog-copy">
          The access phrase decrypts both client identities and approved writing
          samples locally in this browser. Nothing is sent to a server.
        </p>

        <form onSubmit={handleUnlock}>
          <label htmlFor="access-phrase">Access phrase</label>
          <div className="phrase-field">
            <input
              autoComplete="off"
              autoFocus
              id="access-phrase"
              onChange={(event) => setPhrase(event.target.value)}
              placeholder="Enter access phrase"
              spellCheck={false}
              type={showPhrase ? "text" : "password"}
              value={phrase}
            />
            <button
              type="button"
              aria-label={showPhrase ? "Hide access phrase" : "Show access phrase"}
              onClick={() => setShowPhrase((show) => !show)}
            >
              <Icon name={showPhrase ? "eyeOff" : "eye"} />
            </button>
          </div>
          <p className={`form-message ${unlockError ? "is-error" : ""}`} role="status">
            {unlockError || "Private access lasts until you refresh or close this page."}
          </p>
          <button className="dialog-submit" type="submit" disabled={unlocking}>
            {unlocking ? "Decrypting protected work…" : "Unlock portfolio"}
            {!unlocking && <Icon name="arrow" />}
          </button>
        </form>

        <div className="dialog-security">
          <Icon name="shield" size={18} />
          <span>PBKDF2-SHA-256 · AES-256-GCM · browser-only decryption</span>
        </div>
        <a className="request-access-link" href="mailto:zachthinksmedia@gmail.com?subject=Portfolio%20access%20request">
          Need access? Request the phrase
        </a>
      </dialog>

      <div className="sr-live" aria-live="polite" aria-atomic="true">{liveMessage}</div>
    </main>
  );
}
