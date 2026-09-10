/** Local checksum-addressed upload staging (ING-001 / ING-006). */
import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export class LocalStagingStorage {
  private readonly root = process.env.INGESTION_STAGING_DIR || path.join(process.cwd(), "data", "staging");

  async stage(contentHash: string, buffer: Buffer): Promise<void> {
    const calculated = createHash("sha256").update(buffer).digest("hex");
    if (calculated !== contentHash) throw new Error("Upload checksum verification failed before staging.");
    await mkdir(this.root, { recursive: true });
    await writeFile(this.pathFor(contentHash), buffer, { flag: "w" });
  }

  async retrieve(contentHash: string): Promise<Buffer | null> {
    try {
      const buffer = await readFile(this.pathFor(contentHash));
      return createHash("sha256").update(buffer).digest("hex") === contentHash ? buffer : null;
    } catch { return null; }
  }

  private pathFor(contentHash: string): string {
    if (!/^[a-f0-9]{64}$/i.test(contentHash)) throw new Error("Invalid staged content hash.");
    return path.join(this.root, contentHash.toLowerCase());
  }
}

export const localStagingStorage = new LocalStagingStorage();
