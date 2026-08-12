function methodUrl(): string {
  return `${window.location.pathname}${window.location.search}#method`;
}

export function initMethodPanel(): void {
  const panel = document.querySelector<HTMLDialogElement>(
    '[data-method-panel]',
  );
  if (!panel) return;

  const triggers = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-method-open]'),
  );
  const closeButton = panel.querySelector<HTMLButtonElement>(
    '[data-method-close]',
  );

  const setExpanded = (expanded: boolean): void => {
    triggers.forEach((trigger) =>
      trigger.setAttribute('aria-expanded', String(expanded)),
    );
  };

  const open = (fromHash = false): void => {
    if (!panel.open) panel.showModal();
    document.documentElement.classList.add('method-panel-open');
    setExpanded(true);
    if (!fromHash && window.location.hash !== '#method') {
      window.location.hash = 'method';
    }
    closeButton?.focus();
  };

  const close = (clearHash: boolean): void => {
    if (panel.open) panel.close();
    document.documentElement.classList.remove('method-panel-open');
    setExpanded(false);
    if (clearHash && window.location.hash === '#method') {
      history.replaceState(
        history.state,
        '',
        methodUrl().replace('#method', ''),
      );
    }
  };

  triggers.forEach((trigger) =>
    trigger.addEventListener('click', () => open()),
  );
  closeButton?.addEventListener('click', () => close(true));
  panel.addEventListener('click', (event) => {
    if (event.target === panel) close(true);
  });
  panel.addEventListener('cancel', (event) => {
    event.preventDefault();
    close(true);
  });
  window.addEventListener('hashchange', () => {
    if (window.location.hash === '#method') open(true);
    else close(false);
  });

  if (window.location.hash === '#method') open(true);
}
