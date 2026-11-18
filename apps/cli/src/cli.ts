import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import {
  createPaymentExpectation,
  compareReceipt,
  VerificationError,
} from '@1hubengineering/verifier';
import type { VerificationSubmission, PaymentScope } from '@1hubengineering/verifier';
import { JobError } from '@1hubengineering/verifier/jobs';
import { parseReceiptHtml } from '@1hubengineering/verifier/providers';
import { openOperatorRuntime, OperatorError } from './runtime.ts';
import type { OperatorConfiguration } from './runtime.ts';

const help = `Trusted operator CLI (receipt evidence only; settlement stays UNCONFIRMED)
  help
  diagnose <trusted-expectation.json> <saved-receipt.html>  (no database/claim)
  register <trusted-expectation.json>
  verify <submission.json>
  enqueue <submission.json>
  status <scope-and-job.json>
  cancel <scope.json>
Submission fields: tenantId, paymentId, idempotencyKey, receiptLocator.
Scope fields: tenantId, paymentId. Status also requires jobId.
Provider traffic defaults disabled. Queue commands require RECEIPT_JOB_KEY.
`;
async function readBounded(filename: string, maxBytes: number): Promise<string> {
  try {
    const handle = await open(filename, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > maxBytes) throw new OperatorError('INVALID_FILE');
      const buffer = Buffer.alloc(maxBytes + 1);
      let read = 0;
      while (read < buffer.length) {
        const part = await handle.read(buffer, read, buffer.length - read, null);
        if (part.bytesRead === 0) break;
        read += part.bytesRead;
      }
      if (read > maxBytes) throw new OperatorError('INVALID_FILE');
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, read));
    } finally {
      await handle.close();
    }
  } catch {
    throw new OperatorError('INVALID_FILE');
  }
}
async function readObject(filename: string): Promise<Record<string, unknown>> {
  try {
    const value: unknown = JSON.parse(await readBounded(filename, 16000));
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new OperatorError('INVALID_INPUT');
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof OperatorError) throw error;
    throw new OperatorError('INVALID_INPUT');
  }
}
function fields(value: Record<string, unknown>, names: readonly string[]): void {
  if (
    Object.keys(value).some((key) => !names.includes(key)) ||
    names.some((key) => typeof value[key] !== 'string')
  )
    throw new OperatorError('INVALID_INPUT');
}
function trustedExpectation(input: unknown): ReturnType<typeof createPaymentExpectation> {
  try {
    return createPaymentExpectation(input);
  } catch {
    throw new OperatorError('INVALID_INPUT');
  }
}
export function safeErrorCode(error: unknown): string {
  if (
    error instanceof OperatorError ||
    error instanceof VerificationError ||
    error instanceof JobError
  )
    return error.code;
  return 'STORAGE_OR_RUNTIME_UNAVAILABLE';
}
export async function runCli(
  args: readonly string[],
  config: OperatorConfiguration,
): Promise<unknown> {
  const [command = 'help', file, htmlFile] = args;
  if (command === 'help' && args.length <= 1) return help;
  if (command === 'diagnose') {
    if (args.length !== 3) throw new OperatorError('INVALID_INPUT');
    const expected = trustedExpectation(await readObject(file!));
    const parsed = parseReceiptHtml(expected.provider, await readBounded(htmlFile!, 2000000));
    return {
      diagnostic: true,
      claimCreated: false,
      provenance: parsed.provenance,
      result: compareReceipt(expected, parsed.evidence),
    };
  }
  if (args.length !== 2 || !['register', 'verify', 'enqueue', 'status', 'cancel'].includes(command))
    throw new OperatorError('INVALID_INPUT');
  const input = await readObject(file!);
  if (command === 'register') trustedExpectation(input);
  else
    fields(
      input,
      command === 'cancel'
        ? ['tenantId', 'paymentId']
        : command === 'status'
          ? ['tenantId', 'paymentId', 'jobId']
          : ['tenantId', 'paymentId', 'idempotencyKey', 'receiptLocator'],
    );
  const runtime = await openOperatorRuntime(config, command === 'enqueue' || command === 'status');
  try {
    if (command === 'register') {
      const expected = trustedExpectation(input);
      await runtime.verifier.registerExpectation(expected);
      return { registered: true, tenantId: expected.tenantId, paymentId: expected.paymentId };
    }
    if (command === 'verify')
      return await runtime.verifier.submit(input as unknown as VerificationSubmission, {
        timeoutMs: config.RECEIPT_TIMEOUT_MS,
      });
    if (command === 'enqueue')
      return await runtime.jobs!.enqueue(input as unknown as VerificationSubmission);
    if (command === 'status')
      return await runtime.jobs!.status(input as unknown as PaymentScope, input.jobId as string);
    await runtime.verifier.cancelExpectation(input as unknown as PaymentScope);
    return { cancelled: true };
  } finally {
    runtime.close();
  }
}
