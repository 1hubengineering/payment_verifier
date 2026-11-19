import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { ReceiptCheckout } from './checkout';
import type { CheckoutProps, ReceiptResult, ReceiptSubmission } from './checkout';
import { demoMethods, demoOrder, demoSamples } from './demo-config';
import { createDemoVerifier, validateDemoEvidence } from './demo-verification';

const props = {
  branding: { name: 'Sample shop' },
  order: { reference: 'Sample order', lines: [], totalLabel: 'ETB 10.00' },
  paymentMethods: [
    { id: 'bank', label: 'Bank', instructions: 'Find the bank reference.' },
    { id: 'wallet', label: 'Wallet', instructions: 'Find the wallet reference.' },
  ],
} satisfies Omit<CheckoutProps, 'onSubmitReceipt'>;

function input() {
  return screen.getByRole('textbox', { name: 'Receipt reference' });
}

function fill(value = 'DEMO-RECEIPT') {
  fireEvent.change(input(), { target: { value } });
}

function submit(label = 'Check receipt') {
  fireEvent.click(screen.getByRole('button', { name: label }));
}

afterEach(cleanup);

describe('ReceiptCheckout', () => {
  it('focuses and describes invalid input without submitting', () => {
    const callback = vi.fn<CheckoutProps['onSubmitReceipt']>();
    render(
      <ReceiptCheckout
        {...props}
        onSubmitReceipt={callback}
        validateReference={() => 'Use a synthetic reference.'}
      />,
    );
    submit();
    expect(document.activeElement).toBe(input());
    expect(input().getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Enter a receipt reference.');
    fill('real-looking-value');
    submit();
    expect(screen.getByRole('alert').textContent).toBe('Use a synthetic reference.');
    expect(callback).not.toHaveBeenCalled();
  });

  it('submits only the selected method and trimmed receipt, ignoring duplicate requests while pending', async () => {
    const deferred = Promise.withResolvers<ReceiptResult>();
    const callback = vi.fn((_submission: ReceiptSubmission) => deferred.promise);
    render(<ReceiptCheckout {...props} onSubmitReceipt={callback} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Wallet' }));
    expect(screen.getByText('Find the wallet reference.')).toBeTruthy();
    fill(' DEMO-RECEIPT ');
    submit();
    expect(screen.getByRole('button', { name: 'Checking receipt…' }).hasAttribute('disabled')).toBe(
      true,
    );
    const form = input().closest('form');
    if (!form) throw new Error('Missing checkout form');
    fireEvent.submit(form);
    expect(callback).toHaveBeenCalledExactlyOnceWith({
      reference: 'DEMO-RECEIPT',
      paymentMethodId: 'wallet',
      signal: expect.any(AbortSignal),
    });
    await act(async () => deferred.resolve({ status: 'VERIFIED', retryable: false }));
    const result = await screen.findByRole('dialog', { name: 'Payment verified' });
    expect(result.textContent).toContain('The official receipt matches this order.');
  });

  it('preserves the receipt for an explicit retry after provider unavailability', async () => {
    const callback = vi
      .fn<CheckoutProps['onSubmitReceipt']>()
      .mockResolvedValueOnce({ status: 'UNAVAILABLE', retryable: true })
      .mockResolvedValueOnce({ status: 'MISMATCH', retryable: false });
    render(<ReceiptCheckout {...props} onSubmitReceipt={callback} />);
    fill();
    submit();
    await screen.findByRole('dialog', { name: 'Receipt could not be checked' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(callback).toHaveBeenCalledTimes(1);
    submit('Retry receipt check');
    await screen.findByRole('dialog', { name: 'Receipt details did not match' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(
      callback.mock.calls.map(([{ reference, paymentMethodId }]) => ({
        reference,
        paymentMethodId,
      })),
    ).toEqual([
      { reference: 'DEMO-RECEIPT', paymentMethodId: 'bank' },
      { reference: 'DEMO-RECEIPT', paymentMethodId: 'bank' },
    ]);
    fill('DEMO-NEW');
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('does not surface host errors and supports recovery', async () => {
    const callback = vi
      .fn<CheckoutProps['onSubmitReceipt']>()
      .mockRejectedValueOnce(new Error('internal provider details'))
      .mockResolvedValueOnce({ status: 'INVALID_INPUT', retryable: false });
    render(<ReceiptCheckout {...props} onSubmitReceipt={callback} />);
    fill();
    submit();
    await screen.findByRole('dialog', { name: 'Could not submit the receipt' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('internal provider details')).toBeNull();
    submit('Retry receipt check');
    await screen.findByRole('dialog', { name: 'Receipt input not accepted' });
  });

  it('aborts in-flight work when the host unmounts an order', async () => {
    const deferred = Promise.withResolvers<ReceiptResult>();
    const callback = vi.fn((_submission: ReceiptSubmission) => deferred.promise);
    const { unmount } = render(<ReceiptCheckout {...props} onSubmitReceipt={callback} />);
    fill();
    submit();
    unmount();
    expect(callback.mock.calls[0]?.[0].signal.aborted).toBe(true);
    await act(async () => deferred.resolve({ status: 'VERIFIED', retryable: false }));
  });

  it('disables submission when the host configures no payment methods', () => {
    const callback = vi.fn<CheckoutProps['onSubmitReceipt']>();
    render(<ReceiptCheckout {...props} paymentMethods={[]} onSubmitReceipt={callback} />);
    expect(screen.getByText('No payment methods configured')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check receipt' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(callback).not.toHaveBeenCalled();
  });
});

function demoCheckout() {
  const callback = vi.fn(createDemoVerifier(async () => {}));
  render(
    <ReceiptCheckout
      {...props}
      order={demoOrder}
      paymentMethods={demoMethods}
      onSubmitReceipt={callback}
      evidence={{
        simulated: true,
        validate: validateDemoEvidence,
        sample: (method) =>
          method === 'cbe' || method === 'telebirr' ? demoSamples[method].sms : undefined,
      }}
    />,
  );
  return callback;
}

describe('Ethiopian checkout', () => {
  it('offers one labeled input and keeps independent drafts for each payment method', () => {
    demoCheckout();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.queryByRole('tablist')).toBeNull();
    fill('v2-Synthetic_42');
    fireEvent.click(screen.getByRole('radio', { name: /Telebirr/ }));
    expect(screen.getByText('+251 00 000 1048')).toBeTruthy();
    expect((input() as HTMLTextAreaElement).value).toBe('');
    fireEvent.click(screen.getByRole('radio', { name: /CBE/ }));
    expect((input() as HTMLTextAreaElement).value).toBe('v2-Synthetic_42');
  });

  it('copies only the configured values and reports blocked clipboard access', async () => {
    const writeText = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('blocked'));
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      const callback = demoCheckout();
      fireEvent.click(screen.getByRole('button', { name: 'Copy amount' }));
      await screen.findByText('Copied amount.');
      fireEvent.click(screen.getByRole('button', { name: 'Copy invoice number' }));
      await screen.findByText('Copy was blocked. Select the text to copy it manually.');
      expect(writeText.mock.calls).toEqual([[demoOrder.copyAmount], [demoOrder.reference]]);
      expect(callback).not.toHaveBeenCalled();
    } finally {
      if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('rejects a foreign receipt URL and explicitly labels a simulated match', async () => {
    const callback = demoCheckout();
    fill(demoSamples.telebirr.url);
    submit('Submit Payment for Verification');
    await screen.findByRole('alert');
    expect(callback).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use sample SMS' }));
    submit('Submit Payment for Verification');
    const result = await screen.findByRole('dialog', { name: 'Simulated verification' });
    expect(result.textContent).toContain('passed the checks against a simulated provider record');
    expect(result.textContent).toContain('ETB 1,480.00');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    const [saved] = screen.getAllByRole('button', { name: /View result/ });
    fireEvent.click(saved!);
    await screen.findByRole('dialog', { name: 'Simulated verification' });
    expect(callback).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    submit('Submit Payment for Verification');
    await screen.findByRole('dialog', { name: 'Receipt already submitted' });
  });
});
