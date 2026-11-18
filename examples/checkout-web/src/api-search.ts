const query = document.querySelector<HTMLInputElement>('#api-query');
const status = document.querySelector<HTMLElement>('[data-count]');
const items = Array.from(document.querySelectorAll<HTMLElement>('[data-api-entry]'), (element) => ({
  element,
  text: (element.textContent ?? '').toLowerCase(),
}));

if (query && status) {
  query.closest<HTMLElement>('.api-toolbar')?.removeAttribute('hidden');
  function filter(value: string, message: HTMLElement): void {
    const tokens = value.trim().toLowerCase().split(/\s+/);
    let shown = 0;
    for (const { element, text } of items) {
      element.hidden = !tokens.every((token) => text.includes(token));
      if (!element.hidden) shown++;
    }
    message.textContent = shown
      ? `${shown} ${shown === 1 ? 'export' : 'exports'}`
      : 'No exports found. Try a shorter term.';
  }
  const revealLinkedExport = (): void => {
    const target = document.getElementById(location.hash.slice(1));
    if (target instanceof HTMLDetailsElement) {
      if (target.hidden) {
        query.value = '';
        filter('', status);
      }
      target.open = true;
      target.scrollIntoView();
    }
  };
  query.addEventListener('input', () => filter(query.value, status));
  window.addEventListener('hashchange', revealLinkedExport);
  filter(query.value, status);
  revealLinkedExport();
}
