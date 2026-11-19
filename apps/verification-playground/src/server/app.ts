import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fastify from 'fastify';
import type { Database } from 'better-sqlite3';
import { z } from 'zod';
import { createReceiptVerifier, VerificationOperationError } from '@1hubengineering/verifier';
import type {
  ProviderId,
  ReceiptProvider,
  VerificationResult,
  VerificationStorage,
} from '@1hubengineering/verifier';
import { detectPaymentInput } from '@1hubengineering/verifier/input';
import type { HistoryItem, Report, Submission } from '../contracts.ts';
import type { MockCase } from '../presets.ts';
import { benchmarkOptions, createBenchmarks } from './benchmarks.ts';
import type { BenchmarkEnvironment } from './benchmarks.ts';
import { createAuth } from './auth.ts';
import { RequestError } from './request-error.ts';
import { createInstrumentation } from '@1hubengineering/verification-benchmarks/performance';
import { createState } from './state.ts';
import { syntheticProvider } from '@1hubengineering/verification-benchmarks/synthetic';
import {
  acceptedBounds,
  draftSchema,
  paymentExpectation,
  registerSchema,
  saveDraftSchema,
  submissionSchema,
} from './validation.ts';

const tenantId = 'playground-operator';

interface Options {
  origin: string;
  timeoutMs: number;
  retentionDays: number;
  stateDb: Database;
  stores: Record<'simulated' | 'live', VerificationStorage>;
  liveProviders: Partial<Record<ProviderId, ReceiptProvider>>;
  assetsDir?: string;
  benchmarks?: BenchmarkEnvironment;
  now?: () => number;
}

function validated<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fields = [...new Set(result.error.issues.map(({ path }) => path.join('.') || 'request'))];
  throw new RequestError(400, 'INVALID_CONFIGURATION', `Check ${fields.join(', ')}.`);
}
function windowLimit(limit: number, now: () => number) {
  let until = 0;
  let used = 0;
  return () => {
    const time = now();
    if (time >= until) {
      until = time + 60_000;
      used = 0;
    }
    return used++ < limit;
  };
}

function publicResult(result: VerificationResult): VerificationResult {
  // Live report values are minimized independently of the claim and replay records.
  return {
    ...result,
    input: result.input && { ...result.input, identifier: '[redacted]' },
    receipt: result.receipt && {
      ...result.receipt,
      transactionId: result.receipt.transactionId === null ? null : '[redacted]',
      recipientName: result.receipt.recipientName === null ? null : '[redacted]',
      invoiceReference: result.receipt.invoiceReference === null ? null : '[redacted]',
    },
    checks: result.checks.map((check) => {
      if (
        !['transactionId', 'invoiceReference', 'recipientName'].includes(check.field) ||
        check.field === 'amountMinor'
      )
        return check;
      return {
        ...check,
        ...(typeof check.expected === 'string' ? { expected: '[redacted]' } : {}),
        ...(typeof check.actual === 'string' ? { actual: '[redacted]' } : {}),
      };
    }),
  } as VerificationResult;
}

export async function createApp(options: Options) {
  const now = options.now ?? Date.now;
  const { origin, timeoutMs, retentionDays } = options;
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))
  )
    throw new TypeError('Configure an HTTPS origin or a loopback HTTP origin');
  const app = fastify({
    bodyLimit: 32_768,
    requestTimeout: 15_000,
    connectionTimeout: 75_000,
    logger: false,
  });
  const state = createState(options.stateDb, retentionDays * 86_400_000);
  const metrics = createInstrumentation();
  const selectedMock = new AsyncLocalStorage<MockCase>();
  const liveProviders = Object.keys(options.liveProviders) as ProviderId[];
  const liveAdapters = Object.fromEntries(
    Object.entries(options.liveProviders).map(([provider, adapter]) => [
      provider,
      metrics.provider(adapter),
    ]),
  );
  const verifiers = {
    simulated: createReceiptVerifier({
      storage: metrics.storage(options.stores.simulated),
      providers: {
        telebirr: metrics.provider(
          syntheticProvider('telebirr', () => selectedMock.getStore() ?? 'success', { now }),
        ),
        cbe: metrics.provider(
          syntheticProvider('cbe', () => selectedMock.getStore() ?? 'success', { now }),
        ),
      },
      now,
    }),
    live: createReceiptVerifier({
      storage: metrics.storage(options.stores.live),
      providers: liveAdapters,
      now,
    }),
  };
  await verifiers.simulated.initialize();
  await verifiers.live.initialize();

  const benchmarks =
    options.benchmarks && createBenchmarks(options.stateDb, options.benchmarks, now);
  if (benchmarks) app.addHook('onClose', async () => benchmarks.close());
  const auth = createAuth(options.stateDb, url.protocol === 'https:', now);
  const mutate = windowLimit(120, now);
  const liveRate = windowLimit(6, now);
  const active = new Map<string, Submission['mode']>();
  let nextPrune = 0;
  function pruneHistory() {
    const time = now();
    if (time < nextPrune || active.size > 0) return;
    nextPrune = time + 60_000;
    try {
      state.prune(time);
    } catch {
      process.stderr.write('Verification history cleanup will retry.\n');
    }
  }
  const retentionTimer = setInterval(pruneHistory, 60_000);
  retentionTimer.unref();
  app.addHook('onClose', async () => clearInterval(retentionTimer));

  app.addHook('onRequest', async (req, reply) => {
    reply.headers({
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
      'content-security-policy':
        "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
    });
    if (url.protocol === 'https:') reply.header('strict-transport-security', 'max-age=31536000');
    if (
      (req.method === 'GET' || req.method === 'HEAD') &&
      (req.url === '/' || req.url === '/health' || /^\/assets\/[\w-]+\.(?:js|css)$/u.test(req.url))
    )
      return;
    const route = req.routeOptions.url;
    const writing = req.method !== 'GET' && req.method !== 'HEAD';
    if ((writing || req.headers.origin !== undefined) && req.headers.origin !== origin)
      throw new RequestError(403, 'ORIGIN_REJECTED', 'Use the configured portal origin.');
    if (req.method === 'POST' && route === '/api/auth/login') return;
    const session = auth.session(req);
    if (!session)
      throw new RequestError(401, 'UNAUTHORIZED', 'Sign in with the administrator account.');
    if (route === '/api/session' || route === '/api/auth/logout' || route === '/api/auth/password')
      return;
    if (session.mustChangePassword)
      throw new RequestError(
        403,
        'PASSWORD_CHANGE_REQUIRED',
        'Change the initial password before using the portal.',
      );
    pruneHistory();
    if (writing && !mutate())
      throw new RequestError(429, 'RATE_LIMIT', 'Wait before submitting another request.');
  });
  app.setErrorHandler((error: Error & { statusCode?: number }, _req, reply) => {
    if (error instanceof RequestError)
      return reply.code(error.status).send({ code: error.code, message: error.message });
    if (error.statusCode === 413)
      return reply
        .code(413)
        .send({ code: 'REQUEST_TOO_LARGE', message: 'The request exceeds the size limit.' });
    if (error.statusCode === 400 || error.statusCode === 415)
      return reply
        .code(error.statusCode)
        .send({ code: 'INVALID_REQUEST', message: 'Send a valid JSON request.' });
    return reply.code(500).send({
      code: 'SERVER_ERROR',
      message:
        'The server could not complete the request. Recover any pending attempt with its original ID.',
    });
  });
  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).send({ code: 'NOT_FOUND', message: 'Page or API route not found.' }),
  );

  app.get('/health', async () => ({ status: 'ok' }));
  app.post('/api/auth/login', auth.login);
  app.post('/api/auth/logout', auth.logout);
  app.post('/api/auth/password', auth.change);
  app.get('/api/session', async (request) => {
    const session = auth.session(request);
    if (!session)
      throw new RequestError(401, 'UNAUTHORIZED', 'Sign in with the administrator account.');
    return {
      liveProviders,
      retentionDays,
      timeoutMs,
      mustChangePassword: session.mustChangePassword,
    };
  });
  if (benchmarks) {
    app.get('/api/benchmarks', async () => ({
      history: benchmarks.list(),
      monitor: benchmarks.monitor(),
    }));
    app.post('/api/benchmarks', async (request, reply) => {
      if (active.size)
        throw new RequestError(409, 'VERIFICATION_BUSY', 'Wait for verification to finish.');
      return reply.code(202).send(benchmarks.start(validated(benchmarkOptions, request.body)));
    });
    app.post<{ Params: { id: string } }>('/api/benchmarks/:id/cancel', async (request, reply) => {
      benchmarks.cancel(validated(z.uuid(), request.params.id));
      return reply.code(204).send();
    });
  }
  app.get('/api/drafts', async () => state.drafts());
  app.post('/api/drafts', async (request, reply) => {
    const value = validated(saveDraftSchema, request.body);
    if (state.drafts().length >= 100)
      throw new RequestError(409, 'DRAFT_LIMIT', 'Delete a saved draft before creating another.');
    const draft = { id: randomUUID(), ...value };
    state.saveDraft(draft);
    return reply.code(201).send(draft);
  });
  app.put<{ Params: { id: string } }>('/api/drafts/:id', async (request) => {
    const id = validated(z.uuid(), request.params.id);
    if (!state.drafts().some((draft) => draft.id === id))
      throw new RequestError(404, 'DRAFT_NOT_FOUND', 'Saved configuration is no longer available.');
    const draft = { id, ...validated(saveDraftSchema, request.body) };
    state.saveDraft(draft);
    return draft;
  });
  app.delete<{ Params: { id: string } }>('/api/drafts/:id', async (request, reply) => {
    state.deleteDraft(validated(z.uuid(), request.params.id));
    return reply.code(204).send();
  });

  const expectation = (draft: Parameters<typeof paymentExpectation>[0], id: string) => {
    try {
      return paymentExpectation(draft, tenantId, id);
    } catch (error) {
      if (error instanceof VerificationOperationError)
        throw new RequestError(400, error.code, error.message);
      throw new RequestError(
        400,
        'INVALID_EXPECTATION',
        'Check the ETB amount, recipient, order reference and payment time window.',
      );
    }
  };
  app.post('/api/amount-preview', async (request) =>
    acceptedBounds(expectation(validated(draftSchema, request.body), 'preview')),
  );
  app.post('/api/scenarios', async (request, reply) => {
    const { mode, draft } = validated(registerSchema, request.body);
    if (mode === 'live' && !liveProviders.includes(draft.provider))
      throw new RequestError(
        409,
        'LIVE_DISABLED',
        'Live verification is disabled for this provider.',
      );
    const id = randomUUID();
    const value = expectation(draft, id);
    await verifiers[mode].registerExpectation(value);
    state.addScenario({ id, mode, provider: value.provider }, now());
    return reply.code(201).send({ paymentId: id, bounds: acceptedBounds(value) });
  });
  app.get('/api/history', async () => state.history());
  app.get<{ Params: { id: string } }>('/api/history/:id', async (request): Promise<HistoryItem> => {
    const entry = state.detail(validated(z.uuid(), request.params.id));
    if (!entry)
      throw new RequestError(
        404,
        'ATTEMPT_NOT_FOUND',
        'Attempt is missing or its retention period has ended.',
      );
    return entry;
  });

  app.post('/api/verify', async (request, reply) => {
    const input = validated(submissionSchema, request.body);
    const { attemptId, paymentId, mode, evidence, inputProvider, mockCase, showLiveValues } = input;
    const providerTimeout = mode === 'live' ? timeoutMs : Math.min(timeoutMs, 750);
    if (mode === 'live' && mockCase !== 'success')
      throw new RequestError(
        400,
        'INVALID_CONFIGURATION',
        'Choose a simulated mode to inject provider failures.',
      );
    const binding = createHmac('sha256', state.secret)
      .update(JSON.stringify([mode, paymentId, inputProvider, mockCase, evidence]))
      .digest('hex');
    const prior = state.attempt(attemptId);
    if (prior && prior.binding !== binding)
      throw new RequestError(
        409,
        'ATTEMPT_CONFLICT',
        'Recover with the original evidence, input provider and scenario.',
      );
    if (prior?.report) return JSON.parse(prior.report) as Report;
    if (active.has(attemptId))
      throw new RequestError(
        409,
        'ATTEMPT_IN_PROGRESS',
        'This attempt is already running. Open history to check its result.',
      );
    const scenario = state.scenario(paymentId);
    if (!scenario || scenario.mode !== mode)
      throw new RequestError(404, 'SCENARIO_NOT_FOUND', 'Create a test payment for this mode.');
    if (mode === 'live' && !liveProviders.includes(scenario.provider))
      throw new RequestError(
        409,
        'LIVE_DISABLED',
        'Live verification is disabled for this provider.',
      );
    if (benchmarks?.active())
      throw new RequestError(409, 'BENCHMARK_BUSY', 'Wait for the benchmark to finish.');
    if (active.size >= 4 || (mode === 'live' && [...active.values()].includes('live')))
      throw new RequestError(429, 'VERIFICATION_BUSY', 'Wait for an active attempt to finish.');
    if (mode === 'live' && !liveRate())
      throw new RequestError(
        429,
        'LIVE_RATE_LIMIT',
        'The live request budget resets every minute.',
      );
    const started = prior?.started ?? now();
    active.set(attemptId, mode);
    try {
      const verifier = verifiers[mode];
      const { value, timing } = await metrics.attempt(async () => {
        try {
          const parsed = await metrics.time('inputPreview', () => detectPaymentInput(evidence));
          if (
            parsed.ok &&
            parsed.value.provider === scenario.provider &&
            inputProvider !== 'auto' &&
            inputProvider !== parsed.value.provider
          )
            throw new RequestError(
              400,
              'INPUT_PROVIDER_CONFLICT',
              'The selected input provider conflicts with the detected format.',
            );
          if (!prior)
            state.addAttempt({
              attemptId,
              paymentId,
              mode,
              provider: scenario.provider,
              started,
              binding,
              mockCase,
              inputProvider,
            });
          const prepared = await metrics.time('prepare', () =>
            selectedMock.run(mockCase, () =>
              verifier.prepare(
                { paymentId, tenantId, idempotencyKey: attemptId, receiptLocator: evidence },
                { timeoutMs: providerTimeout },
              ),
            ),
          );
          const result = await metrics.time('complete', () => verifier.complete(prepared));
          return result;
        } catch (error) {
          if (error instanceof VerificationOperationError) return error.toJSON();
          throw error;
        }
      });
      const report: Report = {
        mode,
        paymentId,
        attemptId,
        provider: scenario.provider,
        startedAt: new Date(started).toISOString(),
        result: mode === 'live' && 'status' in value ? publicResult(value) : value,
        timing,
        timeoutMs: providerTimeout,
      };
      if ('type' in value && value.code === 'STORAGE_OUTCOME_UNKNOWN')
        return reply.code(503).send(report);
      state.finish(report);
      if (mode === 'live' && showLiveValues && 'checks' in value) {
        return {
          ...report,
          transientChecks: value.checks.filter(
            ({ field }) => field === 'recipientName' || field === 'invoiceReference',
          ),
        };
      }
      return report;
    } finally {
      active.delete(attemptId);
    }
  });

  if (options.assetsDir) {
    const assets = options.assetsDir;
    app.get('/', async (_req, reply) =>
      reply.type('text/html').send(await readFile(join(assets, 'index.html'))),
    );
    app.get<{ Params: { file: string } }>('/assets/:file', async (request, reply) => {
      const { file } = request.params;
      if (!/^[\w-]+\.(?:js|css)$/u.test(file))
        throw new RequestError(404, 'NOT_FOUND', 'Asset not found.');
      const body = await readFile(join(assets, 'assets', file)).catch(() => undefined);
      if (!body) throw new RequestError(404, 'NOT_FOUND', 'Asset not found.');
      return reply.type(file.endsWith('.css') ? 'text/css' : 'text/javascript').send(body);
    });
  }
  return app;
}
