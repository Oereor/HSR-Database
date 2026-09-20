import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export interface FileSummary {
  files: number;
  bytes: number;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

export function logFileSummary(label: string, summary: FileSummary): void {
  console.log(
    `[deploy:io] ${label} files=${summary.files} bytes=${summary.bytes} (${formatBytes(summary.bytes)})`
  );
}

export async function summarizeDirectory(
  root: string,
  ignoredNames: ReadonlySet<string> = new Set()
): Promise<FileSummary> {
  const summary: FileSummary = { files: 0, bytes: 0 };
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop()!;
    const entries = await readdir(directory, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && !ignoredNames.has(entry.name));
    const metadata = await Promise.all(
      files.map((entry) => stat(path.join(directory, entry.name)))
    );
    summary.files += metadata.length;
    summary.bytes += metadata.reduce((total, value) => total + value.size, 0);
    for (const entry of entries)
      if (entry.isDirectory() && !ignoredNames.has(entry.name))
        pending.push(path.join(directory, entry.name));
  }
  return summary;
}

export async function withProcessTelemetry<T>(
  label: string,
  operation: () => Promise<T>
): Promise<T> {
  const startedCpu = process.cpuUsage();
  try {
    return await operation();
  } finally {
    const cpu = process.cpuUsage(startedCpu);
    const resources = process.resourceUsage();
    console.log(
      `[deploy:resource] ${label} user=${(cpu.user / 1_000_000).toFixed(3)}s system=${(cpu.system / 1_000_000).toFixed(3)}s max-rss=${(resources.maxRSS / 1024).toFixed(1)} MiB`
    );
  }
}
