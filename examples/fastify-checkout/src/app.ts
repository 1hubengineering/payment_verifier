import Fastify from 'fastify';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createPaymentExpectation, VerificationOperationError } from '@1hubengineering/verifier';
import type { PaymentExpectation, ReceiptVerifier } from '@1hubengineering/verifier';
import type { DurableVerifier } from '@1hubengineering/verifier/jobs';

interface CheckoutEvidence {
  receiptLocator: string;
}

export interface Principal {
  readonly tenantId: string;
  readonly userId: string;
}
export interface HostOrder {
  readonly orderId: string;
  readonly ownerId: string;
  readonly expectation: PaymentExpectation;
  readonly recipientAccount?: string;
}
export interface HostOrderState {
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
const verificationBody = {
  type: 'object',
  additionalProperties: false,
  required: ['receiptLocator'],
  properties: { receiptLocator: { type: 'string' } },
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
      const { fulfillmentStatus } = await services.readOrderState(order);
      return {
        orderId: order.orderId,
        paymentId: order.expectation.paymentId,
        provider: order.expectation.provider,
        amountMinor: order.expectation.amountMinor,
        currency: order.expectation.currency,
        recipientName: order.expectation.recipientName,
        recipientAccount: order.recipientAccount ?? null,
        invoiceReference: order.expectation.reference,
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
        // Idempotent host snapshot registration rejects subsequent order mutations.
        await services.verifier.registerExpectation(order.expectation);
        const input = {
          tenantId: order.expectation.tenantId,
          paymentId: order.expectation.paymentId,
          idempotencyKey: request.headers['idempotency-key'],
          receiptLocator: request.body.receiptLocator,
        };
        if (services.jobs) {
          const job = await services.jobs.enqueue(input);
          const status =
            job.result?.status === 'INVALID_INPUT'
              ? 400
              : job.state === 'COMPLETED' || job.state === 'FAILED'
                ? 200
                : 202;
          return reply.code(status).send({ job });
        }
        const receipt = await services.verifier.submit(input);
        return reply.code(receipt.status === 'INVALID_INPUT' ? 400 : 200).send({ receipt });
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
    if (error instanceof VerificationOperationError) {
      const status = {
        JOB_NOT_FOUND: 404,
        EXPECTATION_NOT_FOUND: 404,
        INVALID_REQUEST: 400,
        INVALID_EXPECTATION: 400,
        INVALID_AMOUNT_POLICY: 400,
        EXPECTATION_CONFLICT: 409,
        EXPECTATION_CANCELLED: 409,
        EXPECTATION_EXPIRED: 409,
        EXPECTATION_NOT_YET_VALID: 409,
        EXPECTATION_CHANGED: 409,
        IDEMPOTENCY_CONFLICT: 409,
        RECEIPT_ALREADY_CLAIMED: 409,
        JOB_IN_PROGRESS: 409,
        QUEUE_CAPACITY: 429,
      } as Partial<Record<VerificationOperationError['code'], number>>;
      if (error.code === 'QUEUE_CAPACITY') reply.header('retry-after', '1');
      return reply.code(status[error.code] ?? 503).send({ error: error.toJSON() });
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 400 || status === 413 || status === 415)
      return reply.code(status).send({ error: 'INVALID_REQUEST' });
    return reply.code(503).send({ error: 'UNAVAILABLE' });
  });
  return app;
}
