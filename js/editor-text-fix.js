'use strict';
/* ═══════════════════════════════════════════════════════════
   editor-text-fix.js
   Load LAST — after all other JS files
   Fixes: text placement, drag-to-move while editing,
          resize handles, auto-switch to move on commit,
          clicking existing text to re-edit
═══════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════════════════════
// TXT — complete replacement for the text editing system
// ═══════════════════════════════════════════════════════════
const TXT = {
  obj: null,       // current OB object being edited
  isNew: false,    // was this object just created (delete if empty on cancel)
  _drag: null,     // {startX,startY,origOX,origOY} while dragging the move bar
  _resize: null,   // {startX,startY,origW,origH} while dragging resize corner

  // ── wrapper element (injected into #vp) ──────────────────
  get box()  { return document.getElementById('txed-box'); },
  get area() { return document.getElementById('txed'); },

  // ── public API ────────────────────────────────────────────
  // Called by text tool click on canvas
  place(cx, cy) {
    // If clicking ON an existing text object → edit it instead of creating new
    const hit = OB.hitTest(cx, cy);
    if (hit && (hit.type === 'text' || hit.type === 'text_path')) {
      OB.selId = hit.id;
      this.isNew = false;
      this._open(hit);
      return;
    }

    // Create brand-new text object
    const font  = document.getElementById('txt-font')?.value || 'Arial';
    const size  = parseInt(document.getElementById('txt-size')?.value) || 32;
    const bold  = document.getElementById('txt-bold')?.classList.contains('on');
    const italic= document.getElementById('txt-italic')?.classList.contains('on');
    const align = document.getElementById('txt-align')?.value || 'left';
    const ls    = parseInt(document.getElementById('txt-spacing')?.value) || 0;

    const obj = OB.add('text', cx, cy, 260, size * 1.6 + 16, {
      text: '',
      font, size, bold, italic, color: S.pri,
      opacity: 100, align, letterSpacing: ls, lineHeight: 1.35,
      shadow: false, shadowColor: 'rgba(0,0,0,0.55)', shadowBlur: 4,
      shadowOffsetX: 2, shadowOffsetY: 2,
      stroke: false, strokeColor: '#000000', strokeWidth: 2
    });
    this.isNew = true;
    this._open(obj);
  },

  // ── open the floating editor on an object ─────────────────
  _open(obj) {
    this.obj = obj;
    OB.editId = obj.id;
    const d   = obj.data;
    const box = this.box;
    const ta  = this.area;

    // Style textarea to match text
    const fs = Math.max(10, Math.round(d.size * S.zoom));
    ta.style.font          = `${d.italic?'italic ':''}${d.bold?'bold ':''}${fs}px "${d.font||'Arial'}"`;
    ta.style.color         = d.color || '#000000';
    ta.style.textAlign     = d.align || 'left';
    ta.style.letterSpacing = ((d.letterSpacing || 0) * S.zoom) + 'px';
    ta.style.lineHeight    = d.lineHeight || '1.35';
    ta.value               = d.text || '';

    // Position & size the wrapper
    this._reposition();

    // Show
    box.style.display = 'block';
    box.dataset.objId = obj.id;
    OB.renderOverlay();

    // Focus the textarea
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
      this._fitTextarea();
    });

    // Live preview as user types
    ta.oninput = () => {
      obj.data.text = ta.value;
      this._fitTextarea();
      OB.renderOverlay();
    };
  },

  // ── reposition the box to match the OB object ─────────────
  _reposition() {
    const obj = this.obj; if (!obj) return;
    const box = this.box;
    const vpRect = vp.getBoundingClientRect();

    // Screen coords of object origin (top-left of obj bbox)
    const sx = Math.round(S.panX + obj.x * S.zoom);
    const sy = Math.round(S.panY + obj.y * S.zoom);

    box.style.left   = sx + 'px';
    box.style.top    = sy + 'px';
    box.style.width  = Math.max(120, Math.round(obj.w * S.zoom)) + 'px';

    // Update font size in textarea to match zoom
    const d  = obj.data;
    const fs = Math.max(10, Math.round(d.size * S.zoom));
    const ta = this.area;
    ta.style.fontSize = fs + 'px';
    ta.style.letterSpacing = ((d.letterSpacing||0)*S.zoom)+'px';

    this._fitTextarea();
  },

  // ── auto-grow textarea height to content ──────────────────
  _fitTextarea() {
    const ta = this.area; if (!ta) return;
    ta.style.height = '4px';
    ta.style.height = Math.max(ta.scrollHeight, 28) + 'px';
    // Also keep box width big enough for text
    const box = this.box;
    ta.style.width = '100%';
  },

  // ── commit text (keep object, hide editor) ────────────────
  commit() {
    const obj = this.obj; if (!obj) return;
    const ta  = this.area;
    const text = ta.value;

    if (!text.trim() && this.isNew) {
      // Empty new text → remove it
      OB.del(obj.id);
    } else {
      obj.data.text = text;
      this._measureObj(obj);
      Hs.save('Text');
      OB.selId = obj.id; // keep selected
    }

    this._hide();

    // Auto-switch to move tool so user can immediately position the text
    setTimeout(() => {
      if (S.tool === 'text') A.tool('move');
    }, 20);
  },

  // ── cancel (remove if new and empty) ─────────────────────
  cancel() {
    const obj = this.obj;
    this._hide();
    if (obj && this.isNew) OB.del(obj.id);
    OB.editId = null;
  },

  _hide() {
    const box = this.box;
    if (box) box.style.display = 'none';
    const ta = this.area;
    if (ta) { ta.oninput = null; ta.value = ''; }
    this.obj    = null;
    this.isNew  = false;
    this._drag   = null;
    this._resize = null;
    OB.editId = null;
    OB.renderOverlay();
  },

  // ── measure text → update OB object w/h ──────────────────
  _measureObj(obj) {
    const d = obj.data;
    const tmp = document.createElement('canvas').getContext('2d');
    tmp.font = `${d.italic?'italic ':''}${d.bold?'bold ':''}${d.size||32}px "${d.font||'Arial'}"`;
    const lines = (d.text || ' ').split('\n');
    let maxW = 0;
    lines.forEach(ln => {
      const w = tmp.measureText(ln || ' ').width + (d.letterSpacing||0) * (ln.length||1);
      if (w > maxW) maxW = w;
    });
    obj.w = Math.max(40, maxW + 16);
    obj.h = Math.max(20, lines.length * (d.size||32) * (d.lineHeight||1.35) + 8);
  },

  // ── MOVE BAR drag: start ──────────────────────────────────
  _moveStart(e) {
    e.preventDefault(); e.stopPropagation();
    this._drag = {
      startX: e.clientX, startY: e.clientY,
      origOX: this.obj?.x || 0, origOY: this.obj?.y || 0
    };
    document.addEventListener('mousemove', TXT._onMoveMove);
    document.addEventListener('mouseup',   TXT._onMoveUp);
  },
  _onMoveMove(e) {
    if (!TXT._drag || !TXT.obj) return;
    const dx = (e.clientX - TXT._drag.startX) / S.zoom;
    const dy = (e.clientY - TXT._drag.startY) / S.zoom;
    TXT.obj.x = TXT._drag.origOX + dx;
    TXT.obj.y = TXT._drag.origOY + dy;
    TXT._reposition();
    OB.renderOverlay();
  },
  _onMoveUp(e) {
    TXT._drag = null;
    document.removeEventListener('mousemove', TXT._onMoveMove);
    document.removeEventListener('mouseup',   TXT._onMoveUp);
  },

  // ── RESIZE CORNER drag ────────────────────────────────────
  _resizeStart(e) {
    e.preventDefault(); e.stopPropagation();
    this._resize = {
      startX: e.clientX, startY: e.clientY,
      origW: this.obj?.w || 200, origH: this.obj?.h || 60,
      origSize: this.obj?.data.size || 32
    };
    document.addEventListener('mousemove', TXT._onResizeMove);
    document.addEventListener('mouseup',   TXT._onResizeUp);
  },
  _onResizeMove(e) {
    if (!TXT._resize || !TXT.obj) return;
    const dx = (e.clientX - TXT._resize.startX) / S.zoom;
    const dy = (e.clientY - TXT._resize.startY) / S.zoom;
    const nw = Math.max(60, TXT._resize.origW + dx);
    const nh = Math.max(24, TXT._resize.origH + dy);
    TXT.obj.w = nw;
    TXT.obj.h = nh;
    // Proportionally update font size based on height
    const ratio = nh / TXT._resize.origH;
    TXT.obj.data.size = Math.max(6, Math.round(TXT._resize.origSize * ratio));
    TXT._reposition();
    OB.renderOverlay();
  },
  _onResizeUp() {
    TXT._resize = null;
    document.removeEventListener('mousemove', TXT._onResizeMove);
    document.removeEventListener('mouseup',   TXT._onResizeUp);
  }
};

// ═══════════════════════════════════════════════════════════
// BUILD the floating editor DOM (injected into #vp)
// ═══════════════════════════════════════════════════════════
function buildTextEditor() {
  if (document.getElementById('txed-box')) return; // already built
  const vp_ = document.getElementById('vp'); if (!vp_) return;

  const box = document.createElement('div');
  box.id = 'txed-box';
  box.style.cssText = `
    display:none; position:absolute; z-index:25;
    min-width:260px;min-height : 70px;
    box-shadow:0 4px 20px rgba(0,0,0,.18);
    border-radius:6px; overflow:visible;
    font-family:var(--f);
  `;

  // ── move handle bar ──────────────────────────────────────
  const bar = document.createElement('div');
  bar.id = 'txed-bar';
  bar.style.cssText = `
    height:22px; background:var(--blu); border-radius:6px 6px 0 0;
    cursor:move; display:flex; align-items:center;
    padding:0 7px; gap:6px; user-select:none;
  `;
  bar.innerHTML = `
    <span style="font-size:9px;color:rgba(255,255,255,.7);flex:1;letter-spacing:.04em;text-transform:uppercase">
      ⠿ Text — drag to move
    </span>
    <button id="txed-commit" style="
      background:rgba(255,255,255,.2); border:none; border-radius:3px;
      color:#fff; font-size:10px; cursor:pointer; padding:1px 7px; line-height:18px;
    " title="Commit text (Ctrl+Enter)">✓ Done</button>
    <button id="txed-cancel" style="
      background:rgba(255,255,255,.1); border:none; border-radius:3px;
      color:rgba(255,255,255,.7); font-size:10px; cursor:pointer; padding:1px 6px; line-height:18px;
    " title="Cancel (Escape)">✕</button>
  `;
  bar.addEventListener('mousedown', e => TXT._moveStart(e));

  // ── textarea ─────────────────────────────────────────────
  const ta = document.createElement('textarea');
  ta.id = 'txed';
  ta.spellcheck = false;
  ta.autocomplete = 'off';
  ta.style.cssText = `
    display:block; width:100%; min-width:100px; min-height:32px;
    background:#fff; border:none; border-radius:0;
    outline:none; resize:none; overflow:hidden;
    padding:6px 8px; box-sizing:border-box;
    font-size:24px; color:#000; line-height:1.35;
    white-space:pre-wrap; word-break:break-word;
  `;
  ta.placeholder = 'Type your text…';

  // Stop events from reaching the canvas while editing
  ['mousedown','mouseup','click','dblclick'].forEach(ev => {
    ta.addEventListener(ev, e => e.stopPropagation());
  });

  ta.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape')                          { e.preventDefault(); TXT.cancel(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); TXT.commit(); }
    // Allow regular Enter for newlines in textarea
  });

  // ── SE resize corner ──────────────────────────────────────
  const rc = document.createElement('div');
  rc.style.cssText = `
    position:absolute; bottom:-5px; right:-5px;
    width:14px; height:14px; border-radius:50%;
    background:var(--blu); cursor:se-resize;
    box-shadow:0 0 0 2px #fff, 0 2px 6px rgba(0,0,0,.3);
    z-index:2;
  `;
  rc.title = 'Drag to resize';
  rc.addEventListener('mousedown', e => TXT._resizeStart(e));

  // ── corner resize handles (TL TR BL) ─────────────────────
  [['top:−5px;left:−5px','nwse-resize'],
   ['top:−5px;right:−5px','nesw-resize'],
   ['bottom:−5px;left:−5px','nesw-resize']].forEach(([pos, cur]) => {
    const c = document.createElement('div');
    c.style.cssText = `
      position:absolute; ${pos.replace('−','-')};
      width:10px; height:10px; border-radius:50%;
      background:#fff; border:2px solid var(--blu);
      cursor:${cur}; z-index:2;
    `;
    box.appendChild(c);
  });

  box.appendChild(bar);
  box.appendChild(ta);
  box.appendChild(rc);
  vp_.appendChild(box);

  // Wire buttons
  document.getElementById('txed-commit').addEventListener('click', e => { e.stopPropagation(); TXT.commit(); });
  document.getElementById('txed-cancel').addEventListener('click', e => { e.stopPropagation(); TXT.cancel(); });

  // Commit when user clicks outside the box (on canvas) while editing
  document.addEventListener('mousedown', e => {
    if (!TXT.obj) return;
    const box2 = document.getElementById('txed-box');
    if (box2 && !box2.contains(e.target) && e.target !== box2) {
      // Delay slightly so click coordinates are processed first
      setTimeout(() => { if (TXT.obj) TXT.commit(); }, 30);
    }
  });
}

// ═══════════════════════════════════════════════════════════
// PATCH OB methods to use TXT
// ═══════════════════════════════════════════════════════════
OB.editText = function(id) {
  const obj = this.list.find(o => o.id === id);
  if (!obj) return;
  this.selId = id;
  TXT.isNew = false;
  TXT._open(obj);
};
OB.commitTextEdit = function() { TXT.commit(); };

// ═══════════════════════════════════════════════════════════
// PATCH DT.placeText to use TXT
// ═══════════════════════════════════════════════════════════
DT.placeText = function(cx, cy) { TXT.place(cx, cy); };

// ═══════════════════════════════════════════════════════════
// PATCH A.tool  — update txed-box font/position on zoom change
// ═══════════════════════════════════════════════════════════
const _txtFix_origATool = A.tool.bind(A);
A.tool = function(name) {
  // If switching away from text while editing → commit
  if (S.tool === 'text' && name !== 'text' && TXT.obj) {
    TXT.commit();
  }
  _txtFix_origATool(name);
  // Update cursor for text tool
  if (name === 'text') vp.style.cursor = 'text';
};

// ═══════════════════════════════════════════════════════════
// PATCH V.setZoom — reposition txed-box when zooming
// ═══════════════════════════════════════════════════════════
const _txtFix_origSetZoom = V.setZoom.bind(V);
V.setZoom = function(z, mx, my) {
  _txtFix_origSetZoom(z, mx, my);
  if (TXT.obj) TXT._reposition();
};

// ═══════════════════════════════════════════════════════════
// PATCH A._dn — fix move-tool S.drawing + text-tool flow
// ═══════════════════════════════════════════════════════════
const _txtFix_origDn = A._dn.bind(A);
A._dn = function(e) {
  if (e.button !== 0) return;
  const [cx, cy] = s2c(e.clientX, e.clientY);

  // ── TEXT TOOL: if clicking on existing text → edit it ────
  if (S.tool === 'text') {
    const hit = OB.hitTest(cx, cy);
    if (hit && (hit.type === 'text' || hit.type === 'text_path')) {
      OB.selId = hit.id;
      TXT.isNew = false;
      TXT._open(hit);
      return;
    }
    // Create new text object at click position
    TXT.place(cx, cy);
    e.stopPropagation();
    S.drawing = false;
    return;
  }

  // ── MOVE TOOL: ensure S.drawing is set correctly ─────────
  if (S.tool === 'move') {
    S.sx = e.clientX; S.sy = e.clientY; S.lx = cx; S.ly = cy;

    const handle = OB.hitHandle(cx, cy);
    if (handle) {
      if (handle === 'rot') OB.startDrag('rotate', handle, cx, cy);
      else                   OB.startDrag('resize', handle, cx, cy);
      S.drawing = true;   // ★ was missing — root cause of can't-drag bug
      return;
    }

    const obj = OB.hitTest(cx, cy);
    if (obj) {
      // Double-click on text → edit
      if (e.detail >= 2 && (obj.type === 'text' || obj.type === 'text_path')) {
        OB.editText(obj.id); return;
      }
      OB.selId = obj.id;
      OB.startDrag('move', null, cx, cy);
      S.drawing = true;   // ★ was missing
      OB.renderOverlay();
      UI.showObjProps(obj);
      return;
    }

    // No object hit → deselect + pan
    OB.deselect();
    S.drawing = true;   // allow pan
    return;
  }

  // Everything else: delegate to original chain
  _txtFix_origDn(e);
};

// ═══════════════════════════════════════════════════════════
// PATCH A._mv — keep txed-box in sync during object drag
// ═══════════════════════════════════════════════════════════
const _txtFix_origMv = A._mv.bind(A);
A._mv = function(e) {
  _txtFix_origMv(e);
  // If a text object is being dragged, keep editor box in sync
  if (S.tool === 'move' && OB._drag && TXT.obj && OB.selId === TXT.obj.id) {
    TXT._reposition();
  }
};

// ═══════════════════════════════════════════════════════════
// PATCH A._up — end drag, keep txed in sync
// ═══════════════════════════════════════════════════════════
const _txtFix_origUp = A._up.bind(A);
A._up = function(e) {
  _txtFix_origUp(e);
  if (TXT.obj) TXT._reposition();
};

// ═══════════════════════════════════════════════════════════
// CSS injected — overrides old txed styles + adds new ones
// ═══════════════════════════════════════════════════════════
(function injectCSS() {
  const st = document.createElement('style');
  st.textContent = `
  /* ── text editor wrapper ── */
  #txed-box {
    font-family: var(--f);
    border: 1.5px solid var(--blu);
    box-shadow: 0 4px 20px rgba(74,124,247,.25), 0 0 0 3px rgba(74,124,247,.1);
  }
  #txed {
    border-top: 1px solid rgba(74,124,247,.3);
    background: rgba(255,255,255,.97);
    caret-color: var(--blu);
    min-height: 36px;
    transition: height .05s;
  }
  [data-theme="dark"] #txed {
    background: rgba(22,27,34,.97);
    color: #E6EDF3;
  }
  [data-theme="dark"] #txed-bar {
    background: #2E5FD4;
  }
  #txed::selection { background: rgba(74,124,247,.3); }
  #txed:focus { outline: none; }

  /* ── move cursor on bar ── */
  #txed-bar:active { cursor: grabbing !important; }

  /* ── remove the OLD raw textarea styling (now inside box) ── */
  /* (the old #txed in CSS is replaced — no conflicts) */

  /* ── tooltip hints on toolbar ── */
  .txt-tool-hint {
    font-size: 10px; color: var(--t3); padding: 0 6px;
    display: flex; align-items: center; gap: 4px; flex-shrink: 0;
  }
  `;
  document.head.appendChild(st);
})();

// ═══════════════════════════════════════════════════════════
// KEYBOARD: Escape commits text + deselects while move tool
// ═══════════════════════════════════════════════════════════
document.addEventListener('keydown', e => {
  if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === 'Escape' && TXT.obj) { TXT.cancel(); return; }
  if (e.key === 'Escape' && S.tool === 'move' && OB.selId) { OB.deselect(); OB.renderOverlay(); }
  // T = switch to text tool
  if (!e.ctrlKey && e.key.toLowerCase() === 't' && S.tool !== 'text') A.tool('text');
}, { capture: false });

// ═══════════════════════════════════════════════════════════
// HINT in toolbar: add usage tip next to text options
// ═══════════════════════════════════════════════════════════
function addTextHint() {
  const opts = document.getElementById('txt-opts');
  if (!opts || opts.querySelector('.txt-tool-hint')) return;
  const hint = document.createElement('div');
  hint.className = 'txt-tool-hint';
  hint.innerHTML = `<span>Click canvas → type → <kbd style="background:var(--bg);border:1px solid var(--bdr);border-radius:3px;padding:0 4px;font-size:9px">Ctrl+↵</kbd> or click ✓ to finish</span>`;
  opts.appendChild(hint);
}

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
window.addEventListener('load', () => {
  buildTextEditor();
  addTextHint();

  // Reposition txed-box whenever pan/zoom changes
  const _origFit = V.fit.bind(V);
  V.fit = function() { _origFit(); if (TXT.obj) TXT._reposition(); };

  // Add "Text on Path" button to text options if pen path exists
  const opts = document.getElementById('txt-opts');
  if (opts && typeof TOP !== 'undefined') {
    const topBtn = document.createElement('button');
    topBtn.className = 'txbtn';
    topBtn.title = 'Attach text to selected pen path';
    topBtn.textContent = '⌇ Path';
    topBtn.style.flexShrink = '0';
    topBtn.onclick = () => {
      if (!OB.selId) { toast('Select a text object first'); return; }
      if (typeof PEN === 'undefined' || PEN.selPath < 0) { toast('Select a pen path first (Path Select tool)'); return; }
      TOP.attach(OB.selId, PEN.selPath);
    };
    opts.insertBefore(topBtn, opts.querySelector('.txt-tool-hint') || null);
  }

  toast('Text tool ready — click canvas to place text, drag the blue bar to move, ✓ to commit');
});