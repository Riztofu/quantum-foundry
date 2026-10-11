// A small DOM/event fixture for testing the actual packaged scripts.
// It does NOT implement a rendering engine and is not browser or layout QA.
'use strict';
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const decode = s => s.replace(/&(?:amp|lt|gt|quot|#39);/g, t => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }[t]));
class Element {
  constructor(tag, attrs = {}, doc) {
    this.tagName = tag.toUpperCase(); this.attributes = { ...attrs }; this.ownerDocument = doc; this.parentNode = null; this.children = []; this.listeners = {}; this._html = ''; this._text = ''; this.value = attrs.value || ''; this.files = [];
    if (this.tagName === 'AUDIO') { this.src = attrs.src || ''; this.currentTime = 0; this.volume = 1; this.paused = true; this.mediaCalls = []; }
    this.hidden = 'hidden' in attrs; this.disabled = 'disabled' in attrs; this.style = { setProperty: (key, value) => { this.style[key] = value; } };
    this.dataset = {}; for (const [key, value] of Object.entries(attrs)) if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, a) => a.toUpperCase())] = value;
    this.classes = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
    this.classList = { toggle: (c, value) => { if (value === undefined) value = !this.classes.has(c); value ? this.classes.add(c) : this.classes.delete(c); }, contains: c => this.classes.has(c), add: c => this.classes.add(c), remove: c => this.classes.delete(c) };
  }
  get id() { return this.attributes.id || ''; }
  get className() { return [...this.classes].join(' '); }
  set className(value) { this.classes = new Set(String(value).split(/\s+/).filter(Boolean)); }
  get innerHTML() { return this._html; }
  set innerHTML(value) { for (const n of this.children) n.parentNode = null; this.children = []; this._text = ''; this._html = String(value); parse(String(value), this, this.ownerDocument); }
  get textContent() { return this._text + this.children.map(n => n.textContent).join(''); }
  set textContent(value) { this._text = String(value); for (const n of this.children) n.parentNode = null; this.children = []; this._html = ''; }
  get firstChild() { return this.children[0] || null; }
  get isConnected() { return !!this.ownerDocument?.root.contains(this); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  hasAttribute(key) { return key in this.attributes; }
  addEventListener(type, f) { (this.listeners[type] ||= []).push(f); }
  appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
  async play() { this.mediaCalls.push(['play', this.src]); this.paused = false; }
  pause() { this.mediaCalls.push(['pause', this.src]); this.paused = true; }
  load() { this.mediaCalls.push(['load', this.src]); }
  removeAttribute(key) { delete this.attributes[key]; if (key === 'src') this.src = ''; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(n => n !== this); this.parentNode = null; }
  contains(node) { return this === node || this.children.some(n => n.contains(node)); }
  matches(selector) {
    return selector.split(',').some(s => {
      s = s.trim(); if (!s) return false;
      const tag = s.match(/^[a-zA-Z][\w-]*/); if (tag && this.tagName !== tag[0].toUpperCase()) return false;
      for (const m of s.matchAll(/#([\w-]+)/g)) if (this.id !== m[1]) return false;
      for (const m of s.matchAll(/\.([\w-]+)/g)) if (!this.classes.has(m[1])) return false;
      for (const m of s.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) if (!this.hasAttribute(m[1]) || m[2] !== undefined && this.getAttribute(m[1]) !== m[2]) return false;
      return true;
    });
  }
  closest(selector) { for (let n = this; n instanceof Element; n = n.parentNode) if (n.matches(selector)) return n; return null; }
  querySelectorAll(selector) { const out = []; function walk(node) { for (const child of node.children) { if (child.matches(selector)) out.push(child); walk(child); } } walk(this); return out; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  focus() { this.ownerDocument.activeElement = this; }
  setPointerCapture() {}
  getBoundingClientRect() {
    if (this.id === 'canvas') return { left: 140, top: 84, width: 968, height: 457, right: 1108, bottom: 541 };
    if (this.id === 'dock') return { left: 140, top: 545, width: 968, height: 172 };
    return { left: 0, top: 0, width: 1280, height: 720 };
  }
  dispatch(type, props = {}) {
    const modal = this.ownerDocument.getElementById?.('modal-root')?.firstChild;
    if (modal && ['click','pointerdown','pointermove','pointerup'].includes(type) && !modal.contains(this)) throw Error('Dismiss the current dialog before using the workbench.');
    const event = { type, target: this, button: 0, pointerId: 1, clientX: 0, clientY: 0, preventDefault() {}, ...props }, returns = [];
    for (let n = this; n; n = n.parentNode) {
      for (const f of n.listeners[type] || []) returns.push(f(event));
      if (typeof n['on' + type] === 'function') returns.push(n['on' + type](event));
    }
    for (const f of this.ownerDocument.listeners[type] || []) returns.push(f(event));
    return Promise.all(returns);
  }
  click() {
    if (this.disabled) return Promise.resolve();
    if (this.tagName === 'A' && this.download) this.ownerDocument.downloads.push({ name: this.download, blob: this.ownerDocument.urls.get(this.href) });
    return this.dispatch('click');
  }
}
function parse(html, parent, doc) {
  const stack = [parent], voidTags = new Set(['INPUT', 'BR', 'META', 'LINK', 'HR', 'IMG']);
  for (const match of html.matchAll(/<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|[^<]+/g)) {
    const token = match[0]; if (token.startsWith('<!--')) continue;
    if (token.startsWith('</')) { const tag = token.slice(2).match(/^[\w:-]+/)[0].toUpperCase(); for (let i = stack.length - 1; i > 0; i--) if (stack[i].tagName === tag) { stack.length = i; break; } }
    else if (token.startsWith('<')) {
      const tag = token.slice(1).match(/^[\w:-]+/)[0], attrs = {}, text = token.slice(tag.length + 1, -1);
      for (const m of text.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[m[1]] = decode(m[2] ?? m[3] ?? m[4] ?? '');
      const node = new Element(tag, attrs, doc); stack[stack.length - 1].appendChild(node);
      if (!voidTags.has(node.tagName) && !token.endsWith('/>')) stack.push(node);
    } else stack[stack.length - 1]._text += decode(token);
  }
}
function createEnvironment({ saved = new Map(), failStorage = false, AudioContext, fetch: fetchImpl } = {}) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), doc = { listeners: {}, downloads: [], urls: new Map(), activeElement: null };
  doc.root = new Element('document', {}, doc);
  parse(html.replace(/<script>[\s\S]*?<\/script>/g, '').replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<!doctype[^>]*>/i, ''), doc.root, doc);
  doc.documentElement = doc.root.querySelector('html'); doc.body = doc.root.querySelector('body'); doc.activeElement = doc.body;
  doc.getElementById = id => doc.root.querySelector('#' + id);
  doc.querySelector = s => doc.root.querySelector(s); doc.querySelectorAll = s => doc.root.querySelectorAll(s);
  doc.createElement = tag => new Element(tag, {}, doc); doc.addEventListener = (t, f) => (doc.listeners[t] ||= []).push(f);
  const timers = new Map(), intervals = new Map(); let timerId = 0;
  const win = { innerHeight: 900, listeners: {}, document: doc, addEventListener(t, f) { (this.listeners[t] ||= []).push(f); } };
  const sandbox = { console, document: doc, window: win, fetch: fetchImpl, Blob, URL: { createObjectURL(blob) { const id = 'blob:fixture/' + (++timerId); doc.urls.set(id, blob); return id; }, revokeObjectURL(id) { doc.urls.delete(id); } }, localStorage: { getItem(k) { if (failStorage) throw Error('Blocked storage'); return saved.get(k) || null; }, setItem(k, v) { if (failStorage) throw Error('Blocked storage'); saved.set(k, v); } }, setTimeout(f) { const id = ++timerId; timers.set(id, f); return id; }, clearTimeout(id) { timers.delete(id); }, setInterval(f) { const id = ++timerId; intervals.set(id, f); return id; }, clearInterval(id) { intervals.delete(id); }, requestAnimationFrame: f => f() };
  win.setInterval = sandbox.setInterval; win.clearInterval = sandbox.clearInterval; win.AudioContext = AudioContext;
  vm.createContext(sandbox);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  for (const script of scripts) { vm.runInContext(script, sandbox); win.FoundryCore = sandbox.FoundryCore; }
  const get = id => { const el = doc.getElementById(id); if (!el) throw Error('No element ' + id); return el; };
  const query = selector => { const el = doc.querySelector(selector); if (!el) throw Error('No matching element ' + selector); return el; };
  const state = () => JSON.parse(JSON.stringify(win.quantumFoundry.getCircuit()));
  const position = (x, y) => { const t = get('world').getAttribute('transform'), [cx, cy, z] = t.match(/-?[\d.]+/g).map(Number), b = get('canvas').getBoundingClientRect(); return { clientX: b.left + cx + x * z, clientY: b.top + cy + y * z }; };
  const begin = async () => { if (doc.getElementById('briefing-content')) await modalAction(0); };
  const clickPin = async (id, dir, port = 0) => { await begin(); return query(`circle.port[data-pin="${id}"][data-dir="${dir}"][data-port="${port}"]`).dispatch('pointerdown'); };
  const wire = async (a, b, from = 0, to = 0) => { await clickPin(a, 'out', from); await clickPin(b, 'in', to); };
  const place = async (type, x = 520, y = 120, moduleId) => {
    await begin();
    await query(moduleId ? `[data-module="${moduleId}"]` : `[data-part="${type}"]`).click();
    await get('canvas').dispatch('pointerdown', position(x, y)); await get('canvas').dispatch('pointerup', position(x, y));
    return state().graph.nodes.at(-1).id;
  };
  const modalAction = async index => query(`[data-modal-action="${index}"]`).click();
  const open = async id => { if (get('campaign').hidden) await get('map-button').click(); if (!doc.querySelector(`[data-level="${id}"]`)) await query(`[data-chapter="${['swap','routing','ghz','uncompute','parity','fanout','kickback','oracle'].includes(id) ? 1 : 0}"]`).click(); await query(`[data-level="${id}"]`).click(); await begin(); };
  const key = (key, props = {}) => get('canvas').dispatch('keydown', { key, ...props });
  return { doc, win, get, query, state, saved, position, place, wire, clickPin, modalAction, begin, open, key, tick: () => [...intervals.values()].forEach(f => f()), intervals };
}
module.exports = { createEnvironment };
