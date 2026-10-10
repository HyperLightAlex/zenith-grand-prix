/** Tiny DOM builder: h('div.panel.wide', 'text') or with children. */
export function h<K extends keyof HTMLElementTagNameMap = 'div'>(
  spec: string,
  ...children: Array<string | Node | null | undefined>
): HTMLElementTagNameMap[K] {
  const [tag, ...classes] = spec.split('.');
  const el = document.createElement((tag || 'div') as K);
  if (classes.length) el.className = classes.join(' ');
  for (const c of children) {
    if (c == null) continue;
    el.append(c);
  }
  return el;
}

/** Only touch the DOM when the text actually changes. */
export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function setClass(el: HTMLElement, name: string, on: boolean): void {
  if (el.classList.contains(name) !== on) el.classList.toggle(name, on);
}
