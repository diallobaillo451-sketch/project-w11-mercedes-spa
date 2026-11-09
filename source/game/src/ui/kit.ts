/** Petits composants « UIKit » en DOM pur : listes groupées, contrôle segmenté, stepper, interrupteur, alerte. */
export const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e }
export const CHEV = '<svg class="chev" viewBox="0 0 8 14"><path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
export const ICON: Record<string, string> = {
  flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4m0 0h11l-2 4 2 4H5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  timer: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 9v4l3 2M9 2h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  road: '<svg viewBox="0 0 24 24"><path d="M8 3L4 21M16 3l4 18M12 4v3m0 4v3m0 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>',
  helmet: '<svg viewBox="0 0 24 24"><path d="M3 14a9 9 0 0118 0v3H9l-2 3H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 11h9" stroke="currentColor" stroke-width="2"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9.5" r="2.5" fill="currentColor"/></svg>',
  car: '<svg viewBox="0 0 24 24"><path d="M2 15h20M4 15l2-5h12l2 5M6 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm12 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM10 10l1-3h2l1 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  wrench: '<svg viewBox="0 0 24 24"><path d="M14.5 6.5a4 4 0 005 5L13 18a2.1 2.1 0 01-3-3zM14.5 6.5L17 4a4 4 0 00-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9L7 7m10 10l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6M12 7.5v.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>',
}
export const BACK = '<svg viewBox="0 0 12 20"><path d="M10 2L2 10l8 8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
/** retour « haptique » : vibration courte quand le navigateur la propose (Android), petit clic visuel partout */
export function haptic() { try { (navigator as Navigator & { vibrate?: (n: number) => boolean }).vibrate?.(8) } catch { /* */ } }
export function group(...rows: HTMLElement[]) { const g = h('div', 'ap-group'); g.append(...rows); return g }
export function header(t: string, color?: string) { const e = h('div', 'ap-h'); if (color) { const i = h('i'); i.style.background = color; e.append(i) } e.append(t); return e }
export function footnote(t: string) { return h('div', 'ap-f', t) }
export interface RowOpt { icon?: string; color?: string; title: string; sub?: string; value?: string; chev?: boolean; check?: boolean; disabled?: boolean; badge?: string; act?: string; onTap?: () => void }
export function row(o: RowOpt) {
  const r = h('button', 'ap-row' + (o.icon ? '' : ' noicon') + (o.disabled ? ' dis' : ''))
  if (o.icon) { const ic = h('span', 'ic', ICON[o.icon] ?? o.icon); ic.style.background = o.color ?? '#8e8e93'; r.append(ic) }
  const tx = h('span', 'tx'); const b = h('b'); b.textContent = o.title; tx.append(b); if (o.sub) { const s = h('small'); s.textContent = o.sub; tx.append(s) } r.append(tx)
  if (o.badge) { const bd = h('span', 'ap-badge'); bd.textContent = o.badge; r.append(bd) }
  if (o.value) { const v = h('span', 'val'); v.textContent = o.value; r.append(v) }
  if (o.check) r.append(h('span', 'chk', '✓'))
  if (o.chev) r.insertAdjacentHTML('beforeend', CHEV)
  if (o.act) r.dataset.act = o.act
  if (o.onTap && !o.disabled) r.addEventListener('click', () => { haptic(); o.onTap!() })
  return r
}
/** contrôle segmenté avec pastille glissante (ressort) */
export function seg<T extends string | number>(opts: [T, string][], val: T, on: (v: T) => void) {
  const s = h('div', 'ap-seg'), th = h('span', 'th'); s.append(th)
  const bs = opts.map(([v, l]) => { const b = h('button'); b.textContent = l; b.addEventListener('click', () => { haptic(); set(v); on(v) }); s.append(b); return b })
  const set = (v: T) => { const i = Math.max(0, opts.findIndex(o => o[0] === v)); bs.forEach((b, j) => b.classList.toggle('on', i === j)); th.style.width = `calc((100% - 4px) / ${opts.length})`; th.style.transform = `translateX(${i * 100}%)` }
  set(val); return s
}
export function ctl(label: string, control: HTMLElement, sub?: string) { const c = h('div', 'ap-ctl'); const l = h('span'); l.textContent = label; c.append(l); if (sub) { const s = h('small'); s.textContent = sub; c.append(s) } c.append(control); return c }
export function ctlCol(label: string, control: HTMLElement, right?: string) { const c = h('div', 'ap-ctl col'); const d = h('div'); const l = h('span'); l.textContent = label; d.append(l); if (right) { const s = h('small'); s.textContent = right; d.append(s) } c.append(d, control); return c }
export function stepper(val: number, steps: number[] | { min: number; max: number; step: number }, fmt: (v: number) => string, on: (v: number) => void) {
  const e = h('div', 'ap-step'), m = h('button', '', '−'), p = h('button', '', '+'), o = h('output')
  const list = Array.isArray(steps) ? steps : null, S = steps as { min: number; max: number; step: number }
  let v = val
  const upd = () => { o.textContent = fmt(v); m.disabled = list ? v <= list[0] : v <= S.min; p.disabled = list ? v >= list[list.length - 1] : v >= S.max }
  const go = (d: number) => {
    if (list) { let i = list.findIndex(x => x >= v - 1e-9); if (i < 0) i = list.length - 1; if (list[i] !== v && d < 0) i++; v = list[Math.max(0, Math.min(list.length - 1, i + d))] }
    else v = +Math.max(S.min, Math.min(S.max, v + d * S.step)).toFixed(3)
    haptic(); upd(); on(v)
  }
  m.addEventListener('click', () => go(-1)); p.addEventListener('click', () => go(1)); e.append(m, h('i'), o, h('i'), p); upd()
  ;(e as HTMLElement & { set?: (x: number) => void }).set = (x: number) => { v = x; upd() }
  return e
}
export function toggle(val: boolean, on: (v: boolean) => void) { const b = h('button', 'ap-sw' + (val ? ' on' : '')); b.addEventListener('click', () => { haptic(); val = !val; b.classList.toggle('on', val); on(val) }); return b }
export function alertBox(title: string, msg: string, acts: { label: string; red?: boolean; bold?: boolean; on?: () => void }[]) {
  const bg = h('div', 'ap-sheet-bg ap'), a = h('div', 'ap-alert'), t = h('h4'), p = h('p'), row = h('div', 'acts'); t.textContent = title; p.textContent = msg
  for (const x of acts) { const b = h('button', x.red ? 'red' : ''); b.textContent = x.label; b.addEventListener('click', () => { haptic(); bg.remove(); x.on?.() }); row.append(b) }
  a.append(t, p, row); bg.append(a); document.body.append(bg); return bg
}
export function flagHtml(cols: string[]) { return `<span class="flag">${cols.map(c => `<i style="background:${c}"></i>`).join('')}</span>` }
export const fmtTime = (t: number | null | undefined) => { if (t == null || !isFinite(t)) return '—'; const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(3).padStart(6, '0')}`.replace('.', ',') }
export const fmtClock = (sec: number) => { sec = Math.max(0, Math.ceil(sec)); const m = Math.floor(sec / 60), s = sec % 60; return `${m}:${String(s).padStart(2, '0')}` }
