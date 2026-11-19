/* 极简 toast：任意模块调用 toast("已保存") 即可在底部提示。 */
let host: HTMLDivElement | null = null;

function ensureHost(): HTMLDivElement {
  if (!host) {
    host = document.createElement("div");
    host.className = "toast-host";
    document.body.appendChild(host);
  }
  return host;
}

export function toast(msg: string, ms = 1800): void {
  const h = ensureHost();
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  h.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .2s";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 220);
  }, ms);
}
