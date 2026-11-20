import { readFile } from 'node:fs/promises';
import { sep } from 'node:path';
import { Marked } from 'marked';
import { pages, repository, version } from '../../scripts/docs-catalog.mjs';

const corpus = new URL('../../.cache/payment-verifier-docs/corpus.json', import.meta.url);
const escape = (text) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
function renderGuide({ id, body, source }, guideIds) {
  return new Marked({
    renderer: {
      code(token) {
        return `<pre tabindex="0" aria-label="Code example"><code>${escape(token.text)}</code></pre>`;
      },
      table(token) {
        return `<div class="doc-table" role="region" tabindex="0" aria-label="Reference table">${renderTable.call(this, token)}</div>`;
      },
      heading({ depth, text, tokens }) {
        const slug = text
          .toLowerCase()
          .replace(/[^a-z0-9 -]/g, '')
          .replaceAll(' ', '-');
        const level = Math.min(depth + 1, 6);
        return `<h${level} id="${id}--${escape(slug)}">${this.parser.parseInline(tokens)}</h${level}>`;
      },
    },
    walkTokens(token) {
      if (token.type !== 'link') return;
      const { href } = token;
      const [file, fragment] = href.split('#');
      const targetId = file.endsWith('.md') ? file.slice(0, -3) : '';
      if (guideIds.has(targetId)) {
        token.href = fragment ? `#${targetId}--${fragment}` : `#${targetId}`;
      } else if (href.startsWith(pages)) {
        token.href = '../' + href.slice(pages.length);
      } else {
        token.href = new URL(href, source).href;
      }
    },
  }).parse(body);
}

function renderTable(token) {
  const row = (cells, tag) =>
    `<tr>${cells.map(({ tokens }) => `<${tag}${tag === 'th' ? ' scope="col"' : ''}>${this.parser.parseInline(tokens)}</${tag}>`).join('')}</tr>`;
  return `<table class="ui-table"><thead>${row(token.header, 'th')}</thead><tbody>${token.rows.map((cells) => row(cells, 'td')).join('')}</tbody></table>`;
}

function navigation(prefix, current) {
  const links = [
    ['Guide', 'docs/'],
    ['API', 'api/'],
    ['Checkout demo', 'demo/'],
    ['Playground', 'playground/'],
    ['Benchmarks', 'benchmarks/'],
  ];
  return `<a class="skip-link" href="#main">Skip to content</a>
    <!-- Adapted from Shadcnblocks Navbar 1. -->
    <header class="site-header"><nav class="site-shell site-nav" aria-label="Main">
    <a class="wordmark" href="${prefix}"${current === './' ? ' aria-current="page"' : ''}>
    <span class="brand-mark" aria-hidden="true">✓</span>
    Payment Verifier</a>
    <div class="nav-links">${links.map(([label, path]) => `<a href="${prefix}${path}"${path === current ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
    <a href="${repository}">GitHub</a></div></nav></header>`;
}

export function documentation() {
  return {
    name: 'payment-verifier-documentation',
    async transformIndexHtml(html, context) {
      if (!html.includes('<!-- developer-nav -->')) return html;
      const route =
        ['docs/', 'api/', 'demo/', 'playground/', 'benchmarks/', 'candidate/'].find((path) =>
          context.filename.split(sep).join('/').endsWith(`/${path}index.html`),
        ) ?? './';
      const page = html.replace('<!-- developer-nav -->', () =>
        navigation(route === './' ? './' : '../', route),
      );
      if (route !== 'docs/' && route !== 'api/') return page;
      const entries = JSON.parse(await readFile(corpus, 'utf8')).filter(
        (entry) => entry.version === version,
      );
      if (route === 'docs/') {
        const guides = entries.filter(({ kind }) => kind === 'guide');
        const guideIds = new Set(guides.map(({ id }) => id));
        const links = guides
          .map(({ id, title }) => `<a href="#${escape(id)}">${escape(title)}</a>`)
          .join('');
        const sections = await Promise.all(
          guides.map(
            async (guide) =>
              `<section id="${escape(guide.id)}"><h2>${escape(guide.title)}</h2>${await renderGuide(guide, guideIds)}
           <a class="doc-source" href="${escape(guide.source)}">View guide source</a></section>`,
          ),
        );
        return page
          .replace('<!-- guide-links -->', () => links)
          .replace('<!-- guide-sections -->', () => sections.join(''));
      }
      const htmlEntries = entries
        .filter(({ kind }) => kind === 'api')
        .map(
          ({ id, title, summary, body, source }) =>
            `<details class="api-entry" id="${escape(id)}" data-api-entry>
          <summary><code>${escape(title)}</code><span>${escape(summary)}</span></summary>
          <pre tabindex="0" aria-label="${escape(title)} declaration"><code>${escape(body)}</code></pre>
          <p><a href="${escape(source)}">Release source</a> · <a href="#${escape(id)}">Link to export</a></p></details>`,
        )
        .join('');
      return page.replace(
        '<!-- api-entries -->',
        () => `<div class="api-results">${htmlEntries}</div>`,
      );
    },
  };
}
