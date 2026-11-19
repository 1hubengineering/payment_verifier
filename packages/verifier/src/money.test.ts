import { describe, expect, it } from 'vite-plus/test';
import { parseEtbAmount } from './money.ts';

describe('ETB decimal boundary', () => {
  it.each([
    ['0.01', 1],
    ['0.29', 29],
    ['10', 1000],
    ['10.1', 1010],
    ['120000.00', 12000000],
    ['90071992547409.91', Number.MAX_SAFE_INTEGER],
  ])('converts %s to exact integer minor units', (value, expected) => {
    expect(parseEtbAmount(value)).toBe(expected);
  });

  it.each([
    '0',
    '0.00',
    '-1',
    '+1',
    ' 1',
    '1 ',
    '1\n',
    '01',
    '.5',
    '1.',
    '1.001',
    '1e3',
    '1,000',
    'NaN',
    'Infinity',
    '',
    '90071992547409.92',
    '999999999999999999999',
  ])('rejects invalid or unsafe money: %j', (value) => {
    expect(() => parseEtbAmount(value)).toThrow();
  });
});
