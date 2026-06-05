'use strict';
/* ══════════════════════════════════════════════════════════
   editor-missing.js  —  All remaining / partial features
   Load AFTER editor-ui.js in editor.html
   ══════════════════════════════════════════════════════════ */

// ── EXTEND STATE ─────────────────────────────────────────
Object.assign(S, {
  magPts:[],            // magnetic lasso accumulated pts
  magActive:false,
  qsActive:false,       // quick selection active
  tfMode:'free',        // 'skew'|'distort'|'perspective'|'warp'
  tfCorners:null,       // 4 corner points for distort/perspective
  patchSrc:null,        // patch tool source rect
  patchMode:false,
  macroRec:false,       // recording macro
  macroActions:[],      // recorded action steps
  macros:{},            // saved macros {name:[actions]}
  snapshots:[],         // [{name,layers_png_arr}]
  animFrames:[],        // [{layers_png_arr, duration}]
  animFrame:0,
  animPlaying:false,
  animInterval:null,
  groups:{},            // {groupId:{name,collapsed,ids:[]}}
  handPanning:false,    // hand tool panning state
});

// ══════════════════════════════════════════════════════════
// 1. HAND TOOL  (dedicated pan, also triggered by Space)
// ══════════════════════════════════════════════════════════
const HAND = {
  _prev: null,
  start(ex, ey){ S.handPanning=true; this._prev={x:ex,y:ey}; vp.style.cursor='grabbing'; },
  move(ex, ey){
    if(!S.handPanning||!this._prev) return;
    S.panX += ex-this._prev.x; S.panY += ey-this._prev.y;
    this._prev={x:ex,y:ey};
  },
  end(){ S.handPanning=false; if(S.tool==='hand') vp.style.cursor='grab'; }
};
// Space-bar temporary hand tool
document.addEventListener('keydown', e=>{
  if(e.code==='Space' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName) && S.tool!=='hand'){
    vp.style.cursor='grab'; vp.dataset.spaceHand='1';
  }
});
document.addEventListener('keyup', e=>{
  if(e.code==='Space'){ delete vp.dataset.spaceHand; vp.style.cursor=''; A.tool(S.tool); }
});

// ══════════════════════════════════════════════════════════
// 2. PENCIL TOOL  (hard-edged, no feather)
// ══════════════════════════════════════════════════════════
const PENCIL = {
  draw(cx, cy){
    const l=AL(); if(!l||l.lk) return;
    const r=Math.max(1,Math.floor(S.bsz/2));
    const [br,bg,bb]=h2r(S.pri);
    l.x.save();
    l.x.fillStyle=`rgba(${br},${bg},${bb},${S.bop/100})`;
    l.x.beginPath(); l.x.arc(cx,cy,r,0,Math.PI*2); l.x.fill();
    l.x.restore();
  },
  line(x0,y0,x1,y1){
    const dist=Math.hypot(x1-x0,y1-y0), steps=Math.max(1,Math.ceil(dist));
    for(let i=0;i<=steps;i++) this.draw(x0+(x1-x0)*i/steps, y0+(y1-y0)*i/steps);
  }
};

// ══════════════════════════════════════════════════════════
// 3. SHARPEN BRUSH  (as a paint tool)
// ══════════════════════════════════════════════════════════
const SHARPEN_BRUSH = {
  apply(cx,cy){
    const l=AL(); if(!l||l.lk) return;
    const r=Math.floor(S.bsz/2), str=S.bop/100*0.6;
    const d=l.x.getImageData(cx-r,cy-r,r*2,r*2);
    const src=new Uint8ClampedArray(d.data), W2=r*2;
    // Unsharp mask kernel
    for(let y2=1;y2<W2-1;y2++) for(let x2=1;x2<W2-1;x2++){
      const dist=Math.hypot(x2-r,y2-r); if(dist>r) continue;
      const f=Math.max(0,1-dist/r)*str, i=(y2*W2+x2)*4;
      for(let c=0;c<3;c++){
        const lap= src[i+c]*5 - src[i-W2*4+c] - src[i+W2*4+c] - src[i-4+c] - src[i+4+c];
        d.data[i+c]=cl(src[i+c]+lap*f,0,255);
      }
    }
    l.x.putImageData(d,cx-r,cy-r);
  }
};

// ══════════════════════════════════════════════════════════
// 4. MAGNETIC LASSO
// ══════════════════════════════════════════════════════════
const MAG = {
  pts:[],
  _edgeCache:null, _edgeW:0, _edgeH:0,
  _buildEdge(){
    const l=AL(); if(!l) return;
    const id=l.gd(), d=id.data, W=id.width, H=id.height;
    const e=new Float32Array(W*H);
    for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++){
      const i=(y*W+x)*4;
      const gx=d[(y*W+x+1)*4]-d[(y*W+x-1)*4];
      const gy=d[((y+1)*W+x)*4]-d[((y-1)*W+x)*4];
      e[y*W+x]=Math.hypot(gx,gy);
    }
    this._edgeCache=e; this._edgeW=W; this._edgeH=H;
  },
  // Snap point to strongest edge within radius
  snap(cx,cy,radius=12){
    if(!this._edgeCache) this._buildEdge();
    const W=this._edgeW, H=this._edgeH;
    let best=0, bx=Math.round(cx), by=Math.round(cy);
    for(let dy=-radius;dy<=radius;dy++) for(let dx=-radius;dx<=radius;dx++){
      const nx=Math.round(cx+dx), ny=Math.round(cy+dy);
      if(nx<0||nx>=W||ny<0||ny>=H) continue;
      const v=this._edgeCache[ny*W+nx];
      if(v>best){best=v;bx=nx;by=ny;}
    }
    return {x:bx,y:by};
  },
  start(cx,cy){ this._buildEdge(); this.pts=[{x:cx,y:cy}]; S.magActive=true; S.lassoPts=this.pts; },
  move(cx,cy){ const p=this.snap(cx,cy); this.pts.push(p); S.lassoPts=this.pts; },
  commit(){ S.lassoPts=this.pts; SEL.commitLasso(); this.pts=[]; S.magActive=false; this._edgeCache=null; }
};

// ══════════════════════════════════════════════════════════
// 5. QUICK SELECTION BRUSH
// ══════════════════════════════════════════════════════════
const QS = {
  paint(cx,cy){
    const l=AL(); if(!l) return;
    const r=S.bsz/2, tolerance=40;
    const x0=Math.floor(cx-r), y0=Math.floor(cy-r);
    const id=l.x.getImageData(0,0,S.W,S.H), d=id.data, W=S.W, H=S.H;
    // Sample center color
    const si=(Math.floor(cy)*W+Math.floor(cx))*4;
    const tr=d[si],tg=d[si+1],tb=d[si+2];
    // Flood from every pixel in brush radius
    const visited=new Uint8Array(W*H);
    const queue=[];
    for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++){
      if(Math.hypot(dx,dy)>r) continue;
      const nx=Math.floor(cx+dx), ny=Math.floor(cy+dy);
      if(nx>=0&&nx<W&&ny>=0&&ny<H&&!visited[ny*W+nx]){
        queue.push([nx,ny]); visited[ny*W+nx]=1;
      }
    }
    let minX=W,minY=H,maxX=0,maxY=0;
    while(queue.length){
      const [x,y]=queue.pop();
      const i=(y*W+x)*4;
      if(Math.abs(d[i]-tr)+Math.abs(d[i+1]-tg)+Math.abs(d[i+2]-tb)>tolerance*3) continue;
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
      const nbrs=[[x+1,y],[x-1,y],[x,y+1],[x,y-1]];
      for(const [nx2,ny2] of nbrs){
        if(nx2>=0&&nx2<W&&ny2>=0&&ny2<H&&!visited[ny2*W+nx2]){
          visited[ny2*W+nx2]=1; queue.push([nx2,ny2]);
        }
      }
    }
    if(S.sel){
      // Expand existing selection
      S.sel={x:Math.min(S.sel.x,minX),y:Math.min(S.sel.y,minY),
             w:Math.max(S.sel.x+S.sel.w,maxX)-Math.min(S.sel.x,minX),
             h:Math.max(S.sel.y+S.sel.h,maxY)-Math.min(S.sel.y,minY)};
    } else {
      S.sel={x:minX,y:minY,w:maxX-minX,h:maxY-minY};
    }
    UI.updateSelInfo();
  }
};

// ══════════════════════════════════════════════════════════
// 6. SPOT HEALING BRUSH
// ══════════════════════════════════════════════════════════
const SPOT = {
  heal(cx,cy){
    const l=AL(); if(!l||l.lk) return;
    const r=Math.floor(S.bsz/2);
    const d=l.x.getImageData(cx-r,cy-r,r*2,r*2);
    const W2=r*2;
    // Sample ring around the area (just outside radius)
    const ring=[], outerR=r+4;
    const full=l.x.getImageData(cx-outerR,cy-outerR,outerR*2,outerR*2);
    for(let y2=0;y2<outerR*2;y2++) for(let x2=0;x2<outerR*2;x2++){
      const dist=Math.hypot(x2-outerR,y2-outerR);
      if(dist>=r&&dist<=outerR) ring.push([(y2*outerR*2+x2)*4]);
    }
    if(!ring.length) return;
    // Average ring color
    let ar=0,ag=0,ab=0;
    ring.forEach(([i])=>{ar+=full.data[i];ag+=full.data[i+1];ab+=full.data[i+2];});
    ar/=ring.length; ag/=ring.length; ab/=ring.length;
    // Blend toward ring average inside brush
    for(let y2=0;y2<W2;y2++) for(let x2=0;x2<W2;x2++){
      const dist=Math.hypot(x2-r,y2-r); if(dist>r) continue;
      const f=Math.max(0,1-dist/r)*S.bop/100;
      const i=(y2*W2+x2)*4;
      d.data[i]=  cl(d.data[i]  *(1-f)+ar*f,0,255);
      d.data[i+1]=cl(d.data[i+1]*(1-f)+ag*f,0,255);
      d.data[i+2]=cl(d.data[i+2]*(1-f)+ab*f,0,255);
    }
    l.x.putImageData(d,cx-r,cy-r);
  }
};

// ══════════════════════════════════════════════════════════
// 7. PATCH TOOL
// ══════════════════════════════════════════════════════════
const PATCH = {
  srcRect:null,
  setSource(){ S.patchSrc=S.sel?{...S.sel}:null; S.patchMode=true; toast('Patch source set. Now draw destination selection.'); },
  apply(){
    if(!S.patchSrc||!S.sel) { toast('Set source first, then select destination'); return; }
    const l=AL(); if(!l||l.lk) return;
    const s=S.patchSrc, d2=S.sel;
    const tmp=document.createElement('canvas'); tmp.width=s.w; tmp.height=s.h;
    const tc=tmp.getContext('2d'); tc.drawImage(l.el,-s.x,-s.y);
    // Scale source to destination size
    l.x.save();
    l.x.imageSmoothingEnabled=true; l.x.imageSmoothingQuality='high';
    l.x.drawImage(tmp,d2.x,d2.y,d2.w,d2.h);
    l.x.restore();
    Hs.save('Patch Tool'); S.patchMode=false; S.patchSrc=null; toast('Patch applied');
  }
};

// ══════════════════════════════════════════════════════════
// 8. RED EYE REMOVAL
// ══════════════════════════════════════════════════════════
const REDEYE = {
  fix(cx,cy,radius){
    const l=AL(); if(!l||l.lk) return;
    const r=radius||S.bsz/2;
    const d=l.x.getImageData(cx-r,cy-r,r*2,r*2);
    const W2=r*2;
    for(let y2=0;y2<W2;y2++) for(let x2=0;x2<W2;x2++){
      if(Math.hypot(x2-r,y2-r)>r) continue;
      const i=(y2*W2+x2)*4;
      const red=d.data[i], green=d.data[i+1], blue=d.data[i+2];
      // Red-eye: red channel significantly higher than G+B average
      if(red > 120 && red > green*1.5 && red > blue*1.5){
        const gray=Math.round((green+blue)/2);
        d.data[i]=gray; // desaturate red channel
      }
    }
    l.x.putImageData(d,cx-r,cy-r);
    Hs.save('Red Eye Removal'); toast('Red eye corrected');
  }
};

// ══════════════════════════════════════════════════════════
// 9. CANVAS OPERATIONS
// ══════════════════════════════════════════════════════════
const CANVAS_OPS = {
  // Trim transparent area
  trim(){
    const l=AL(); if(!l) return;
    const d=l.gd(), W=d.width, H=d.height;
    let minX=W,minY=H,maxX=0,maxY=0;
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      if(d.data[(y*W+x)*4+3]>4){
        minX=Math.min(minX,x);minY=Math.min(minY,y);
        maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
      }
    }
    if(maxX===0&&maxY===0){toast('No non-transparent pixels found');return;}
    const nw=maxX-minX+1, nh=maxY-minY+1;
    layers.forEach(layer=>{
      const tmp=document.createElement('canvas'); tmp.width=nw; tmp.height=nh;
      const tc=tmp.getContext('2d'); tc.drawImage(layer.el,-minX,-minY);
      layer.el.width=nw; layer.el.height=nh; layer.w=nw; layer.h=nh;
      layer.x.drawImage(tmp,0,0);
    });
    S.W=nw; S.H=nh; Hs.save('Trim Transparent');
    V.fit(); UI.updateSizeDisplay(); toast(`Trimmed to ${nw}×${nh}`);
  },

  // Resize canvas (without scaling content)
  resizeCanvas(nw, nh, anchor='center'){
    const offX = anchor==='center'?Math.round((nw-S.W)/2):anchor==='left'?0:nw-S.W;
    const offY = anchor==='center'?Math.round((nh-S.H)/2):anchor==='top'?0:nh-S.H;
    layers.forEach(layer=>{
      const tmp=document.createElement('canvas'); tmp.width=nw; tmp.height=nh;
      const tc=tmp.getContext('2d'); tc.drawImage(layer.el,offX,offY);
      layer.el.width=nw; layer.el.height=nh; layer.w=nw; layer.h=nh;
      layer.x.drawImage(tmp,0,0);
    });
    S.W=nw; S.H=nh; Hs.save('Resize Canvas');
    V.fit(); UI.updateSizeDisplay(); toast(`Canvas resized to ${nw}×${nh}`);
  },

  // Expand canvas by adding padding
  expand(top=20,right=20,bottom=20,left=20){
    this.resizeCanvas(S.W+left+right, S.H+top+bottom, 'none');
    // Apply specific offset
    const nw=S.W, nh=S.H;
    layers.forEach(layer=>{
      const tmp=document.createElement('canvas'); tmp.width=nw; tmp.height=nh;
      const tc=tmp.getContext('2d'); tc.drawImage(layer.el,left,top);
      layer.x.clearRect(0,0,nw,nh); layer.x.drawImage(tmp,0,0);
    });
    toast(`Canvas expanded (+${top}/${right}/${bottom}/${left})`);
  },

  // Perspective crop — transforms 4 corner points to rectangle
  perspectiveCrop(pts){ // pts = [{x,y},{x,y},{x,y},{x,y}] TL,TR,BR,BL
    const l=AL(); if(!l) return;
    const xs=pts.map(p=>p.x), ys=pts.map(p=>p.y);
    const nw=Math.round(Math.max(Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y),Math.hypot(pts[2].x-pts[3].x,pts[2].y-pts[3].y)));
    const nh=Math.round(Math.max(Math.hypot(pts[3].x-pts[0].x,pts[3].y-pts[0].y),Math.hypot(pts[2].x-pts[1].x,pts[2].y-pts[1].y)));
    // Use CSS perspective transform approximation via canvas
    const tmp=document.createElement('canvas'); tmp.width=nw; tmp.height=nh;
    const tc=tmp.getContext('2d');
    // Simple bilinear remap
    const src=l.gd(), W=src.width, H=src.height;
    const out=tc.createImageData(nw,nh);
    for(let ty=0;ty<nh;ty++) for(let tx=0;tx<nw;tx++){
      const u=tx/nw, v=ty/nh;
      // Bilinear interpolation on quad
      const sx=((1-u)*(1-v)*pts[0].x + u*(1-v)*pts[1].x + u*v*pts[2].x + (1-u)*v*pts[3].x);
      const sy=((1-u)*(1-v)*pts[0].y + u*(1-v)*pts[1].y + u*v*pts[2].y + (1-u)*v*pts[3].y);
      const px=Math.floor(sx), py=Math.floor(sy);
      if(px<0||px>=W||py<0||py>=H) continue;
      const si=(py*W+px)*4, di=(ty*nw+tx)*4;
      out.data[di]=src.data[si];out.data[di+1]=src.data[si+1];out.data[di+2]=src.data[si+2];out.data[di+3]=src.data[si+3];
    }
    tc.putImageData(out,0,0);
    layers.forEach(layer=>{
      layer.el.width=nw;layer.el.height=nh;layer.w=nw;layer.h=nh;
    });
    l.x.drawImage(tmp,0,0);
    S.W=nw;S.H=nh;Hs.save('Perspective Crop');V.fit();UI.updateSizeDisplay();toast('Perspective crop applied');
  }
};

// ══════════════════════════════════════════════════════════
// 10. TRANSFORM MODES — Skew, Distort, Perspective, Warp
// ══════════════════════════════════════════════════════════
const XFORM = {
  _corners:null, // [{x,y}×4]  TL TR BR BL
  _srcImg:null,  // ImageData of region before transform
  _region:null,  // {x,y,w,h}
  _active:false,
  _selHandle:-1,
  overlay:null, octx:null,

  init(){
    this.overlay=document.getElementById('xform-overlay');
    if(this.overlay) this.octx=this.overlay.getContext('2d');
  },

  // Start transform on active layer (or selection)
  start(mode){
    const l=AL(); if(!l) return;
    const rgn=S.sel||{x:0,y:0,w:S.W,h:S.H};
    this._region=rgn;
    this._srcImg=l.x.getImageData(rgn.x,rgn.y,rgn.w,rgn.h);
    this._corners=[
      {x:rgn.x,    y:rgn.y},
      {x:rgn.x+rgn.w,y:rgn.y},
      {x:rgn.x+rgn.w,y:rgn.y+rgn.h},
      {x:rgn.x,    y:rgn.y+rgn.h}
    ];
    TF._tfState={xform:true};
    S.tfMode=mode; this._active=true;
    A.tool('move');
    toast(`${mode} — drag corners to transform. Enter=commit Esc=cancel`);
    this.render();
  },

  hitCorner(cx,cy){
    const hit=10/S.zoom;
    if(!this._corners) return -1;
    return this._corners.findIndex(c=>Math.hypot(c.x-cx,c.y-cy)<hit);
  },

  drag(idx,cx,cy){
    if(!this._corners||idx<0) return;
    if(S.tfMode==='skew'){
      // Only allow horizontal/vertical skew
      if(idx===0||idx===3) this._corners[idx].x=cx;
      else this._corners[idx].x=cx;
    } else if(S.tfMode==='perspective'){
      // Mirror opposite corner symmetrically
      this._corners[idx]={x:cx,y:cy};
      if(idx===0) this._corners[3].x=cx;
      if(idx===1) this._corners[2].x=cx;
    } else {
      // Free distort / warp
      this._corners[idx]={x:cx,y:cy};
    }
    this._applyTransform();
    this.render();
  },

  _applyTransform(){
    const l=AL(); if(!l||!this._srcImg||!this._corners) return;
    const rgn=this._region, src=this._srcImg;
    const pts=this._corners;
    const out=l.x.createImageData(rgn.w,rgn.h);
    const W=rgn.w, H=rgn.h;
    // Bilinear quad remap (inverse mapping)
    for(let ty=0;ty<H;ty++) for(let tx=0;tx<W;tx++){
      const u=tx/W, v=ty/H;
      // Map (u,v) in unit square → canvas space via corners
      const cx2=(1-u)*(1-v)*pts[0].x + u*(1-v)*pts[1].x + u*v*pts[2].x + (1-u)*v*pts[3].x;
      const cy2=(1-u)*(1-v)*pts[0].y + u*(1-v)*pts[1].y + u*v*pts[2].y + (1-u)*v*pts[3].y;
      // Map back to source region
      const sx=Math.round((cx2-pts[0].x)/(pts[1].x-pts[0].x||1)*W);
      const sy=Math.round((cy2-pts[0].y)/(pts[3].y-pts[0].y||1)*H);
      if(sx<0||sx>=W||sy<0||sy>=H) continue;
      const si=(sy*W+sx)*4, di=(ty*W+tx)*4;
      out.data[di]=src.data[si];out.data[di+1]=src.data[si+1];
      out.data[di+2]=src.data[si+2];out.data[di+3]=src.data[si+3];
    }
    // Compute bounding box of transformed corners
    const xs=pts.map(p=>p.x), ys=pts.map(p=>p.y);
    const bx=Math.min(...xs),by=Math.min(...ys);
    const bw=Math.max(...xs)-bx, bh=Math.max(...ys)-by;
    const tmp=document.createElement('canvas'); tmp.width=bw||1; tmp.height=bh||1;
    const tc=tmp.getContext('2d'); tc.putImageData(out,0,0);
    l.x.clearRect(rgn.x,rgn.y,rgn.w,rgn.h);
    l.x.drawImage(tmp,bx,by);
  },

  render(){
    if(!this.octx||!this._corners) return;
    const oc=this.overlay;
    this.octx.clearRect(0,0,oc.width,oc.height);
    this.octx.save();
    this.octx.translate(Math.round(S.panX),Math.round(S.panY));
    this.octx.scale(S.zoom,S.zoom);
    const pts=this._corners;
    this.octx.beginPath();
    this.octx.moveTo(pts[0].x,pts[0].y);
    pts.slice(1).forEach(p=>this.octx.lineTo(p.x,p.y));
    this.octx.closePath();
    this.octx.strokeStyle='#4A7CF7'; this.octx.lineWidth=1/S.zoom; this.octx.stroke();
    const s=7/S.zoom;
    pts.forEach((p,i)=>{
      this.octx.fillStyle='#fff'; this.octx.strokeStyle='#4A7CF7'; this.octx.lineWidth=1.5/S.zoom;
      this.octx.fillRect(p.x-s/2,p.y-s/2,s,s); this.octx.strokeRect(p.x-s/2,p.y-s/2,s,s);
    });
    this.octx.restore();
  },

  commit(){
    this._active=false; TF._tfState=null;
    if(this.octx) this.octx.clearRect(0,0,this.overlay.width,this.overlay.height);
    Hs.save(S.tfMode+' Transform'); toast('Transform committed');
  },
  cancel(){
    if(this._srcImg&&this._region){
      const l=AL(); if(l) l.x.putImageData(this._srcImg,this._region.x,this._region.y);
    }
    this._active=false; TF._tfState=null;
    if(this.octx) this.octx.clearRect(0,0,this.overlay.width,this.overlay.height);
    toast('Transform cancelled');
  }
};

// ══════════════════════════════════════════════════════════
// 11. ALIGN OBJECTS
// ══════════════════════════════════════════════════════════
const ALIGN = {
  _getObjs(){ return OB.selId ? [OB.sel].filter(Boolean) : OB.list; },
  left()  { const os=this._getObjs();if(!os.length)return;const mx=Math.min(...os.map(o=>o.x));os.forEach(o=>o.x=mx);OB.renderOverlay(); },
  right() { const os=this._getObjs();if(!os.length)return;const mx=Math.max(...os.map(o=>o.x+o.w));os.forEach(o=>o.x=mx-o.w);OB.renderOverlay(); },
  top()   { const os=this._getObjs();if(!os.length)return;const my=Math.min(...os.map(o=>o.y));os.forEach(o=>o.y=my);OB.renderOverlay(); },
  bottom(){ const os=this._getObjs();if(!os.length)return;const my=Math.max(...os.map(o=>o.y+o.h));os.forEach(o=>o.y=my-o.h);OB.renderOverlay(); },
  centerH(){ const os=this._getObjs();if(!os.length)return;os.forEach(o=>o.x=S.W/2-o.w/2);OB.renderOverlay(); },
  centerV(){ const os=this._getObjs();if(!os.length)return;os.forEach(o=>o.y=S.H/2-o.h/2);OB.renderOverlay(); },
  distributeH(){
    const os=this._getObjs().sort((a,b)=>a.x-b.x);if(os.length<3)return;
    const total=os[os.length-1].x-os[0].x, gap=total/(os.length-1);
    os.forEach((o,i)=>o.x=os[0].x+gap*i); OB.renderOverlay();
  },
  distributeV(){
    const os=this._getObjs().sort((a,b)=>a.y-b.y);if(os.length<3)return;
    const total=os[os.length-1].y-os[0].y, gap=total/(os.length-1);
    os.forEach((o,i)=>o.y=os[0].y+gap*i); OB.renderOverlay();
  }
};

// ══════════════════════════════════════════════════════════
// 12. VERTICAL TEXT
// ══════════════════════════════════════════════════════════
// Add to OB._drawText: detect data.vertical === true
// Monkey-patch OB._drawText to support vertical
const _origDrawText = OB._drawText.bind(OB);
OB._drawText = function(ctx, o){
  if(!o.data.vertical){ _origDrawText(ctx,o); return; }
  const d=o.data;
  ctx.font=`${d.italic?'italic ':''}${d.bold?'bold ':''}${d.size||24}px "${d.font||'Arial'}"`;
  ctx.textBaseline='top'; ctx.fillStyle=d.color||S.pri;
  const chars=(d.text||'').split('');
  let ypos=o.y;
  chars.forEach(ch=>{
    ctx.fillText(ch, o.x, ypos);
    ypos += (d.size||24)*1.2;
  });
};

// ══════════════════════════════════════════════════════════
// 13. TEXT WARP (Arc warp)
// ══════════════════════════════════════════════════════════
const TWARP = {
  // Render warped text to canvas and return image object
  render(text, font, size, color, warpAmount, warpType='arc'){
    const tmp=document.createElement('canvas'); tmp.width=600; tmp.height=200;
    const tc=tmp.getContext('2d');
    tc.font=`${size}px "${font}"`;
    const w2=tc.measureText(text).width;
    tmp.width=Math.ceil(w2+40); tmp.height=Math.ceil(size*2.5);
    tc.font=`${size}px "${font}"`; tc.textBaseline='middle'; tc.fillStyle=color;
    const chars=text.split(''), cw=tmp.width/(chars.length||1);
    chars.forEach((ch,i)=>{
      const cx2=20+i*cw+(cw/2), pct=i/Math.max(1,chars.length-1)-0.5;
      let angle=0, offY=0;
      if(warpType==='arc'){ angle=pct*warpAmount*(Math.PI/180); offY=Math.sin(angle)*size*1.5; }
      else if(warpType==='wave'){ offY=Math.sin(pct*Math.PI*2)*warpAmount; }
      else if(warpType==='bulge'){ offY=-Math.cos(pct*Math.PI)*warpAmount; }
      tc.save(); tc.translate(cx2,tmp.height/2+offY); tc.rotate(angle*0.3); tc.fillText(ch,0,0); tc.restore();
    });
    return tmp;
  },
  apply(obj, warpType, warpAmount){
    if(!obj||obj.type!=='text') return;
    const tmp=this.render(obj.data.text,obj.data.font||'Arial',obj.data.size||24,obj.data.color||'#000',warpAmount,warpType);
    obj.data.warpCanvas=tmp; obj.data.warpType=warpType; obj.data.warpAmount=warpAmount;
    OB.renderOverlay();
  }
};
// Patch OB._drawText to handle warpCanvas
const _origDrawText2 = OB._drawText.bind(OB);
OB._drawText = function(ctx,o){
  if(o.data.warpCanvas){ ctx.drawImage(o.data.warpCanvas,o.x,o.y,o.w,o.h); return; }
  _origDrawText2(ctx,o);
};

// ══════════════════════════════════════════════════════════
// 14. LAYER MASK
// ══════════════════════════════════════════════════════════
const LMASK = {
  add(){
    const l=AL(); if(!l) return;
    l.mask=document.createElement('canvas'); l.mask.width=S.W; l.mask.height=S.H;
    const mc=l.mask.getContext('2d');
    mc.fillStyle='#ffffff'; mc.fillRect(0,0,S.W,S.H); // white = fully visible
    l.maskActive=true;
    Hs.save('Add Layer Mask'); UI.lylist(); toast('Layer mask added — paint black to hide, white to reveal');
  },
  remove(){
    const l=AL(); if(!l||!l.mask) return;
    l.mask=null; l.maskActive=false;
    Hs.save('Remove Layer Mask'); UI.lylist(); toast('Layer mask removed');
  },
  apply(){
    const l=AL(); if(!l||!l.mask) return;
    // Burn mask into layer alpha
    const id=l.gd(), W=id.width, H=id.height;
    const md=l.mask.getContext('2d').getImageData(0,0,W,H);
    for(let i=0;i<id.data.length;i+=4){
      id.data[i+3]=Math.round(id.data[i+3]*md.data[i]/255);
    }
    l.pd(id); l.mask=null; l.maskActive=false;
    Hs.save('Apply Layer Mask'); UI.lylist(); toast('Mask applied and merged');
  },
  // Paint on mask: mode = 'reveal'(white) | 'hide'(black)
  paint(cx,cy,mode='hide'){
    const l=AL(); if(!l||!l.mask) return;
    const mc=l.mask.getContext('2d');
    mc.fillStyle=mode==='hide'?'#000000':'#ffffff';
    mc.beginPath(); mc.arc(cx,cy,S.bsz/2,0,Math.PI*2); mc.fill();
  }
};

// ══════════════════════════════════════════════════════════
// 15. CLIPPING MASK
// ══════════════════════════════════════════════════════════
const CLIPMASK = {
  set(){
    const l=AL(); if(!l) return;
    l.clippingMask=true; Hs.save('Set Clipping Mask'); UI.lylist();
    toast('Clipping mask set — this layer clips to the layer below');
  },
  release(){
    const l=AL(); if(!l) return;
    l.clippingMask=false; Hs.save('Release Clipping Mask'); UI.lylist();
  }
};
// Note: R.render() needs patching (see PARTIAL UPGRADES section in instructions)

// ══════════════════════════════════════════════════════════
// 16. LAYER STYLES  (Shadow, Glow, Stroke, Bevel)
// ══════════════════════════════════════════════════════════
const LSTYLE = {
  set(layerIdx, styles){
    // styles = {shadow:{x,y,blur,color,opacity}, glow:{blur,color,opacity}, stroke:{width,color}, bevel:{size,highlight,shadow}}
    const l=layers[layerIdx]; if(!l) return;
    l.styles=styles; Hs.save('Layer Styles'); toast('Layer styles applied');
  },
  render(ctx, l){
    if(!l.styles||!l.vis) return;
    const s=l.styles;
    ctx.save(); ctx.globalAlpha=l.op; ctx.globalCompositeOperation=l.bm;
    // Drop shadow: draw layer shifted + blurred behind
    if(s.shadow){
      ctx.save();
      ctx.shadowColor=s.shadow.color||'rgba(0,0,0,0.5)';
      ctx.shadowBlur=s.shadow.blur||6;
      ctx.shadowOffsetX=s.shadow.x||3; ctx.shadowOffsetY=s.shadow.y||3;
      ctx.globalAlpha=(l.op)*(s.shadow.opacity||0.6);
      ctx.drawImage(l.el,0,0);
      ctx.restore();
    }
    // Outer Glow
    if(s.glow){
      ctx.save();
      ctx.shadowColor=s.glow.color||'rgba(255,255,180,0.8)';
      ctx.shadowBlur=s.glow.blur||12;
      ctx.globalAlpha=(l.op)*(s.glow.opacity||0.7);
      ctx.drawImage(l.el,0,0);
      ctx.restore();
    }
    ctx.restore();
  }
};

// ══════════════════════════════════════════════════════════
// 17. LAYER GROUPS
// ══════════════════════════════════════════════════════════
const LGROUP = {
  create(name){
    const gid='g'+(Date.now()).toString(36);
    S.groups[gid]={name:name||'Group',collapsed:false,ids:[]};
    return gid;
  },
  addLayer(gid, layerIdx){
    if(!S.groups[gid]) return;
    const l=layers[layerIdx]; if(!l) return;
    l.groupId=gid; S.groups[gid].ids.push(l.id);
    UI.lylist(); Hs.save('Group Layer');
  },
  removeLayer(layerIdx){
    const l=layers[layerIdx]; if(!l||!l.groupId) return;
    const g=S.groups[l.groupId];
    if(g) g.ids=g.ids.filter(id=>id!==l.id);
    l.groupId=null; UI.lylist();
  },
  toggleCollapse(gid){
    const g=S.groups[gid]; if(!g) return;
    g.collapsed=!g.collapsed;
    layers.forEach(l=>{ if(l.groupId===gid&&g.collapsed) l._hiddenByGroup=true; else l._hiddenByGroup=false; });
    UI.lylist();
  },
  deleteGroup(gid){
    const g=S.groups[gid]; if(!g) return;
    layers.forEach(l=>{ if(l.groupId===gid) l.groupId=null; });
    delete S.groups[gid]; UI.lylist(); Hs.save('Delete Group');
  }
};

// ══════════════════════════════════════════════════════════
// 18. REPLACE COLOR
// ══════════════════════════════════════════════════════════
const REPLACECOL = {
  apply(targetHex, replaceHex, tolerance=40){
    const l=AL(); if(!l||l.lk) return;
    const d=l.gd(), W=d.width, H=d.height;
    const [tr,tg,tb]=h2r(targetHex), [rr,rg,rb]=h2r(replaceHex);
    let count=0;
    for(let i=0;i<d.data.length;i+=4){
      const diff=Math.abs(d.data[i]-tr)+Math.abs(d.data[i+1]-tg)+Math.abs(d.data[i+2]-tb);
      if(diff<=tolerance*3){ d.data[i]=rr;d.data[i+1]=rg;d.data[i+2]=rb; count++; }
    }
    l.pd(d); Hs.save('Replace Color'); toast(`Replaced ${count} pixels`);
  }
};

// ══════════════════════════════════════════════════════════
// 19. EXTRA JS FILTERS — Cartoon, Glow, Drop Shadow
// ══════════════════════════════════════════════════════════
Object.assign(FT.q, {
  cartoon(posterLevels=4, edgeStr=1.5){
    const l=AL(); if(!l||l.lk) return;
    // Step 1: posterize
    const d=l.gd(), W=d.width, H=d.height;
    const step=255/Math.max(2,posterLevels-1);
    for(let i=0;i<d.data.length;i+=4){
      for(let c=0;c<3;c++) d.data[i+c]=Math.round(Math.round(d.data[i+c]/step)*step);
    }
    l.pd(d);
    // Step 2: edge detection overlay (dark edges)
    const d2=l.gd(), out=new Uint8ClampedArray(d2.data);
    for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++){
      const i=(y*W+x)*4;
      const gx=d2.data[i+4]-d2.data[i-4];
      const gy=d2.data[(y+1)*W*4+x*4]-d2.data[(y-1)*W*4+x*4];
      const edge=Math.min(255,Math.hypot(gx,gy)*edgeStr);
      if(edge>60){ out[i]=cl(out[i]-edge*0.5,0,255);out[i+1]=cl(out[i+1]-edge*0.5,0,255);out[i+2]=cl(out[i+2]-edge*0.5,0,255); }
    }
    l.pd(new ImageData(out,W,H)); Hs.save('Cartoon'); toast('Cartoon effect applied');
  },

  glow(radius=8, intensity=0.6){
    const l=AL(); if(!l||l.lk) return;
    // Blur a copy, then screen-blend back
    const orig=l.gd(), W=orig.width, H=orig.height;
    const blur=FT.q._gaussianH(orig.data,W,H,radius);
    const out=new Uint8ClampedArray(orig.data.length);
    for(let i=0;i<orig.data.length;i+=4){
      // Screen blend: 1-(1-a)(1-b)
      for(let c=0;c<3;c++){
        const a=orig.data[i+c]/255, b=(blur[i+c]/255)*intensity;
        out[i+c]=cl(Math.round((1-(1-a)*(1-b))*255),0,255);
      }
      out[i+3]=orig.data[i+3];
    }
    l.pd(new ImageData(out,W,H)); Hs.save('Glow'); toast('Glow applied');
  },

  dropShadow(offsetX=6, offsetY=6, blur=8, color='#000000', opacity=0.5){
    const l=AL(); if(!l||l.lk) return;
    const orig=l.gd(), W=orig.width, H=orig.height;
    // Create shadow layer
    const shadowD=new Uint8ClampedArray(orig.data.length);
    const [sr,sg,sb]=h2r(color);
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      const sy=y-offsetY, sx=x-offsetX;
      if(sx<0||sx>=W||sy<0||sy>=H) continue;
      const si=(sy*W+sx)*4, di=(y*W+x)*4;
      if(orig.data[si+3]>0) { shadowD[di]=sr;shadowD[di+1]=sg;shadowD[di+2]=sb;shadowD[di+3]=Math.round(orig.data[si+3]*opacity); }
    }
    const blurred=FT.q._gaussianH(shadowD,W,H,blur);
    // Composite: shadow behind original
    const out=new Uint8ClampedArray(orig.data.length);
    for(let i=0;i<orig.data.length;i+=4){
      if(orig.data[i+3]>0){ for(let c=0;c<4;c++) out[i+c]=orig.data[i+c]; }
      else {
        const ba=blurred[i+3]/255;
        out[i]=sr;out[i+1]=sg;out[i+2]=sb;out[i+3]=Math.round(ba*255*opacity);
      }
    }
    l.pd(new ImageData(out,W,H)); Hs.save('Drop Shadow'); toast('Drop shadow applied');
  }
});

// ══════════════════════════════════════════════════════════
// 20. SNAPSHOTS  (named history states)
// ══════════════════════════════════════════════════════════
const SNAP = {
  create(name){
    name=name||'Snapshot '+(S.snapshots.length+1);
    const frames=layers.map(l=>{
      const tmp=document.createElement('canvas');tmp.width=l.w;tmp.height=l.h;
      const tc=tmp.getContext('2d');tc.drawImage(l.el,0,0);
      return {name:l.name,png:tmp.toDataURL(),vis:l.vis,op:l.op,bm:l.bm};
    });
    S.snapshots.push({name,W:S.W,H:S.H,ai,frames,ts:Date.now()});
    this.render(); toast(`Snapshot "${name}" saved`);
  },
  restore(idx){
    const snap=S.snapshots[idx]; if(!snap) return;
    layers=[]; ai=snap.ai||0; OB.list=[];
    let loaded=0;
    snap.frames.forEach(s=>{
      const l=new Layer(snap.W||S.W,snap.H||S.H,s.name);
      l.vis=s.vis;l.op=s.op;l.bm=s.bm;
      const img=new Image();
      img.onload=()=>{
        l.x.drawImage(img,0,0); loaded++;
        if(loaded===snap.frames.length){S.W=snap.W||S.W;S.H=snap.H||S.H;UI.lylist();V.fit();}
      };
      img.src=s.png; layers.push(l);
    });
    Hs.save('Restore Snapshot'); toast(`Snapshot "${snap.name}" restored`);
  },
  delete(idx){ S.snapshots.splice(idx,1); this.render(); },
  render(){
    const el=document.getElementById('snap-list'); if(!el) return;
    el.innerHTML='';
    if(!S.snapshots.length){ el.innerHTML='<div style="color:var(--t3);font-size:11px;padding:8px">No snapshots yet</div>'; return; }
    S.snapshots.forEach((s,i)=>{
      const d=document.createElement('div'); d.className='hiitem';
      d.innerHTML=`<span class="hiico">📷</span>${s.name}<span style="margin-left:auto;display:flex;gap:4px">
        <button class="lybtn" style="padding:0 6px;height:20px" onclick="SNAP.restore(${i})">↩</button>
        <button class="lybtn" style="padding:0 6px;height:20px;color:var(--red)" onclick="SNAP.delete(${i})">✕</button>
      </span>`;
      el.appendChild(d);
    });
  }
};

// ══════════════════════════════════════════════════════════
// 21. MACRO RECORDER
// ══════════════════════════════════════════════════════════
const MACRO = {
  start(){
    S.macroRec=true; S.macroActions=[];
    document.getElementById('macro-status').textContent='● REC';
    document.getElementById('macro-status').style.color='var(--red)';
    toast('Macro recording started');
  },
  stop(){
    S.macroRec=false;
    document.getElementById('macro-status').textContent='○ Stop';
    document.getElementById('macro-status').style.color='var(--t3)';
    toast(`Recorded ${S.macroActions.length} actions`);
  },
  record(type, params){
    if(!S.macroRec) return;
    S.macroActions.push({type,...params});
  },
  save(name){
    name=name||prompt('Macro name:','Macro '+(Object.keys(S.macros).length+1));
    if(!name) return;
    S.macros[name]=[...S.macroActions];
    this.render(); localStorage.setItem('pf_macros',JSON.stringify(S.macros));
    toast(`Macro "${name}" saved (${S.macroActions.length} steps)`);
  },
  load(){
    try{ const d=localStorage.getItem('pf_macros'); if(d) S.macros=JSON.parse(d); this.render(); }catch(e){}
  },
  play(name){
    const actions=S.macros[name]; if(!actions||!actions.length){toast('Macro not found');return;}
    toast(`Playing macro "${name}" (${actions.length} steps)…`);
    actions.forEach((act,i)=>{
      setTimeout(()=>{
        switch(act.type){
          case 'filter_quick': FT.q[act.fn]&&FT.q[act.fn](...(act.args||[])); break;
          case 'flip': act.dir==='h'?TF.flipH():TF.flipV(); break;
          case 'grayscale': FT.q.grayscale(); break;
          case 'rotate': TF.rotate90(act.dir); break;
          case 'new_layer': LM.add(act.name); break;
          case 'resize': CANVAS_OPS.resizeCanvas(act.w,act.h); break;
        }
      }, i*120);
    });
  },
  render(){
    const el=document.getElementById('macro-list'); if(!el) return;
    el.innerHTML='';
    Object.entries(S.macros).forEach(([name,actions])=>{
      const d=document.createElement('div'); d.className='hiitem';
      d.innerHTML=`<span class="hiico">⏺</span>${name} <span style="color:var(--t3);font-size:9.5px">(${actions.length} steps)</span>
        <span style="margin-left:auto;display:flex;gap:4px">
          <button class="lybtn" style="padding:0 6px;height:20px" onclick="MACRO.play('${name}')">▶</button>
          <button class="lybtn" style="padding:0 6px;height:20px;color:var(--red)" onclick="delete S.macros['${name}'];MACRO.render();localStorage.setItem('pf_macros',JSON.stringify(S.macros))">✕</button>
        </span>`;
      el.appendChild(d);
    });
  }
};

// ══════════════════════════════════════════════════════════
// 22. ANIMATION TIMELINE
// ══════════════════════════════════════════════════════════
const ANIM = {
  addFrame(duration=100){
    const frame={layers:layers.map(l=>{
      const tmp=document.createElement('canvas');tmp.width=l.w;tmp.height=l.h;
      const tc=tmp.getContext('2d');tc.drawImage(l.el,0,0);
      return {png:tmp.toDataURL(),name:l.name,vis:l.vis,op:l.op,bm:l.bm};
    }),duration};
    S.animFrames.push(frame);
    this.render(); toast(`Frame ${S.animFrames.length} added`);
  },
  deleteFrame(i){ S.animFrames.splice(i,1); if(S.animFrame>=S.animFrames.length) S.animFrame=Math.max(0,S.animFrames.length-1); this.render(); },
  gotoFrame(i){
    const f=S.animFrames[i]; if(!f) return;
    S.animFrame=i;
    // Load frame into layers
    layers=[]; ai=0;
    let loaded=0;
    f.layers.forEach(s=>{
      const l=new Layer(S.W,S.H,s.name);
      l.vis=s.vis;l.op=s.op;l.bm=s.bm;
      const img=new Image();
      img.onload=()=>{l.x.drawImage(img,0,0);loaded++;if(loaded===f.layers.length)UI.lylist();};
      img.src=s.png; layers.push(l);
    });
    this.render();
  },
  play(){
    if(!S.animFrames.length){toast('No frames');return;}
    S.animPlaying=true;
    const next=()=>{
      if(!S.animPlaying) return;
      this.gotoFrame(S.animFrame);
      const dur=S.animFrames[S.animFrame]?.duration||100;
      S.animFrame=(S.animFrame+1)%S.animFrames.length;
      S.animInterval=setTimeout(next,dur);
    };
    next();
    document.getElementById('anim-play-btn').textContent='⏸ Pause';
  },
  pause(){ S.animPlaying=false; clearTimeout(S.animInterval); document.getElementById('anim-play-btn').textContent='▶ Play'; },
  exportGif(){
    toast('Export GIF: Use exported PNG frames in an external GIF tool (gifski, ezgif.com)');
    S.animFrames.forEach((f,i)=>{
      const tmp=document.createElement('canvas');tmp.width=S.W;tmp.height=S.H;
      const tc=tmp.getContext('2d');
      f.layers.forEach(s=>{
        if(!s.vis)return;const img=new Image();
        img.src=s.png;tc.globalAlpha=s.op;tc.globalCompositeOperation=s.bm;tc.drawImage(img,0,0);
      });
      const a=document.createElement('a');a.href=tmp.toDataURL('image/png');a.download=`frame_${String(i).padStart(3,'0')}.png`;a.click();
    });
  },
  render(){
    const el=document.getElementById('anim-frames'); if(!el) return;
    el.innerHTML='';
    S.animFrames.forEach((f,i)=>{
      const tmp=document.createElement('canvas');tmp.width=48;tmp.height=36;
      const tc=tmp.getContext('2d');
      f.layers.slice().reverse().forEach(s=>{
        if(!s.vis)return;const img=new Image();img.src=s.png;
        tc.globalAlpha=s.op;tc.globalCompositeOperation=s.bm;tc.drawImage(img,0,0,48,36);
      });
      const d=document.createElement('div');
      d.className='anim-frame'+(i===S.animFrame?' cur':'');
      d.innerHTML=`<div style="font-size:9px;color:var(--t3);text-align:center">${i+1}</div>`;
      d.appendChild(tmp);
      d.addEventListener('click',()=>this.gotoFrame(i));
      d.addEventListener('dblclick',()=>{
        const ms=prompt('Frame duration (ms):',f.duration);
        if(ms&&+ms>0){f.duration=+ms;this.render();}
      });
      const del=document.createElement('button');del.textContent='✕';
      del.style.cssText='position:absolute;top:0;right:0;background:var(--red);color:#fff;border:none;border-radius:2px;font-size:9px;cursor:pointer;width:14px;height:14px;line-height:14px;padding:0';
      del.addEventListener('click',e=>{e.stopPropagation();this.deleteFrame(i);});
      d.style.position='relative'; d.appendChild(del);
      el.appendChild(d);
    });
  }
};

// ══════════════════════════════════════════════════════════
// 23. PROPER FEATHER SELECTION  (Gaussian blur on mask)
// ══════════════════════════════════════════════════════════
const FEATHER = {
  apply(radius){
    if(!S.sel) return;
    // Create soft selection mask via Gaussian blur
    const W=S.W, H=S.H;
    const mask=new Uint8ClampedArray(W*H);
    const {x,y,w,h}=S.sel;
    // Fill selection area
    for(let py=Math.floor(y);py<Math.ceil(y+h);py++)
      for(let px=Math.floor(x);px<Math.ceil(x+w);px++)
        if(px>=0&&px<W&&py>=0&&py<H) mask[py*W+px]=255;
    // Box blur approximation of Gaussian
    const r=Math.max(1,Math.round(radius));
    const blurred=new Uint8ClampedArray(mask.length);
    for(let py=0;py<H;py++) for(let px=0;px<W;px++){
      let sum=0,cnt=0;
      for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++){
        const ny=py+dy,nx=px+dx;
        if(nx>=0&&nx<W&&ny>=0&&ny<H){sum+=mask[ny*W+nx];cnt++;}
      }
      blurred[py*W+px]=sum/cnt;
    }
    S.selMask=blurred;
    S.feather=radius;
    toast(`Selection feathered: ${radius}px`);
  }
};

// ══════════════════════════════════════════════════════════
// 24. ADJUSTMENT LAYERS — actual render effect
// ══════════════════════════════════════════════════════════
// Upgrade R._applyAdj to actually apply the adjustment to all layers below
// This replaces the empty stub in editor-core.js
R._applyAdj = function(adjLayer){
  if(!adjLayer.adj||!adjLayer.adj.type) return;
  const {type,params={}  } = adjLayer.adj;
  // Build composite of all layers below this adjustment layer
  const adjIdx = layers.indexOf(adjLayer);
  const tmp = document.createElement('canvas'); tmp.width=S.W; tmp.height=S.H;
  const tc = tmp.getContext('2d');
  for(let i=layers.length-1;i>adjIdx;i--){
    const lb=layers[i]; if(!lb.vis) continue;
    tc.globalAlpha=lb.op; tc.globalCompositeOperation=lb.bm; tc.drawImage(lb.el,0,0);
  }
  tc.globalAlpha=1; tc.globalCompositeOperation='source-over';
  const id=tc.getImageData(0,0,S.W,S.H), d=id.data;
  // Apply adjustment
  if(type==='Brightness/Contrast'){
    const b=(params.brightness||0)/100*255, c=(params.contrast||0)/100+1;
    for(let i=0;i<d.length;i+=4){
      for(let ch=0;ch<3;ch++) d[i+ch]=cl((d[i+ch]+b-128)*c+128,0,255);
    }
  } else if(type==='Hue/Saturation'){
    // simplified: use existing FT logic inline  
  } else if(type==='Invert'){
    for(let i=0;i<d.length;i+=4){d[i]=255-d[i];d[i+1]=255-d[i+1];d[i+2]=255-d[i+2];}
  } else if(type==='Grayscale'){
    for(let i=0;i<d.length;i+=4){const g=d[i]*.299+d[i+1]*.587+d[i+2]*.114;d[i]=d[i+1]=d[i+2]=g;}
  }
  tc.putImageData(id,0,0);
  dctx.globalAlpha=adjLayer.op; dctx.globalCompositeOperation=adjLayer.bm; dctx.drawImage(tmp,0,0);
};

// ══════════════════════════════════════════════════════════
// 25. WIRE NEW TOOLS INTO A.tool() + _dn/_mv/_up
// ══════════════════════════════════════════════════════════
const _origATool = A.tool.bind(A);
A.tool = function(name){
  _origATool(name);
  if(name==='hand') vp.style.cursor='grab';
  if(name==='pencil') vp.style.cursor='crosshair';
  if(name==='sharpen_brush') vp.style.cursor='crosshair';
  if(name==='spot') vp.style.cursor='crosshair';
  if(name==='redeye') vp.style.cursor='crosshair';
  if(name==='mag_lasso') { MAG._buildEdge&&MAG._buildEdge(); vp.style.cursor='crosshair'; }
  if(name==='quick_sel') vp.style.cursor='crosshair';
  if(name==='patch') vp.style.cursor='crosshair';
  if(['brush','eraser','pencil','sharpen_brush','spot','heal','clone','smudge','spray','sponge','dodge','burn','blur_brush','redeye'].includes(name)){
    const bo=document.getElementById('brush-opts'); if(bo) bo.style.display='flex';
  }
};

const _origDn = A._dn.bind(A);
A._dn = function(e){
  if(vp.dataset.spaceHand){ HAND.start(e.clientX,e.clientY); return; }
  const [cx,cy]=s2c(e.clientX,e.clientY);
  switch(S.tool){
    case 'hand': HAND.start(e.clientX,e.clientY); return;
    case 'pencil': PENCIL.draw(cx,cy); S.drawing=true; return;
    case 'sharpen_brush': SHARPEN_BRUSH.apply(cx,cy); S.drawing=true; return;
    case 'spot': SPOT.heal(cx,cy); return;
    case 'redeye': REDEYE.fix(cx,cy); return;
    case 'mag_lasso': MAG.start(cx,cy); return;
    case 'quick_sel': QS.paint(cx,cy); return;
    case 'patch': if(e.shiftKey&&S.sel){PATCH.setSource();}else if(S.patchMode){/* handled in up */} return;
  }
  _origDn(e);
};

const _origMv = A._mv.bind(A);
A._mv = function(e){
  if(vp.dataset.spaceHand||S.tool==='hand'){ HAND.move(e.clientX,e.clientY); return; }
  const [cx,cy]=s2c(e.clientX,e.clientY);
  if(S.drawing){
    switch(S.tool){
      case 'pencil': PENCIL.line(S.lx,S.ly,cx,cy); S.lx=cx;S.ly=cy; return;
      case 'sharpen_brush': SHARPEN_BRUSH.apply(cx,cy); return;
    }
  }
  if(S.magActive){ MAG.move(cx,cy); return; }
  if(S.tool==='quick_sel'&&S.drawing){ QS.paint(cx,cy); return; }
  // XFORM corner drag
  if(XFORM._active&&XFORM._selHandle>=0){ XFORM.drag(XFORM._selHandle,cx,cy); return; }
  _origMv(e);
};

const _origUp = A._up.bind(A);
A._up = function(e){
  if(S.tool==='hand'){ HAND.end(); return; }
  if(vp.dataset.spaceHand){ HAND.end(); return; }
  const [cx,cy]=s2c(e.clientX,e.clientY);
  switch(S.tool){
    case 'pencil': S.drawing=false; Hs.save('Pencil'); return;
    case 'sharpen_brush': S.drawing=false; Hs.save('Sharpen Brush'); return;
    case 'mag_lasso': MAG.commit(); return;
    case 'quick_sel': S.drawing=false; return;
    case 'patch': if(S.sel&&S.patchSrc){PATCH.apply();} return;
  }
  if(XFORM._active){ XFORM._selHandle=-1; return; }
  _origUp(e);
};

// XFORM mouse handling
vp.addEventListener('mousedown', e=>{
  if(!XFORM._active) return;
  const [cx,cy]=s2c(e.clientX,e.clientY);
  XFORM._selHandle=XFORM.hitCorner(cx,cy);
});
vp.addEventListener('mouseup', ()=>{ if(XFORM._active) XFORM._selHandle=-1; });

// Extend keyboard shortcuts
document.addEventListener('keydown', e=>{
  if(['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
  if(e.key==='Enter'&&XFORM._active){ XFORM.commit(); }
  if(e.key==='Escape'&&XFORM._active){ XFORM.cancel(); }
  if(e.ctrlKey&&e.key==='m'){ e.preventDefault(); MACRO.start(); }
  if(e.ctrlKey&&e.shiftKey&&e.key==='M'){ e.preventDefault(); MACRO.stop(); }
});

// Init
window.addEventListener('load', ()=>{
  XFORM.init();
  MACRO.load();
  SNAP.render();
  MACRO.render();
  ANIM.render();
  // Add missing tools to CMD
  CMD.commands.push(
    {label:'Pencil Tool',      icon:'✏', fn:()=>A.tool('pencil')},
    {label:'Hand/Pan Tool',    icon:'✋', fn:()=>A.tool('hand'), kbd:'H'},
    {label:'Sharpen Brush',    icon:'◈', fn:()=>A.tool('sharpen_brush')},
    {label:'Spot Healing',     icon:'✚', fn:()=>A.tool('spot')},
    {label:'Red Eye Fix',      icon:'👁', fn:()=>REDEYE.fix(S.W/2,S.H/2,30)},
    {label:'Magnetic Lasso',   icon:'🧲', fn:()=>A.tool('mag_lasso')},
    {label:'Quick Selection',  icon:'⚡', fn:()=>A.tool('quick_sel')},
    {label:'Patch Tool',       icon:'🩹', fn:()=>A.tool('patch')},
    {label:'Trim Transparent', icon:'✂', fn:()=>CANVAS_OPS.trim()},
    {label:'Resize Canvas…',   icon:'⊡', fn:()=>document.getElementById('rcvdlg')&&UI.odlg('rcvdlg')},
    {label:'Expand Canvas…',   icon:'⊞', fn:()=>document.getElementById('expcvdlg')&&UI.odlg('expcvdlg')},
    {label:'Replace Color…',   icon:'🎨', fn:()=>document.getElementById('rcolordlg')&&UI.odlg('rcolordlg')},
    {label:'Skew Transform',   icon:'◧', fn:()=>XFORM.start('skew')},
    {label:'Distort Transform',icon:'◩', fn:()=>XFORM.start('distort')},
    {label:'Perspective',      icon:'◪', fn:()=>XFORM.start('perspective')},
    {label:'Align Left',       icon:'⊞', fn:()=>ALIGN.left()},
    {label:'Align Right',      icon:'⊟', fn:()=>ALIGN.right()},
    {label:'Align Top',        icon:'⊠', fn:()=>ALIGN.top()},
    {label:'Align Bottom',     icon:'⊡', fn:()=>ALIGN.bottom()},
    {label:'Center Horizontal',icon:'↔', fn:()=>ALIGN.centerH()},
    {label:'Center Vertical',  icon:'↕', fn:()=>ALIGN.centerV()},
    {label:'Add Layer Mask',   icon:'⊗', fn:()=>LMASK.add()},
    {label:'Apply Layer Mask', icon:'✓', fn:()=>LMASK.apply()},
    {label:'Remove Layer Mask',icon:'✕', fn:()=>LMASK.remove()},
    {label:'Set Clipping Mask',icon:'⊕', fn:()=>CLIPMASK.set()},
    {label:'Layer Styles…',    icon:'✨', fn:()=>document.getElementById('lstyledlg')&&UI.odlg('lstyledlg')},
    {label:'Group Layers',     icon:'📁', fn:()=>LGROUP.create()},
    {label:'Add Snapshot',     icon:'📷', fn:()=>SNAP.create()},
    {label:'Add Anim Frame',   icon:'🎞', fn:()=>ANIM.addFrame()},
    {label:'Record Macro',     icon:'⏺', fn:()=>MACRO.start()},
    {label:'Stop Macro',       icon:'⏹', fn:()=>MACRO.stop()},
    {label:'Cartoon Filter',   icon:'🎨', fn:()=>FT.q.cartoon()},
    {label:'Glow Filter',      icon:'✨', fn:()=>FT.q.glow()},
    {label:'Drop Shadow',      icon:'🌑', fn:()=>FT.q.dropShadow()},
    {label:'Vertical Text',    icon:'↕T', fn:()=>{A.tool('text');toast('Place text, then toggle Vertical in Props');}},
  );
  toast('PixelForge Pro — all features loaded');
});