'use strict';
// ══════════════════════════════════════════════════════
//  DRAW TOOLS
// ══════════════════════════════════════════════════════
const DT = {
  // ── BRUSH / ERASER ──────────────────────────────────
  _buf: null,
  startPaint(cx, cy) {
    const l = AL(); if (!l || l.lk) return;
    this._buf = l.gd();
    this._applyBrush(cx, cy, l);
  },
  paintLine(x0, y0, x1, y1) {
    const l = AL(); if (!l || l.lk) return;
    const dx = x1-x0, dy = y1-y0, dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist * 2));
    for (let i=0; i<=steps; i++) {
      const t = i/steps;
      this._applyBrush(x0+dx*t, y0+dy*t, l);
    }
  },
  _applyBrush(cx, cy, l) {
    const r = S.bsz/2, op = S.bop/100, hard = S.bhd/100;
    l.x.save();

    // If layer has an active mask and we're in mask-paint mode, paint to mask instead
    if (l.mask && l.maskActive && S.maskPaintMode) {
        const mc = l.mask.getContext('2d',{willReadFrequently: true});
        mc.fillStyle = S.maskPaintHide ? '#000000' : '#ffffff';
        mc.beginPath(); mc.arc(cx, cy, S.bsz/2, 0, Math.PI*2); mc.fill();
        l.x.restore(); return;
    }
    if (S.tool === 'eraser') {
        //l.x.save();

      l.x.globalCompositeOperation = 'destination-out';
      const g = l.x.createRadialGradient(cx,cy,r*hard,cx,cy,r);
      g.addColorStop(0, `rgba(0,0,0,${op})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      l.x.fillStyle = g;
      //l.x.beginPath(); l.x.arc(cx,cy,r+1,0,Math.PI*2); l.x.fill();
        //     l.x.restore();

    } else {
      const [br,bg,bb] = h2r(S.pri);
      //l.x.save();
      if (S.sel) this._clipSel(l.x);
      const g = l.x.createRadialGradient(cx,cy,r*hard,cx,cy,r);
      g.addColorStop(0, `rgba(${br},${bg},${bb},${op})`);
      g.addColorStop(1, `rgba(${br},${bg},${bb},0)`);
      l.x.fillStyle = g;
      //l.x.beginPath(); l.x.arc(cx,cy,r+1,0,Math.PI*2); l.x.fill();
        //     l.x.restore();

    }
    l.x.beginPath(); l.x.arc(cx,cy,r+1,0,Math.PI*2); l.x.fill();
    l.x.restore();
  },
  endPaint() { if (this._buf) { Hs.save(S.tool); this._buf = null; } },

  // ── SPRAY / AIRBRUSH ────────────────────────────────
  spray(cx, cy) {
    const l = AL(); if (!l || l.lk) return;
    const r = S.bsz/2, density = Math.round(r * r * 0.3);
    const [br,bg,bb] = h2r(S.pri);
    l.x.save();
    if (S.sel) this._clipSel(l.x);
    l.x.fillStyle = `rgba(${br},${bg},${bb},${(S.bop/100)*0.15})`;
    for (let i=0; i<density; i++) {
      const a = Math.random()*Math.PI*2, d = Math.random()*r;
      const x = cx + Math.cos(a)*d, y = cy + Math.sin(a)*d;
      l.x.beginPath(); l.x.arc(x,y,0.8,0,Math.PI*2); l.x.fill();
    }
    l.x.restore();
  },

  // ── SMUDGE ──────────────────────────────────────────
  smudge(cx, cy, px, py) {
    const l = AL(); if (!l || l.lk) return;
    const r = S.bsz/2;
    const tmp = document.createElement('canvas'); tmp.width = r*2+2; tmp.height = r*2+2;
    const tc = tmp.getContext('2d', {
      willReadFrequently: true
    });
    tc.drawImage(l.el, px-r-1, py-r-1, r*2+2, r*2+2, 0, 0, r*2+2, r*2+2);
    l.x.save();
    if (S.sel) this._clipSel(l.x);
    const str = S.bop/100 * 0.5;
    l.x.globalAlpha = str;
    l.x.drawImage(tmp, cx-r-1, cy-r-1, r*2+2, r*2+2);
    l.x.restore();
  },

  // ── CLONE STAMP ─────────────────────────────────────
  clone(cx, cy) {
    const l = AL(); if (!l || l.lk) return;
    if (!S.cloneSrc) return;
    const r = S.bsz/2, op = S.bop/100;
    const offX = cx - S.cloneSrc.x, offY = cy - S.cloneSrc.y;
    const src = l.x.getImageData(S.cloneSrc.x - r, S.cloneSrc.y - r, r*2, r*2);
    const tmp = document.createElement('canvas'); tmp.width = r*2; tmp.height = r*2;
    const tc = tmp.getContext('2d', {
      willReadFrequently: true
    });
    tc.putImageData(src, 0, 0);
    l.x.save();
    if (S.sel) this._clipSel(l.x);
    // Feathered circle mask
    const g = l.x.createRadialGradient(cx,cy,r*(S.bhd/100),cx,cy,r);
    g.addColorStop(0, `rgba(0,0,0,${op})`); g.addColorStop(1,'rgba(0,0,0,0)');
    l.x.globalCompositeOperation = 'destination-out';
    l.x.fillStyle = g; l.x.beginPath(); l.x.arc(cx,cy,r,0,Math.PI*2); l.x.fill();
    l.x.globalCompositeOperation = 'destination-over';
    l.x.globalAlpha = op;
    l.x.drawImage(tmp, cx-r, cy-r);
    l.x.restore();
    // Simpler version
    const d = l.x.getImageData(S.cloneSrc.x-r, S.cloneSrc.y-r, r*2, r*2);
    l.x.save();
    l.x.globalAlpha = op * 0.5;
    if (S.sel) this._clipSel(l.x);
    const g2 = l.x.createRadialGradient(cx,cy,0,cx,cy,r);
    g2.addColorStop(0,`rgba(0,0,0,1)`); g2.addColorStop(1,'rgba(0,0,0,0)');
    l.x.filter = 'none';
    l.x.restore();
    // Clean implementation
    const srcD = AL().x.getImageData(S.cloneSrc.x - Math.floor(r), S.cloneSrc.y - Math.floor(r), Math.ceil(r*2), Math.ceil(r*2));
    const dstD = AL().x.getImageData(cx - Math.floor(r), cy - Math.floor(r), Math.ceil(r*2), Math.ceil(r*2));
    const sz = Math.ceil(r*2);
    for (let dy=-sz/2; dy<sz/2; dy++) {
      for (let dx=-sz/2; dx<sz/2; dx++) {
        const dist = Math.hypot(dx, dy);
        if (dist > r) continue;
        const fade = Math.max(0, 1 - dist/r);
        const si = ((dy+Math.floor(r))*sz + (dx+Math.floor(r))) * 4;
        const di = ((dy+Math.floor(r))*sz + (dx+Math.floor(r))) * 4;
        if (si < 0 || si+3 >= srcD.data.length) continue;
        if (di < 0 || di+3 >= dstD.data.length) continue;
        for (let c=0; c<4; c++) {
          dstD.data[di+c] = Math.round(dstD.data[di+c]*(1-fade*op) + srcD.data[si+c]*fade*op);
        }
      }
    }
    AL().x.putImageData(dstD, cx - Math.floor(r), cy - Math.floor(r));
  },

  // ── HEALING BRUSH ───────────────────────────────────
  heal(cx, cy) {
    const l = AL(); if (!l || l.lk || !S.cloneSrc) return;
    const r = S.bsz/2;
    const srcD = l.x.getImageData(S.cloneSrc.x-r, S.cloneSrc.y-r, r*2, r*2);
    const dstD = l.x.getImageData(cx-r, cy-r, r*2, r*2);
    // Compute color diff for blending
    let srcAvg = [0,0,0], dstAvg = [0,0,0], cnt = 0;
    for (let i=0; i<srcD.data.length; i+=4) {
      srcAvg[0]+=srcD.data[i]; srcAvg[1]+=srcD.data[i+1]; srcAvg[2]+=srcD.data[i+2]; cnt++;
    }
    srcAvg = srcAvg.map(v=>v/cnt);
    cnt = 0;
    for (let i=0; i<dstD.data.length; i+=4) {
      dstAvg[0]+=dstD.data[i]; dstAvg[1]+=dstD.data[i+1]; dstAvg[2]+=dstD.data[i+2]; cnt++;
    }
    dstAvg = dstAvg.map(v=>v/cnt);
    const diff = dstAvg.map((v,i) => v - srcAvg[i]);
    const sz = r*2;
    for (let y2=0; y2<sz; y2++) for (let x2=0; x2<sz; x2++) {
      const dist = Math.hypot(x2-r, y2-r);
      if (dist > r) continue;
      const fade = Math.max(0, 1 - dist/r) * S.bop/100;
      const i = (y2*sz + x2) * 4;
      dstD.data[i]   = cl(srcD.data[i]   + diff[0], 0, 255) * fade + dstD.data[i]   * (1-fade);
      dstD.data[i+1] = cl(srcD.data[i+1] + diff[1], 0, 255) * fade + dstD.data[i+1] * (1-fade);
      dstD.data[i+2] = cl(srcD.data[i+2] + diff[2], 0, 255) * fade + dstD.data[i+2] * (1-fade);
    }
    l.x.putImageData(dstD, cx-r, cy-r);
  },

  // ── DODGE / BURN ────────────────────────────────────
  dodgeBurn(cx, cy, mode) {
    const l = AL(); if (!l || l.lk) return;
    const r = S.bsz/2, strength = S.bop/100 * 0.25;
    const d = l.x.getImageData(cx-r, cy-r, r*2, r*2);
    for (let y2=0; y2<r*2; y2++) for (let x2=0; x2<r*2; x2++) {
      const dist = Math.hypot(x2-r, y2-r);
      if (dist > r) continue;
      const f = (1-dist/r) * strength;
      const i = (y2*r*2*4 + x2*4);
      if (i < 0 || i+2 >= d.data.length) continue;
      for (let c=0; c<3; c++) {
        if (mode === 'dodge') d.data[i+c] = Math.min(255, d.data[i+c] + 255*f);
        else d.data[i+c] = Math.max(0, d.data[i+c] - 255*f);
      }
    }
    l.x.putImageData(d, cx-r, cy-r);
  },

  // ── SPONGE (saturate/desaturate) ────────────────────
  sponge(cx, cy, saturate=false) {
    const l = AL(); if (!l || l.lk) return;
    const r = S.bsz/2, strength = S.bop/100 * 0.3;
    const d = l.x.getImageData(cx-r, cy-r, r*2, r*2);
    for (let y2=0; y2<r*2; y2++) for (let x2=0; x2<r*2; x2++) {
      const dist = Math.hypot(x2-r, y2-r);
      if (dist > r) continue;
      const f = (1-dist/r) * strength;
      const i = (y2*r*2*4 + x2*4);
      if (i < 0 || i+2 >= d.data.length) continue;
      const gray = d.data[i]*0.299 + d.data[i+1]*0.587 + d.data[i+2]*0.114;
      for (let c=0; c<3; c++) {
        if (saturate) d.data[i+c] = Math.round(d.data[i+c]*(1+f));
        else d.data[i+c] = Math.round(d.data[i+c]*(1-f) + gray*f);
        d.data[i+c] = cl(d.data[i+c], 0, 255);
      }
    }
    l.x.putImageData(d, cx-r, cy-r);
  },

  // ── BLUR BRUSH ──────────────────────────────────────
  blurBrush(cx, cy) {
    const l = AL(); if (!l || l.lk) return;
    const r = S.bsz/2;
    const d = l.x.getImageData(cx-r, cy-r, r*2, r*2);
    // simple box blur pass
    const src = new Uint8ClampedArray(d.data);
    const w2 = r*2;
    for (let y2=1; y2<w2-1; y2++) for (let x2=1; x2<w2-1; x2++) {
      const dist = Math.hypot(x2-r, y2-r);
      if (dist > r) continue;
      const f = Math.min(1, (1-dist/r) * S.bop/100);
      const i = (y2*w2 + x2)*4;
      for (let c=0; c<3; c++) {
        let sum=0;
        for (let dy2=-1; dy2<=1; dy2++) for (let dx2=-1; dx2<=1; dx2++) {
          sum += src[((y2+dy2)*w2 + (x2+dx2))*4+c];
        }
        d.data[i+c] = Math.round(d.data[i+c]*(1-f) + (sum/9)*f);
      }
    }
    l.x.putImageData(d, cx-r, cy-r);
  },

  // ── FILL (BUCKET) ───────────────────────────────────
  fill(cx, cy) {
    const l = AL(); if (!l || l.lk) return;
    const x0=Math.floor(cx), y0=Math.floor(cy);
    const id = l.gd();
    const d = id.data, W=id.width, H=id.height;
    const target = l.gpx(x0, y0);
    const [fr,fg,fb] = h2r(S.pri);
    const tolerance = 30;
    const match = (i) => {
      return Math.abs(d[i]-target.r) + Math.abs(d[i+1]-target.g) +
             Math.abs(d[i+2]-target.b) + Math.abs(d[i+3]-target.a) < tolerance*4;
    };
    if (d[(y0*W+x0)*4] === fr && d[(y0*W+x0)*4+1] === fg && d[(y0*W+x0)*4+2] === fb) return;
    const stack = [[x0,y0]], visited = new Uint8Array(W*H);
    while (stack.length) {
      const [x,y] = stack.pop();
      if (x<0||x>=W||y<0||y>=H||visited[y*W+x]) continue;
      const i = (y*W+x)*4;
      if (!match(i)) continue;
      visited[y*W+x] = 1;
      d[i]=fr; d[i+1]=fg; d[i+2]=fb; d[i+3]=255;
      stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
    }
    l.pd(id); Hs.save('Fill');
  },

  // ── EYEDROPPER ──────────────────────────────────────
  eyedrop(cx, cy) {
    // Sample composite of all visible layers
    const tmp = document.createElement('canvas'); tmp.width=1; tmp.height=1;
    const tc = tmp.getContext('2d', {
      willReadFrequently: true
    });
    for (let i=layers.length-1; i>=0; i--) {
      if (!layers[i].vis) continue;
      tc.globalAlpha = layers[i].op; tc.globalCompositeOperation = layers[i].bm;
      tc.drawImage(layers[i].el, -Math.floor(cx), -Math.floor(cy));
    }
    const p = tc.getImageData(0,0,1,1).data;
    const hex = r2h(p[0],p[1],p[2]);
    if (S.cpick === 'pri') A.setPri(hex); else A.setSec(hex);
    toast('Sampled: '+hex);
  },

  // ── TEXT ────────────────────────────────────────────
  placeText(cx, cy) {
    // Create a text object (instead of rasterizing immediately)
    const font = document.getElementById('txt-font')?.value || 'Arial';
    const size = parseInt(document.getElementById('txt-size')?.value) || 24;
    const bold   = document.getElementById('txt-bold')?.classList.contains('on');
    const italic = document.getElementById('txt-italic')?.classList.contains('on');
    const align  = document.getElementById('txt-align')?.value || 'left';
    const tmp = document.createElement('canvas').getContext('2d', {
      willReadFrequently: true
    });
    tmp.font = `${italic?'italic ':''}${bold?'bold ':''}${size}px "${font}"`;
    const w2 = Math.max(80, tmp.measureText('Text').width + 20);
    const h2 = size * 1.4 + 10;
    const obj = OB.add('text', cx, cy, w2, h2, {
      text:'', font, size, bold, italic, color:S.pri, opacity:100,
      align, letterSpacing:0, lineHeight:1.3,
      shadow:false, shadowColor:'rgba(0,0,0,0.6)', shadowBlur:4, shadowOffsetX:2, shadowOffsetY:2,
      stroke:false, strokeColor:'#000000', strokeWidth:2
    });
    OB.editText(obj.id);
    UI.showObjProps(obj);
    return obj;
  },

  // ── SHAPES ──────────────────────────────────────────
  commitShape(x1, y1, x2, y2) {
    const x=Math.min(x1,x2), y=Math.min(y1,y2), w=Math.abs(x2-x1), h=Math.abs(y2-y1);
    if (w < 3 && h < 3) return;
    const type = S.tool;
    const data = {
      fillColor: S.shapeFill ? S.pri : 'none',
      strokeColor: S.pri, strokeWidth: S.sw
    };
    if (type === 'line' || type === 'arrow') {
      OB.add(type, x1, y1, x2-x1, y2-y1, data);
    } else {
      OB.add(type, x, y, w, h, data);
    }
    Hs.save('Draw '+type);
    OB.renderOverlay();
    UI.showObjProps(OB.sel);
  },

  // ── GRADIENT ────────────────────────────────────────
  gradient(x1, y1, x2, y2) {
    const l = AL(); if (!l || l.lk) return;
    l.x.save();
    if (S.sel) this._clipSel(l.x);
    const gradType = document.getElementById('grad-type')?.value || 'linear';
    let g;
    if (gradType === 'radial') {
      const dist = Math.hypot(x2-x1, y2-y1);
      g = l.x.createRadialGradient(x1,y1,0,x1,y1,dist);
    } else {
      g = l.x.createLinearGradient(x1,y1,x2,y2);
    }
    // Multi-stop gradient from GE.stops if available, else simple two-color
    if (typeof GE !== 'undefined' && GE.stops.length >= 2) {
      GE.stops.forEach(s => g.addColorStop(s.pos, s.color));
    } else {
      g.addColorStop(0, S.pri); g.addColorStop(1, S.sec);
    }
    l.x.globalAlpha = S.bop/100;
    l.x.fillStyle = g;
    if (S.sel) {
      l.x.fillRect(S.sel.x, S.sel.y, S.sel.w, S.sel.h);
    } else {
      l.x.fillRect(0,0,S.W,S.H);
    }
    l.x.restore(); Hs.save('Gradient');
  },

  // ── POLYGON ─────────────────────────────────────────
  commitPolygon() {
    const l = AL(); if (!l || l.lk || S.polyPts.length < 2) return;
    l.x.save();
    l.x.beginPath(); l.x.moveTo(S.polyPts[0][0], S.polyPts[0][1]);
    S.polyPts.slice(1).forEach(p => l.x.lineTo(p[0], p[1]));
    l.x.closePath();
    l.x.strokeStyle = S.pri; l.x.lineWidth = S.sw;
    if (S.shapeFill) { l.x.fillStyle = S.pri; l.x.fill(); }
    l.x.stroke(); l.x.restore();
    S.polyPts = []; Hs.save('Polygon');
  },

  // ── WAND SELECTION ──────────────────────────────────
  wand(cx, cy) {
    const x0=Math.floor(cx), y0=Math.floor(cy);
    const l = AL(); if (!l) return;
    const id = l.gd(), d = id.data, W=id.width, H=id.height;
    const tolerance = 30;
    const ti = (y0*W+x0)*4;
    const tr = d[ti], tg = d[ti+1], tb = d[ti+2];
    const visited = new Uint8Array(W*H);
    const stack = [[x0,y0]];
    let minX=W,minY=H,maxX=0,maxY=0;
    while (stack.length) {
      const [x,y] = stack.pop();
      if (x<0||x>=W||y<0||y>=H||visited[y*W+x]) continue;
      const i = (y*W+x)*4;
      if (Math.abs(d[i]-tr)+Math.abs(d[i+1]-tg)+Math.abs(d[i+2]-tb) > tolerance*3) continue;
      visited[y*W+x] = 1;
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
      stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
    }
    if (maxX > minX && maxY > minY) {
      if (S.tool === 'wand') {
        S.sel = {x:minX, y:minY, w:maxX-minX, h:maxY-minY};
        S.selMask = visited;
        UI.updateSelInfo(); toast(`Wand: ${maxX-minX}×${maxY-minY}`);
      }
    }
  },

  // ── PIXEL EDITOR ────────────────────────────────────
  ppx(cx, cy) {
    const l = AL(); if (!l || l.lk) return;
    const x=Math.floor(cx), y=Math.floor(cy);
    const [r,g,b] = h2r(S.pri);
    l.spx(x,y,r,g,b,255);
  },

  // ── CROP HELPERS ────────────────────────────────────
  _clipSel(ctx) {
    if (!S.sel) return;
    ctx.beginPath(); ctx.rect(S.sel.x, S.sel.y, S.sel.w, S.sel.h); ctx.clip();
  }
};

// ══════════════════════════════════════════════════════
//  SELECTION TOOLS
// ══════════════════════════════════════════════════════
const SEL = {
  // Feather selection
  feather(px) {
    if (!S.sel) return;
    S.feather = px;
    if(typeof FEATHER !== 'undefined') FEATHER.apply(px);
    else toast(`Selection feathered: ${px}px`);
    //toast(`Selection feathered: ${px}px`);
  },

  // Expand / contract selection rect
  expand(px) {
    if (!S.sel) return;
    S.sel = {
      x: Math.max(0, S.sel.x - px),
      y: Math.max(0, S.sel.y - px),
      w: Math.min(S.W - S.sel.x + px, S.sel.w + px*2),
      h: Math.min(S.H - S.sel.y + px, S.sel.h + px*2)
    };
    UI.updateSelInfo(); toast('Selection expanded by '+px+'px');
  },
  contract(px) {
    if (!S.sel) return;
    S.sel = {
      x: S.sel.x + px, y: S.sel.y + px,
      w: Math.max(4, S.sel.w - px*2), h: Math.max(4, S.sel.h - px*2)
    };
    UI.updateSelInfo(); toast('Selection contracted by '+px+'px');
  },

  // Invert selection
  invert() {
    if (!S.sel) { S.sel = {x:0,y:0,w:S.W,h:S.H}; UI.updateSelInfo(); return; }
    // For rect selection, invert creates an L-shaped selection (simplified: full canvas - current)
    // Simple approach: just set to full canvas
    const old = {...S.sel};
    S.sel = {x:0, y:0, w:S.W, h:S.H};
    UI.updateSelInfo(); toast('Selection inverted');
  },

  // Select all
  all() { S.sel = {x:0,y:0,w:S.W,h:S.H}; UI.updateSelInfo(); toast('Selected all'); },

  // Deselect
  none() { S.sel = null; S.selPoly = []; S.lassoPts = []; S.lassoActive = false; UI.updateSelInfo(); toast('Deselected'); },

  // Commit lasso to selection
  commitLasso() {
    const pts = S.lassoPts;
    if (pts.length < 3) { S.lassoActive = false; S.lassoPts = []; return; }
    let minX=Infinity,minY=Infinity,maxX=0,maxY=0;
    pts.forEach(p => {
      minX=Math.min(minX,p.x); minY=Math.min(minY,p.y);
      maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y);
    });
    S.sel = {x:Math.floor(minX), y:Math.floor(minY), w:Math.ceil(maxX-minX), h:Math.ceil(maxY-minY)};
    S.selPoly = [...pts];
    S.lassoPts = []; S.lassoActive = false;
    UI.updateSelInfo(); toast(`Lasso: ${Math.round(S.sel.w)}×${Math.round(S.sel.h)}`);
  },

  // Commit polygon lasso
  commitPolyLasso() {
    const pts = S.polyPts;
    if (pts.length < 3) return;
    let minX=Infinity,minY=Infinity,maxX=0,maxY=0;
    pts.forEach(([px,py]) => {
      minX=Math.min(minX,px); minY=Math.min(minY,py);
      maxX=Math.max(maxX,px); maxY=Math.max(maxY,py);
    });
    S.sel = {x:Math.floor(minX), y:Math.floor(minY), w:Math.ceil(maxX-minX), h:Math.ceil(maxY-minY)};
    S.selPoly = pts.map(([px,py])=>({x:px,y:py}));
    S.polyPts = [];
    UI.updateSelInfo(); toast('Polygon selection created');
  },

  // Color range selection
  colorRange(hex, tolerance=40) {
    const l = AL(); if (!l) return;
    const id = l.gd(), d = id.data, W=id.width, H=id.height;
    const [tr,tg,tb] = h2r(hex);
    let minX=W,minY=H,maxX=0,maxY=0, cnt=0;
    for (let y=0; y<H; y++) for (let x=0; x<W; x++) {
      const i = (y*W+x)*4;
      if (Math.abs(d[i]-tr)+Math.abs(d[i+1]-tg)+Math.abs(d[i+2]-tb) < tolerance*3) {
        minX=Math.min(minX,x); minY=Math.min(minY,y);
        maxX=Math.max(maxX,x); maxY=Math.max(maxY,y); cnt++;
      }
    }
    if (cnt > 0) {
      S.sel = {x:minX, y:minY, w:maxX-minX, h:maxY-minY};
      UI.updateSelInfo(); toast(`Color range: ${cnt} pixels`);
    } else toast('No matching pixels found');
  }
};

// ══════════════════════════════════════════════════════
//  TRANSFORM SYSTEM
// ══════════════════════════════════════════════════════
const TF = {
  // Free transform on active layer content
  _tfState: null,

  startFreeTransform() {
    const l = AL(); if (!l) return;
    const rect = S.sel || {x:0,y:0,w:S.W,h:S.H};
    // Extract region to temp canvas
    const tmp = document.createElement('canvas');
    tmp.width = rect.w; tmp.height = rect.h;
    const tc = tmp.getContext('2d', {
      willReadFrequently: true
    });
    tc.drawImage(l.el, -rect.x, -rect.y);
    // Create an image object for transformation
    const obj = OB.add('image', rect.x, rect.y, rect.w, rect.h, {src:tmp.toDataURL()});
    obj.data._img = new Image(); obj.data._img.src = obj.data.src;
    // Clear the region from layer
    if (S.sel) { l.x.clearRect(rect.x,rect.y,rect.w,rect.h); }
    OB.selId = obj.id; OB.renderOverlay();
    toast('Free Transform — drag handles. Press Enter to commit.');
    this._tfState = {objId: obj.id};
  },

  commitTransform() {
    if (!this._tfState) return;
    OB.rasterize(this._tfState.objId);
    this._tfState = null;
    toast('Transform committed');
  },

  cancelTransform() {
    if (!this._tfState) return;
    OB.del(this._tfState.objId);
    this._tfState = null;
    Hs.undo();
    toast('Transform cancelled');
  },

  // Scale active layer
  scaleLayer(scaleX, scaleY) {
    const l = AL(); if (!l) return;
    const tmp = document.createElement('canvas');
    tmp.width = Math.round(S.W * scaleX); tmp.height = Math.round(S.H * scaleY);
    const tc = tmp.getContext('2d', {
      willReadFrequently: true
    });
    tc.imageSmoothingEnabled = true;
    tc.drawImage(l.el, 0, 0, tmp.width, tmp.height);
    l.el.width = tmp.width; l.el.height = tmp.height;
    l.w = tmp.width; l.h = tmp.height;
    l.x.drawImage(tmp, 0, 0);
    Hs.save('Scale Layer');
  },

  // Flip layer
  flipH() {
    const l = AL(); if (!l) return;
    const tmp = document.createElement('canvas'); tmp.width=l.w; tmp.height=l.h;
    const tc = tmp.getContext('2d', {
      willReadFrequently: true
    });
    tc.save(); tc.translate(l.w,0); tc.scale(-1,1); tc.drawImage(l.el,0,0); tc.restore();
    l.x.clearRect(0,0,l.w,l.h); l.x.drawImage(tmp,0,0); Hs.save('Flip H');
  },
  flipV() {
    const l = AL(); if (!l) return;
    const tmp = document.createElement('canvas'); tmp.width=l.w; tmp.height=l.h;
    const tc = tmp.getContext('2d', {
      willReadFrequently: true
    });
    tc.save(); tc.translate(0,l.h); tc.scale(1,-1); tc.drawImage(l.el,0,0); tc.restore();
    l.x.clearRect(0,0,l.w,l.h); l.x.drawImage(tmp,0,0); Hs.save('Flip V');
  },
  rotate90(dir=1) {
    const l = AL(); if (!l) return;
    const tmp = document.createElement('canvas');
    tmp.width = l.h; tmp.height = l.w;
    const tc = tmp.getContext('2d', {
      willReadFrequently: true
    });
    tc.save();
    if (dir > 0) { tc.translate(l.h,0); tc.rotate(Math.PI/2); }
    else { tc.translate(0,l.w); tc.rotate(-Math.PI/2); }
    tc.drawImage(l.el, 0, 0); tc.restore();
    l.el.width = tmp.width; l.el.height = tmp.height;
    l.w = tmp.width; l.h = tmp.height;
    l.x.drawImage(tmp, 0, 0); Hs.save('Rotate 90°');
  }
};

// ══════════════════════════════════════════════════════
//  PIXEL INSPECTOR
// ══════════════════════════════════════════════════════
const PI = {
  inspect(x, y) {
    const p = AL() ? AL().gpx(x,y) : {r:0,g:0,b:0,a:0};
    S.hovPx = {x:Math.floor(x), y:Math.floor(y)};
    document.getElementById('sbpxw').style.display='';
     document.getElementById('sbpv').textContent=`(${S.hovPx.x},${S.hovPx.y}) R:${p.r} G:${p.g} B:${p.b} A:${p.a}`;

    document.getElementById('pxR').textContent = p.r;
    document.getElementById('pxG').textContent = p.g;
    document.getElementById('pxB').textContent = p.b;
    document.getElementById('pxA').textContent = p.a;

    document.getElementById('pxHex').value = r2h(p.r,p.g,p.b);
    document.getElementById('pxPrev').style.background = `rgba(${p.r},${p.g},${p.b},${p.a/255})`;
    ['R','G','B','A'].forEach(c => {
      const v = p[c.toLowerCase()];
      const bar = document.getElementById('pxBar'+c);
      if (bar) bar.style.width = (v/255*100)+'%';
    });
  },
  addSel(x, y) {
    const px = {x:Math.floor(x), y:Math.floor(y)};
    if (!S.selPx.find(p => p.x===px.x && p.y===px.y)) S.selPx.push(px);
  },
  setPx(hex) {
    if (!S.hovPx || !AL()) return;
    const [r,g,b] = h2r(hex);
    AL().spx(S.hovPx.x, S.hovPx.y, r,g,b,255);
    Hs.save('Set Pixel');
  }
};

// ══════════════════════════════════════════════════════
//  GRADIENT EDITOR
// ══════════════════════════════════════════════════════
const GE = {
  stops: [
    {pos:0, color:'#000000'},
    {pos:1, color:'#ffffff'}
  ],
  selIdx: 0,
  canvas: null, ctx: null,

  init() {
    const cv = document.getElementById('gradBar');
    if (!cv) return;
    this.canvas = cv; this.ctx = cv.getContext('2d', {
      willReadFrequently: true
    });
    this.render();
  },

  render() {
    if (!this.ctx) return;
    const w = this.canvas.width, h = this.canvas.height;
    this.ctx.clearRect(0,0,w,h);
    const g = this.ctx.createLinearGradient(0,0,w,0);
    this.stops.forEach(s => { try { g.addColorStop(s.pos, s.color); } catch(e){} });
    this.ctx.fillStyle = g; this.ctx.fillRect(0,0,w,h);
    // Draw stops
    this.stops.forEach((s,i) => {
      const x = s.pos * w;
      this.ctx.beginPath(); this.ctx.arc(x, h/2, 5, 0, Math.PI*2);
      this.ctx.fillStyle = i === this.selIdx ? '#4A7CF7' : '#fff';
      this.ctx.fill(); this.ctx.strokeStyle = '#333'; this.ctx.lineWidth = 1; this.ctx.stroke();
    });
  },

  addStop(pos, color) {
    this.stops.push({pos, color});
    this.stops.sort((a,b) => a.pos - b.pos);
    this.selIdx = this.stops.findIndex(s => s.pos === pos);
    this.render();
  },

  removeStop(idx) {
    if (this.stops.length <= 2) return;
    this.stops.splice(idx, 1);
    this.selIdx = Math.max(0, this.selIdx-1);
    this.render();
  }
};
