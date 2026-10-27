'use client';

import { useState, type ReactNode } from 'react';
import JSZip from 'jszip';
import { FolderOpen, FileArchive, Github, UserX, HardDrive, Trash2, Code2 } from 'lucide-react';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { loadFiles, toClaudePath, type LoadInput } from '@/lib/claude-data/vfs';

const REPO_URL = 'https://github.com/deshraj/Claud-ometer';

function fromFolder(list: FileList): LoadInput[] {
  const inputs: LoadInput[] = [];
  for (const f of Array.from(list)) {
    const p = toClaudePath(f.webkitRelativePath || f.name);
    if (p) inputs.push({ path: p, size: f.size, mtimeMs: f.lastModified, read: () => f.text() });
  }
  return inputs;
}

async function fromZip(file: File): Promise<LoadInput[]> {
  const zip = await JSZip.loadAsync(file);
  const inputs: LoadInput[] = [];
  zip.forEach((rel, entry) => {
    const p = entry.dir ? null : toClaudePath(rel);
    if (p) inputs.push({
      path: p,
      // Uncompressed size isn't public in JSZip's types; it only weights the progress bar.
      size: (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 1,
      mtimeMs: entry.date.getTime(),
      read: () => entry.async('string'),
    });
  });
  return inputs;
}

/** Lime highlighter stroke under a word, as on "mesuré". */
function Mark({ children }: { children: ReactNode }) {
  return (
    <span className="relative whitespace-nowrap">
      <span className="absolute inset-x-[-0.1em] bottom-[0.08em] h-[0.32em] bg-signal/70 dark:bg-signal/25" aria-hidden="true" />
      <span className="relative">{children}</span>
    </span>
  );
}

const PROMISES = [
  { icon: UserX, title: 'Anonyme', text: 'Aucun compte, aucune connexion. Vos identifiants Claude, Codex ou Gemini ne sont jamais lus.' },
  { icon: HardDrive, title: '100 % local', text: 'L’analyse tourne dans votre navigateur : rien n’est envoyé sur Internet.' },
  { icon: Trash2, title: 'Rien n’est conservé', text: 'Fermez l’onglet et tout disparaît. Aucun stockage, aucun cookie de suivi.' },
  { icon: Code2, title: 'Open source', text: 'Code ouvert, sous licence MIT : vous pouvez vérifier chaque promesse.' },
];

export function Landing() {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(getInputs: () => Promise<LoadInput[]> | LoadInput[]) {
    setError(null);
    setProgress(0);
    try {
      const inputs = await getInputs();
      if (!inputs.length) throw new Error('Aucune donnée Claude Code, Codex ou Gemini CLI trouvée. Choisissez le dossier .claude, .codex ou .gemini, ou leur ZIP.');
      await loadFiles(inputs, (done, total) => setProgress(Math.round((done / total) * 100)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lecture impossible.');
      setProgress(null);
    }
  }

  const busy = progress !== null;
  const btn = 'flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors';

  return (
    <div className="flex min-h-screen flex-col px-6 py-6 lg:h-screen lg:overflow-hidden">
      <header className="flex items-center gap-2.5">
        <Logo />
        <span className="text-sm font-semibold tracking-tight">TokenMeter</span>
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:inline">
          / instrument de mesure pour agents de code
        </span>
        <ThemeToggle className="ml-auto" />
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-8 py-6">
      <div className="tick-ruler h-4 w-full" aria-hidden="true" />
      <main className="grid w-full items-center gap-10 lg:grid-cols-[1fr_1.15fr]">
        <section className="space-y-6">
          <div className="space-y-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Claude Code <span className="text-primary">●</span> Codex <span className="text-primary">●</span> Gemini CLI
            </p>
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.035em] lg:text-[3.4rem]">
              Chaque token,{' '}
<Mark>mesuré.</Mark>
            </h1>
            <p className="text-muted-foreground">
              Sessions, tokens, coûts estimés, modèles utilisés et heures de pointe, calculés à partir
              des dossiers que Claude Code, Codex et Gemini CLI tiennent sur votre ordinateur.
            </p>
          </div>

          <ul className="grid grid-cols-2 gap-3">
            {PROMISES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3 rounded-md border border-border bg-card/60 p-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-base font-semibold leading-tight"><Mark>{title}</Mark></p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{text}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="space-y-3 rounded-md border border-border border-l-[3px] border-l-primary bg-card p-5">
            <p className="text-sm">
              Chargez votre dossier <code className="rounded bg-muted px-1.5 py-0.5 text-xs">.claude</code>,{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">.codex</code> ou{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">.gemini</code>
            </p>
            <p className="text-xs text-muted-foreground">
              Windows : <code>%USERPROFILE%\.claude</code>, <code>\.codex</code> ou <code>\.gemini</code> · macOS / Linux : <code>~/.claude</code>, <code>~/.codex</code> ou <code>~/.gemini</code>
            </p>

            {!busy && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90`}>
                  <FolderOpen className="h-4 w-4" />
                  Choisir le dossier
                  <input
                    type="file"
                    // @ts-expect-error non-standard but supported by all major browsers
                    webkitdirectory=""
                    className="hidden"
                    onChange={e => e.target.files && load(() => fromFolder(e.target.files!))}
                  />
                </label>
                <label className={`${btn} border border-border hover:bg-accent`}>
                  <FileArchive className="h-4 w-4" />
                  Ou un fichier .zip
                  <input
                    type="file"
                    accept=".zip"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) load(() => fromZip(f)); }}
                  />
                </label>
              </div>
            )}
            {error && <p className="text-xs text-red-500">{error}</p>}

          </div>
        </section>

        <figure className="hidden overflow-hidden rounded-md border border-border shadow-[0_30px_80px_-30px_rgb(0_0_0/0.45)] lg:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/apercu-light.png" alt="Aperçu du tableau de bord avec des données d'exemple" className="w-full dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/apercu-dark.png" alt="Aperçu du tableau de bord avec des données d'exemple" className="hidden w-full dark:block" />
        </figure>
      </main>

      {/* The same ruler, always shown; it fills with lime while files are read. */}
      <div role="progressbar" aria-label="Chargement" aria-valuenow={progress ?? 0} aria-valuemin={0} aria-valuemax={100}>
        <div className="relative h-4 w-full">
          <div className="tick-ruler absolute inset-0" />
          <div className="tick-ruler tick-ruler-fill absolute inset-y-0 left-0" style={{ width: `${progress ?? 0}%` }} />
        </div>
        <div className="mt-2 flex h-4 items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {busy && (
            <>
              <span>{progress! < 100 ? 'Lecture de votre dossier' : 'Analyse en cours'}</span>
              <span className="tabular-nums text-foreground">{progress} %</span>
            </>
          )}
        </div>
      </div>
      </div>

      <footer className="text-center text-xs text-muted-foreground">
        Cette version en ligne repose sur{' '}
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-foreground underline underline-offset-2 hover:text-primary">
          <Github className="h-3 w-3" />
          Claud-ometer
        </a>
        , le projet open source de deshraj, publié sous licence MIT.
      </footer>
    </div>
  );
}
