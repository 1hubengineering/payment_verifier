import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { ReceiptCheckout } from './checkout';
import type { CheckoutProps, ReceiptResult, ReceiptSubmission } from './checkout';

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
    await act(async () => deferred.resolve('matched'));
    expect(screen.getByRole('status').textContent).toContain('Receipt details match');
    expect(screen.getByRole('status').textContent).toContain(
      'Settlement is unconfirmed and fulfillment is not authorized',
    );
  });

  it('preserves the receipt for an explicit retry after provider unavailability', async () => {
    const callback = vi
      .fn<CheckoutProps['onSubmitReceipt']>()
      .mockResolvedValueOnce('unavailable')
      .mockResolvedValueOnce('mismatch');
    render(<ReceiptCheckout {...props} onSubmitReceipt={callback} />);
    fill();
    submit();
    await screen.findByText('Receipt provider unavailable');
    expect(callback).toHaveBeenCalledTimes(1);
    submit('Retry receipt check');
    await screen.findByText('Receipt details did not match');
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
      .mockResolvedValueOnce('rejected');
    render(<ReceiptCheckout {...props} onSubmitReceipt={callback} />);
    fill();
    submit();
    await screen.findByText('Could not submit the receipt');
    expect(screen.queryByText('internal provider details')).toBeNull();
    submit('Retry receipt check');
    await screen.findByText('Receipt not accepted');
  });

  it('aborts in-flight work when the host unmounts an order', async () => {
    const deferred = Promise.withResolvers<ReceiptResult>();
    const callback = vi.fn((_submission: ReceiptSubmission) => deferred.promise);
    const { unmount } = render(<ReceiptCheckout {...props} onSubmitReceipt={callback} />);
    fill();
    submit();
    unmount();
    expect(callback.mock.calls[0]?.[0].signal.aborted).toBe(true);
    await act(async () => deferred.resolve('matched'));
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
