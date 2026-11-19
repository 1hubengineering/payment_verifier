import { runDeploymentCheck } from './deployment-check.ts';

try {
  const report = await runDeploymentCheck(process.argv.slice(2));
  console.log(typeof report === 'string' ? report : JSON.stringify(report, null, 2));
  if (typeof report !== 'string' && report.failed) process.exitCode = 1;
} catch {
  console.error('Invalid diagnostic configuration. Run pnpm check:deployment --help.');
  process.exitCode = 2;
}
