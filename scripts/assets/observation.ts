import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp, { type Metadata } from 'sharp';

export interface ObservedAssetFile {
  absolutePath: string;
  relativePath: string;
  size: number;
}

export class AssetFilesystemObservation {
  readonly root: string;
  readonly files: ReadonlyMap<string, ObservedAssetFile>;
  readonly filesByDirectory: ReadonlyMap<string, ReadonlySet<string>>;
  readonly summary: { files: number; bytes: number };
  metadataInspections = 0;
  readonly #metadata = new Map<string, Promise<Metadata>>();

  constructor(
    root: string,
    files: ReadonlyMap<string, ObservedAssetFile>,
    filesByDirectory: ReadonlyMap<string, ReadonlySet<string>>
  ) {
    this.root = path.resolve(root);
    this.files = files;
    this.filesByDirectory = filesByDirectory;
    this.summary = {
      files: files.size,
      bytes: [...files.values()].reduce((total, file) => total + file.size, 0)
    };
  }

  hasFile(file: string): boolean {
    return this.files.has(path.resolve(file));
  }

  fileNames(directory: string): ReadonlySet<string> | undefined {
    return this.filesByDirectory.get(path.resolve(directory));
  }

  metadata(file: string): Promise<Metadata> {
    const absolute = path.resolve(file);
    const existing = this.#metadata.get(absolute);
    if (existing) return existing;
    if (!this.files.has(absolute))
      return Promise.reject(new Error(`视觉资源观察中缺少文件：${absolute}`));
    this.metadataInspections += 1;
    const pending = sharp(absolute).metadata();
    this.#metadata.set(absolute, pending);
    return pending;
  }
}

export async function observeAssetFilesystem(
  root: string,
  directories: readonly string[]
): Promise<AssetFilesystemObservation> {
  const resolvedRoot = path.resolve(root);
  const files = new Map<string, ObservedAssetFile>();
  const filesByDirectory = new Map<string, ReadonlySet<string>>();
  for (const directory of directories) {
    const resolvedDirectory = path.resolve(directory);
    const entries = await readdir(resolvedDirectory, { withFileTypes: true });
    const names = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
    const metadata = await Promise.all(
      names.map((name) => stat(path.join(resolvedDirectory, name)))
    );
    filesByDirectory.set(resolvedDirectory, new Set(names));
    for (const [index, name] of names.entries()) {
      const absolutePath = path.join(resolvedDirectory, name);
      files.set(absolutePath, {
        absolutePath,
        relativePath: path.relative(resolvedRoot, absolutePath).replaceAll('\\', '/'),
        size: metadata[index].size
      });
    }
  }
  return new AssetFilesystemObservation(resolvedRoot, files, filesByDirectory);
}
