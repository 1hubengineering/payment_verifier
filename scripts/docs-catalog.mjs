export const version = '0.1.0';
export const repository = 'https://github.com/1hubengineering/payment_verifier';
export const pages = 'https://1hubengineering.github.io/payment_verifier/';

export const guides = [
  ['quickstart', 'Quickstart'],
  ['configuration', 'Configuration and outcomes'],
  ['storage', 'Storage and transactions'],
  ['direct-sql', 'Direct SQL'],
  ['drizzle', 'Drizzle'],
  ['prisma', 'Prisma'],
  ['telebirr', 'Telebirr'],
  ['cbe', 'CBE'],
  ['retries', 'Retries and durable jobs'],
  ['agents', 'Agent skills and MCP'],
];

export const packages = {
  'receipt-verifier': 'db9ed367631a7005af9360589f0d50743c86aed3716a0ebe0308c5b0b3928990',
  'receipt-verifier-storage-sql':
    '5b54c921b672563a4d439d05fd2e6e4e7e982d5ec65d0e38c0a749c9be6ff14f',
  'receipt-verifier-adapter-drizzle':
    'acb579e5847b02ebfe6748f4d6f5f10e87d424e52bbd676a5916777eda689316',
  'receipt-verifier-adapter-prisma':
    '330037141364973c23f702bf27892fe542f2b1c564e0737e11951b9e70fe25c7',
  'receipt-verifier-provider-cbe':
    'b375b9dd376115c4f5e12f6fc559956512c48275fed26330b53d8b8c4ed069c3',
};

export function searchDocs(entries, query, kind, limit = 12) {
  const needle = query.trim().toLowerCase();
  const tokens = needle.split(/\s+/);
  return entries
    .filter((entry) => !kind || entry.kind === kind)
    .flatMap(({ body, ...entry }) => {
      const title = entry.title.toLowerCase();
      const summary = entry.summary.toLowerCase();
      const content = body.toLowerCase();
      if (
        !tokens.every(
          (token) => title.includes(token) || summary.includes(token) || content.includes(token),
        )
      )
        return [];
      const score =
        title === needle ? 100 : title.includes(needle) ? 50 : summary.includes(needle) ? 25 : 0;
      return [{ score, entry }];
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ entry }) => entry);
}
