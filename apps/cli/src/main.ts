import { ENV } from '../env.ts';
import { runCli, safeError } from './cli.ts';
try {
  const result = await runCli(process.argv.slice(2), ENV);
  process.stdout.write(typeof result === 'string' ? result : JSON.stringify(result) + '\n');
} catch (error) {
  process.stderr.write(JSON.stringify({ error: safeError(error) }) + '\n');
  process.exitCode = 1;
}
