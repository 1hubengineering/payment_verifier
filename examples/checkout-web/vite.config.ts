import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import { defineConfig } from 'vite-plus';

const repoSource = 'https://github.com/1hubengineering/payment_verifier/blob/main/';
const guide = 'docs/guide.md';
const skills = 'docs/development/skills-and-mcp.md';

async function renderMarkdown(path: string): Promise<string> {
  return new Marked({
    walkTokens(token) {
      if (path === skills && token.type === 'heading') token.depth += 1;
      if (token.type === 'link' && !token.href.startsWith('#')) {
        const destination = new URL(token.href, new URL(path, repoSource)).href;
        token.href = destination === `${repoSource}${skills}` ? '#contributor-setup' : destination;
      }
    },
  }).parse(await readFile(new URL(`../../${path}`, import.meta.url), 'utf8'));
}

export default defineConfig({
  base: './',
  envDir: false,
  plugins: [
    {
      name: 'integration-guide',
      async transformIndexHtml(html) {
        if (!html.includes('<!-- integration-guide -->')) return html;
        const [renderedGuide, renderedSkills] = await Promise.all([
          renderMarkdown(guide),
          renderMarkdown(skills),
        ]);
        return html
          .replace('<!-- integration-guide -->', () => renderedGuide)
          .replace('<!-- contributor-setup -->', () => renderedSkills);
      },
    },
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    license: { fileName: 'dependency-licenses.md' },
    rolldownOptions: {
      input: [
        fileURLToPath(new URL('./index.html', import.meta.url)),
        fileURLToPath(new URL('./demo/index.html', import.meta.url)),
      ],
    },
  },
  test: { environment: 'jsdom', include: ['src/**/*.test.tsx'] },
});
