import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Activity, ArrowDownToLine, ArrowRight, BookOpen, Check, ChevronDown, ChevronRight,
  Cloud, CloudCog, Code2, Database, FileArchive, FileCheck2, Files, FolderOpen, LockKeyhole,
  Globe2, HardDrive, KeyRound, LayoutDashboard, LifeBuoy, LoaderCircle, LogOut, Menu,
  RefreshCw, Search, Settings2, ShieldCheck, SlidersHorizontal, Upload, X,
} from "lucide-react";
import AuthGate from "./AuthGate";
import { supabase } from "./lib/supabase";
import { apiRequest, downloadFile } from "./lib/api";
import type { CloudChunk, CloudFile, CloudStatus, Deployment } from "./lib/api";

type Page = "Dashboard" | "My Files" | "Upload" | "Segmentation" | "Encryption" | "Downloads" | "Portfolio Hosting" | "Documentation Hosting" | "CDN" | "Analytics" | "Settings" | "Help";
const navGroups: Array<{ label: string; items: Array<{ title: Page; icon: typeof Cloud }> }> = [
  { label: "WORKSPACE", items: [{ title: "Dashboard", icon: LayoutDashboard }, { title: "My Files", icon: Files }, { title: "Upload", icon: Upload }] },
  { label: "SECURITY & DELIVERY", items: [{ title: "Segmentation", icon: FileArchive }, { title: "Encryption", icon: KeyRound }, { title: "Downloads", icon: ArrowDownToLine }] },
  { label: "PUBLISH", items: [{ title: "Portfolio Hosting", icon: Code2 }, { title: "Documentation Hosting", icon: BookOpen }, { title: "CDN", icon: Globe2 }] },
  { label: "INSIGHTS", items: [{ title: "Analytics", icon: Activity }, { title: "Settings", icon: Settings2 }, { title: "Help", icon: LifeBuoy }] },
];

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function dateLabel(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [preview, setPreview] = useState(false);
  const [page, setPage] = useState<Page>("Dashboard");
  const [status, setStatus] = useState<CloudStatus["services"]>({ supabase: false, storage: false, encryption: false, cdn: false });
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [downloads, setDownloads] = useState<Array<{ id: string; file_name: string; mode: string; size_bytes: number; created_at: string }>>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/health");
      if (!response.ok) throw new Error("Could not read backend integration configuration.");
      const health = await response.json() as CloudStatus;
      setStatus(health.services);
      if (!session) return;
      setLoading(true);
      setError("");
      const [fileData, deploymentData, downloadData] = await Promise.all([
        apiRequest<{ files: CloudFile[] }>("/files", session),
        apiRequest<{ deployments: Deployment[] }>("/deployments", session),
        apiRequest<{ downloads: typeof downloads }>("/downloads", session),
      ]);
      setFiles(fileData.files);
      setDeployments(deploymentData.deployments);
      setDownloads(downloadData.downloads);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load your cloud data.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { void refresh(); }, [refresh]);

  const navigate = (next: Page) => { setPage(next); setMenuOpen(false); setError(""); setNotice(""); };
  const signOut = async () => {
    if (!supabase) return;
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) setError(`Could not sign out: ${signOutError.message}`);
    } catch (cause) {
      setError(cause instanceof Error ? `Could not sign out: ${cause.message}` : "Could not sign out.");
    }
  };
  const usedBytes = useMemo(() => files.reduce((total, file) => total + file.size_bytes, 0), [files]);
  const filteredFiles = useMemo(() => files.filter((file) => file.name.toLowerCase().includes(search.toLowerCase())), [files, search]);

  if (!authReady) return <div className="page-loader"><LoaderCircle className="spin" size={26} /></div>;
  if (!session && !preview) return <AuthGate onPreview={() => setPreview(true)} />;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand"><span className="brand-icon"><Cloud size={20} /></span><span>cloud<span className="brand-accent">vault</span></span><button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={19} /></button></div>
        <div className="workspace-switch"><span className="workspace-avatar">C</span><span className="workspace-label"><b>My workspace</b><small>{preview ? "Preview mode" : "Personal account"}</small></span><ChevronDown size={15} /></div>
        <nav className="main-nav">
          {navGroups.map((group) => <div className="nav-group" key={group.label}><p className="nav-heading">{group.label}</p>{group.items.map(({ title, icon: Icon }) => <button key={title} className={`nav-item ${page === title ? "active" : ""}`} onClick={() => navigate(title)}><Icon size={17} strokeWidth={1.8} /><span>{title}</span>{title === "Upload" && <span className="nav-shortcut">⌘ U</span>}</button>)}</div>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="storage-card"><div className="storage-title"><HardDrive size={15} /> Storage <span>{formatBytes(usedBytes)}</span></div><div className="storage-track"><span style={{ width: `${Math.min(usedBytes / (5 * 1024 ** 3) * 100, 100)}%` }} /></div><small>Usage shown from your uploaded files</small></div>
          {!preview && <button className="profile-row" onClick={() => void signOut()}><span className="profile-avatar">{session?.user.email?.[0]?.toUpperCase() ?? "U"}</span><span className="profile-name"><b>{session?.user.email?.split("@")[0]}</b><small>{session?.user.email}</small></span><LogOut size={16} /></button>}
          {preview && <button className="profile-row" onClick={() => setPreview(false)}><span className="profile-avatar">D</span><span className="profile-name"><b>Demo preview</b><small>No cloud operations</small></span><LogOut size={16} /></button>}
        </div>
      </aside>
      {menuOpen && <button className="mobile-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}
      <main className="main-area">
        <header className="topbar"><button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={20} /></button><div className="breadcrumb">Workspace <ChevronRight size={14} /><b>{page}</b></div><div className="topbar-actions"><span className="connection-pill"><span className={`status-dot ${status.storage && status.supabase ? "online" : ""}`} />{preview ? "Preview mode" : status.storage && status.supabase ? "Cloud configured" : "Setup required"}</span><button className="icon-button" onClick={() => void refresh()} title="Refresh"><RefreshCw size={17} /></button><span className="top-avatar">{session?.user.email?.[0]?.toUpperCase() ?? "D"}</span></div></header>
        <div className="content">
          {preview && <div className="demo-banner"><div><strong>Demo preview</strong><span>This is an empty interface preview. Cloud data and actions are disabled; nothing is simulated.</span></div><button onClick={() => setPreview(false)}>Configure account <ArrowRight size={14} /></button></div>}
          {!preview && !status.supabase && <div className="config-banner"><CloudCog size={19} /><div><strong>Backend configuration needed</strong><span>Set up Supabase, AWS S3, and a server encryption key to enable real operations.</span></div><button onClick={() => navigate("Settings")}>View setup <ArrowRight size={14} /></button></div>}
          {(error || notice) && <div className={error ? "alert alert-error" : "alert alert-success"}>{error || notice}<button onClick={() => { setError(""); setNotice(""); }} aria-label="Dismiss"><X size={15} /></button></div>}
          {page === "Dashboard" && <Dashboard files={files} deployments={deployments} downloads={downloads} status={status} usedBytes={usedBytes} loading={loading} onNavigate={navigate} />}
          {page === "My Files" && <FilesPage files={filteredFiles} search={search} setSearch={setSearch} loading={loading} session={session} onError={setError} onNavigate={navigate} onRefresh={refresh} />}
          {page === "Upload" && <UploadPage session={session} disabled={preview} onError={setError} onSuccess={async (message) => { setNotice(message); await refresh(); }} />}
          {page === "Segmentation" && <SegmentationPage files={files} session={session} onError={setError} />}
          {page === "Encryption" && <EncryptionPage files={files} status={status} />}
          {page === "Downloads" && <DownloadsPage downloads={downloads} />}
          {page === "Portfolio Hosting" && <HostingPage kind="portfolio" status={status} session={session} disabled={preview} deployments={deployments} onError={setError} onSuccess={async (message) => { setNotice(message); await refresh(); }} />}
          {page === "Documentation Hosting" && <HostingPage kind="documentation" status={status} session={session} disabled={preview} deployments={deployments} onError={setError} onSuccess={async (message) => { setNotice(message); await refresh(); }} />}
          {page === "CDN" && <CdnPage status={status} deployments={deployments} session={session} disabled={preview} onError={setError} onSuccess={setNotice} />}
          {page === "Analytics" && <AnalyticsPage files={files} downloads={downloads} deployments={deployments} usedBytes={usedBytes} />}
          {page === "Settings" && <SettingsPage status={status} />}
          {page === "Help" && <HelpPage />}
        </div>
      </main>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function Dashboard({ files, deployments, downloads, status, usedBytes, loading, onNavigate }: {
  files: CloudFile[]; deployments: Deployment[];
  downloads: Array<{ id: string; file_name: string; mode: string; size_bytes: number; created_at: string }>;
  status: CloudStatus["services"]; usedBytes: number; loading: boolean; onNavigate: (page: Page) => void;
}) {
  const encryptedCount = files.filter((file) => file.encrypted).length;
  const totalChunks = files.reduce((sum, file) => sum + file.chunk_count, 0);
  return <>
    <PageHeading eyebrow="OVERVIEW" title="Good to see you." description="A snapshot of your secure cloud workspace." action={<button className="button primary" onClick={() => onNavigate("Upload")}><Upload size={16} /> Upload files</button>} />
    <section className="hero-card"><div className="hero-content"><span className="hero-kicker"><ShieldCheck size={15} /> YOUR DATA, UNDER YOUR CONTROL</span><h2>Secure storage.<br /><span>Seamless delivery.</span></h2><p>Encrypt, organize, and publish from one workspace — with your own cloud infrastructure.</p><button className="hero-link" onClick={() => onNavigate("Help")}>Explore how it works <ArrowRight size={15} /></button></div><div className="hero-visual"><div className="hero-ring ring-a" /><div className="hero-ring ring-b" /><div className="hero-cloud"><Cloud size={49} strokeWidth={1.4} /><ShieldCheck size={21} /></div><div className="hero-chip chip-top"><LockKeyhole size={14} /> AES-256-GCM</div><div className="hero-chip chip-bottom"><Globe2 size={14} /> Global edge delivery</div></div></section>
    <div className="section-label"><span>WORKSPACE AT A GLANCE</span><span className="muted-label">Synced with your cloud account</span></div>
    <section className="stats-grid">
      <StatCard icon={HardDrive} title="Storage used" value={formatBytes(usedBytes)} detail="Across your uploaded files" tint="blue" />
      <StatCard icon={Files} title="Uploaded files" value={String(files.length)} detail="Encrypted at rest" tint="violet" />
      <StatCard icon={FileCheck2} title="Encrypted files" value={String(encryptedCount)} detail="AES-256-GCM" tint="green" />
      <StatCard icon={FileArchive} title="File chunks" value={String(totalChunks)} detail="Verified with SHA-256" tint="amber" />
    </section>
    <section className="dashboard-grid">
      <div className="panel recent-panel"><div className="panel-header"><div><h3>Recent files</h3><p>Your latest uploads</p></div><button className="link-button" onClick={() => onNavigate("My Files")}>View all <ArrowRight size={14} /></button></div>
        {loading ? <div className="empty-inline"><LoaderCircle className="spin" size={18} /> Loading your files…</div> : files.length === 0 ? <EmptyState icon={FolderOpen} title="Your workspace is ready" text="Upload a file to see its encrypted chunks and checksums here." action={<button className="button secondary small" onClick={() => onNavigate("Upload")}>Upload your first file</button>} /> : <div className="table-wrap"><table><thead><tr><th>FILE NAME</th><th>SIZE</th><th>CHUNKS</th><th>ADDED</th></tr></thead><tbody>{files.slice(0, 5).map((file) => <tr key={file.id}><td><span className="file-cell"><span className="file-type-icon"><Files size={15} /></span><b>{file.name}</b></span></td><td>{formatBytes(file.size_bytes)}</td><td><span className="chunk-count">{file.chunk_count} chunks</span></td><td>{dateLabel(file.created_at)}</td></tr>)}</tbody></table></div>}
      </div>
      <div className="panel status-panel"><div className="panel-header"><div><h3>Cloud service setup</h3><p>Required environment configuration</p></div><CloudCog size={19} className="panel-icon" /></div><div className="service-list"><ServiceRow name="Supabase" detail="Auth & metadata" ready={status.supabase} /><ServiceRow name="AWS S3" detail="Private object storage" ready={status.storage} /><ServiceRow name="AES-256-GCM" detail="Server-side encryption" ready={status.encryption} /><ServiceRow name="CloudFront" detail="CDN distribution" ready={status.cdn} /></div><button className="subtle-action" onClick={() => onNavigate("Settings")}>Manage configuration <ArrowRight size={14} /></button></div>
    </section>
    <section className="dashboard-grid bottom-grid">
      <div className="panel"><div className="panel-header"><div><h3>Recent downloads</h3><p>Encrypted and original exports</p></div><button className="link-button" onClick={() => onNavigate("Downloads")}>History <ArrowRight size={14} /></button></div>{downloads.length ? <div className="compact-list">{downloads.slice(0, 4).map((item) => <div className="compact-row" key={item.id}><span className="compact-icon"><ArrowDownToLine size={15} /></span><span className="compact-main"><b>{item.file_name}</b><small>{item.mode} · {dateLabel(item.created_at)}</small></span><span className="compact-size">{formatBytes(item.size_bytes)}</span></div>)}</div> : <EmptyState icon={ArrowDownToLine} title="No downloads yet" text="Download activity will appear here after you export a file." />}</div>
      <div className="panel"><div className="panel-header"><div><h3>Published websites</h3><p>CloudFront deployments</p></div><button className="link-button" onClick={() => onNavigate("CDN")}>Manage CDN <ArrowRight size={14} /></button></div>{deployments.length ? <div className="compact-list">{deployments.slice(0, 4).map((item) => <div className="compact-row" key={item.id}><span className="compact-icon site-icon"><Globe2 size={15} /></span><span className="compact-main"><b>{item.name}</b><small>{item.kind} · {dateLabel(item.created_at)}</small></span><span className={`deployment-status ${item.status}`}>{item.status}</span></div>)}</div> : <EmptyState icon={Globe2} title="Nothing published yet" text="Deploy a portfolio or documentation site to CloudFront." action={<button className="text-button" onClick={() => onNavigate("Portfolio Hosting")}>Start a deployment <ArrowRight size={14} /></button>} />}</div>
    </section>
    <div className="education-strip"><span className="education-icon"><BookOpen size={18} /></span><span><b>Curious how it works?</b><small>Explore the architecture, security model, and cloud workflows behind CloudVault.</small></span><button className="link-button" onClick={() => onNavigate("Help")}>Explore guide <ArrowRight size={14} /></button></div>
  </>;
}

function StatCard({ icon: Icon, title, value, detail, tint }: { icon: typeof Cloud; title: string; value: string; detail: string; tint: string }) {
  return <div className="stat-card"><span className={`stat-icon ${tint}`}><Icon size={18} strokeWidth={1.8} /></span><div className="stat-title">{title}</div><div className="stat-value">{value}</div><div className="stat-detail">{detail}</div></div>;
}

function ServiceRow({ name, detail, ready }: { name: string; detail: string; ready: boolean }) {
  return <div className="service-row"><span className={`service-indicator ${ready ? "ready" : ""}`}>{ready ? <Check size={12} /> : <X size={11} />}</span><span className="service-copy"><b>{name}</b><small>{detail}</small></span><span className={`service-state ${ready ? "ready-text" : ""}`}>{ready ? "Connected" : "Not set up"}</span></div>;
}

function EmptyState({ icon: Icon, title, text, action }: { icon: typeof Cloud; title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={20} /></span><b>{title}</b><p>{text}</p>{action}</div>;
}

function FilesPage({ files, search, setSearch, loading, session, onError, onNavigate, onRefresh }: {
  files: CloudFile[]; search: string; setSearch: (value: string) => void; loading: boolean; session: Session | null;
  onError: (message: string) => void; onNavigate: (page: Page) => void; onRefresh: () => Promise<void>;
}) {
  async function getFile(file: CloudFile, mode: "encrypted" | "original") {
    if (!session) return;
    try { await downloadFile(`/files/${file.id}/download?mode=${mode}`, session, mode === "original" ? file.name : `${file.name}.encrypted.json`); await onRefresh(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : "Download failed."); }
  }
  return <>
    <PageHeading eyebrow="WORKSPACE" title="My files" description="Manage your private files, inspect integrity metadata, and download a verified copy." action={<button className="button primary" onClick={() => onNavigate("Upload")}><Upload size={16} /> Upload files</button>} />
    <div className="toolbar"><div className="search-box"><Search size={16} /><input aria-label="Search files" placeholder="Search files…" value={search} onChange={(event) => setSearch(event.target.value)} /></div><button className="button secondary small"><SlidersHorizontal size={15} /> Filter</button></div>
    <div className="panel files-table-panel">{loading ? <div className="loading-row"><LoaderCircle className="spin" size={19} /> Loading files…</div> : files.length === 0 ? <EmptyState icon={FolderOpen} title="No files found" text={search ? "Try another search term." : "Your private files will appear here after a successful upload."} action={!search && <button className="button secondary small" onClick={() => onNavigate("Upload")}>Upload a file</button>} /> : <div className="table-wrap"><table className="files-table"><thead><tr><th>FILE</th><th>SIZE</th><th>CHUNKS</th><th>SECURITY</th><th>UPLOADED</th><th></th></tr></thead><tbody>{files.map((file) => <tr key={file.id}><td><span className="file-cell"><span className="file-type-icon"><Files size={15} /></span><span><b>{file.name}</b><small>{file.mime_type}</small></span></span></td><td>{formatBytes(file.size_bytes)}</td><td>{file.chunk_count} × {formatBytes(file.chunk_size_bytes)}</td><td><span className="security-tag"><ShieldCheck size={13} /> Encrypted</span></td><td>{dateLabel(file.created_at)}</td><td><div className="row-actions"><button className="icon-button" title="Download original" onClick={() => void getFile(file, "original")}><ArrowDownToLine size={16} /></button><button className="icon-button" title="Download encrypted data" onClick={() => void getFile(file, "encrypted")}><LockKeyhole size={15} /></button></div></td></tr>)}</tbody></table></div>}</div>
    <p className="table-footnote"><ShieldCheck size={14} /> Files are encrypted before they reach S3. The encryption key stays on the backend.</p>
  </>;
}

function UploadPage({ session, disabled, onError, onSuccess }: { session: Session | null; disabled: boolean; onError: (message: string) => void; onSuccess: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [chunkSizeMb, setChunkSizeMb] = useState("1");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file || !session) { onError("Choose a file and sign in before uploading."); return; }
    setBusy(true); onError("");
    const body = new FormData();
    body.append("file", file);
    body.append("chunkSizeMb", chunkSizeMb);
    try {
      const result = await apiRequest<{ chunkCount: number; name: string }>("/files", session, { method: "POST", body });
      setFile(null);
      onSuccess(`${result.name} was uploaded, encrypted, and verified as ${result.chunkCount} chunk${result.chunkCount === 1 ? "" : "s"}.`);
    } catch (cause) { onError(cause instanceof Error ? cause.message : "Upload failed."); }
    finally { setBusy(false); }
  }
  return <>
    <PageHeading eyebrow="SECURE STORAGE" title="Upload a file" description="Files are split into chunks, encrypted with AES-256-GCM, checksummed, and stored in your private S3 bucket." />
    <div className="upload-layout"><form className="panel upload-form" onSubmit={submit}>
      <label className="field-label">Choose a file</label><label className={`dropzone ${file ? "has-file" : ""}`}><input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><span className="drop-icon">{file ? <FileCheck2 size={24} /> : <Upload size={24} />}</span><b>{file ? file.name : "Drop your file here or browse"}</b><small>{file ? `${formatBytes(file.size)} · ${file.type || "Unknown type"}` : "Maximum file size is controlled by your server configuration"}</small><span className="browse-link">{file ? "Choose a different file" : "Browse files"}</span></label>
      <label className="field-label chunk-label" htmlFor="chunk-size">Chunk size</label><select id="chunk-size" value={chunkSizeMb} onChange={(event) => setChunkSizeMb(event.target.value)}><option value="1">1 MB — more granular</option><option value="2">2 MB — balanced</option><option value="4">4 MB — fewer chunks</option><option value="8">8 MB — larger transfers</option></select>
      <div className="upload-process"><span><span className="process-number">1</span> Segment</span><ChevronRight size={15} /><span><span className="process-number">2</span> Encrypt</span><ChevronRight size={15} /><span><span className="process-number">3</span> Verify</span><ChevronRight size={15} /><span><span className="process-number">4</span> Store</span></div>
      <button className="button primary full" disabled={busy || disabled || !file}>{busy ? <><LoaderCircle className="spin" size={16} /> Uploading securely…</> : <><ShieldCheck size={16} /> Encrypt & upload</>}</button>
      {disabled && <p className="form-hint">Uploads are disabled in preview mode.</p>}
    </form><aside className="panel upload-aside"><div className="aside-icon"><ShieldCheck size={19} /></div><h3>Private from the start</h3><p>Your file is encrypted on the backend before it is stored. AWS S3 Server-Side Encryption is also enabled on each object.</p><div className="aside-point"><Check size={14} /> AES-256-GCM authenticated encryption</div><div className="aside-point"><Check size={14} /> SHA-256 integrity verification</div><div className="aside-point"><Check size={14} /> Private S3 objects; no public ACL</div><div className="callout-note"><b>Encryption key stays on your server</b><span>Generate a 32-byte key and store it only in the backend environment.</span></div></aside></div>
  </>;
}

function SegmentationPage({ files, session, onError }: { files: CloudFile[]; session: Session | null; onError: (message: string) => void }) {
  const [selected, setSelected] = useState(files[0]?.id ?? "");
  const [chunks, setChunks] = useState<CloudChunk[]>([]);
  const [busy, setBusy] = useState(false);
  const current = files.find((file) => file.id === selected);
  useEffect(() => { if (!selected && files[0]) setSelected(files[0].id); }, [files, selected]);
  useEffect(() => {
    if (!session || !selected) { setChunks([]); return; }
    setBusy(true);
    apiRequest<{ chunks: CloudChunk[] }>(`/files/${selected}/chunks`, session)
      .then((data) => setChunks(data.chunks))
      .catch((cause) => onError(cause instanceof Error ? cause.message : "Could not load chunks."))
      .finally(() => setBusy(false));
  }, [selected, session, onError]);
  return <>
    <PageHeading eyebrow="FILE INTEGRITY" title="Segmentation" description="Inspect the real chunks created during upload, including per-chunk sizes and SHA-256 checksums." />
    {!files.length ? <div className="panel"><EmptyState icon={FileArchive} title="No segmented files yet" text="Upload a file to see its actual chunk layout and checksums." /></div> : <>
      <div className="panel segment-summary"><div className="select-wrap"><label htmlFor="segment-file">File</label><select id="segment-file" value={selected} onChange={(event) => setSelected(event.target.value)}>{files.map((file) => <option value={file.id} key={file.id}>{file.name}</option>)}</select></div><div className="segment-stat"><span>FILE SIZE</span><b>{formatBytes(current?.size_bytes ?? 0)}</b></div><div className="segment-stat"><span>CHUNK SIZE</span><b>{formatBytes(current?.chunk_size_bytes ?? 0)}</b></div><div className="segment-stat"><span>CHUNKS</span><b>{current?.chunk_count ?? 0}</b></div><div className="segment-stat"><span>WHOLE-FILE SHA-256</span><b className="hash-short">{current?.sha256 ?? "—"}</b></div></div>
      <div className="panel chunks-panel"><div className="panel-header"><div><h3>Chunk manifest</h3><p>Each chunk is encrypted and verified independently.</p></div><span className="manifest-tag"><Check size={13} /> SHA-256 verified on download</span></div>{busy ? <div className="loading-row"><LoaderCircle className="spin" size={18} /> Loading chunk metadata…</div> : <div className="table-wrap"><table><thead><tr><th>INDEX</th><th>CHUNK NAME</th><th>SIZE</th><th>SHA-256</th><th>ENCRYPTED CHECKSUM</th></tr></thead><tbody>{chunks.map((chunk) => <tr key={chunk.chunk_index}><td><span className="index-tag">{String(chunk.chunk_index).padStart(3, "0")}</span></td><td><span className="chunk-name">chunk-{String(chunk.chunk_index).padStart(6, "0")}.bin</span></td><td>{formatBytes(chunk.size_bytes)}</td><td><code className="hash-value" title={chunk.sha256}>{chunk.sha256.slice(0, 18)}…</code></td><td><code className="hash-value" title={chunk.encrypted_sha256}>{chunk.encrypted_sha256.slice(0, 18)}…</code></td></tr>)}</tbody></table></div>}</div>
    </>}
    <div className="info-strip"><FileArchive size={17} /><span><b>How the segments work</b><small>CloudVault slices the source file into your selected chunk size and encrypts each piece with a unique nonce. The manifest stores ordering, IVs, authentication tags, and checksums needed by the backend to verify and reconstruct your file.</small></span></div>
  </>;
}

function EncryptionPage({ files, status }: { files: CloudFile[]; status: CloudStatus["services"] }) {
  return <>
    <PageHeading eyebrow="DATA PROTECTION" title="Encryption" description="Understand how CloudVault protects files from upload through verified download." />
    <div className="security-banner"><span className="security-banner-icon"><ShieldCheck size={22} /></span><div><b>{status.encryption ? "Backend encryption is configured" : "Encryption is not configured"}</b><p>{status.encryption ? "New uploads are encrypted using AES-256-GCM before they are sent to S3." : "Set ENCRYPTION_KEY to a random 32-byte (64 hex character) key in the backend environment before uploading files."}</p></div><span className={`status-chip ${status.encryption ? "success" : "warning"}`}>{status.encryption ? "AES-256-GCM" : "Needs setup"}</span></div>
    <div className="security-cards"><article className="panel security-card"><span className="stat-icon violet"><KeyRound size={19} /></span><h3>AES-256-GCM</h3><p>Each chunk is encrypted on the server with a unique 96-bit nonce and authenticated encryption tag. The key never leaves the backend.</p><div className="security-fact"><span>Key length</span><b>256 bits</b></div><div className="security-fact"><span>Nonce per chunk</span><b>Unique, random</b></div></article><article className="panel security-card"><span className="stat-icon green"><FileCheck2 size={19} /></span><h3>Integrity checks</h3><p>SHA-256 digests are computed for the original file and for each plaintext and ciphertext chunk.</p><div className="security-fact"><span>Files encrypted</span><b>{files.filter((file) => file.encrypted).length} / {files.length}</b></div><div className="security-fact"><span>Verification</span><b>On each download</b></div></article><article className="panel security-card"><span className="stat-icon blue"><Database size={19} /></span><h3>Two layers at rest</h3><p>Application-level encryption is combined with S3 Server-Side Encryption (SSE-S3) for stored file chunks.</p><div className="security-fact"><span>S3 ACL</span><b>Private by default</b></div><div className="security-fact"><span>Key exposure</span><b>Backend only</b></div></article></div>
    <div className="callout-note key-warning"><b>Back up your encryption key securely</b><span>Without the original ENCRYPTION_KEY, AES-GCM-encrypted file chunks cannot be decrypted. Use a secret manager in production; never commit the key or place it in VITE_ variables.</span></div>
  </>;
}

function DownloadsPage({ downloads }: { downloads: Array<{ id: string; file_name: string; mode: string; size_bytes: number; created_at: string }> }) {
  return <>
    <PageHeading eyebrow="FILE ACTIVITY" title="Downloads" description="A history of original file exports and encrypted data downloads." />
    <div className="panel files-table-panel">{downloads.length ? <div className="table-wrap"><table><thead><tr><th>FILE NAME</th><th>DOWNLOAD TYPE</th><th>SIZE</th><th>DATE</th></tr></thead><tbody>{downloads.map((item) => <tr key={item.id}><td><span className="file-cell"><span className="file-type-icon"><ArrowDownToLine size={15} /></span><b>{item.file_name}</b></span></td><td><span className={`mode-tag ${item.mode}`}>{item.mode === "original" ? "Original · decrypted" : "Encrypted data"}</span></td><td>{formatBytes(item.size_bytes)}</td><td>{dateLabel(item.created_at)}</td></tr>)}</tbody></table></div> : <EmptyState icon={ArrowDownToLine} title="No download history" text="Downloads are recorded here after a successful, integrity-checked export." />}</div>
    <div className="info-strip"><ShieldCheck size={17} /><span><b>Every original download is verified</b><small>CloudVault checks each stored ciphertext checksum, authenticates and decrypts each chunk, then checks the reconstructed file hash before it is sent to your browser.</small></span></div>
  </>;
}

function HostingPage({ kind, status, session, disabled, deployments, onError, onSuccess }: {
  kind: "portfolio" | "documentation"; status: CloudStatus["services"]; session: Session | null; disabled: boolean; deployments: Deployment[];
  onError: (message: string) => void; onSuccess: (message: string) => void;
}) {
  const [name, setName] = useState(kind === "portfolio" ? "My portfolio" : "Project documentation");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    fileInput.current?.setAttribute("webkitdirectory", "");
    fileInput.current?.setAttribute("directory", "");
  }, []);
  const siteDeployments = deployments.filter((deployment) => deployment.kind === kind);
  async function publish(event: React.FormEvent) {
    event.preventDefault();
    if (!session || !selectedFiles.length) { onError("Choose your website files and sign in before publishing."); return; }
    setBusy(true); onError("");
    const body = new FormData();
    body.append("name", name);
    const rootFolder = selectedFiles.find((file) => file.webkitRelativePath.toLowerCase().endsWith("/index.html"))
      ?.webkitRelativePath.split("/")[0];
    selectedFiles.forEach((file) => {
      const fullPath = file.webkitRelativePath || file.name;
      const relativePath = rootFolder && fullPath.startsWith(`${rootFolder}/`) ? fullPath.slice(rootFolder.length + 1) : fullPath;
      body.append("files", file, relativePath);
    });
    try {
      const result = await apiRequest<{ publishedUrl: string; fileCount: number }>(`/deployments/${kind}`, session, { method: "POST", body });
      setSelectedFiles([]);
      onSuccess(`Published ${result.fileCount} website files. Your site is live at ${result.publishedUrl}`);
    } catch (cause) { onError(cause instanceof Error ? cause.message : "Website deployment failed."); }
    finally { setBusy(false); }
  }
  const title = kind === "portfolio" ? "Portfolio hosting" : "Documentation hosting";
  const latestPublished = siteDeployments.find((deployment) => deployment.status === "published" && deployment.published_url);
  return <>
    <PageHeading eyebrow="STATIC SITE PUBLISHING" title={title} description={kind === "portfolio" ? "Publish your HTML, CSS, JavaScript, and assets to private S3 storage and deliver them via CloudFront." : "Publish project documentation as a static website on your CloudFront distribution."} />
    <div className="hosting-layout"><form className="panel hosting-form" onSubmit={publish}><div className="panel-header"><div><h3>New deployment</h3><p>Upload a folder containing an index.html file at its root.</p></div><span className="hosting-icon"><Code2 size={19} /></span></div>
      <label className="field-label" htmlFor={`${kind}-name`}>Site name</label><input id={`${kind}-name`} value={name} onChange={(event) => setName(event.target.value)} maxLength={100} />
      <label className="field-label hosting-files-label">Website folder</label><label className={`dropzone site-dropzone ${selectedFiles.length ? "has-file" : ""}`}><input ref={fileInput} type="file" multiple onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))} /><span className="drop-icon"><FolderOpen size={23} /></span><b>{selectedFiles.length ? `${selectedFiles.length} files selected` : "Select your website folder"}</b><small>{selectedFiles.length ? selectedFiles.slice(0, 3).map((file) => file.webkitRelativePath).join(" · ") : "Folder upload preserves relative paths; index.html must be at the folder root."}</small><span className="browse-link">Browse folder</span></label>
      <div className="hosting-url-note"><LockKeyhole size={15} /><span>Website files are stored in your private S3 bucket and served through the configured CloudFront distribution. S3 public access is not required.</span></div>
      <button className="button primary full" disabled={busy || disabled || selectedFiles.length === 0}>{busy ? <><LoaderCircle className="spin" size={16} /> Publishing…</> : <><Globe2 size={16} /> Publish to CloudFront</>}</button>
      {disabled && <p className="form-hint">Publishing is disabled in preview mode.</p>}
    </form><div className="hosting-side"><div className="panel hosting-checks"><h3>Before you publish</h3><ServiceRow name="Private S3 bucket" detail={status.storage ? "Environment configured; AWS checked on publish" : "Set AWS_REGION and S3_BUCKET"} ready={status.storage} /><ServiceRow name="CloudFront distribution" detail={status.cdn ? "Environment configured; distribution checked on publish" : "Set CloudFront distribution ID and domain"} ready={status.cdn} /><ServiceRow name="Root index.html" detail="Required in uploaded folder" ready={selectedFiles.some((file) => (file.webkitRelativePath || file.name).split("/").length === 2 && (file.webkitRelativePath || file.name).split("/").at(-1)?.toLowerCase() === "index.html")} /><div className="callout-note"><b>HTTPS delivery</b><span>Sites use HTTPS links only after the configured CloudFront distribution is deployed and its default or custom TLS certificate is valid. Custom aliases are checked by the backend during publish.</span></div></div><div className="panel"><div className="panel-header"><div><h3>Deployment history</h3><p>{kind === "portfolio" ? "Portfolio sites" : "Documentation sites"}</p></div></div>{siteDeployments.length ? <div className="compact-list">{siteDeployments.slice(0, 4).map((deployment) => <div className="compact-row" key={deployment.id}><span className="compact-icon site-icon"><Globe2 size={15} /></span><span className="compact-main"><b>{deployment.name}</b><small>{dateLabel(deployment.created_at)}{deployment.published_url && <> · <a className="preview-link" href={deployment.published_url} target="_blank" rel="noreferrer">Open site</a></>}</small></span><span className={`deployment-status ${deployment.status}`}>{deployment.status}</span></div>)}</div> : <p className="muted-empty">No deployments yet.</p>}</div></div></div>
    {kind === "documentation" && latestPublished?.published_url && <div className="panel docs-preview"><div className="panel-header"><div><h3>Documentation preview</h3><p>{latestPublished.name} · preview runs from its published CloudFront URL</p></div><a className="link-button" href={latestPublished.published_url} target="_blank" rel="noreferrer">Open in new tab <ArrowRight size={14} /></a></div><iframe title={`${latestPublished.name} documentation preview`} src={latestPublished.published_url} sandbox="allow-scripts" loading="lazy" referrerPolicy="no-referrer" /></div>}
  </>;
}

function CdnPage({ status, deployments, session, disabled, onError, onSuccess }: {
  status: CloudStatus["services"]; deployments: Deployment[]; session: Session | null; disabled: boolean;
  onError: (message: string) => void; onSuccess: (message: string) => void;
}) {
  const [busyId, setBusyId] = useState("");
  async function invalidate(deployment: Deployment) {
    if (!session) return;
    setBusyId(deployment.id);
    try {
      const result = await apiRequest<{ invalidationId?: string; status: string }>(`/deployments/${deployment.id}/invalidate`, session, { method: "POST" });
      onSuccess(`CloudFront accepted invalidation ${result.invalidationId ?? ""} (${result.status}).`);
    } catch (cause) { onError(cause instanceof Error ? cause.message : "Invalidation failed."); }
    finally { setBusyId(""); }
  }
  return <>
    <PageHeading eyebrow="GLOBAL DELIVERY" title="CDN & CloudFront" description="Distribute your published websites from edge locations close to your visitors." />
    <div className="cdn-hero panel"><div className="cdn-globe"><Globe2 size={33} /></div><div className="cdn-hero-copy"><div className="eyebrow">AMAZON CLOUDFRONT</div><h2>One origin. Global delivery.</h2><p>CloudFront caches your static assets at edge locations around the world. Visitors get content from a nearby edge; cache invalidations request fresh content after an update.</p></div><span className={`status-chip ${status.cdn ? "success" : "warning"}`}>{status.cdn ? "Configured" : "Not configured"}</span></div>
    <div className="cdn-metrics"><div className="panel cdn-metric"><span>CDN CONNECTION</span><b>{status.cdn ? "Connected" : "Needs setup"}</b><small>{status.cdn ? "Distribution is configured on the backend" : "Set CLOUDFRONT_DISTRIBUTION_ID and CLOUDFRONT_DOMAIN"}</small></div><div className="panel cdn-metric"><span>ACTIVE SITES</span><b>{deployments.filter((deployment) => deployment.status === "published").length}</b><small>Successfully published deployments</small></div><div className="panel cdn-metric"><span>HTTPS</span><b>Check distribution</b><small>CloudVault does not detect certificate configuration</small></div></div>
    <div className="panel deployment-panel"><div className="panel-header"><div><h3>Deployment cache</h3><p>Request cache invalidation after updating site files.</p></div><RefreshCw size={17} className="panel-icon" /></div>{deployments.length ? <div className="table-wrap"><table><thead><tr><th>WEBSITE</th><th>STATUS</th><th>PUBLISHED URL</th><th>LAST INVALIDATION</th><th></th></tr></thead><tbody>{deployments.map((deployment) => <tr key={deployment.id}><td><span className="file-cell"><span className="file-type-icon"><Globe2 size={15} /></span><span><b>{deployment.name}</b><small>{deployment.kind}</small></span></span></td><td><span className={`deployment-status ${deployment.status}`}>{deployment.status}</span></td><td>{deployment.published_url ? <a href={deployment.published_url} target="_blank" rel="noreferrer" className="url-link">{deployment.published_url.replace(/^https?:\/\//, "").slice(0, 35)}…</a> : "—"}</td><td>{deployment.cdn_invalidation_id ?? "—"}</td><td><button className="button secondary small" disabled={disabled || busyId === deployment.id || !status.cdn} onClick={() => void invalidate(deployment)}>{busyId === deployment.id ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />} Invalidate</button></td></tr>)}</tbody></table></div> : <EmptyState icon={Globe2} title="No published sites" text="Publish a portfolio or documentation site first; its distribution will appear here." />}</div>
    <div className="info-strip"><Activity size={17} /><span><b>What does invalidation do?</b><small>CloudFront may continue serving a cached copy until its TTL expires. An invalidation asks edge locations to remove matching cached objects so the next request fetches the updated object from S3. Invalidation is a real AWS API request and requires CloudFront permissions.</small></span></div>
  </>;
}

function AnalyticsPage({ files, downloads, deployments, usedBytes }: { files: CloudFile[]; downloads: Array<{ id: string; file_name: string; mode: string; size_bytes: number; created_at: string }>; deployments: Deployment[]; usedBytes: number }) {
  const bytesByType = files.reduce<Record<string, number>>((total, file) => { const kind = file.mime_type.split("/")[0] || "other"; total[kind] = (total[kind] ?? 0) + file.size_bytes; return total; }, {});
  return <>
    <PageHeading eyebrow="WORKSPACE INSIGHTS" title="Analytics" description="A summary calculated from your actual CloudVault file, download, and deployment records." />
    <section className="stats-grid analytics-stats"><StatCard icon={HardDrive} title="Storage used" value={formatBytes(usedBytes)} detail={`${files.length} files`} tint="blue" /><StatCard icon={ArrowDownToLine} title="Downloads" value={String(downloads.length)} detail="Recorded exports" tint="violet" /><StatCard icon={Globe2} title="Deployments" value={String(deployments.length)} detail="Published sites" tint="green" /><StatCard icon={FileArchive} title="Total chunks" value={String(files.reduce((sum, file) => sum + file.chunk_count, 0))} detail="Encrypted objects" tint="amber" /></section>
    <div className="dashboard-grid"><div className="panel"><div className="panel-header"><div><h3>Storage by file type</h3><p>Computed from your uploaded file metadata</p></div></div>{Object.entries(bytesByType).length ? <div className="analytics-bars">{Object.entries(bytesByType).map(([type, bytes]) => <div className="bar-row" key={type}><div><b>{type}</b><span>{formatBytes(bytes)}</span></div><div className="bar-track"><span style={{ width: `${Math.max(3, bytes / usedBytes * 100)}%` }} /></div></div>)}</div> : <EmptyState icon={Activity} title="No metrics yet" text="Your storage metrics will appear after uploading files." />}</div><div className="panel"><div className="panel-header"><div><h3>Activity overview</h3><p>Records currently in your account</p></div></div><div className="analytics-breakdown"><div><span>Files uploaded</span><b>{files.length}</b></div><div><span>Original downloads</span><b>{downloads.filter((item) => item.mode === "original").length}</b></div><div><span>Encrypted downloads</span><b>{downloads.filter((item) => item.mode === "encrypted").length}</b></div><div><span>Published sites</span><b>{deployments.filter((item) => item.status === "published").length}</b></div></div></div></div>
    <p className="table-footnote"><Activity size={14} /> These are account-level counts, not AWS billing metrics or CloudFront traffic analytics.</p>
  </>;
}

function SettingsPage({ status }: { status: CloudStatus["services"] }) {
  const variables = [
    ["Supabase Auth & database", "VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY", status.supabase],
    ["Private file storage", "AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET", status.storage],
    ["File encryption", "ENCRYPTION_KEY (32 bytes, 64 hex characters)", status.encryption],
    ["CDN static hosting", "CLOUDFRONT_DISTRIBUTION_ID, CLOUDFRONT_DOMAIN", status.cdn],
  ];
  return <>
    <PageHeading eyebrow="WORKSPACE CONFIGURATION" title="Settings" description="Connect credentials in your backend environment. Secrets are never displayed here." />
    <div className="panel config-panel"><div className="panel-header"><div><h3>Service configuration</h3><p>These statuses are read from the backend environment. No credentials are returned to the browser.</p></div><Settings2 size={18} className="panel-icon" /></div><div className="config-list">{variables.map(([name, variable, ready]) => <div className="config-row" key={name as string}><span className={`service-indicator ${ready ? "ready" : ""}`}>{ready ? <Check size={12} /> : <X size={11} />}</span><div className="config-copy"><b>{name}</b><small>{variable}</small></div><span className={`service-state ${ready ? "ready-text" : ""}`}>{ready ? "Configured" : "Missing"}</span></div>)}</div></div>
    <div className="dashboard-grid settings-grid"><div className="panel settings-card"><span className="stat-icon blue"><Database size={18} /></span><h3>Database setup</h3><p>Run <code>supabase/schema.sql</code> in the Supabase SQL editor to create ownership-scoped tables and row-level security policies.</p></div><div className="panel settings-card"><span className="stat-icon violet"><Cloud size={18} /></span><h3>Private S3 origin</h3><p>Block all public access. Configure CloudFront with an Origin Access Control (OAC) and restrict the bucket policy to that distribution.</p></div></div>
    <div className="panel tls-panel"><span className="tls-icon"><LockKeyhole size={18} /></span><div><b>HTTPS and custom domains</b><p>CloudVault uses an HTTPS URL for the configured CloudFront domain, but does not inspect distribution certificate settings. HTTPS delivery is only established when your distribution has an attached, valid ACM certificate and viewer policy redirects HTTP to HTTPS.</p><ol><li>Request or import the certificate in ACM <b>us-east-1</b>.</li><li>Add your custom domain as an alternate domain name on the CloudFront distribution.</li><li>Attach the ACM certificate and choose “Redirect HTTP to HTTPS”.</li><li>Point your DNS record to the CloudFront distribution domain and verify TLS in a browser.</li></ol></div></div>
    <div className="info-strip"><ShieldCheck size={17} /><span><b>Production security notes</b><small>Use an IAM role instead of static AWS keys, keep SUPABASE_SERVICE_ROLE_KEY and ENCRYPTION_KEY backend-only, rotate secrets safely, and back up your encryption key securely.</small></span></div>
  </>;
}

function HelpPage() {
  return <>
    <PageHeading eyebrow="LEARN & EXPLORE" title="How CloudVault works" description="A simple guide to the cloud concepts used in this project." />
    <div className="panel architecture-panel"><div className="panel-header"><div><h3>CloudVault architecture</h3><p>Private data flows through an authenticated backend before it reaches cloud storage.</p></div><CloudCog size={19} className="panel-icon" /></div><div className="architecture-flow"><div className="flow-node user-node"><span><Files size={19} /></span><b>Your browser</b><small>React + Supabase Auth</small></div><ArrowRight className="flow-arrow" size={18} /><div className="flow-node api-node"><span><KeyRound size={19} /></span><b>Express API</b><small>Auth · chunk · encrypt</small></div><ArrowRight className="flow-arrow" size={18} /><div className="flow-node db-node"><span><Database size={19} /></span><b>Supabase</b><small>Auth + metadata</small></div><ArrowRight className="flow-arrow" size={18} /><div className="flow-node s3-node"><span><Cloud size={19} /></span><b>Private S3</b><small>Encrypted objects</small></div></div><div className="architecture-cdn"><span><Globe2 size={17} /></span><div><b>CloudFront CDN</b><small>Static websites · HTTPS when configured · edge caching</small></div><span className="flow-branch">↑ serves published site files from the S3 origin</span></div></div>
    <div className="concept-grid"><ConceptCard icon={FileArchive} title="File segmentation" text="A large file is split into smaller byte ranges called chunks. Each chunk gets an index, size, and SHA-256 hash. The backend uses that manifest to verify and reconstruct the original byte-for-byte." /><ConceptCard icon={KeyRound} title="Encryption" text="AES-256-GCM protects each file chunk with a unique random nonce and authentication tag. The backend holds the key; the browser never receives it. Changing a tag or ciphertext fails authentication." /><ConceptCard icon={Database} title="Cloud storage" text="Amazon S3 stores objects durably. CloudVault keeps file objects private, uses opaque per-user paths, and enables S3-managed encryption as an additional at-rest layer." /><ConceptCard icon={Globe2} title="CDN & CloudFront" text="A content delivery network caches static assets at edge locations. Nearby edge delivery reduces latency; cache invalidations request that cached versions be removed after an update." /><ConceptCard icon={LockKeyhole} title="HTTPS & TLS" text="HTTPS encrypts traffic between a browser and a web server. CloudFront requires a valid ACM certificate and a configured viewer policy. A URL alone does not prove TLS is enabled." /><ConceptCard icon={ShieldCheck} title="Authorization" text="Supabase Auth establishes the user identity. The Express API validates each access token and includes that user ID in every data lookup; PostgreSQL RLS further restricts ownership." /></div>
    <div className="workflow-grid"><div className="panel workflow-card"><h3>Secure file upload</h3><ol><li>Select a file and chunk size.</li><li>Express validates user token and upload limit.</li><li>File is segmented and encrypted on the server.</li><li>Encrypted chunks go to private S3; metadata goes to PostgreSQL.</li><li>Checksums are checked before reconstructing a download.</li></ol></div><div className="panel workflow-card"><h3>Static website publishing</h3><ol><li>Choose a folder containing a root index.html.</li><li>Express validates paths, types, and user ownership.</li><li>Website files upload to a private S3 prefix.</li><li>CloudFront invalidation is requested through AWS.</li><li>Use HTTPS only after confirming CloudFront TLS configuration.</li></ol></div></div>
  </>;
}

function ConceptCard({ icon: Icon, title, text }: { icon: typeof Cloud; title: string; text: string }) {
  return <article className="panel concept-card"><span className="concept-icon"><Icon size={18} /></span><h3>{title}</h3><p>{text}</p></article>;
}
