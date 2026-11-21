// The mainnet confirmation. It only accepts an answer typed in a real terminal,
// so a script cannot pipe "yes" into it by accident.
import { createInterface } from 'node:readline/promises';

export function assertInteractive() {
  if (!process.stdin.isTTY) {
    throw new Error('Mainnet needs an interactive confirmation; run this command in a terminal.');
  }
}

export async function confirmMainnet(): Promise<boolean> {
  assertInteractive();
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('\nThis spends real SOL on mainnet. Revoked authorities can never be restored.');
    const answer = await readline.question('Type "yes" to create this token on mainnet: ');
    return answer.trim().toLowerCase() === 'yes';
  } finally {
    readline.close();
  }
}
