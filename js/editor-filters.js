'use strict';
// ══════════════════════════════════════════════════════
//  FILTER SYSTEM
// ══════════════════════════════════════════════════════
const FT = {
  _busy: false,

  async _run(endpoint, payload) {
    if (this._busy) { toast('Filter running, please wait…'); return; }
    this._busy = true;
    this._setLoading(true);
    const l = AL();
    try {
      const tmp = document.createElement('canvas');
      tmp.width = S.W; tmp.height = S.H;
      const tc = tmp.getContext('2d', {
      willReadFrequently: true
    });
      tc.imageSmoothingEnabled = false;
      // Composite visible layers
      for (let i=layers.length-1; i>=0; i--) {
        if (!layers[i].vis) continue;
        tc.globalAlpha = layers[i].op; tc.globalCompositeOperation = layers[i].bm;
        tc.drawImage(layers[i].el, 0, 0);
      }
      tc.globalAlpha=1; tc.globalCompositeOperation='source-over';
      const src = tmp.toDataURL('image/png');
      const res = await fetch(endpoint, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({image: src, ...payload})
      });
      const data = await res.json();
      if (data.error) { toast('Error: '+data.error); return; }
      const img = new Image();
      img.onload = () => {
        l.x.clearRect(0,0,S.W,S.H);
        l.x.imageSmoothingEnabled = false;
        l.x.drawImage(img, 0, 0);
        Hs.save(payload._name || 'Filter');
        toast((payload._name||'Filter')+' applied');
      };
      img.src = data.image;
    } catch(e) { toast('Server error: '+e.message); console.error(e); }
    finally { this._busy = false; this._setLoading(false); }
  },

  _setLoading(on) {
    const btn = document.getElementById('filterApplyBtn');
    if (btn) btn.textContent = on ? '⏳ Applying…' : 'Apply';
  },

  // Get active layer as base64
  _activeB64() {
    const l = AL(); if (!l) return null;
    const tmp = document.createElement('canvas');
    tmp.width = S.W; tmp.height = S.H;
    const tc = tmp.getContext('2d', {
      willReadFrequently: true
    });
    tc.imageSmoothingEnabled = false;
    tc.drawImage(l.el, 0, 0);
    return tmp.toDataURL('image/png');
  },

  // ── JS-side quick filters (no server needed) ──────
  q: {
    grayscale() {
      const l = AL(); if (!l||l.lk) return;
      const d = l.gd();
      for (let i=0; i<d.data.length; i+=4) {
        const g = d.data[i]*0.299 + d.data[i+1]*0.587 + d.data[i+2]*0.114;
        d.data[i]=d.data[i+1]=d.data[i+2]=g;
      }
      l.pd(d); Hs.save('Grayscale'); toast('Grayscale');
    },
    invert() {
      const l = AL(); if (!l||l.lk) return;
      const d = l.gd();
      for (let i=0; i<d.data.length; i+=4) {
        d.data[i]=255-d.data[i]; d.data[i+1]=255-d.data[i+1]; d.data[i+2]=255-d.data[i+2];
      }
      l.pd(d); Hs.save('Invert'); toast('Inverted');
    },
    sepia() {
      const l = AL(); if (!l||l.lk) return;
      const d = l.gd();
      for (let i=0; i<d.data.length; i+=4) {
        const r=d.data[i],g=d.data[i+1],b=d.data[i+2];
        d.data[i]  =cl(r*0.393+g*0.769+b*0.189,0,255);
        d.data[i+1]=cl(r*0.349+g*0.686+b*0.168,0,255);
        d.data[i+2]=cl(r*0.272+g*0.534+b*0.131,0,255);
      }
      l.pd(d); Hs.save('Sepia'); toast('Sepia');
    },
    posterize(levels=4) {
      const l = AL(); if (!l||l.lk) return;
      const d = l.gd();
      const step = 255/Math.max(2,levels-1);
      for (let i=0; i<d.data.length; i+=4) {
        for (let c=0; c<3; c++) d.data[i+c] = Math.round(Math.round(d.data[i+c]/step)*step);
      }
      l.pd(d); Hs.save('Posterize'); toast('Posterized');
    },
    threshold(t=128) {
      const l = AL(); if (!l||l.lk) return;
      const d = l.gd();
      for (let i=0; i<d.data.length; i+=4) {
        const g = (d.data[i]+d.data[i+1]+d.data[i+2])/3;
        const v = g >= t ? 255 : 0;
        d.data[i]=d.data[i+1]=d.data[i+2]=v;
      }
      l.pd(d); Hs.save('Threshold'); toast('Threshold');
    },
    emboss() {
      const l = AL(); if (!l||l.lk) return;
      const d = l.gd(), out = new Uint8ClampedArray(d.data);
      const W=d.width, H=d.height;
      for (let y=1; y<H-1; y++) for (let x=1; x<W-1; x++) {
        const i=(y*W+x)*4;
        for (let c=0; c<3; c++) {
          out[i+c] = cl(128 + d.data[i+c]*2 - d.data[i-W*4-4+c] - d.data[i-W*4+4+c], 0, 255);
        }
      }
      l.pd(new ImageData(out, W, H)); Hs.save('Emboss'); toast('Emboss');
    },
    edge() {
      const l = AL(); if (!l||l.lk) return;
      const d = l.gd(), out = new Uint8ClampedArray(d.data.length);
      const W=d.width, H=d.height;
      for (let y=1; y<H-1; y++) for (let x=1; x<W-1; x++) {
        const i=(y*W+x)*4;
        for (let c=0; c<3; c++) {
          const gx = d.data[i+4+c] - d.data[i-4+c];
          const gy = d.data[i+W*4+c] - d.data[i-W*4+c];
          out[i+c] = cl(Math.hypot(gx,gy)*0.5,0,255);
        }
        out[i+3]=255;
      }
      l.pd(new ImageData(out, W, H)); Hs.save('Edge Detect'); toast('Edge detection');
    },
    sharpenJS() {
      const l = AL(); if (!l||l.lk) return;
      const d = l.gd(), out = new Uint8ClampedArray(d.data);
      const W=d.width, H=d.height;
      const k = [0,-1,0,-1,5,-1,0,-1,0];
      for (let y=1; y<H-1; y++) for (let x=1; x<W-1; x++) {
        const i=(y*W+x)*4;
        for (let c=0; c<3; c++) {
          let v=0;
          for(let ky=0;ky<3;ky++) for(let kx=0;kx<3;kx++) {
            v += d.data[((y+ky-1)*W+(x+kx-1))*4+c] * k[ky*3+kx];
          }
          out[i+c]=cl(v,0,255);
        }
      }
      l.pd(new ImageData(out,W,H)); Hs.save('Sharpen'); toast('Sharpened');
    },
    blurJS(radius=2) {
      const l = AL(); if (!l||l.lk) return;
      const d = l.gd(), W=d.width, H=d.height;
      const out = new Uint8ClampedArray(d.data.length);
      const r2 = Math.max(1, Math.floor(radius));
      for (let y=0; y<H; y++) for (let x=0; x<W; x++) {
        let sr=0,sg=0,sb=0,sa=0,cnt=0;
        for (let dy=-r2; dy<=r2; dy++) for (let dx=-r2; dx<=r2; dx++) {
          const ny=Math.max(0,Math.min(H-1,y+dy)), nx=Math.max(0,Math.min(W-1,x+dx));
          const i=(ny*W+nx)*4; sr+=d.data[i]; sg+=d.data[i+1]; sb+=d.data[i+2]; sa+=d.data[i+3]; cnt++;
        }
        const i=(y*W+x)*4; out[i]=sr/cnt; out[i+1]=sg/cnt; out[i+2]=sb/cnt; out[i+3]=sa/cnt;
      }
      l.pd(new ImageData(out,W,H)); Hs.save('Blur'); toast('Blurred');
    },
    noise(amt=25) {
      const l = AL(); if (!l||l.lk) return;
      const d = l.gd();
      for (let i=0; i<d.data.length; i+=4) {
        const n = (Math.random()-0.5)*amt*2;
        d.data[i]=cl(d.data[i]+n,0,255); d.data[i+1]=cl(d.data[i+1]+n,0,255); d.data[i+2]=cl(d.data[i+2]+n,0,255);
      }
      l.pd(d); Hs.save('Noise'); toast('Noise added');
    },
    pixelate(sz=8) {
      const l = AL(); if (!l||l.lk) return;
      const d = l.gd(), W=d.width, H=d.height;
      for (let y=0; y<H; y+=sz) for (let x=0; x<W; x+=sz) {
        let r2=0,g2=0,b2=0,cnt=0;
        for (let dy=0; dy<sz&&y+dy<H; dy++) for (let dx=0; dx<sz&&x+dx<W; dx++) {
          const i=((y+dy)*W+(x+dx))*4; r2+=d.data[i]; g2+=d.data[i+1]; b2+=d.data[i+2]; cnt++;
        }
        r2=r2/cnt; g2=g2/cnt; b2=b2/cnt;
        for (let dy=0; dy<sz&&y+dy<H; dy++) for (let dx=0; dx<sz&&x+dx<W; dx++) {
          const i=((y+dy)*W+(x+dx))*4; d.data[i]=r2; d.data[i+1]=g2; d.data[i+2]=b2;
        }
      }
      l.pd(d); Hs.save('Pixelate'); toast('Pixelated');
    },
    // Duotone JS implementation
    duotone(c1='#000000', c2='#ffffff') {
      const l = AL(); if (!l||l.lk) return;
      const d = l.gd();
      const [r1,g1,b1] = h2r(c1), [r2,g2,b2] = h2r(c2);
      for (let i=0; i<d.data.length; i+=4) {
        const t = (d.data[i]*0.299 + d.data[i+1]*0.587 + d.data[i+2]*0.114)/255;
        d.data[i]   = cl(r1 + (r2-r1)*t, 0, 255);
        d.data[i+1] = cl(g1 + (g2-g1)*t, 0, 255);
        d.data[i+2] = cl(b1 + (b2-b1)*t, 0, 255);
      }
      l.pd(d); Hs.save('Duotone'); toast('Duotone applied');
    },
    // Film grain
    filmGrain(amt=25) {
      const l = AL(); if (!l||l.lk) return;
      const d = l.gd();
      for (let i=0; i<d.data.length; i+=4) {
        const g = (Math.random()-0.5)*amt*2;
        d.data[i]=cl(d.data[i]+g,0,255); d.data[i+1]=cl(d.data[i+1]+g,0,255); d.data[i+2]=cl(d.data[i+2]+g,0,255);
      }
      l.pd(d); Hs.save('Film Grain'); toast('Film grain added');
    },
    // Glitch
    glitch(amount=10) {
      const l = AL(); if (!l||l.lk) return;
      const d = l.gd(), W=d.width, H=d.height;
      const out = new Uint8ClampedArray(d.data);
      // Chromatic aberration
      for (let y=0; y<H; y++) for (let x=0; x<W; x++) {
        const i=(y*W+x)*4;
        const rx=Math.max(0,Math.min(W-1,x+amount)), lx=Math.max(0,Math.min(W-1,x-amount));
        out[i]   = d.data[(y*W+rx)*4];
        out[i+2] = d.data[(y*W+lx)*4+2];
      }
      // Horizontal glitch bands
      for (let n=0; n<8; n++) {
        const y0 = Math.floor(Math.random()*H);
        const ht = Math.floor(Math.random()*6)+2;
        const shift = Math.floor((Math.random()-0.5)*60);
        for (let y2=y0; y2<Math.min(H,y0+ht); y2++) {
          const row = new Uint8ClampedArray(W*4);
          for (let x2=0; x2<W; x2++) {
            const sx = Math.max(0,Math.min(W-1,x2+shift));
            for (let c=0;c<4;c++) row[x2*4+c] = out[(y2*W+sx)*4+c];
          }
          for (let x2=0; x2<W; x2++) for (let c=0;c<4;c++) out[(y2*W+x2)*4+c]=row[x2*4+c];
        }
      }
      l.pd(new ImageData(out,W,H)); Hs.save('Glitch'); toast('Glitch applied');
    },
    // Pencil sketch
    pencilSketch(blur=12) {
      const l = AL(); if (!l||l.lk) return;
      const d = l.gd(), W=d.width, H=d.height;
      // Step 1: grayscale
      const gray = new Uint8ClampedArray(W*H);
      for (let i=0; i<d.data.length; i+=4) {
        gray[i/4] = d.data[i]*0.299+d.data[i+1]*0.587+d.data[i+2]*0.114;
      }
      // Step 2: invert
      const inv = gray.map(v=>255-v);
      // Step 3: blur the inverted using box blur
      const blurred = this._boxBlur(inv, W, H, Math.max(1,Math.floor(blur/2)));
      // Step 4: color dodge blend
      const out = new Uint8ClampedArray(d.data.length);
      for (let i=0,j=0; i<d.data.length; i+=4,j++) {
        const s = gray[j]/Math.max(1, 255-blurred[j]) * 255;
        const v = cl(s*1.1, 0, 255);
        out[i]=out[i+1]=out[i+2]=v; out[i+3]=d.data[i+3];
      }
      l.pd(new ImageData(out,W,H)); Hs.save('Pencil Sketch'); toast('Pencil sketch applied');
    },
    _boxBlur(src, W, H, r) {
      const out = new Uint8ClampedArray(src.length);
      for (let y=0; y<H; y++) for (let x=0; x<W; x++) {
        let sum=0, cnt=0;
        for (let dy=-r; dy<=r; dy++) for (let dx=-r; dx<=r; dx++) {
          const ny=Math.max(0,Math.min(H-1,y+dy)), nx=Math.max(0,Math.min(W-1,x+dx));
          sum+=src[ny*W+nx]; cnt++;
        }
        out[y*W+x]=sum/cnt;
      }
      return out;
    },
    // Halftone
    halftone(dotSize=8) {
      const l = AL(); if (!l||l.lk) return;
      const d = l.gd(), W=d.width, H=d.height;
      const out = new Uint8ClampedArray(d.data.length).fill(255);
      for (let i=0; i<out.length; i+=4) out[i+3]=255;
      for (let y=0; y<H; y+=dotSize) for (let x=0; x<W; x+=dotSize) {
        let sum=0, cnt=0;
        for (let dy=0; dy<dotSize&&y+dy<H; dy++) for (let dx=0; dx<dotSize&&x+dx<W; dx++) {
          const i=((y+dy)*W+(x+dx))*4;
          sum+=d.data[i]*0.299+d.data[i+1]*0.587+d.data[i+2]*0.114; cnt++;
        }
        const bright = sum/cnt/255;
        const r2 = (1-bright) * dotSize*0.6;
        const cx2 = x+dotSize/2, cy2 = y+dotSize/2;
        // Draw filled circle into out
        for (let dy2=Math.floor(cy2-r2); dy2<=Math.ceil(cy2+r2); dy2++) for (let dx2=Math.floor(cx2-r2); dx2<=Math.ceil(cx2+r2); dx2++) {
          if (dy2<0||dy2>=H||dx2<0||dx2>=W) continue;
          if (Math.hypot(dx2-cx2,dy2-cy2) <= r2) {
            const i=(dy2*W+dx2)*4; out[i]=out[i+1]=out[i+2]=0;
          }
        }
      }
      l.pd(new ImageData(out,W,H)); Hs.save('Halftone'); toast('Halftone applied');
    },
    // Tilt-shift blur
    tiltShift(focusY=0.5, band=0.15, blurR=6) {
      const l = AL(); if (!l||l.lk) return;
      const d = l.gd(), W=d.width, H=d.height;
      const blurred = this._gaussianH(d.data, W, H, blurR);
      const out = new Uint8ClampedArray(d.data.length);
      for (let y=0; y<H; y++) {
        const rel = Math.abs(y/H - focusY);
        const t = Math.max(0, Math.min(1, (rel-band)/(0.5-band+0.001)));
        for (let x=0; x<W; x++) {
          const i=(y*W+x)*4;
          for (let c=0;c<4;c++) out[i+c]=d.data[i+c]*(1-t)+blurred[i+c]*t;
        }
      }
      l.pd(new ImageData(out,W,H)); Hs.save('Tilt-Shift'); toast('Tilt-shift applied');
    },
    _gaussianH(src, W, H, r) {
      const out = new Uint8ClampedArray(src.length);
      const r2 = Math.max(1,Math.floor(r));
      for (let y=0; y<H; y++) for (let x=0; x<W; x++) {
        let sum=[0,0,0,0], cnt=0;
        for (let d=-r2; d<=r2; d++) {
          const nx=Math.max(0,Math.min(W-1,x+d)), i=(y*W+nx)*4;
          for(let c=0;c<4;c++) sum[c]+=src[i+c]; cnt++;
        }
        const i=(y*W+x)*4; for(let c=0;c<4;c++) out[i+c]=sum[c]/cnt;
      }
      return out;
    },
    // Color balance (simplified JS version)
    colorBalance(sr=0,sg=0,sb=0, mr=0,mg=0,mb=0, hr=0,hg=0,hb=0) {
      const l = AL(); if (!l||l.lk) return;
      const d = l.gd();
      for (let i=0; i<d.data.length; i+=4) {
        const lum = d.data[i]*0.299+d.data[i+1]*0.587+d.data[i+2]*0.114;
        const sw = Math.max(0,1-lum/128), mw = Math.max(0,1-Math.abs(lum-128)/64), hw = Math.max(0,lum/128-1);
        d.data[i]  =cl(d.data[i]  +sr*sw+mr*mw+hr*hw,0,255);
        d.data[i+1]=cl(d.data[i+1]+sg*sw+mg*mw+hg*hw,0,255);
        d.data[i+2]=cl(d.data[i+2]+sb*sw+mb*mw+hb*hw,0,255);
      }
      l.pd(d); Hs.save('Color Balance'); toast('Color balance adjusted');
    },
    // Levels
    levels(black=0, white=255, gamma=1.0) {
      const l = AL(); if (!l||l.lk) return;
      const d = l.gd();
      for (let i=0; i<d.data.length; i+=4) {
        for (let c=0; c<3; c++) {
          let v = (d.data[i+c] - black) / Math.max(1, white-black) * 255;
          if (gamma !== 1.0) v = Math.pow(Math.max(0,v)/255, 1/gamma)*255;
          d.data[i+c] = cl(v, 0, 255);
        }
      }
      l.pd(d); Hs.save('Levels'); toast('Levels adjusted');
    },
    // Motion blur (horizontal only for JS version)
    motionBlur(distance=15, angle=0) {
      const l = AL(); if (!l||l.lk) return;
      const d = l.gd(), W=d.width, H=d.height;
      const out = new Uint8ClampedArray(d.data.length);
      const rad = angle * Math.PI/180;
      const dx = Math.cos(rad), dy = Math.sin(rad);
      const half = Math.floor(distance/2);
      for (let y=0; y<H; y++) for (let x=0; x<W; x++) {
        let sum=[0,0,0,0], cnt=0;
        for (let t=-half; t<=half; t++) {
          const nx=Math.max(0,Math.min(W-1,Math.round(x+dx*t)));
          const ny=Math.max(0,Math.min(H-1,Math.round(y+dy*t)));
          const i=(ny*W+nx)*4;
          for (let c=0;c<4;c++) sum[c]+=d.data[i+c]; cnt++;
        }
        const i=(y*W+x)*4; for(let c=0;c<4;c++) out[i+c]=sum[c]/cnt;
      }
      l.pd(new ImageData(out,W,H)); Hs.save('Motion Blur'); toast('Motion blur applied');
    },
    vignette(strength=0.6, softness=0.4) {
      const l = AL(); if (!l||l.lk) return;
      const d = l.gd(), W=d.width, H=d.height;
      const cx2=W/2, cy2=H/2, maxD=Math.hypot(cx2,cy2);
      for (let y=0; y<H; y++) for (let x=0; x<W; x++) {
        const dist = Math.hypot(x-cx2, y-cy2)/maxD;
        const v = Math.max(0, 1 - Math.max(0, (dist-softness)/(1-softness+0.001))*strength);
        const i=(y*W+x)*4;
        d.data[i]=cl(d.data[i]*v,0,255); d.data[i+1]=cl(d.data[i+1]*v,0,255); d.data[i+2]=cl(d.data[i+2]*v,0,255);
      }
      l.pd(d); Hs.save('Vignette'); toast('Vignette applied');
    },
  },

  // ── SERVER-SIDE filter calls ──────────────────────
  async brightness(v) { await this._run('/api/filter/brightness', {value:v, _name:'Brightness'}); },
  async contrast(v)   { await this._run('/api/filter/contrast',   {value:v, _name:'Contrast'}); },
  async saturation(v) { await this._run('/api/filter/saturation', {value:v, _name:'Saturation'}); },
  async sharpen(f)    { await this._run('/api/filter/sharpen',    {factor:f, _name:'Sharpen'}); },
  async blur(r)       { await this._run('/api/filter/blur',       {radius:r, _name:'Gaussian Blur'}); },
  async hsl(h,s,l)    { await this._run('/api/filter/hsl',        {hue:h, saturation:s, lightness:l, _name:'Hue/Saturation'}); },
  async vignetteSrv(str,soft) { await this._run('/api/filter/vignette', {strength:str, softness:soft, _name:'Vignette'}); },
  async noise(a)      { await this._run('/api/filter/noise',      {amount:a, _name:'Noise'}); },
  async curves(pts)   { await this._run('/api/filter/curves',     {points:pts, _name:'Curves'}); },
  async levels(bl,wh,gm) { await this._run('/api/filter/levels', {black:bl, white:wh, gamma:gm, _name:'Levels'}); },
  async colorBalance(p) { await this._run('/api/filter/color_balance', {...p, _name:'Color Balance'}); },
  async motionBlurSrv(a,d) { await this._run('/api/filter/motion_blur', {angle:a, distance:d, _name:'Motion Blur'}); },
  async radialBlur(a) { await this._run('/api/filter/radial_blur',  {amount:a, _name:'Radial Blur'}); },
  async duotoneSrv(c1,c2) { await this._run('/api/filter/duotone', {color1:c1, color2:c2, _name:'Duotone'}); },
  async filmGrainSrv(a)   { await this._run('/api/filter/film_grain', {amount:a, _name:'Film Grain'}); },
  async glitchSrv(a)  { await this._run('/api/filter/glitch',     {amount:a, _name:'Glitch'}); },
  async halftoneSrv(sz) { await this._run('/api/filter/halftone', {dot_size:sz, _name:'Halftone'}); },
  async pencilSketchSrv(b) { await this._run('/api/filter/pencil_sketch', {blur:b, _name:'Pencil Sketch'}); },
  async tiltShiftSrv(fy,band,blurR) { await this._run('/api/filter/tilt_shift', {focus_y:fy, band, blur:blurR, _name:'Tilt-Shift'}); },
  async exposure(e,s,h) { await this._run('/api/filter/exposure', {exposure:e, shadows:s, highlights:h, _name:'Exposure'}); },
  async vibrance(v) { await this._run('/api/filter/vibrance', {value:v, _name:'Vibrance'}); },
  async pixelateSrv(sz) { await this._run('/api/filter/pixelate', {size:sz, _name:'Pixelate'}); },
  async oilPaint(r,i) { await this._run('/api/filter/oil_paint', {radius:r, intensity:i, _name:'Oil Paint'}); },



  // ── CURVES ───────────────────────────────────────
  curvesJS(pts) {
    const l = AL(); if (!l||l.lk) return;
    const lut = new Uint8Array(256);
    const sorted = pts.sort((a,b)=>a[0]-b[0]);
    for (let i=0; i<256; i++) {
      for (let j=0; j<sorted.length-1; j++) {
        if (sorted[j][0] <= i && i <= sorted[j+1][0]) {
          const t = (i-sorted[j][0])/Math.max(1,sorted[j+1][0]-sorted[j][0]);
          lut[i] = cl(Math.round(sorted[j][1] + t*(sorted[j+1][1]-sorted[j][1])), 0, 255);
          break;
        }
      }
    }
    const d = l.gd();
    for (let i=0; i<d.data.length; i+=4) {
      d.data[i]=lut[d.data[i]]; d.data[i+1]=lut[d.data[i+1]]; d.data[i+2]=lut[d.data[i+2]];
    }
    l.pd(d); Hs.save('Curves'); toast('Curves adjusted');
  }
};
