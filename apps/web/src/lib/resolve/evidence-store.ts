import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EvidenceBundle } from '@/lib/near/evidence';

/** On disk, so this deployment needs a persistent volume at `EVIDENCE_DIR`. */
const directory = () => process.env.EVIDENCE_DIR?.trim() || path.join(process.cwd(), '.data', 'evidence');
const fileOf = (marketId: string) => path.join(directory(), `${marketId}.json`);

export async function readBundle(marketId: string): Promise<EvidenceBundle | null> {
  if (!/^\d+$/.test(marketId)) return null;
  try {
    return JSON.parse(await readFile(fileOf(marketId), 'utf8')) as EvidenceBundle;
  } catch {
    return null;
  }
}

/** Whole or not at all: readers never see half a file. */
export async function writeBundle(bundle: EvidenceBundle): Promise<void> {
  await mkdir(directory(), { recursive: true });
  const file = fileOf(bundle.marketId);
  await writeFile(`${file}.tmp`, JSON.stringify(bundle));
  await rename(`${file}.tmp`, file);
}
