// Minimal inline-markdown → HTML for text lifted from CONCEPT-IDEA.md tables.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function md(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>')
    .replace(/\(verify\)/g, '<span class="marker">verify</span>')
    .replace(/\((inferred|proposed|CoLab|user)\)/g, '<span class="marker">$1</span>');
}
export const strip = (s) => String(s ?? '').replace(/[`*]/g, '');
