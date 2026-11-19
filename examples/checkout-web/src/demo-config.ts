import type { CheckoutProps } from './checkout';
import type { ProviderId } from '@1hubengineering/verifier';

const amountMinor = 148000;
const decimalAmount = `${Math.trunc(amountMinor / 100)}.${String(amountMinor % 100).padStart(2, '0')}`;
const wholeAmount = new Intl.NumberFormat('en-ET').format(Math.trunc(amountMinor / 100));
const displayAmount = `ETB ${wholeAmount}.${decimalAmount.slice(-2)}`;
const cbeUrl = 'https://mbreciept.cbe.com.et/v2-DEMO1048';
const telebirrUrl = 'https://transactioninfo.ethiotelecom.et/receipt/DEMO1048TB';

export const demoOrder = {
  id: 'demo-order-1048',
  reference: 'INV-DEMO-1048',
  amountMinor,
  validFrom: Date.parse('2026-11-19T09:00:00+03:00'),
  validUntil: Date.parse('2026-11-19T13:00:00+03:00'),
  lines: [
    { id: 'notebook', label: 'Field notebook', detail: 'Quantity 2', amountLabel: 'ETB 1,200.00' },
    { id: 'pen', label: 'Ink pen', detail: 'Quantity 1', amountLabel: 'ETB 280.00' },
  ],
  totalLabel: displayAmount,
  copyAmount: decimalAmount,
};

const holder = 'Juniper Supply [demo]';

export const demoMethods = [
  {
    id: 'cbe',
    label: 'CBE',
    subtitle: 'Bank transfer',
    logo: new URL('./brands/cbe.png', import.meta.url).href,
    instructions:
      'In a real checkout, you would transfer the exact amount in CBE Mobile Banking and put the invoice number in the description if the app allows it.',
    receiving: { holder, accountLabel: 'Account number', account: 'DEMO-CBE-1048' },
    placeholder: 'e.g. v2-DEMO1048',
  },
  {
    id: 'telebirr',
    label: 'Telebirr',
    subtitle: 'Mobile wallet',
    logo: new URL('./brands/telebirr.png', import.meta.url).href,
    instructions:
      'In a real checkout, you would send the exact amount to the receiving phone number in Telebirr. Add the invoice number as a note if that option is available.',
    receiving: { holder, accountLabel: 'Telebirr phone number', account: '+251 00 000 1048' },
    placeholder: 'e.g. DEMO1048TB',
  },
] as const satisfies CheckoutProps['paymentMethods'];

export const demoSamples = {
  cbe: {
    transaction: 'v2-DEMO1048',
    url: cbeUrl,
    sms: [
      `Dear Sample Customer You have successfully transferred ${displayAmount} from account 1********7757 to account ****1048 (${holder}). Service charge of ETB 0.50 and VAT(15%) of ETB 0.08 and Disaster Recovery(5%) of 0.03 with total of ETB 1,480.61. Thanks for Banking with CBE. ${cbeUrl}`,
      'Transfer date: 2026-11-19 10:30:00 EAT',
    ].join('\n'),
  },
  telebirr: {
    transaction: 'DEMO1048TB',
    url: telebirrUrl,
    sms: [
      'Dear Sample Customer',
      `You have transferred ${displayAmount} to ${holder} (25100****1048) on 19/11/2026 11:25:00. Your transaction number is DEMO1048TB. The service fee is ETB 0.87 and 15% VAT on the service fee is ETB 0.13. To download your payment information please click this link: ${telebirrUrl}.`,
      'Thank you for using telebirr',
    ].join('\n'),
  },
} as const satisfies Record<ProviderId, { transaction: string; url: string; sms: string }>;
