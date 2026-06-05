'use strict';
// ══════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════
const S = {
  W:800, H:600,
  zoom:1, panX:0, panY:0,
  tool:'brush',
  pri:'#000000', sec:'#ffffff',
  bsz:18, bop:100, bhd:80, sw:2,
  shapeFill:false, shapeStroke:true,
  drawing:false,
  sx:0, sy:0, lx:0, ly:0, cx:0, cy:0,
  sel:null,           // {x,y,w,h} rect selection | null
  selPoly:[],         // [{x,y}] polygon selection points
  selMask:null,       // ImageData mask of selection
  cropRgn:null,
  polyPts:[],
  lassoActive:false,  // currently drawing lasso
  lassoPts:[],
  feather:0,
  selPx:[], hovPx:null,
  grid:false, pixelGrid:false, snapGrid:false, showGuides:true,
  guides:[],          // [{type:'h'|'v', pos}]
  dashOff:0,
  clip:null,
  cpick:'pri',
  codeLang:'js',
  cloneSrc:null,      // {x,y} clone stamp source
  cloneSet:false,
  theme:'light',
  swatches:[],
  viewRot:0,

  //add
  magActive:false, qsActive:false, tfMode:'free', tfCorners:null,
patchSrc:null, patchMode:false, macroRec:false, macroActions:[],
macros:{}, snapshots:[], animFrames:[], animFrame:0,
animPlaying:false, animInterval:null, groups:{}, handPanning:false,
  maskPaintMode:false, maskPaintHide:false
};

// ══════════════════════════════════════════════════════
//  LAYER CLASS
// ══════════════════════════════════════════════════════
class Layer {
  constructor(w, h, n, type='pixel') {
    this.id = 'L' + (Date.now() + Math.random()).toString(36);
    this.name = n || 'Layer';
    this.type = type; // 'pixel' | 'adjustment' | 'group'
    this.w = w; this.h = h;
    this.el = document.createElement('canvas');
    this.el.width = w; this.el.height = h;
    this.x = this.el.getContext('2d', {
      willReadFrequently: true
    });
    this.x.imageSmoothingEnabled = false;
    this.vis = true; this.lk = false; this.op = 1; this.bm = 'source-over';
    this.adj = null;     // for adjustment layers: {type, params}
    this.mask = null;    // layer mask canvas (or null)
    this.groupId = null; // group ID if in a group

    this.mask = null;       // HTMLCanvasElement | null
    this.maskActive = false;
    this.clippingMask = false;
    this.styles = null;     // {shadow,glow,stroke,bevel}
    this._hiddenByGroup = false;
  }
  gpx(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return {r:0,g:0,b:0,a:0};
    const d = this.x.getImageData(x, y, 1, 1).data;
    return {r:d[0], g:d[1], b:d[2], a:d[3]};
  }
  spx(x, y, r, g, b, a=255) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const id = this.x.createImageData(1, 1);
    id.data[0]=r&255; id.data[1]=g&255; id.data[2]=b&255; id.data[3]=a&255;
    this.x.putImageData(id, x, y);
  }
  gd() { return this.x.getImageData(0, 0, this.w, this.h); }
  pd(d) { this.x.putImageData(d, 0, 0); }
  clr() { this.x.clearRect(0, 0, this.w, this.h); }
  snap() {
    const tmp = document.createElement('canvas');
    tmp.width = this.w; tmp.height = this.h;
    const tc = tmp.getContext('2d', {
      willReadFrequently: true
    });
    tc.imageSmoothingEnabled = false;
    tc.drawImage(this.el, 0, 0);
    return {id:this.id, name:this.name, type:this.type, w:this.w, h:this.h,
            png:tmp.toDataURL('image/png'), vis:this.vis, lk:this.lk, op:this.op, bm:this.bm,
            adj:this.adj,
            // Add to the snap() return object:
            maskPng: this.mask ? (()=>{ const t=document.createElement('canvas');t.width=this.w;t.height=this.h;t.getContext('2d').drawImage(this.mask,0,0);return t.toDataURL(); })() : null,
            maskActive: this.maskActive,
            clippingMask: this.clippingMask,
            styles: this.styles,
              groupId: this.groupId,
    };
  }
  loadSnap(s) {
    this.name = s.name; this.vis = s.vis; this.lk = s.lk; this.op = s.op; this.bm = s.bm;
    this.type = s.type || 'pixel';
    this.adj = s.adj || null;
    this.groupId = s.groupId || null;
    this.clippingMask = s.clippingMask || false;
    this.styles = s.styles || null;

    if(s.maskPng && s.maskActive) {
        this.mask = document.createElement('canvas');
        this.mask.width = this.w; this.mask.height = this.h;
        const img = new Image(); img.src = s.maskPng;
        img.onload = () => this.mask.getContext('2d').drawImage(img,0,0);
        this.maskActive = true;
    }

    if (s.png) {
      const img = new Image();
      img.onload = () => {
        this.x.clearRect(0, 0, this.w, this.h);
        this.x.imageSmoothingEnabled = false;
        this.x.drawImage(img, 0, 0);
      };
      img.src = s.png;
    } else if (s.data) {
      this.pd(new ImageData(new Uint8ClampedArray(s.data), s.w, s.h));
    }
  }
}

let layers = [], ai = 0;
const AL = () => layers[ai];

// Viewport & main canvas
const vp = document.getElementById('vp');
const dc = document.getElementById('dc');
const dctx = dc.getContext('2d', {
      willReadFrequently: true
    });
dctx.imageSmoothingEnabled = false;

// ══════════════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════════════
function s2c(ex, ey) {
  const r = vp.getBoundingClientRect();
  return [(ex - r.left - S.panX) / S.zoom, (ey - r.top - S.panY) / S.zoom];
}
function cl(v, a, b) { return Math.max(a, Math.min(b, v)); }
function h2r(h) { return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]; }
function r2h(r, g, b) { return '#' + [r,g,b].map(v=>cl(~~v,0,255).toString(16).padStart(2,'0')).join('').toUpperCase(); }
function pct(z) { return z >= 1 ? Math.round(z*100)+'%' : (z*100).toFixed(0)+'%'; }
function hexToHSL(hex) {
  let [r,g,b] = h2r(hex);
  r/=255; g/=255; b/=255;
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2;
  if (mx===mn) return {h:0,s:0,l:Math.round(l*100)};
  const d=mx-mn, s=l>0.5?d/(2-mx-mn):d/(mx+mn);
  let h = mx===r?(g-b)/d+(g<b?6:0) : mx===g?(b-r)/d+2 : (r-g)/d+4;
  return {h:Math.round(h/6*360), s:Math.round(s*100), l:Math.round(l*100)};
}
function hslToHex(h,s,l) {
  s/=100; l/=100; h/=360;
  const q=l<0.5?l*(1+s):l+s-l*s, p=2*l-q;
  const hue2rgb=(p,q,t)=>{t=(t%1+1)%1; return t<1/6?p+(q-p)*6*t:t<1/2?q:t<2/3?p+(q-p)*(2/3-t)*6:p;};
  return r2h(Math.round(hue2rgb(p,q,h+1/3)*255), Math.round(hue2rgb(p,q,h)*255), Math.round(hue2rgb(p,q,h-1/3)*255));
}
function snapToGrid(v, gridSize=20) {
  return S.snapGrid ? Math.round(v/gridSize)*gridSize : v;
}

// ══════════════════════════════════════════════════════
//  HISTORY
// ══════════════════════════════════════════════════════
const Hs = {
  stack: [], idx: -1, max: 60,
  save(desc='Action') {
    const snap = {
      desc, W:S.W, H:S.H,
      layers: layers.map(l => l.snap()),
      ai,
      objects: OB.snapObjects()
    };
    if (this.idx < this.stack.length-1) this.stack.splice(this.idx+1);
    this.stack.push(snap);
    if (this.stack.length > this.max) this.stack.shift(); else this.idx++;
    UI.hilist();
  },
  undo() {
    if (this.idx <= 0) { toast('Nothing to undo'); return; }
    this.idx--;
    this._load(this.stack[this.idx]);
    toast('Undo: ' + this.stack[this.idx].desc);
  },
  redo() {
    if (this.idx >= this.stack.length-1) { toast('Nothing to redo'); return; }
    this.idx++;
    this._load(this.stack[this.idx]);
    toast('Redo: ' + this.stack[this.idx].desc);
  },
  _load(snap) {
    S.W = snap.W; S.H = snap.H;
    layers = snap.layers.map(s => {
      const l = new Layer(s.w, s.h, s.name, s.type || 'pixel');
      l.id = s.id; l.vis = s.vis; l.lk = s.lk; l.op = s.op; l.bm = s.bm;
      l.adj = s.adj || null;
      l.loadSnap(s);
      return l;
    });
    ai = snap.ai;
    if (snap.objects) OB.loadObjects(snap.objects);
    S.sel = null; S.cropRgn = null; S.drawing = false; S.polyPts = []; S.lassoPts = []; S.lassoActive = false;
    document.getElementById('cropbar').classList.remove('show');
    vp.style.cursor = 'crosshair';
    UI.lylist(); UI.hilist(); UI.updateSizeDisplay(); UI.updateSelInfo();
    OB.renderOverlay();
  }
};

// ══════════════════════════════════════════════════════
//  OBJECT SYSTEM — non-destructive objects (text, shapes, images)
// ══════════════════════════════════════════════════════
const OB = {
  list: [],       // [{id,type,x,y,w,h,rot,data,vis,op,layerIdx}]
  selId: null,    // selected object id
  editId: null,   // text object being inline-edited
  overlay: null,  // HTMLCanvasElement
  octx: null,
  _drag: null,    // {type:'move'|'resize'|'rotate', handle, startCx,startCy, origObj}

  init() {
    this.overlay = document.getElementById('oc');
    this.octx = this.overlay.getContext('2d', {
      willReadFrequently: true
    });
    this.octx.imageSmoothingEnabled = false;
  },
  resize(w, h) {
    this.overlay.width = w;
    this.overlay.height = h;
  },
  get sel() { return this.list.find(o => o.id === this.selId) || null; },

  add(type, x, y, w, h, data) {
    const obj = {
      id: 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2,5),
      type, x, y, w: Math.max(w, 4), h: Math.max(h, 4),
      rot: 0, vis: true, op: 100,
      data: { ...data },
      layerIdx: ai
    };
    this.list.push(obj);
    this.selId = obj.id;
    return obj;
  },

  del(id) {
    const target = id || this.selId;
    const i = this.list.findIndex(o => o.id === target);
    if (i >= 0) this.list.splice(i, 1);
    if (!id || id === this.selId) this.selId = null;
    this.renderOverlay();
    Hs.save('Delete Object');
  },

  deselect() { this.selId = null; this.renderOverlay(); UI.hideObjProps(); },

  // Hit test at canvas coords
  hitTest(cx, cy) {
    for (let i = this.list.length-1; i >= 0; i--) {
      const o = this.list[i];
      if (!o.vis) continue;
      if (this._ptInObj(cx, cy, o)) return o;
    }
    return null;
  },

  _ptInObj(cx, cy, o) {
    const cos = Math.cos(-o.rot * Math.PI/180);
    const sin = Math.sin(-o.rot * Math.PI/180);
    const ocx = o.x + o.w/2, ocy = o.y + o.h/2;
    const dx = cx - ocx, dy = cy - ocy;
    const lx = dx*cos - dy*sin, ly = dx*sin + dy*cos;
    const margin = 8 / S.zoom;
    return lx >= -o.w/2-margin && lx <= o.w/2+margin && ly >= -o.h/2-margin && ly <= o.h/2+margin;
  },

  _handles(o) {
    const {x,y,w,h} = o;
    const rot = this._rotHandlePos(o);
    return [
      {id:'tl',x:x,     y:y},     {id:'tc',x:x+w/2,y:y},     {id:'tr',x:x+w,   y:y},
      {id:'ml',x:x,     y:y+h/2},                             {id:'mr',x:x+w,   y:y+h/2},
      {id:'bl',x:x,     y:y+h},   {id:'bc',x:x+w/2,y:y+h},   {id:'br',x:x+w,   y:y+h},
      {id:'rot',x:rot.x,y:rot.y}
    ];
  },
  _rotHandlePos(o) { return {x: o.x + o.w/2, y: o.y - 24/S.zoom}; },

  hitHandle(cx, cy) {
    const o = this.sel; if (!o) return null;
    const hit = 7/S.zoom;
    for (const h of this._handles(o)) {
      if (Math.abs(cx - h.x) <= hit && Math.abs(cy - h.y) <= hit) return h.id;
    }
    return null;
  },

  startDrag(type, handle, cx, cy) {
    const o = this.sel; if (!o) return;
    this._drag = { type, handle, startCx:cx, startCy:cy,
      orig: {x:o.x,y:o.y,w:o.w,h:o.h,rot:o.rot} };
  },

  continueDrag(cx, cy) {
    const d = this._drag, o = this.sel;
    if (!d || !o) return;
    const dx = cx - d.startCx, dy = cy - d.startCy;
    if (d.type === 'move') {
      o.x = snapToGrid(d.orig.x + dx); o.y = snapToGrid(d.orig.y + dy);
    } else if (d.type === 'resize') {
      this._applyResize(o, d.handle, cx, cy, d.orig);
    } else if (d.type === 'rotate') {
      const ocx = d.orig.x + d.orig.w/2, ocy = d.orig.y + d.orig.h/2;
      o.rot = Math.atan2(cy - ocy, cx - ocx) * 180/Math.PI + 90;
    }
    this.renderOverlay();
    UI.showObjProps(o);
  },

  endDrag() {
    if (this._drag) { this._drag = null; Hs.save('Transform Object'); }
  },

  _applyResize(o, handle, cx, cy, orig) {
    const right = orig.x + orig.w, bottom = orig.y + orig.h;
    if (handle === 'tl')      { o.x = Math.min(cx, right-10); o.y = Math.min(cy, bottom-10); o.w = right-o.x; o.h = bottom-o.y; }
    else if (handle === 'tr') { o.y = Math.min(cy, bottom-10); o.w = Math.max(10, cx-orig.x); o.h = bottom-o.y; }
    else if (handle === 'bl') { o.x = Math.min(cx, right-10); o.w = right-o.x; o.h = Math.max(10, cy-orig.y); }
    else if (handle === 'br') { o.w = Math.max(10, cx-orig.x); o.h = Math.max(10, cy-orig.y); }
    else if (handle === 'tc') { o.y = Math.min(cy, bottom-10); o.h = bottom-o.y; }
    else if (handle === 'bc') { o.h = Math.max(10, cy-orig.y); }
    else if (handle === 'ml') { o.x = Math.min(cx, right-10); o.w = right-o.x; }
    else if (handle === 'mr') { o.w = Math.max(10, cx-orig.x); }
    // Update text size based on height
    if (o.type === 'text') o.data.size = Math.max(6, Math.round(o.h * 0.75));
  },

  renderOverlay() {
    const ctx = this.octx;
    const cw = this.overlay.width, ch = this.overlay.height;
    ctx.clearRect(0, 0, cw, ch);
    if (!layers.length) return;
    ctx.save();
    ctx.translate(Math.round(S.panX), Math.round(S.panY));
    ctx.scale(S.zoom, S.zoom);
    ctx.imageSmoothingEnabled = false;
    for (const o of this.list) {
      if (o.vis) this._drawObj(ctx, o);
    }
    if (this.sel) this._drawHandles(ctx, this.sel);
    ctx.restore();
  },

  _drawObj(ctx, o) {
    ctx.save();
    const cx = o.x + o.w/2, cy = o.y + o.h/2;
    ctx.translate(cx, cy); ctx.rotate(o.rot * Math.PI/180); ctx.translate(-cx, -cy);
    ctx.globalAlpha = o.op/100;
    if (o.type === 'text')       this._drawText(ctx, o);
    else if (o.type === 'image') this._drawImage(ctx, o);
    else                         this._drawShape(ctx, o);
    ctx.restore();
  },

  _drawText(ctx, o) {
    const d = o.data;
    ctx.font = `${d.italic?'italic ':''}${d.bold?'bold ':''}${d.size||24}px "${d.font||'Arial'}"`;
    ctx.textBaseline = 'top'; ctx.textAlign = d.align || 'left';
    const tx = d.align==='center' ? o.x+o.w/2 : d.align==='right' ? o.x+o.w : o.x;
    if (d.shadow) {
      ctx.shadowColor = d.shadowColor||'rgba(0,0,0,0.6)';
      ctx.shadowBlur = d.shadowBlur||4;
      ctx.shadowOffsetX = d.shadowOffsetX||2;
      ctx.shadowOffsetY = d.shadowOffsetY||2;
    }
    if (d.letterSpacing) {
      let xpos = tx;
      for (const ch of (d.text||'')) {
        if (d.stroke) {
          ctx.shadowColor='transparent'; ctx.strokeStyle=d.strokeColor||'#000'; ctx.lineWidth=d.strokeWidth||2; ctx.strokeText(ch,xpos,o.y);
          if(d.shadow){ ctx.shadowColor=d.shadowColor||'rgba(0,0,0,0.6)'; ctx.shadowBlur=d.shadowBlur||4; ctx.shadowOffsetX=d.shadowOffsetX||2; ctx.shadowOffsetY=d.shadowOffsetY||2; }
        }
        ctx.fillStyle = d.color||S.pri; ctx.fillText(ch, xpos, o.y);
        xpos += ctx.measureText(ch).width + (d.letterSpacing||0);
      }
    } else {
      if (d.stroke) {
        ctx.shadowColor='transparent'; ctx.strokeStyle=d.strokeColor||'#000'; ctx.lineWidth=d.strokeWidth||2; ctx.strokeText(d.text,tx,o.y);
        if(d.shadow){ ctx.shadowColor=d.shadowColor||'rgba(0,0,0,0.6)'; ctx.shadowBlur=d.shadowBlur||4; ctx.shadowOffsetX=d.shadowOffsetX||2; ctx.shadowOffsetY=d.shadowOffsetY||2; }
      }
      ctx.fillStyle = d.color||S.pri; ctx.fillText(d.text||'', tx, o.y);
    }
    ctx.shadowColor='transparent'; ctx.shadowBlur=0; ctx.shadowOffsetX=0; ctx.shadowOffsetY=0;
  },

  _drawShape(ctx, o) {
    const d = o.data;
    ctx.strokeStyle = d.strokeColor||S.pri; ctx.lineWidth = d.strokeWidth||S.sw;
    if (d.fillColor && d.fillColor !== 'none') ctx.fillStyle = d.fillColor;
    if (o.type === 'rect') {
      if (d.fillColor && d.fillColor!=='none') ctx.fillRect(o.x,o.y,o.w,o.h);
      ctx.strokeRect(o.x,o.y,o.w,o.h);
    } else if (o.type === 'ellipse') {
      ctx.beginPath(); ctx.ellipse(o.x+o.w/2, o.y+o.h/2, o.w/2, o.h/2, 0, 0, Math.PI*2);
      if (d.fillColor && d.fillColor!=='none') ctx.fill(); ctx.stroke();
    } else if (o.type === 'line') {
      ctx.beginPath(); ctx.moveTo(o.x,o.y+o.h/2); ctx.lineTo(o.x+o.w,o.y+o.h/2); ctx.stroke();
    } else if (o.type === 'arrow') {
      const as=14, aa=Math.PI/6, ang=Math.atan2(0, o.w);
      ctx.beginPath(); ctx.moveTo(o.x,o.y+o.h/2); ctx.lineTo(o.x+o.w,o.y+o.h/2);
      ctx.lineTo(o.x+o.w-as*Math.cos(ang-aa),o.y+o.h/2-as*Math.sin(ang-aa));
      ctx.moveTo(o.x+o.w,o.y+o.h/2);
      ctx.lineTo(o.x+o.w-as*Math.cos(ang+aa),o.y+o.h/2-as*Math.sin(ang+aa));
      ctx.stroke();
    } else if (o.type === 'star') {
      const pts=5, r1=Math.min(o.w,o.h)/2, r2=r1*0.38;
      const cx2=o.x+o.w/2, cy2=o.y+o.h/2;
      ctx.beginPath();
      for(let i=0;i<pts*2;i++){
        const r=i%2===0?r1:r2, a=i*Math.PI/pts - Math.PI/2;
        i===0?ctx.moveTo(cx2+r*Math.cos(a),cy2+r*Math.sin(a)):ctx.lineTo(cx2+r*Math.cos(a),cy2+r*Math.sin(a));
      }
      ctx.closePath();
      if (d.fillColor && d.fillColor!=='none') ctx.fill(); ctx.stroke();
    }
  },

  _drawImage(ctx, o) {
    if (o.data._img && o.data._img.complete) {
      ctx.drawImage(o.data._img, o.x, o.y, o.w, o.h);
    }
  },

  _drawHandles(ctx, o) {
    const z = S.zoom;
    ctx.save();
    // Dashed bounding box
    ctx.strokeStyle = '#4A7CF7'; ctx.lineWidth = 1.5/z;
    ctx.setLineDash([5/z, 3/z]); ctx.strokeRect(o.x, o.y, o.w, o.h); ctx.setLineDash([]);
    // Rotation line
    const rh = this._rotHandlePos(o);
    ctx.beginPath(); ctx.moveTo(o.x+o.w/2, o.y); ctx.lineTo(rh.x, rh.y);
    ctx.strokeStyle = '#4A7CF7'; ctx.lineWidth = 1/z; ctx.stroke();
    // All handles
    for (const h of this._handles(o)) {
      if (h.id === 'rot') {
        ctx.beginPath(); ctx.arc(h.x, h.y, 5/z, 0, Math.PI*2);
        ctx.fillStyle = '#4A7CF7'; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5/z; ctx.stroke();
      } else {
        const s = 7/z;
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#4A7CF7'; ctx.lineWidth = 1.5/z;
        ctx.beginPath(); ctx.rect(h.x-s/2, h.y-s/2, s, s); ctx.fill(); ctx.stroke();
      }
    }
    ctx.restore();
  },

  // Rasterize obj to layer pixels
  rasterize(id) {
    const o = this.list.find(ob => ob.id === (id || this.selId));
    if (!o) return;
    const l = layers[o.layerIdx] || AL();
    if (!l || l.lk) return;
    this._drawObj(l.x, o);
    this.del(o.id);
    this.selId = null;
    this.renderOverlay();
    Hs.save('Rasterize Object');
    toast('Rasterized to layer');
  },
  rasterizeAll() {
    [...this.list].forEach(o => this.rasterize(o.id));
  },

  // Serialize for undo history
  snapObjects() { return this.list.map(o => ({...o, data:{...o.data, _img:null}})); },
  loadObjects(snaps) {
    this.list = snaps.map(s => {
      const o = {...s, data:{...s.data}};
      if (o.type === 'image' && o.data.src) {
        o.data._img = new Image(); o.data._img.src = o.data.src;
      }
      return o;
    });
    this.selId = null;
    this.renderOverlay();
  },

  // Start inline text edit
  editText(id) {
    const o = this.list.find(ob => ob.id === id);
    if (!o || o.type !== 'text') return;
    this.editId = id;
    const el = document.getElementById('txed');
    const d = o.data;
    el.style.font = `${d.italic?'italic ':''}${d.bold?'bold ':''}${d.size||24}px "${d.font||'Arial'}"`;
    el.style.color = d.color||S.pri;
    el.style.display = 'block';
    el.style.left = (S.panX + o.x * S.zoom) + 'px';
    el.style.top  = (S.panY + o.y * S.zoom) + 'px';
    el.style.minWidth = (o.w * S.zoom) + 'px';
    el.style.fontSize = (d.size||24) * S.zoom + 'px';
    el.value = d.text || '';
    el.focus(); el.select();
  },
  commitTextEdit() {
    if (!this.editId) return;
    const o = this.list.find(ob => ob.id === this.editId);
    const el = document.getElementById('txed');
    if (o) {
      o.data.text = el.value;
      // Resize bounding box to fit text
      const tmp = document.createElement('canvas').getContext('2d', {
      willReadFrequently: true
    });
      tmp.font = `${o.data.italic?'italic ':''}${o.data.bold?'bold ':''}${o.data.size||24}px "${o.data.font||'Arial'}"`;
      const m = tmp.measureText(o.data.text||'A');
      o.w = Math.max(20, m.width + 8);
      o.h = Math.max(20, (o.data.size||24) * 1.3);
      Hs.save('Edit Text');
    }
    el.style.display = 'none';
    this.editId = null;
    this.renderOverlay();
  }
};

// ══════════════════════════════════════════════════════
//  RENDERER
// ══════════════════════════════════════════════════════
const RL = { // alias for legacy calls
  draw() { R.render(); OB.renderOverlay();
    if (A._drawRulers) {
      A._drawRulers();
    }
  }
};

const R = {
  cx:0, cy:0,
  init() {
    this.resize();
    window.addEventListener('resize', () => { this.resize(); RL.draw(); });
    this.loop();
  },
  resize() {
    dc.width = vp.clientWidth; dc.height = vp.clientHeight;
    dctx.imageSmoothingEnabled = false;
    OB.resize(vp.clientWidth, vp.clientHeight);
    const lc = document.getElementById('lasso-canvas');
    if (lc) { lc.width = vp.clientWidth; lc.height = vp.clientHeight; }
  },
  loop() { this.render(); requestAnimationFrame(() => this.loop()); },

  render() {

    const W = dc.width, H = dc.height, z = S.zoom;
    dctx.clearRect(0, 0, W, H);
    // Checker background
    dctx.fillStyle = '#B0B8C8'; dctx.fillRect(0, 0, W, H);
    dctx.fillStyle = '#A4ACBC';
    for (let x=0; x<W; x+=32) for (let y=0; y<H; y+=32) {
      dctx.fillRect(x, y, 16, 16); dctx.fillRect(x+16, y+16, 16, 16);
    }
    dctx.save();

    //rotateView
    const cx = dc.width / 2;
    const cy = dc.height / 2;

    dctx.translate(cx, cy);
    dctx.rotate(S.viewRot * Math.PI / 180);
    dctx.translate(-cx, -cy);

    //rotateend

    dctx.translate(Math.round(S.panX), Math.round(S.panY));
    dctx.scale(z, z);
    dctx.imageSmoothingEnabled = false;

    // Render layers bottom-to-top
    /*for (let i=layers.length-1; i>=0; i--) {
      const l = layers[i]; if (!l.vis) continue;
      if (l.type === 'adjustment' && l.adj) { this._applyAdj(l); continue; }
      dctx.globalAlpha = l.op;
      dctx.globalCompositeOperation = l.bm;
      dctx.imageSmoothingEnabled = false;
      dctx.drawImage(l.el, 0, 0);
    }*/
    for (let i=layers.length-1; i>=0; i--) {
        const l = layers[i];
        if (!l.vis || l._hiddenByGroup) continue;
        if (l.type === 'adjustment' && l.adj) { this._applyAdj(l); continue; }

        // Clipping mask: clip to alpha of layer below
        if (l.clippingMask && layers[i+1]) {
              const tmp=document.createElement('canvas'); tmp.width=S.W; tmp.height=S.H;
              const tc=tmp.getContext('2d');
              tc.drawImage(layers[i+1].el,0,0);
                tc.globalCompositeOperation='source-in';
                  tc.drawImage(l.el,0,0);
                    dctx.globalAlpha=l.op; dctx.globalCompositeOperation=l.bm;
              dctx.drawImage(tmp,0,0);
              continue;
        }

        // Layer mask: apply mask alpha
        if (l.mask && l.maskActive) {
            const tmp=document.createElement('canvas'); tmp.width=S.W; tmp.height=S.H;
              const tc=tmp.getContext('2d');
                  tc.drawImage(l.el,0,0);
              tc.globalCompositeOperation='destination-in';
              tc.drawImage(l.mask,0,0);
              // Layer styles
                  if(typeof LSTYLE!=='undefined' && l.styles) LSTYLE.render(dctx,{...l, el:tmp});
              dctx.globalAlpha=l.op; dctx.globalCompositeOperation=l.bm; dctx.drawImage(tmp,0,0);
            continue;
        }

        // Layer styles
        if(typeof LSTYLE!=='undefined' && l.styles) { LSTYLE.render(dctx,l); }

        dctx.globalAlpha = l.op;
        dctx.globalCompositeOperation = l.bm;
        dctx.imageSmoothingEnabled = false;
        dctx.drawImage(l.el, 0, 0);
    }
    dctx.globalAlpha = 1; dctx.globalCompositeOperation = 'source-over';

    // Grid
    if (S.grid) this._grid();
    if (S.pixelGrid && z >= 6) this._pxgrid();
    // Guides
    if (S.showGuides) this._drawGuides();

    // Selection pixel highlights
    if (S.selPx.length > 0) {
      dctx.fillStyle = 'rgba(74,124,247,.25)';
      dctx.strokeStyle = 'rgba(74,124,247,.9)'; dctx.lineWidth = 1.5/z;
      for (const p of S.selPx) {
        dctx.fillRect(p.x, p.y, 1, 1);
        dctx.strokeRect(p.x+.5/z, p.y+.5/z, 1-1/z, 1-1/z);
      }
    }
    // Pixel hover
    if (S.tool === 'pixel' && S.hovPx) {
      dctx.strokeStyle = '#FFD700'; dctx.lineWidth = 2/z;
      dctx.strokeRect(S.hovPx.x+1/z, S.hovPx.y+1/z, 1-2/z, 1-2/z);
    }
    // Selection marching ants (rect)
    if (S.sel) this._sel(S.sel);
    // Crop overlay
    if (S.cropRgn) this._cropOverlay(S.cropRgn);
    // Live shape/select preview
    if (S.drawing) this._preview();
    // Canvas border
    dctx.strokeStyle = '#8891A4'; dctx.lineWidth = 1/z;
    dctx.strokeRect(0, 0, S.W, S.H);

    dctx.restore();
    // Brush cursor
    if (['brush','eraser','blur_brush','dodge','burn','clone','smudge','spray','heal','sponge'].includes(S.tool)) this._brushCursor();
    // Lasso path
    if (S.lassoActive || S.selPoly.length) this._drawLasso();
  },

  _applyAdj(l) {
    // Adjustment layers affect all layers below — simplified implementation
    // (full non-destructive adjustment would require a separate compositing pass)
  },

  _grid() {
    const base = 20;
    const step = base / S.zoom;

    if (step < 5) return; // avoid noisy grid when zoomed out
    dctx.strokeStyle = 'rgba(100,110,130,.2)'; dctx.lineWidth = 1/S.zoom;
    dctx.beginPath();
    for (let x=0; x<=S.W; x+=step) { dctx.moveTo(x,0); dctx.lineTo(x,S.H); }
    for (let y=0; y<=S.H; y+=step) { dctx.moveTo(0,y); dctx.lineTo(S.W,y); }
    dctx.stroke();
  },
  _pxgrid() {
    dctx.strokeStyle = 'rgba(80,90,120,.28)'; dctx.lineWidth = .5/S.zoom;
    dctx.beginPath();
    for (let x=0; x<=S.W; x++) { dctx.moveTo(x,0); dctx.lineTo(x,S.H); }
    for (let y=0; y<=S.H; y++) { dctx.moveTo(0,y); dctx.lineTo(S.W,y); }
    dctx.stroke();
  },
  _drawGuides() {
    dctx.strokeStyle = 'rgba(74,124,247,.65)'; dctx.lineWidth = 1/S.zoom;
    dctx.setLineDash([4/S.zoom, 4/S.zoom]);
    for (const g of S.guides) {
      dctx.beginPath();
      if (g.type === 'h') { dctx.moveTo(0, g.pos); dctx.lineTo(S.W, g.pos); }
      else { dctx.moveTo(g.pos, 0); dctx.lineTo(g.pos, S.H); }
      dctx.stroke();
    }
    dctx.setLineDash([]);
  },
  _sel(rect) {
    S.dashOff += .35;
    const {x,y,w,h} = rect, d = 5/S.zoom;
    dctx.lineWidth = 1/S.zoom;
    dctx.strokeStyle = '#000'; dctx.setLineDash([d,d]); dctx.lineDashOffset = -S.dashOff;
    dctx.strokeRect(x,y,w,h);
    dctx.strokeStyle = '#fff'; dctx.lineDashOffset = -S.dashOff+d;
    dctx.strokeRect(x,y,w,h);
    dctx.setLineDash([]);
  },
  _cropOverlay(rgn) {
    const {x,y,w,h} = rgn;
    dctx.fillStyle = 'rgba(0,0,0,.5)';
    dctx.fillRect(0,0,S.W,y); dctx.fillRect(0,y+h,S.W,S.H-y-h);
    dctx.fillRect(0,y,x,h); dctx.fillRect(x+w,y,S.W-x-w,h);
    dctx.strokeStyle = '#fff'; dctx.lineWidth = 1.5/S.zoom;
    dctx.strokeRect(x,y,w,h);
    dctx.strokeStyle = 'rgba(255,255,255,.4)'; dctx.lineWidth = .5/S.zoom;
    dctx.beginPath();
    dctx.moveTo(x+w/3,y); dctx.lineTo(x+w/3,y+h);
    dctx.moveTo(x+w*2/3,y); dctx.lineTo(x+w*2/3,y+h);
    dctx.moveTo(x,y+h/3); dctx.lineTo(x+w,y+h/3);
    dctx.moveTo(x,y+h*2/3); dctx.lineTo(x+w,y+h*2/3);
    dctx.stroke();
  },
  _preview() {
    const z = S.zoom;
    const [x1,y1] = s2c(S.sx,S.sy), [x2,y2] = s2c(S.cx,S.cy);
    const x=Math.min(x1,x2), y=Math.min(y1,y2), w=Math.abs(x2-x1), h=Math.abs(y2-y1);
    dctx.globalAlpha = .75;
    if (S.tool === 'select' || S.tool === 'ellipse_sel') {
      dctx.strokeStyle = S.pri; dctx.lineWidth = 1/z;
      dctx.setLineDash([4/z,4/z]);
      if (S.tool === 'ellipse_sel') { dctx.beginPath(); dctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2); dctx.stroke(); }
      else dctx.strokeRect(x,y,w,h);
      dctx.setLineDash([]);
    } else if (S.tool === 'crop') {
      dctx.fillStyle = 'rgba(0,0,0,.45)';
      dctx.fillRect(0,0,S.W,y); dctx.fillRect(0,y+h,S.W,S.H-y-h);
      dctx.fillRect(0,y,x,h); dctx.fillRect(x+w,y,S.W-x-w,h);
      dctx.strokeStyle = '#fff'; dctx.lineWidth = 1.5/z; dctx.strokeRect(x,y,w,h);
    } else if (S.tool === 'rect') {
      dctx.strokeStyle = S.pri; dctx.lineWidth = S.sw/z;
      if (S.shapeFill) { dctx.fillStyle = S.pri; dctx.fillRect(x,y,w,h); }
      dctx.strokeRect(x,y,w,h);
    } else if (S.tool === 'ellipse') {
      dctx.strokeStyle = S.pri; dctx.lineWidth = S.sw/z;
      dctx.beginPath(); dctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);
      if (S.shapeFill) { dctx.fillStyle = S.pri; dctx.fill(); } dctx.stroke();
    } else if (S.tool === 'line') {
      dctx.strokeStyle = S.pri; dctx.lineWidth = S.sw/z;
      dctx.beginPath(); dctx.moveTo(x1,y1); dctx.lineTo(x2,y2); dctx.stroke();
    } else if (S.tool === 'arrow') {
      const ang=Math.atan2(y2-y1,x2-x1), as=14, aa=Math.PI/6;
      dctx.strokeStyle = S.pri; dctx.lineWidth = S.sw/z;
      dctx.beginPath(); dctx.moveTo(x1,y1); dctx.lineTo(x2,y2);
      dctx.lineTo(x2-as*Math.cos(ang-aa)/z,y2-as*Math.sin(ang-aa)/z);
      dctx.moveTo(x2,y2);
      dctx.lineTo(x2-as*Math.cos(ang+aa)/z,y2-as*Math.sin(ang+aa)/z);
      dctx.stroke();
    } else if (S.tool === 'gradient') {
      const g = dctx.createLinearGradient(x1,y1,x2,y2);
      const [r1,g1,b1]=h2r(S.pri), [r2,g2,b2]=h2r(S.sec);
      g.addColorStop(0,`rgba(${r1},${g1},${b1},.6)`); g.addColorStop(1,`rgba(${r2},${g2},${b2},.6)`);
      dctx.fillStyle = g; dctx.fillRect(0,0,S.W,S.H);
    }
    dctx.globalAlpha = 1;
  },
  _drawLasso() {
    const pts = S.lassoActive ? S.lassoPts : S.selPoly;
    if (pts.length < 2) return;
    const lc = document.getElementById('lasso-canvas');
    if (!lc) return;
    const lctx = lc.getContext('2d', {
      willReadFrequently: true
    });
    lctx.clearRect(0, 0, lc.width, lc.height);
    lctx.save();
    lctx.translate(Math.round(S.panX), Math.round(S.panY));
    lctx.scale(S.zoom, S.zoom);
    S.dashOff += .3;
    lctx.beginPath();
    lctx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach(p => lctx.lineTo(p.x, p.y));
    if (!S.lassoActive) lctx.closePath();
    lctx.lineWidth = 1/S.zoom;
    lctx.strokeStyle = '#000'; lctx.setLineDash([5/S.zoom, 5/S.zoom]); lctx.lineDashOffset = -S.dashOff;
    lctx.stroke();
    lctx.strokeStyle = '#fff'; lctx.lineDashOffset = -S.dashOff + 5/S.zoom;
    lctx.stroke();
    lctx.setLineDash([]);
    lctx.restore();
  },
  _brushCursor() {
    const r = (S.bsz/2) * S.zoom; if (r < 1) return;
    const {cx:x, cy:y} = R; if (!x && !y) return;
    dctx.strokeStyle = 'rgba(255,255,255,.8)'; dctx.lineWidth = 1.5;
    dctx.beginPath(); dctx.arc(x, y, r, 0, Math.PI*2); dctx.stroke();
    dctx.strokeStyle = 'rgba(0,0,0,.45)'; dctx.lineWidth = .7;
    dctx.beginPath(); dctx.arc(x, y, r, 0, Math.PI*2); dctx.stroke();
    dctx.strokeStyle = 'rgba(255,255,255,.6)'; dctx.lineWidth = .8;
    dctx.beginPath(); dctx.moveTo(x-4,y); dctx.lineTo(x+4,y); dctx.moveTo(x,y-4); dctx.lineTo(x,y+4); dctx.stroke();
    // Clone source indicator
    if (S.tool === 'clone' && S.cloneSrc) {
      const sx2 = S.panX + S.cloneSrc.x * S.zoom, sy2 = S.panY + S.cloneSrc.y * S.zoom;
      dctx.strokeStyle = '#FFD700'; dctx.lineWidth = 1.5;
      dctx.beginPath(); dctx.arc(sx2, sy2, r, 0, Math.PI*2); dctx.stroke();
      dctx.beginPath(); dctx.moveTo(sx2-4,sy2); dctx.lineTo(sx2+4,sy2); dctx.moveTo(sx2,sy2-4); dctx.lineTo(sx2,sy2+4); dctx.stroke();
    }
  }
};

// ══════════════════════════════════════════════════════
//  LAYER MANAGER
// ══════════════════════════════════════════════════════
const LM = {
  add(name, fill=null, type='pixel') {
    const l = new Layer(S.W, S.H, name || 'Layer '+(layers.length+1), type);
    if (fill && fill !== 'transparent') {
      l.x.fillStyle = fill; l.x.fillRect(0, 0, S.W, S.H);
    }
    layers.unshift(l); ai = 0;
    UI.lylist(); return l;
  },
  dup() {
    const src = AL();
    const l = new Layer(S.W, S.H, src.name+' copy');
    l.x.drawImage(src.el, 0, 0);
    l.vis = src.vis; l.op = src.op; l.bm = src.bm;
    layers.splice(ai, 0, l);
    Hs.save('Duplicate Layer'); UI.lylist();
  },
  del() {
    if (layers.length <= 1) { toast('Cannot delete last layer'); return; }
    layers.splice(ai, 1); ai = Math.max(0, ai-1);
    Hs.save('Delete Layer'); UI.lylist();
  },
  setAct(i) { ai = i; UI.lylist(); },
  togVis(i) { layers[i].vis = !layers[i].vis; UI.lylist(); },
  up() {
    if (ai <= 0) return;
    [layers[ai], layers[ai-1]] = [layers[ai-1], layers[ai]]; ai--;
    Hs.save('Move Layer Up'); UI.lylist();
  },
  down() {
    if (ai >= layers.length-1) return;
    [layers[ai], layers[ai+1]] = [layers[ai+1], layers[ai]]; ai++;
    Hs.save('Move Layer Down'); UI.lylist();
  },
  flatten() {
    const tmp = document.createElement('canvas'); tmp.width = S.W; tmp.height = S.H;
    const t = tmp.getContext('2d', {
      willReadFrequently: true
    });
    t.imageSmoothingEnabled = false;
    t.fillStyle = '#fff'; t.fillRect(0, 0, S.W, S.H);
    for (let i=layers.length-1; i>=0; i--) {
      if (!layers[i].vis) continue;
      t.globalAlpha = layers[i].op; t.globalCompositeOperation = layers[i].bm;
      t.drawImage(layers[i].el, 0, 0);
    }
    t.globalAlpha = 1; t.globalCompositeOperation = 'source-over';
    const l = new Layer(S.W, S.H, 'Background'); l.x.drawImage(tmp, 0, 0);
    layers = [l]; ai = 0; OB.rasterizeAll(); Hs.save('Flatten'); UI.lylist();
  },
  mergeDown() {
    if (ai >= layers.length-1) return;
    const top = layers[ai], bot = layers[ai+1];
    bot.x.save(); bot.x.globalAlpha = top.op; bot.x.globalCompositeOperation = top.bm;
    bot.x.drawImage(top.el, 0, 0); bot.x.restore();
    layers.splice(ai, 1); ai = Math.max(0, ai-1);
    Hs.save('Merge Down'); UI.lylist();
  },
  setOpacity(v) {
    const l = AL(); if (!l) return;
    l.op = v/100; UI.lylist();
  },
  setBlend(bm) {
    const l = AL(); if (!l) return;
    l.bm = bm; Hs.save('Blend Mode');
  },
  addAdjustment(type) {
    const l = this.add('Adj: '+type, null, 'adjustment');
    l.adj = { type, params: {} };
    Hs.save('Add Adjustment Layer'); UI.lylist();
  }
};
