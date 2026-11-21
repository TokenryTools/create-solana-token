// Loads the signer from a keypair file. The secret bytes are only passed to Kit;
// they are never printed, logged or written anywhere.
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { createKeyPairSignerFromBytes, type KeyPairSigner } from '@solana/kit';

export async function loadKeypairSigner(path: string): Promise<KeyPairSigner> {
  const fullPath = resolve(path.replace(/^~(?=$|[\\/])/, homedir()));

  let text: string;
  try {
    text = await readFile(fullPath, 'utf8');
  } catch {
    throw new Error(
      `Cannot read the keypair file at ${fullPath}. ` +
        'Create one with "solana-keygen new" or pass --keypair <path>.',
    );
  }

  let bytes: unknown;
  try {
    bytes = JSON.parse(text);
  } catch {
    throw new Error(`${fullPath} is not a JSON keypair file (expected an array of 64 numbers).`);
  }
  if (!Array.isArray(bytes) || bytes.length !== 64 || !bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) {
    throw new Error(`${fullPath} is not a Solana keypair file (expected an array of 64 numbers).`);
  }

  return createKeyPairSignerFromBytes(new Uint8Array(bytes));
}
