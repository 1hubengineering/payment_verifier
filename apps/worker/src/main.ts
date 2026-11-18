import { ENV } from '../env.ts';
import { openOperatorRuntime, OperatorError } from '../../cli/src/runtime.ts';
import { safeErrorCode } from '../../cli/src/cli.ts';
import { runWorker } from './loop.ts';
const args = process.argv.slice(2),
  controller = new AbortController();
const stop = (): void => controller.abort();
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
try {
  if (args.length === 1 && args[0] === '--help')
    process.stdout.write(
      'Durable SQLite receipt worker: [--once]. Varlock configuration matches the operator CLI.\n',
    );
  else {
    if (args.length > 1 || (args.length === 1 && args[0] !== '--once'))
      throw new OperatorError('INVALID_INPUT');
    const runtime = await openOperatorRuntime(ENV, true);
    try {
      await runWorker(runtime.jobs!, {
        signal: controller.signal,
        once: args[0] === '--once',
        emit: (outcome) => process.stdout.write(JSON.stringify({ worker: outcome }) + '\n'),
      });
    } finally {
      runtime.close();
    }
  }
} catch (error) {
  process.stderr.write(JSON.stringify({ error: safeErrorCode(error) }) + '\n');
  process.exitCode = 1;
} finally {
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
}
