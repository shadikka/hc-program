// TS control-flow narrowing from a null-check doesn't survive into nested
// function declarations, so required elements are asserted once up front
// (throwing if missing/wrong-typed) and carry a non-null type from there on.
export function requireById<T extends Element>(id: string, ctor: new (...args: never[]) => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof ctor)) throw new Error(`missing or mistyped #${id}`);
  return el;
}

/** Looks up a required element inside a cloned <template> fragment. */
export function requireEl<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing "${selector}" in template`);
  return el;
}

/** Shows `el` with `text`, or hides it when there's none — so e.g. a session's note is only ever visible while that session is. */
export function setOptionalText(el: HTMLElement, text: string | undefined): void {
  el.textContent = text ?? "";
  el.hidden = !text;
}
