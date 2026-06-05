'use strict';
/* ══════════════════════════════════════════════════════════════
   editor-advanced.js
   Features: Pen/Vector, Smart Objects, Text on Path, Layer Bevel,
             Panorama, RAW, Face Retouch, HDR, Batch Processing
   Load AFTER editor-missing.js in editor.html
   ══════════════════════════════════════════════════════════════ */

// ══════════════════════════════════════════════════════════════
// 1.  PEN / VECTOR PATHS TOOL
// ══════════════════════════════════════════════════════════════
const PEN = {
  paths:[],        // [{id,anchors:[{x,y,cp1x,cp1y,cp2x,cp2y,smooth}],closed,stroke,strokeWidth,fill,name}]
  active:null,     // path currently being drawn
  selPath:-1,      // index of selected path
  selAnchor:-1,    // index of selected anchor in selPath
  selPart:'anchor',// 'anchor' | 'cp1' | 'cp2'
  _dragging:false,
  _dragStartX:0, _dragStartY:0,
  _curX:0, _curY:0,
  _pendingAnchor:null, // anchor added on mousedown, waiting for drag

  // ── bezier math ──────────────────────────────────────────
  _bezierPoint(a0,a1,t){
    // cubic bezier between two anchors using a0.cp2 and a1.cp1
    const mt=1-t;
    return {
      x: mt*mt*mt*a0.x + 3*mt*mt*t*a0.cp2x + 3*mt*t*t*a1.cp1x + t*t*t*a1.x,
      y: mt*mt*mt*a0.y + 3*mt*mt*t*a0.cp2y + 3*mt*t*t*a1.cp1y + t*t*t*a1.y
    };
  },
  _arcLength(a0,a1,steps=40){
    let len=0, prev=this._bezierPoint(a0,a1,0);
    for(let i=1;i<=steps;i++){
      const p=this._bezierPoint(a0,a1,i/steps);
      len+=Math.hypot(p.x-prev.x,p.y-prev.y); prev=p;
    }
    return len;
  },
  // Walk path and return {x,y,angle} at arc-distance `dist` from start
  _walkPath(path,dist){
    const a=path.anchors; if(a.length<2) return null;
    let rem=dist;
    const pairs=[];
    for(let i=0;i<a.length-1;i++) pairs.push([a[i],a[i+1]]);
    if(path.closed&&a.length>1) pairs.push([a[a.length-1],a[0]]);
    for(const [a0,a1] of pairs){
      const steps=60;
      let prev=this._bezierPoint(a0,a1,0);
      for(let i=1;i<=steps;i++){
        const t=i/steps, cur=this._bezierPoint(a0,a1,t);
        const seg=Math.hypot(cur.x-prev.x,cur.y-prev.y);
        if(rem<=seg){
          const angle=Math.atan2(cur.y-prev.y,cur.x-prev.x);
          const frac=rem/seg;
          return {x:prev.x+(cur.x-prev.x)*frac, y:prev.y+(cur.y-prev.y)*frac, angle};
        }
        rem-=seg; prev=cur;
      }
    }
    // past end — return last point
    const last=a[a.length-1];
    return {x:last.x,y:last.y,angle:0};
  },

  // ── state helpers ────────────────────────────────────────
  newPath(){
    const p={id:'path_'+(Date.now()),anchors:[],closed:false,
      stroke:S.pri,strokeWidth:S.sw,fill:'none',name:'Path '+(this.paths.length+1)};
    this.paths.push(p); this.active=p; this.selPath=this.paths.length-1;
    return p;
  },
  get spath(){ return this.paths[this.selPath]||null; },

  // ── mouse interactions ───────────────────────────────────
  onDown(cx,cy,e){
    this._curX=cx; this._curY=cy;
    if(S.tool==='path_select'){ this._selectDown(cx,cy); return; }
    // PEN DRAW mode
    if(!this.active) this.newPath();
    const p=this.active;
    // Check snap to first anchor (close path)
    if(p.anchors.length>1){
      const f=p.anchors[0];
      if(Math.hypot(cx-f.x,cy-f.y)<9/S.zoom){
        p.closed=true; this.active=null;
        Hs.save('Pen Path'); this._renderPathPanel(); OB.renderOverlay(); return;
      }
    }
    // Add new anchor (may become smooth on drag)
    const anchor={x:cx,y:cy,cp1x:cx,cp1y:cy,cp2x:cx,cp2y:cy,smooth:false};
    p.anchors.push(anchor); this._pendingAnchor=anchor; this._dragging=false;
    this._dragStartX=cx; this._dragStartY=cy;
    OB.renderOverlay();
  },
  onMove(cx,cy){
    this._curX=cx; this._curY=cy;
    if(S.tool==='path_select'){ this._selectMove(cx,cy); OB.renderOverlay(); return; }
    // Dragging to create bezier handles
    if(this._pendingAnchor){
      const dx=cx-this._dragStartX, dy=cy-this._dragStartY;
      if(Math.hypot(dx,dy)>3){
        this._dragging=true;
        this._pendingAnchor.cp2x=cx; this._pendingAnchor.cp2y=cy;
        this._pendingAnchor.cp1x=2*this._pendingAnchor.x-cx;
        this._pendingAnchor.cp1y=2*this._pendingAnchor.y-cy;
        this._pendingAnchor.smooth=true;
      }
    }
    OB.renderOverlay();
  },
  onUp(cx,cy){
    this._pendingAnchor=null; this._dragging=false;
    if(S.tool==='path_select'){ this._selectUp(); if(this.selPath>=0) Hs.save('Edit Path'); return; }
    OB.renderOverlay();
  },

  // ── path_select (subselection tool) ─────────────────────
  _selectDown(cx,cy){
    // First check if clicking on anchor or handle in selected path
    if(this.selPath>=0){
      const p=this.paths[this.selPath];
      const hit=7/S.zoom;
      for(let i=0;i<p.anchors.length;i++){
        const a=p.anchors[i];
        if(Math.hypot(cx-a.x,cy-a.y)<hit){ this.selAnchor=i; this.selPart='anchor'; this._dragging=true; return; }
        if(a.smooth){
          if(Math.hypot(cx-a.cp1x,cy-a.cp1y)<hit){ this.selAnchor=i; this.selPart='cp1'; this._dragging=true; return; }
          if(Math.hypot(cx-a.cp2x,cy-a.cp2y)<hit){ this.selAnchor=i; this.selPart='cp2'; this._dragging=true; return; }
        }
      }
    }
    // Click on different path
    for(let pi=this.paths.length-1;pi>=0;pi--){
      if(this._hitPath(cx,cy,this.paths[pi])){ this.selPath=pi; this.selAnchor=-1; OB.renderOverlay(); return; }
    }
    this.selPath=-1; this.selAnchor=-1; OB.renderOverlay();
  },
  _selectMove(cx,cy){
    if(!this._dragging||this.selPath<0||this.selAnchor<0) return;
    const a=this.paths[this.selPath].anchors[this.selAnchor];
    if(this.selPart==='anchor'){
      const dx=cx-a.x, dy=cy-a.y;
      a.x=cx; a.y=cy;
      a.cp1x+=dx; a.cp1y+=dy; a.cp2x+=dx; a.cp2y+=dy;
    } else if(this.selPart==='cp1'){
      a.cp1x=cx; a.cp1y=cy;
      if(a.smooth){ a.cp2x=2*a.x-cx; a.cp2y=2*a.y-cy; }
    } else if(this.selPart==='cp2'){
      a.cp2x=cx; a.cp2y=cy;
      if(a.smooth){ a.cp1x=2*a.x-cx; a.cp1y=2*a.y-cy; }
    }
  },
  _selectUp(){ this._dragging=false; },
  _hitPath(cx,cy,p){
    if(!p.anchors.length) return false;
    // Simple: check if near any segment
    const steps=30;
    for(let i=0;i<p.anchors.length-1;i++){
      const a0=p.anchors[i],a1=p.anchors[i+1];
      for(let t=0;t<=steps;t++){
        const pt=this._bezierPoint(a0,a1,t/steps);
        if(Math.hypot(cx-pt.x,cy-pt.y)<8/S.zoom) return true;
      }
    }
    return false;
  },

  // ── delete anchor ────────────────────────────────────────
  deleteAnchor(){
    if(this.selPath<0||this.selAnchor<0) return;
    const p=this.paths[this.selPath];
    p.anchors.splice(this.selAnchor,1);
    this.selAnchor=Math.min(this.selAnchor,p.anchors.length-1);
    Hs.save('Delete Anchor'); OB.renderOverlay();
  },
  toggleSmooth(){
    if(this.selPath<0||this.selAnchor<0) return;
    const a=this.paths[this.selPath].anchors[this.selAnchor];
    a.smooth=!a.smooth;
    if(!a.smooth){ a.cp1x=a.x; a.cp1y=a.y; a.cp2x=a.x; a.cp2y=a.y; }
    OB.renderOverlay();
  },

  // ── path operations ──────────────────────────────────────
  fillPath(idx){
    const p=this.paths[idx??this.selPath]; if(!p||!p.anchors.length) return;
    const l=AL(); if(!l||l.lk) return;
    l.x.save(); this._buildCtxPath(l.x,p);
    l.x.fillStyle=S.pri; l.x.fill('evenodd'); l.x.restore(); Hs.save('Fill Path');
  },
  strokePath(idx){
    const p=this.paths[idx??this.selPath]; if(!p||!p.anchors.length) return;
    const l=AL(); if(!l||l.lk) return;
    l.x.save(); this._buildCtxPath(l.x,p);
    l.x.strokeStyle=p.stroke||S.pri; l.x.lineWidth=p.strokeWidth||S.sw;
    l.x.stroke(); l.x.restore(); Hs.save('Stroke Path');
  },
  pathToSelection(){
    const p=this.spath; if(!p||!p.anchors.length) return;
    const xs=p.anchors.map(a=>a.x), ys=p.anchors.map(a=>a.y);
    S.sel={x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
    UI.updateSelInfo(); toast('Path converted to selection');
  },
  deletePath(idx){
    this.paths.splice(idx??this.selPath,1);
    this.selPath=Math.max(-1,Math.min(this.selPath,this.paths.length-1));
    this.active=null; OB.renderOverlay(); this._renderPathPanel();
  },
  commitPath(){
    if(this.active){ this.active=null; Hs.save('Pen Path'); OB.renderOverlay(); this._renderPathPanel(); }
  },

  // ── build ctx path ───────────────────────────────────────
  _buildCtxPath(ctx,p){
    const a=p.anchors; if(!a.length) return;
    ctx.beginPath(); ctx.moveTo(a[0].x,a[0].y);
    for(let i=1;i<a.length;i++)
      ctx.bezierCurveTo(a[i-1].cp2x,a[i-1].cp2y,a[i].cp1x,a[i].cp1y,a[i].x,a[i].y);
    if(p.closed&&a.length>1)
      ctx.bezierCurveTo(a[a.length-1].cp2x,a[a.length-1].cp2y,a[0].cp1x,a[0].cp1y,a[0].x,a[0].y);
    if(p.closed) ctx.closePath();
  },

  // ── render on OB overlay ─────────────────────────────────
  drawOnOverlay(ctx){
    this.paths.forEach((p,pi)=>{
      if(!p.anchors.length) return;
      ctx.save();
      this._buildCtxPath(ctx,p);
      // Fill preview
      if(p.fill&&p.fill!=='none'){ ctx.fillStyle=p.fill; ctx.globalAlpha=0.25; ctx.fill('evenodd'); ctx.globalAlpha=1; }
      // Stroke
      ctx.strokeStyle=pi===this.selPath?'#4A7CF7':p.stroke||S.pri;
      ctx.lineWidth=(p.strokeWidth||1)/S.zoom; ctx.stroke();
      // Anchors + handles (only for pen/path_select)
      if(['pen','path_select'].includes(S.tool)){
        const showHandles=pi===this.selPath;
        p.anchors.forEach((a,ai)=>{
          // Handle lines
          if(showHandles&&a.smooth){
            ctx.beginPath(); ctx.moveTo(a.cp1x,a.cp1y); ctx.lineTo(a.cp2x,a.cp2y);
            ctx.strokeStyle='rgba(74,124,247,.5)'; ctx.lineWidth=1/S.zoom; ctx.stroke();
            [[a.cp1x,a.cp1y],[a.cp2x,a.cp2y]].forEach(([hx,hy])=>{
              ctx.beginPath(); ctx.arc(hx,hy,3.5/S.zoom,0,Math.PI*2);
              ctx.fillStyle=ai===this.selAnchor&&showHandles?'#4A7CF7':'rgba(74,124,247,.8)';
              ctx.fill();
            });
          }
          // Anchor square
          const s=6/S.zoom;
          const isSel=showHandles&&ai===this.selAnchor&&this.selPart==='anchor';
          ctx.fillStyle=isSel?'#4A7CF7':'#fff';
          ctx.strokeStyle='#4A7CF7'; ctx.lineWidth=1.5/S.zoom;
          ctx.fillRect(a.x-s/2,a.y-s/2,s,s); ctx.strokeRect(a.x-s/2,a.y-s/2,s,s);
        });
      }
      ctx.restore();
    });
    // Live cursor line
    if(S.tool==='pen'&&this.active&&this.active.anchors.length){
      const last=this.active.anchors[this.active.anchors.length-1];
      ctx.save();
      ctx.beginPath(); ctx.moveTo(last.x,last.y);
      if(last.smooth) ctx.bezierCurveTo(last.cp2x,last.cp2y,this._curX,this._curY,this._curX,this._curY);
      else ctx.lineTo(this._curX,this._curY);
      ctx.strokeStyle='rgba(74,124,247,.6)'; ctx.lineWidth=1/S.zoom;
      ctx.setLineDash([4/S.zoom,4/S.zoom]); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
    }
  },

  // ── path panel ───────────────────────────────────────────
  _renderPathPanel(){
    const el=document.getElementById('path-list'); if(!el) return;
    el.innerHTML='';
    if(!this.paths.length){
      el.innerHTML='<div style="color:var(--t3);font-size:11px;padding:8px">No paths. Use the Pen tool to draw.</div>';
      return;
    }
    this.paths.forEach((p,i)=>{
      const d=document.createElement('div'); d.className='hiitem'+(i===this.selPath?' cur':'');
      d.innerHTML=`<span class="hiico">🖊</span><span style="flex:1;font-size:12px">${p.name}</span>
        <span style="display:flex;gap:3px;flex-shrink:0">
          <button class="lybtn" style="padding:0 5px;height:20px" title="Fill" onclick="PEN.fillPath(${i})">▪</button>
          <button class="lybtn" style="padding:0 5px;height:20px" title="Stroke" onclick="PEN.strokePath(${i})">◻</button>
          <button class="lybtn" style="padding:0 5px;height:20px" title="To Selection" onclick="PEN.selPath=${i};PEN.pathToSelection()">⊡</button>
          <button class="lybtn" style="padding:0 5px;height:20px;color:var(--red)" title="Delete" onclick="PEN.deletePath(${i})">✕</button>
        </span>`;
      d.addEventListener('click',()=>{ this.selPath=i; this._renderPathPanel(); OB.renderOverlay(); });
      el.appendChild(d);
    });
  },

  // ── serialization ─────────────────────────────────────────
  snap(){ return JSON.parse(JSON.stringify(this.paths)); },
  load(data){ this.paths=data||[]; this.active=null; this.selPath=-1; this._renderPathPanel(); OB.renderOverlay(); }
};

// ══════════════════════════════════════════════════════════════
// 2.  TEXT ON PATH
// ══════════════════════════════════════════════════════════════
const TOP = {
  // Attach text from current OB text object to selected PEN path
  attach(objId, pathIdx){
    const o=OB.list.find(ob=>ob.id===(objId||OB.selId));
    const p=PEN.paths[pathIdx??PEN.selPath];
    if(!o||o.type!=='text'){ toast('Select a text object first (text tool)'); return; }
    if(!p||p.anchors.length<2){ toast('Select a path with 2+ anchors first (path_select tool)'); return; }
    o.type='text_path';
    o.data.pathId=p.id;
    o.data.pathSnap=PEN.snap(); // snapshot path at attachment time
    Hs.save('Text on Path'); OB.renderOverlay();
    toast('Text attached to path — move/scale object to offset along path');
  },

  // Called from OB._drawText when type==='text_path'
  render(ctx,o){
    const d=o.data;
    const pathSnap=d.pathSnap; if(!pathSnap||!pathSnap.length) return;
    // Find the path by id
    let p=pathSnap.find(ps=>ps.id===d.pathId)||pathSnap[0];
    if(!p||p.anchors.length<2) return;
    ctx.save();
    ctx.font=`${d.italic?'italic ':''}${d.bold?'bold ':''}${d.size||24}px "${d.font||'Arial'}"`;
    ctx.fillStyle=d.color||S.pri;
    ctx.textBaseline='bottom';
    if(d.shadow){ ctx.shadowColor=d.shadowColor||'rgba(0,0,0,.6)'; ctx.shadowBlur=d.shadowBlur||4; ctx.shadowOffsetX=d.shadowOffsetX||2; ctx.shadowOffsetY=d.shadowOffsetY||2; }
    const text=d.text||''; let offset=o.x; // x of object used as path offset
    for(const ch of text){
      const pos=PEN._walkPath(p,offset);
      if(!pos) break;
      ctx.save();
      ctx.translate(pos.x,pos.y);
      ctx.rotate(pos.angle);
      ctx.fillText(ch,0,0);
      const cw=ctx.measureText(ch).width+(d.letterSpacing||0);
      ctx.restore();
      offset+=cw;
    }
    ctx.shadowColor='transparent'; ctx.shadowBlur=0;
    ctx.restore();
  },

  detach(objId){
    const o=OB.list.find(ob=>ob.id===(objId||OB.selId));
    if(!o||o.type!=='text_path') return;
    o.type='text'; delete o.data.pathId; delete o.data.pathSnap;
    Hs.save('Detach Text from Path'); OB.renderOverlay(); toast('Text detached from path');
  }
};

// Patch OB._drawObj to handle text_path
const _origDrawObj=OB._drawObj.bind(OB);
OB._drawObj=function(ctx,o){
  if(o.type==='text_path'){ ctx.save(); const cx=o.x+o.w/2,cy=o.y+o.h/2; ctx.translate(cx,cy); ctx.rotate(o.rot*Math.PI/180); ctx.translate(-cx,-cy); ctx.globalAlpha=o.op/100; TOP.render(ctx,o); ctx.restore(); return; }
  _origDrawObj(ctx,o);
};

// Patch OB.renderOverlay to also draw PEN paths
const _origRenderOverlay=OB.renderOverlay.bind(OB);
OB.renderOverlay=function(){
  _origRenderOverlay();
  const ctx=this.octx; if(!ctx||!layers.length) return;
  ctx.save();
  ctx.translate(Math.round(S.panX),Math.round(S.panY));
  ctx.scale(S.zoom,S.zoom);
  ctx.imageSmoothingEnabled=false;
  PEN.drawOnOverlay(ctx);
  ctx.restore();
};

// ══════════════════════════════════════════════════════════════
// 3.  SMART OBJECTS
// ══════════════════════════════════════════════════════════════
const SO = {
  // Convert active layer to Smart Object
  convert(){
    const l=AL(); if(!l) return;
    const orig=document.createElement('canvas'); orig.width=l.w; orig.height=l.h;
    orig.getContext('2d').drawImage(l.el,0,0);
    l.smartObj={ original:orig, transform:{tx:0,ty:0,scaleX:1,scaleY:1,rotation:0,skewX:0,skewY:0} };
    l.type='smart';
    Hs.save('Convert to Smart Object'); UI.lylist();
    toast('Smart Object ✓ — transforms are non-destructive. Double-click layer to edit contents.');
  },

  // Apply transform fields to display canvas
  _apply(l){
    const so=l.smartObj; if(!so) return;
    const t=so.transform, orig=so.original;
    l.x.clearRect(0,0,l.w,l.h);
    l.x.save();
    l.x.translate(l.w/2+t.tx, l.h/2+t.ty);
    l.x.rotate(t.rotation*Math.PI/180);
    l.x.scale(t.scaleX,t.scaleY);
    l.x.transform(1,t.skewY,t.skewX,1,0,0);
    l.x.drawImage(orig,-orig.width/2,-orig.height/2);
    l.x.restore();
  },

  setTransform(props){
    const l=AL(); if(!l||!l.smartObj) return;
    Object.assign(l.smartObj.transform,props);
    this._apply(l); Hs.save('Smart Object Transform');
  },

  resetTransform(){
    const l=AL(); if(!l||!l.smartObj) return;
    l.smartObj.transform={tx:0,ty:0,scaleX:1,scaleY:1,rotation:0,skewX:0,skewY:0};
    this._apply(l); Hs.save('Reset Smart Object Transform'); toast('Transform reset');
  },

  // Open edit modal for smart object contents
  editContents(layerIdx){
    const li=layerIdx??ai, l=layers[li]; if(!l||!l.smartObj) return;
    const modal=document.getElementById('so-modal'); if(!modal) return;
    const cv=document.getElementById('so-canvas');
    const orig=l.smartObj.original;
    cv.width=orig.width; cv.height=orig.height;
    cv.getContext('2d').drawImage(orig,0,0);
    modal.dataset.li=li; modal.classList.add('open');
    toast('Editing Smart Object contents — paint, then click Done');
  },

  // Replace contents with a new image file
  replaceContents(file){
    const l=AL(); if(!l||!l.smartObj) return;
    const img=new Image(); img.onload=()=>{
      const orig=l.smartObj.original;
      orig.width=img.width; orig.height=img.height;
      orig.getContext('2d').drawImage(img,0,0);
      this._apply(l); Hs.save('Replace Smart Object Contents'); toast('Contents replaced');
    };
    img.src=URL.createObjectURL(file);
  },

  // Commit edits from modal back to original
  commitEdit(){
    const modal=document.getElementById('so-modal'); if(!modal) return;
    const li=+modal.dataset.li, l=layers[li]; if(!l||!l.smartObj) return;
    const cv=document.getElementById('so-canvas');
    const orig=l.smartObj.original;
    orig.width=cv.width; orig.height=cv.height;
    orig.getContext('2d').drawImage(cv,0,0);
    this._apply(l); modal.classList.remove('open');
    Hs.save('Smart Object Edit'); toast('Smart Object updated');
  },

  // Rasterize back to regular layer
  rasterize(){
    const l=AL(); if(!l||!l.smartObj) return;
    l.smartObj=null; l.type='pixel';
    Hs.save('Rasterize Smart Object'); UI.lylist(); toast('Rasterized to regular layer');
  },

  // Panel UI
  refreshPanel(){
    const l=AL(); if(!l) return;
    const isSO=!!l.smartObj;
    document.getElementById('so-panel').style.display=isSO?'block':'none';
    document.getElementById('so-empty').style.display=isSO?'none':'block';
    if(!isSO) return;
    const t=l.smartObj.transform;
    document.getElementById('so-tx').value=t.tx;
    document.getElementById('so-ty').value=t.ty;
    document.getElementById('so-sx').value=t.scaleX;
    document.getElementById('so-sy').value=t.scaleY;
    document.getElementById('so-rot').value=t.rotation;
    document.getElementById('so-skx').value=t.skewX;
  }
};

// ══════════════════════════════════════════════════════════════
// 4.  LAYER BEVEL  (extends LSTYLE in editor-missing.js)
// ══════════════════════════════════════════════════════════════
const BEVEL = {
  apply(layerIdx, depth=5, highlightColor='#ffffff', shadowColor='#000000', angle=135){
    const l=layers[layerIdx??ai]; if(!l||l.lk) return;
    const id=l.gd(), W=id.width, H=id.height;
    const out=new Uint8ClampedArray(id.data);
    const rad=angle*Math.PI/180;
    const lx=Math.cos(rad), ly=Math.sin(rad);
    const [hr,hg,hb]=h2r(highlightColor);
    const [sr,sg,sb]=h2r(shadowColor);
    for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++){
      const i=(y*W+x)*4;
      if(id.data[i+3]<10) continue;
      const gx=(id.data[(y*W+x+1)*4+3]-id.data[(y*W+x-1)*4+3])/2;
      const gy=(id.data[((y+1)*W+x)*4+3]-id.data[((y-1)*W+x)*4+3])/2;
      const mag=Math.hypot(gx,gy); if(mag<8) continue;
      const dot=(gx/mag)*lx+(gy/mag)*ly;
      const f=Math.abs(dot)*(depth/10)*(mag/255)*0.8;
      if(dot>0){
        out[i]=cl(out[i]+hr*f,0,255); out[i+1]=cl(out[i+1]+hg*f,0,255); out[i+2]=cl(out[i+2]+hb*f,0,255);
      } else {
        out[i]=cl(out[i]-sr*f,0,255); out[i+1]=cl(out[i+1]-sg*f,0,255); out[i+2]=cl(out[i+2]-sb*f,0,255);
      }
    }
    l.pd(new ImageData(out,W,H)); Hs.save('Bevel'); toast('Bevel applied');
  }
};

// Also wire bevel into LSTYLE.render so it works as a live layer style
const _origLSTYLERender=LSTYLE.render.bind(LSTYLE);
LSTYLE.render=function(ctx,l){
  _origLSTYLERender(ctx,l);
  if(l.styles&&l.styles.bevel){
    // Bevel as live layer style: apply to composited result
    const b=l.styles.bevel;
    const id=l.x.getImageData(0,0,l.w||S.W,l.h||S.H);
    const W=id.width,H=id.height;
    const out=new Uint8ClampedArray(id.data);
    const rad=(b.angle||135)*Math.PI/180, lx=Math.cos(rad), ly=Math.sin(rad);
    const [hr,hg,hb]=h2r(b.highlight||'#ffffff');
    const [sr,sg,sb]=h2r(b.shadow||'#000000');
    for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++){
      const i=(y*W+x)*4; if(id.data[i+3]<10) continue;
      const gx=(id.data[(y*W+x+1)*4+3]-id.data[(y*W+x-1)*4+3])/2;
      const gy=(id.data[((y+1)*W+x)*4+3]-id.data[((y-1)*W+x)*4+3])/2;
      const mag=Math.hypot(gx,gy); if(mag<8) continue;
      const dot=(gx/mag)*lx+(gy/mag)*ly;
      const f=Math.abs(dot)*((b.depth||5)/10)*(mag/255)*0.6;
      if(dot>0){ out[i]=cl(out[i]+hr*f,0,255);out[i+1]=cl(out[i+1]+hg*f,0,255);out[i+2]=cl(out[i+2]+hb*f,0,255); }
      else { out[i]=cl(out[i]-sr*f,0,255);out[i+1]=cl(out[i+1]-sg*f,0,255);out[i+2]=cl(out[i+2]-sb*f,0,255); }
    }
    const tmp=document.createElement('canvas'); tmp.width=W; tmp.height=H;
    tmp.getContext('2d').putImageData(new ImageData(out,W,H),0,0);
    ctx.globalAlpha=l.op; ctx.globalCompositeOperation=l.bm; ctx.drawImage(tmp,0,0);
  }
};

// ══════════════════════════════════════════════════════════════
// 5.  BATCH PROCESSING
// ══════════════════════════════════════════════════════════════
const BATCH = {
  _files:[],
  _chain:[],  // [{filter, params}]

  setFiles(fileList){ this._files=[...fileList]; this._renderFileList(); },

  addStep(filter,params={}){
    this._chain.push({filter,params});
    this._renderChain();
  },
  removeStep(i){ this._chain.splice(i,1); this._renderChain(); },

  _renderFileList(){
    const el=document.getElementById('batch-files'); if(!el) return;
    el.innerHTML=this._files.map((f,i)=>`
      <div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--b2)">
        <span style="font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</span>
        <span style="font-size:10px;color:var(--t3)">${(f.size/1024).toFixed(0)}KB</span>
      </div>`).join('');
    document.getElementById('batch-count').textContent=`${this._files.length} files`;
  },

  _renderChain(){
    const el=document.getElementById('batch-chain'); if(!el) return;
    el.innerHTML=this._chain.length
      ? this._chain.map((s,i)=>`
          <div class="hiitem">
            <span class="hiico">⚙</span>${s.filter}
            <button class="lybtn" style="margin-left:auto;padding:0 6px;height:20px;color:var(--red)" onclick="BATCH.removeStep(${i})">✕</button>
          </div>`).join('')
      : '<div style="color:var(--t3);font-size:11px;padding:6px">No steps — add filters below</div>';
  },

  async run(){
    if(!this._files.length){ toast('Add files first'); return; }
    if(!this._chain.length){ toast('Add processing steps first'); return; }
    const statusEl=document.getElementById('batch-status');
    const results=[];
    for(let i=0;i<this._files.length;i++){
      if(statusEl) statusEl.textContent=`Processing ${i+1}/${this._files.length}…`;
      const b64=await this._fileToB64(this._files[i]);
      let current=b64;
      for(const step of this._chain){
        const res=await fetch(`/api/filter/${step.filter}`,{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({image:current,...step.params})
        }).then(r=>r.json());
        if(res.image) current=res.image;
        else { toast(`Step ${step.filter} failed: ${res.error}`); }
      }
      results.push({name:this._files[i].name,data:current});
    }
    // Bundle as ZIP
    if(statusEl) statusEl.textContent='Creating ZIP…';
    const res=await fetch('/api/batch/export',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({files:results})
    }).then(r=>r.json());
    if(res.data){
      const a=document.createElement('a'); a.href=res.data; a.download='batch_output.zip'; a.click();
      toast(`Batch done: ${results.length} files exported`);
    }
    if(statusEl) statusEl.textContent='Done ✓';
  },

  _fileToB64(file){
    return new Promise((res,rej)=>{
      const r=new FileReader(); r.onload=e=>res(e.target.result); r.onerror=rej; r.readAsDataURL(file);
    });
  }
};

// ══════════════════════════════════════════════════════════════
// 6.  HDR MERGE
// ══════════════════════════════════════════════════════════════
const HDR = {
  _files:[],
  _exposures:[],

  setFiles(fl){
    this._files=[...fl];
    this._exposures=this._files.map((_,i)=>Math.pow(2,i-(Math.floor(this._files.length/2))));
    this._renderList();
  },

  _renderList(){
    const el=document.getElementById('hdr-files'); if(!el) return;
    el.innerHTML=this._files.map((f,i)=>`
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</span>
        <label style="font-size:10px;color:var(--t3)">EV</label>
        <input type="number" class="dinp" step="0.5" value="${this._exposures[i]}" style="width:55px"
          oninput="HDR._exposures[${i}]=+this.value">
      </div>`).join('');
  },

  async merge(method='mertens'){
    if(this._files.length<2){ toast('Need at least 2 images for HDR'); return; }
    const btn=document.getElementById('hdr-merge-btn');
    const autores = document.getElementById('autors');
    if(btn){ btn.textContent='⏳ Merging…'; btn.disabled=true; }
    const images=await Promise.all(this._files.map(f=>new Promise((res,rej)=>{
      const r=new FileReader(); r.onload=e=>res(e.target.result); r.onerror=rej; r.readAsDataURL(f);
    })));
    console.log(images);
    const res=await fetch('/api/hdr',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({images,exposures:this._exposures,method,autoresize: autores.checked})
    }).then(r=>r.json());
    if(btn){ btn.textContent='Merge'; btn.disabled=false; }
    if(res.error){ toast('HDR error: '+res.error); return; }
    // Load result as new layer
    const img=new Image(); img.onload=()=>{
      const l=LM.add('HDR Result');
      l.x.drawImage(img,0,0,Math.min(img.width,S.W),Math.min(img.height,S.H));
      Hs.save('HDR Merge'); toast('HDR merge complete ✓'); UI.cdlg('hdrdlg');
    };
    img.src=res.image;
  }
};

// ══════════════════════════════════════════════════════════════
// 7.  PANORAMA STITCHING
// ══════════════════════════════════════════════════════════════
const PANO = {
  _files:[],

  setFiles(fl){ this._files=[...fl]; document.getElementById('pano-count').textContent=`${fl.length} images`; },

  async stitch(){
    if(this._files.length<2){ toast('Need at least 2 images'); return; }
    const btn=document.getElementById('pano-stitch-btn');
    if(btn){ btn.textContent='⏳ Stitching…'; btn.disabled=true; }
    const images=await Promise.all(this._files.map(f=>new Promise((res,rej)=>{
      const r=new FileReader(); r.onload=e=>res(e.target.result); r.onerror=rej; r.readAsDataURL(f);
    })));
    const res=await fetch('/api/panorama',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({images})
    }).then(r=>r.json());
    if(btn){ btn.textContent='Stitch Panorama'; btn.disabled=false; }
    if(res.error){ toast('Panorama error: '+res.error); return; }
    const img=new Image(); img.onload=()=>{
      S.W=img.width; S.H=img.height;
      layers.forEach(l=>{ l.el.width=S.W; l.el.height=S.H; l.w=S.W; l.h=S.H; });
      const l=LM.add('Panorama'); l.x.drawImage(img,0,0);
      Hs.save('Panorama Stitch'); V.fit(); UI.updateSizeDisplay();
      toast(`Panorama: ${img.width}×${img.height} ✓`); UI.cdlg('panodlg');
    };
    img.src=res.image;
  }
};

// ══════════════════════════════════════════════════════════════
// 8.  RAW FILE I/O
// ══════════════════════════════════════════════════════════════
const RAWIO = {
  _file:null,
  _b64:null,

  setFile(f){
    this._file=f;
    document.getElementById('raw-filename').textContent=f.name;
    const r=new FileReader(); r.onload=e=>{ this._b64=e.target.result; }; r.readAsDataURL(f);
  },

  async develop(){
    if(!this._b64){ toast('Load a RAW file first'); return; }
    const btn=document.getElementById('raw-dev-btn');
    if(btn){ btn.textContent='⏳ Developing…'; btn.disabled=true; }
    const params={
      exposure:+document.getElementById('raw-exp').value,
      brightness:+document.getElementById('raw-bright').value,
      contrast:+document.getElementById('raw-con').value,
      use_camera_wb:document.getElementById('raw-camwb').checked,
      no_auto_bright:document.getElementById('raw-noab').checked
    };
    const res=await fetch('/api/raw/open',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({file:this._b64,filename:this._file?.name,...params})
    }).then(r=>r.json());
    if(btn){ btn.textContent='Develop RAW'; btn.disabled=false; }
    if(res.error){ toast('RAW error: '+res.error); return; }
    const img=new Image(); img.onload=()=>{
      S.W=img.width; S.H=img.height;
      const l=LM.add(this._file?.name||'RAW');
      l.x.drawImage(img,0,0); Hs.save('Open RAW');
      V.fit(); UI.updateSizeDisplay(); toast('RAW developed ✓'); UI.cdlg('rawdlg');
    };
    img.src=res.image;
  }
};

// ══════════════════════════════════════════════════════════════
// 9.  FACE RETOUCH
// ══════════════════════════════════════════════════════════════
const FACE = {
  async retouch(){
    const l=AL(); if(!l){ toast('No layer'); return; }
    const btn=document.getElementById('face-btn');
    if(btn){ btn.textContent='⏳ Processing…'; btn.disabled=true; }
    const tmp=document.createElement('canvas'); tmp.width=S.W; tmp.height=S.H;
    tmp.getContext('2d').drawImage(l.el,0,0);
    const params={
      smooth:+document.getElementById('face-smooth').value,
      brighten:+document.getElementById('face-bright').value,
      sharpen_eyes:document.getElementById('face-eyes').checked,
      teeth_whiten:document.getElementById('face-teeth').checked,
    };
    const res=await fetch('/api/ai/face_retouch',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({image:tmp.toDataURL('image/png'),...params})
    }).then(r=>r.json());
    if(btn){ btn.textContent='Apply Face Retouch'; btn.disabled=false; }
    if(res.error){ toast('Face retouch error: '+res.error); return; }
    const img=new Image(); img.onload=()=>{ l.x.clearRect(0,0,S.W,S.H); l.x.drawImage(img,0,0); Hs.save('Face Retouch'); toast('Face retouch done ✓'); };
    img.src=res.image;
  }
};

// ══════════════════════════════════════════════════════════════
// WIRE: tool switching, keyboard, A._dn/_mv/_up patches
// ══════════════════════════════════════════════════════════════
const _origATool2=A.tool.bind(A);
A.tool=function(name){
  _origATool2(name);
  if(name==='pen'){ vp.style.cursor='crosshair'; PEN.active=null; }
  if(name==='path_select') vp.style.cursor='default';
};

const _origDn2=A._dn.bind(A);
A._dn=function(e){
  if(['pen','path_select'].includes(S.tool)){
    const [cx,cy]=s2c(e.clientX,e.clientY);
    PEN.onDown(cx,cy,e);
    S.drawing=true; return;
  }
  _origDn2(e);
};
const _origMv2=A._mv.bind(A);
A._mv=function(e){
  if(['pen','path_select'].includes(S.tool)){
    const [cx,cy]=s2c(e.clientX,e.clientY);
    PEN.onMove(cx,cy); return;
  }
  _origMv2(e);
};
const _origUp2=A._up.bind(A);
A._up=function(e){
  if(['pen','path_select'].includes(S.tool)){
    const [cx,cy]=s2c(e.clientX,e.clientY);
    PEN.onUp(cx,cy); S.drawing=false; return;
  }
  _origUp2(e);
};

// Keyboard additions
document.addEventListener('keydown',e=>{
  if(['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
  // Pen: Enter = commit path, Delete = delete anchor/path
  if(e.key==='Enter'&&S.tool==='pen'){ PEN.commitPath(); }
  if((e.key==='Delete'||e.key==='Backspace')&&S.tool==='path_select'){
    if(PEN.selAnchor>=0) PEN.deleteAnchor();
    else if(PEN.selPath>=0) PEN.deletePath();
  }
  // Alt+click in path_select toggles smooth (handled in onDown checking e.altKey)
  // P = pen, A = path select
  if(!e.ctrlKey&&e.key==='p') A.tool('pen');
  if(!e.ctrlKey&&e.key==='a'&&S.tool==='pen') A.tool('path_select');
});

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════
window.addEventListener('load',()=>{
  // Patch Hs.save to also snap PEN paths
  const _origHSave=Hs.save.bind(Hs);
  Hs.save=function(desc){
    _origHSave(desc);
    if(Hs.stack[Hs.idx]) Hs.stack[Hs.idx].penPaths=PEN.snap();
  };
  const _origHLoad=Hs._load.bind(Hs);
  Hs._load=function(snap){
    _origHLoad(snap);
    if(snap.penPaths) PEN.load(snap.penPaths);
  };

  // Patch layer list double-click for Smart Objects
  document.getElementById('lylist')?.addEventListener('dblclick',e=>{
    const item=e.target.closest('.lyitem'); if(!item) return;
    const idx=[...item.parentElement.children].indexOf(item);
    const l=layers[idx]; if(!l) return;
    if(l.smartObj) SO.editContents(idx);
    else if(l.type==='smart') SO.editContents(idx);
  });

  // SO editor mini-canvas paint support
  const soCanvas=document.getElementById('so-canvas');
  if(soCanvas){
    let soDrawing=false;
    soCanvas.addEventListener('mousedown',e=>{ soDrawing=true; soPaint(e); });
    soCanvas.addEventListener('mousemove',e=>{ if(soDrawing) soPaint(e); });
    soCanvas.addEventListener('mouseup',()=>soDrawing=false);
    function soPaint(e){
      const r=soCanvas.getBoundingClientRect();
      const x=(e.clientX-r.left)/r.width*soCanvas.width;
      const y=(e.clientY-r.top)/r.height*soCanvas.height;
      const ctx=soCanvas.getContext('2d');
      ctx.fillStyle=S.pri; ctx.beginPath(); ctx.arc(x,y,S.bsz/2,0,Math.PI*2); ctx.fill();
    }
  }

  // Extend CMD palette with new commands
  CMD.commands.push(
    {label:'Pen Tool',         icon:'🖊', fn:()=>A.tool('pen'), kbd:'P'},
    {label:'Path Select',      icon:'◈', fn:()=>A.tool('path_select'), kbd:'A'},
    {label:'Fill Path',        icon:'▪', fn:()=>PEN.fillPath()},
    {label:'Stroke Path',      icon:'◻', fn:()=>PEN.strokePath()},
    {label:'Path → Selection', icon:'⊡', fn:()=>PEN.pathToSelection()},
    {label:'Delete Path',      icon:'✕', fn:()=>PEN.deletePath()},
    {label:'Text on Path',     icon:'🖊T',fn:()=>TOP.attach()},
    {label:'Detach Text from Path',icon:'T',fn:()=>TOP.detach()},
    {label:'Convert to Smart Object',icon:'📦',fn:()=>SO.convert()},
    {label:'Rasterize Smart Object', icon:'⬇',fn:()=>SO.rasterize()},
    {label:'Reset Smart Transform',  icon:'↺',fn:()=>SO.resetTransform()},
    {label:'Apply Bevel',      icon:'◨', fn:()=>UI.odlg('beveldlg')},
    {label:'Panorama Stitch',  icon:'🌅', fn:()=>UI.odlg('panodlg')},
    {label:'Open RAW File',    icon:'📷', fn:()=>UI.odlg('rawdlg')},
    {label:'Face Retouch',     icon:'👤', fn:()=>UI.odlg('facedlg')},
    {label:'Batch Processing', icon:'⚡', fn:()=>UI.odlg('batchdlg')},
    {label:'HDR Merge',        icon:'🌄', fn:()=>UI.odlg('hdrdlg')},
  );

  // Init path panel
  PEN._renderPathPanel();
  SO.refreshPanel();

  toast('Advanced features loaded — Pen (P), Smart Objects, HDR, RAW, Panorama ready');
});