export const version = '0.2.0';
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

export const sourceRefs = { '0.2.0': 'a876f119fa0da2670b7b2312698cbd538f676b9a' };

export const releases = {
  '0.1.0': packages,
  '0.1.1': {
    verifier: 'dce2c9f2ccaf5439f0f9f1ba80ee26d58d24a3421dbe343e27c68cfc84aa7af7',
    'storage-sql': '755e9ff25108573f7f5d079fbb3616ab251c4a60f46c86d045cb7996ce60a5ba',
    'adapter-drizzle': '31aed56c663434d9908f61c70c6113b823606f90369d3c196ee76583d4ce0cc0',
    'adapter-prisma': 'bbf10cba35962105e6f6ae1c39a347e909aeb716cb36038a5b4daf673cffaf68',
    'provider-cbe': '02e8a0982a45f277796457998d099ed7ed0150429f0b2cf4338bd76afe26aecf',
  },
  '0.2.0': {
    verifier: '8bcdac81b5b645f4e7de5f7264f160001fea897ca6cf91a64bb0439192d9c8c5',
    'storage-sql': '743a1afbb8c6b24f15c6415f2bdaeac7da05c89cc2c5129dc19324434ae9e43a',
    'adapter-drizzle': '3cc9ebf3f9b270bb6327e5dbe84f6b02ebd47fee048f46fe41fa1c0a579c2d63',
    'adapter-prisma': '87f296ae931542eabdeafd842dc4c6868fa423fd43ddee9f1ff614cd25088a7c',
    'provider-cbe': 'ac70697ec425c9ee2bcb255df21174f35e421a4e8e593362966039e4703bbbd5',
  },
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
