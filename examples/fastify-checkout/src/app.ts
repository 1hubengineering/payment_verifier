import Fastify from 'fastify';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createPaymentExpectation,
  VerificationError,
  StorageConflict,
} from '@1hubengineering/verifier';
import type {
  PaymentExpectation,
  ReceiptVerifier,
  SettlementStatus,
} from '@1hubengineering/verifier';
import { JobError } from '@1hubengineering/verifier/jobs';
import type { DurableVerifier } from '@1hubengineering/verifier/jobs';
import { checkoutLocator } from './checkout-evidence.ts';
import type { CheckoutEvidence } from './checkout-evidence.ts';

export interface Principal {
  readonly tenantId: string;
  readonly userId: string;
}
export interface HostOrder {
  readonly orderId: string;
  readonly ownerId: string;
  readonly expectation: PaymentExpectation;
}
export interface HostOrderState {
  readonly settlementStatus: SettlementStatus;
  readonly fulfillmentStatus: 'PENDING' | 'FULFILLED' | 'BLOCKED';
}
export interface CheckoutServices {
  authenticate(request: FastifyRequest): Promise<Principal | undefined>;
  admit(principal: Principal): Promise<boolean>;
  findOrder(tenantId: string, orderId: string): Promise<HostOrder | undefined>;
  readOrderState(order: HostOrder): Promise<HostOrderState>;
  readonly verifier: ReceiptVerifier;
  readonly jobs?: DurableVerifier;
  readonly maxConcurrent?: number;
}
const orderParams = {
  type: 'object',
  required: ['orderId'],
  additionalProperties: false,
  properties: { orderId: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,128}$' } },
};
const evidenceText = { type: 'string', minLength: 1, maxLength: 4096 };
const verificationBody = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['receiptLocator'],
      properties: { receiptLocator: evidenceText },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'reference'],
      properties: {
        kind: { type: 'string', enum: ['transaction', 'url', 'sms'] },
        reference: evidenceText,
      },
    },
  ],
};
const retry = (reply: FastifyReply): FastifyReply =>
  reply.header('retry-after', '1').code(429).send({ error: 'CAPACITY' });

/** Example host boundary: no environment, listen(), provider or connection ownership. */
export function createCheckoutApp(services: CheckoutServices): FastifyInstance {
  const limit = services.maxConcurrent ?? 1;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 4)
    throw new TypeError('Invalid checkout concurrency');
  const app = Fastify({
    logger: false,
    bodyLimit: 8192,
    requestTimeout: 10000,
    connectionTimeout: 10000,
    trustProxy: false,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false } },
  });
  const principals = new WeakMap<FastifyRequest, Principal>();
  let active = 0;
  app.addHook('onRequest', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const principal = await services.authenticate(request);
    if (!principal) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    const trusted = Object.freeze({ tenantId: principal.tenantId, userId: principal.userId });
    if (!(await services.admit(trusted))) return retry(reply);
    principals.set(request, trusted);
  });
  const owned = async (
    request: FastifyRequest,
    reply: FastifyReply,
    orderId: string,
  ): Promise<HostOrder | undefined> => {
    const principal = principals.get(request)!;
    const found = await services.findOrder(principal.tenantId, orderId);
    if (
      !found ||
      found.orderId !== orderId ||
      found.ownerId !== principal.userId ||
      found.expectation.tenantId !== principal.tenantId
    ) {
      reply.code(404).send({ error: 'NOT_FOUND' });
      return undefined;
    }
    return { ...found, expectation: createPaymentExpectation(found.expectation) };
  };
  app.get<{ Params: { orderId: string } }>(
    '/orders/:orderId',
    { schema: { params: orderParams } },
    async (request, reply) => {
      const order = await owned(request, reply, request.params.orderId);
      if (!order) return reply;
      const { settlementStatus, fulfillmentStatus } = await services.readOrderState(order);
      return {
        orderId: order.orderId,
        paymentId: order.expectation.paymentId,
        provider: order.expectation.provider,
        amountMinor: order.expectation.amountMinor,
        currency: order.expectation.currency,
        settlementStatus,
        fulfillmentStatus,
      };
    },
  );
  app.post<{
    Params: { orderId: string };
    Body: CheckoutEvidence;
    Headers: { 'idempotency-key': string };
  }>(
    '/orders/:orderId/receipt-verifications',
    {
      schema: {
        params: orderParams,
        headers: {
          type: 'object',
          required: ['idempotency-key'],
          properties: { 'idempotency-key': { type: 'string', minLength: 1, maxLength: 128 } },
        },
        body: verificationBody,
      },
    },
    async (request, reply) => {
      if (active >= limit) return retry(reply);
      active++;
      try {
        const order = await owned(request, reply, request.params.orderId);
        if (!order) return reply;
        const resolved = checkoutLocator(order.expectation.provider, request.body);
        if ('error' in resolved) {
          if (resolved.error === 'CBE_RECEIPT_URL_REQUIRED') {
            return reply
              .code(422)
              .send({ error: resolved.error, message: 'Paste the official CBE receipt URL.' });
          }
          return reply.code(400).send({ error: resolved.error });
        }
        // Idempotent host snapshot registration rejects subsequent order mutations.
        await services.verifier.registerExpectation(order.expectation);
        const input = {
          tenantId: order.expectation.tenantId,
          paymentId: order.expectation.paymentId,
          idempotencyKey: request.headers['idempotency-key'],
          receiptLocator: resolved.locator,
        };
        if (services.jobs) return reply.code(202).send({ job: await services.jobs.enqueue(input) });
        const receipt = await services.verifier.submit(input);
        return reply
          .code(receipt.verificationStatus === 'IDEMPOTENCY_CONFLICT' ? 409 : 200)
          .send({ receipt });
      } finally {
        active--;
      }
    },
  );
  app.get<{ Params: { orderId: string; jobId: string } }>(
    '/orders/:orderId/receipt-verifications/:jobId',
    {
      schema: {
        params: {
          ...orderParams,
          required: ['orderId', 'jobId'],
          properties: {
            ...orderParams.properties,
            jobId: { type: 'string', pattern: '^rv1:job:[a-f0-9]{64}$' },
          },
        },
      },
    },
    async (request, reply) => {
      const order = await owned(request, reply, request.params.orderId);
      if (!order) return reply;
      if (!services.jobs) return reply.code(404).send({ error: 'NOT_FOUND' });
      return { job: await services.jobs.status(order.expectation, request.params.jobId) };
    },
  );
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof JobError) {
      if (error.code === 'CAPACITY') return retry(reply);
      const status =
        error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'IDEMPOTENCY_CONFLICT'
            ? 409
            : error.code === 'INVALID_INPUT'
              ? 400
              : error.code === 'NOT_OPEN'
                ? 409
                : 503;
      return reply.code(status).send({ error: status === 503 ? 'UNAVAILABLE' : error.code });
    }
    if (error instanceof VerificationError) {
      const status =
        error.code === 'NOT_FOUND'
          ? 404
          : error.code === 'INVALID_INPUT'
            ? 400
            : error.code === 'EXPECTATION_EXISTS'
              ? 409
              : 503;
      return reply.code(status).send({ error: status === 503 ? 'UNAVAILABLE' : error.code });
    }
    if (error instanceof StorageConflict) return reply.code(503).send({ error: 'UNAVAILABLE' });
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 400 || status === 413 || status === 415)
      return reply.code(status).send({ error: 'INVALID_REQUEST' });
    return reply.code(503).send({ error: 'UNAVAILABLE' });
  });
  return app;
}
