'use strict';
// ══════════════════════════════════════════════════════
//  VIEW
// ══════════════════════════════════════════════════════
const V = {

  //rotateView
  rotate(deg){
  S.viewRot += deg;

  // keep between 0-359
  S.viewRot = ((S.viewRot % 360) + 360) % 360;

  RL.draw();
  },

  resetRotation(){
  S.viewRot = 0;
  RL.draw();
  },
  fit() {
    const vpW=vp.clientWidth, vpH=vp.clientHeight;
    const z = Math.min((vpW-32)/S.W, (vpH-32)/S.H, 4);
    S.zoom = Math.max(0.05, z);
    S.panX = (vpW - S.W*S.zoom)/2;
    S.panY = (vpH - S.H*S.zoom)/2;
    this._syncZoom();
  },
  actual() { this.setZoom(1, vp.clientWidth/2, vp.clientHeight/2); },
  in_() { this.setZoom(S.zoom*1.25, vp.clientWidth/2, vp.clientHeight/2); },
  out_() { this.setZoom(S.zoom*0.8, vp.clientWidth/2, vp.clientHeight/2); },
  setZoom(z, mx, my) {
    const oz = S.zoom; z = cl(z, 0.02, 128);
    S.panX = mx - (mx - S.panX) * z/oz;
    S.panY = my - (my - S.panY) * z/oz;
    S.zoom = z; this._syncZoom();
  },
  _syncZoom() {
    const el = document.getElementById('zd');
    if (el) el.textContent = pct(S.zoom);
    RL.draw();
  },
  toggleGrid() { S.grid = !S.grid; toast('Grid '+(S.grid?'on':'off')); RL.draw(); },
  togglePixelGrid() { S.pixelGrid = !S.pixelGrid; RL.draw(); },
  toggleSnap() { S.snapGrid = !S.snapGrid; toast('Snap '+(S.snapGrid?'on':'off')); },
  toggleGuides() { S.showGuides = !S.showGuides; toast('Guides '+(S.showGuides?'on':'off')); RL.draw(); },
  addGuide(type, pos) { S.guides.push({type,pos}); RL.draw(); },
  clearGuides() { S.guides = []; RL.draw(); },
};

// ══════════════════════════════════════════════════════
//  UI MANAGER
// ══════════════════════════════════════════════════════
const UI = {
  // Panel tabs
  tab(id) {
    document.querySelectorAll('.rpc').forEach(p=>p.style.display='none');
    document.querySelectorAll('.rptb').forEach(b=>b.classList.toggle('on',b.dataset.tab===id));
    const el = document.getElementById('rp-'+id);
    if (el) el.style.display='block';
  },
  odlg(id) { document.getElementById(id)?.classList.add('open'); },
  cdlg(id) { document.getElementById(id)?.classList.remove('open'); },

  lylist() {
    const list = document.getElementById('lylist');
    if (!list) return;
    list.innerHTML = '';
    layers.forEach((l, i) => {
      const item = document.createElement('div');
      item.className = 'lyitem'+(i===ai?' on':'');
      item.title = l.name;
      const thumb = document.createElement('canvas');
      thumb.width=30; thumb.height=22;
      const tc = thumb.getContext('2d', {
      willReadFrequently: true
      });
      tc.imageSmoothingEnabled=false;
      // Checker bg
      tc.fillStyle='#ccc';
      for(let y=0;y<22;y+=4)for(let x=0;x<30;x+=4){if((x+y)%8===0)tc.fillRect(x,y,4,4);}
      tc.globalAlpha=l.op; tc.globalCompositeOperation=l.bm;
      tc.drawImage(l.el,0,0,30,22);
      const thWrap = document.createElement('div'); thWrap.className='lyth'; thWrap.appendChild(thumb);
      const badge = l.type!=='pixel' ? `<span class="ly-type ${l.type==='adjustment'?'adj':'grp'}">${l.type==='adjustment'?'ADJ':'GRP'}</span>` : '';
      const nameEl = document.createElement('span'); nameEl.className='lyname'; nameEl.textContent=l.name;
      nameEl.title='Double-click to rename';
      nameEl.addEventListener('dblclick',e=>{
        e.stopPropagation();
        const inp=document.createElement('input'); inp.className='lyni'; inp.value=l.name;
        inp.addEventListener('blur',()=>{l.name=inp.value||l.name;UI.lylist();});
        inp.addEventListener('keydown',e2=>{if(e2.key==='Enter'||e2.key==='Escape'){inp.blur();}});
        nameEl.replaceWith(inp); inp.focus(); inp.select();
      });
      const opEl = document.createElement('span'); opEl.className='lymt'; opEl.textContent=Math.round(l.op*100)+'%';
      const visBtn = document.createElement('button'); visBtn.className='lyvb';
      visBtn.textContent=l.vis?'👁':'🚫'; visBtn.title='Toggle visibility';
      visBtn.addEventListener('click',e=>{e.stopPropagation();LM.togVis(i);});
      item.appendChild(thWrap); item.appendChild(nameEl);
      //added
      // After nameEl creation, add mask/clip indicators
      if(l.mask && l.maskActive){
        const mi=document.createElement('span');
        mi.style.cssText='font-size:9px;background:#EAF3DE;color:#3B6D11;padding:1px 4px;border-radius:3px;flex-shrink:0';
        mi.textContent='MASK'; item.appendChild(mi);
      }
      if(l.clippingMask){
        const ci=document.createElement('span');
        ci.style.cssText='font-size:9px;background:#F0E8FF;color:#6B2FA0;padding:1px 4px;border-radius:3px;flex-shrink:0';
        ci.textContent='CLIP'; item.appendChild(ci);
      }
      if(l.groupId && S.groups[l.groupId]){
        const gi=document.createElement('span');
        gi.style.cssText='font-size:9px;color:var(--t3)';
        gi.textContent='📁 '+S.groups[l.groupId].name; item.appendChild(gi);
      }


      if(badge){const bd=document.createElement('div');bd.innerHTML=badge;item.appendChild(bd.firstChild);}
      item.appendChild(opEl); item.appendChild(visBtn);
      item.addEventListener('click',()=>LM.setAct(i));
      list.appendChild(item);
    });
    // Update opacity slider
    const l = AL();
    const opSl = document.getElementById('lyop'); if(opSl) opSl.value = Math.round((l?.op||1)*100);
    const opV  = document.getElementById('lyopv'); if(opV) opV.textContent = Math.round((l?.op||1)*100)+'%';
    const bmSel = document.getElementById('lybm'); if(bmSel&&l) bmSel.value = l.bm;
    R.resize();
    RL.draw();
    this.updateThumb();
    if(typeof SO !== 'undefined') SO.refreshPanel();
  },

  hilist() {
    const list = document.getElementById('hilist'); if(!list) return;
    list.innerHTML='';
    Hs.stack.forEach((s,i) => {
      const item=document.createElement('div'); item.className='hiitem'+(i===Hs.idx?' cur':i>Hs.idx?' fut':'');
      item.innerHTML=`<span class="hiico">✱</span>${s.desc}`;
      item.addEventListener('click',()=>{Hs.idx=i;Hs._load(s);});
      list.appendChild(item);
    });
    list.scrollTop=list.scrollHeight;
  },

  updateColors() {
    const pri=document.getElementById('cpri'), sec=document.getElementById('csec');
    if(pri) pri.style.background=S.pri; if(sec) sec.style.background=S.sec;
    const fhex=document.getElementById('fhex'), shex=document.getElementById('shex');
    if(fhex) fhex.value=S.pri; if(shex) shex.value=S.sec;
    // Update any color pickers
    const colPreview=document.getElementById('colPreview');
    if(colPreview) colPreview.style.background=S.pri;
  },

  updateSizeDisplay() {
    const el=document.getElementById('sbs'); if(el) el.textContent=S.W+'×'+S.H;
  },
  updateSelInfo() {
    const el=document.getElementById('selinfo');
    if(el){
      if(S.sel) el.textContent=`Sel: ${Math.round(S.sel.w)}×${Math.round(S.sel.h)} @ (${Math.round(S.sel.x)},${Math.round(S.sel.y)})`;
      else el.textContent='No selection';
    }
  },
  updateThumb() {
    // Composite all layers to thumbnail for history
  },

  showObjProps(obj) {
    const el=document.getElementById('obj-props'); if(!el) return;
    el.classList.add('show'); el.style.display='block';
    if(!obj){el.style.display='none';el.classList.remove('show');return;}
    document.getElementById('op-x').value=Math.round(obj.x);
    document.getElementById('op-y').value=Math.round(obj.y);
    document.getElementById('op-w').value=Math.round(obj.w);
    document.getElementById('op-h').value=Math.round(obj.h);
    document.getElementById('op-rot').value=Math.round(obj.rot);
    document.getElementById('op-op').value=Math.round(obj.op);
    const txtSection=document.getElementById('op-text-section');
    if(txtSection) txtSection.style.display=obj.type==='text'?'block':'none';
    if(obj.type==='text'){
      document.getElementById('op-txt-font').value=obj.data.font||'Arial';
      document.getElementById('op-txt-size').value=obj.data.size||24;
      document.getElementById('op-txt-color').value=obj.data.color||'#000000';
      document.getElementById('op-txt-shadow').checked=!!obj.data.shadow;
      document.getElementById('op-txt-stroke').checked=!!obj.data.stroke;
    }
    this.tab('props');
  },
  hideObjProps() {
    const el=document.getElementById('obj-props'); if(el){el.style.display='none';el.classList.remove('show');}
    this.tab('layers');
  },

  applyObjProps() {
    const o=OB.sel; if(!o) return;
    o.x=parseFloat(document.getElementById('op-x').value)||o.x;
    o.y=parseFloat(document.getElementById('op-y').value)||o.y;
    o.w=Math.max(4,parseFloat(document.getElementById('op-w').value)||o.w);
    o.h=Math.max(4,parseFloat(document.getElementById('op-h').value)||o.h);
    o.rot=parseFloat(document.getElementById('op-rot').value)||0;
    o.op=cl(parseFloat(document.getElementById('op-op').value)||100,0,100);
    if(o.type==='text'){
      o.data.font=document.getElementById('op-txt-font').value||'Arial';
      o.data.size=parseInt(document.getElementById('op-txt-size').value)||24;
      o.data.color=document.getElementById('op-txt-color').value;
      o.data.shadow=document.getElementById('op-txt-shadow').checked;
      o.data.stroke=document.getElementById('op-txt-stroke').checked;
    }
    OB.renderOverlay(); Hs.save('Object Properties');
  }
};

// ══════════════════════════════════════════════════════
//  CODE PANEL
// ══════════════════════════════════════════════════════
const CP = {
  toggle() { document.getElementById('cpanel').classList.toggle('open'); },
  open()  { document.getElementById('cpanel').classList.add('open'); },
  close() { document.getElementById('cpanel').classList.remove('open'); },
  setLang(lang) {
    S.codeLang=lang;
    document.querySelectorAll('.cptab').forEach(b=>b.classList.toggle('on',b.dataset.l===lang));
    this._updateExamples();
  },
  _updateExamples() {
    const ex = document.getElementById('cpex');
    if (!ex) return;
    if (S.codeLang==='js') {
      ex.innerHTML='<div class="cpline inf">// Examples:</div><div class="cpline">pixels, width, height, setPixel(x,y,r,g,b,a), getPixel(x,y)</div>';
    } else {
      ex.innerHTML='<div class="cpline inf"># Examples:</div><div class="cpline">arr (H×W×4 ndarray), width, height, set_pixel(x,y,r,g,b), get_pixel(x,y)</div>';
    }
  },
  log(msg, type='ok') {
    const out=document.getElementById('cpout'); if(!out) return;
    const ln=document.createElement('div'); ln.className='cpline '+type; ln.textContent=msg;
    out.appendChild(ln); out.scrollTop=out.scrollHeight;
  },
  clearLog() { const out=document.getElementById('cpout'); if(out) out.innerHTML=''; },
  run() {
    const code=document.getElementById('cped').value.trim(); if(!code) return;
    const l=AL(); if(!l){toast('No layer');return;}
    const tmp=document.createElement('canvas'); tmp.width=S.W; tmp.height=S.H;
    const tc=tmp.getContext('2d', {
      willReadFrequently: true
    });
    tc.drawImage(l.el,0,0);
    const b64=tmp.toDataURL('image/png');
    this.clearLog(); this.log('Running…','inf');
    if(S.codeLang==='js'){
      try{
        const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
        const id=l.x.getImageData(0,0,S.W,S.H);
        const pixels=id.data;
        const width=S.W, height=S.H;
        const getPixel=(x,y)=>{x=Math.floor(x);y=Math.floor(y);if(x<0||x>=width||y<0||y>=height)return{r:0,g:0,b:0,a:0};const i=(y*width+x)*4;return{r:pixels[i],g:pixels[i+1],b:pixels[i+2],a:pixels[i+3]};};
        const setPixel=(x,y,r,g,b,a=255)=>{x=Math.floor(x);y=Math.floor(y);if(x<0||x>=width||y<0||y>=height)return;const i=(y*width+x)*4;pixels[i]=r&255;pixels[i+1]=g&255;pixels[i+2]=b&255;pixels[i+3]=a&255;};
        const print=(...a)=>this.log(a.join(' '),'inf');
        const fn=new AsyncFunction('pixels','width','height','getPixel','setPixel','print',code);
        fn(pixels,width,height,getPixel,setPixel,print).then(()=>{
          l.pd(id); Hs.save('Code Run'); this.log('Done ✓','ok'); toast('Code executed');
        }).catch(e=>{this.log(e.message,'err');toast('JS error: '+e.message);});
      }catch(e){this.log(e.message,'err');}
    } else {
      fetch('/api/code/execute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,image:b64})})
      .then(r=>r.json()).then(d=>{
        if(d.error){this.log(d.error,'err');this.log(d.traceback||'','err');return;}
        const img=new Image();
        img.onload=()=>{l.x.clearRect(0,0,S.W,S.H);l.x.drawImage(img,0,0);Hs.save('Python Code');this.log(d.log||'Done ✓','ok');toast('Python executed');};
        img.src=d.image;
      }).catch(e=>this.log(e.message,'err'));
    }
  }
};

// ══════════════════════════════════════════════════════
//  SWATCHES & COLOR HARMONIES
// ══════════════════════════════════════════════════════
const SW = {
  add(hex) {
    if (!hex) hex=S.pri;
    if (!S.swatches.includes(hex)) S.swatches.push(hex);
    this.render(); this._saveLocal();
  },
  remove(hex) { S.swatches=S.swatches.filter(c=>c!==hex); this.render(); this._saveLocal(); },
  use(hex, which='pri') { if(which==='pri') A.setPri(hex); else A.setSec(hex); },
  _saveLocal() { try{localStorage.setItem('pf_swatches',JSON.stringify(S.swatches));}catch(e){} },
  _loadLocal() {
    try{const d=localStorage.getItem('pf_swatches');if(d){S.swatches=JSON.parse(d);this.render();}}catch(e){}
  },
  render() {
    const grid=document.getElementById('sw-grid'); if(!grid) return;
    grid.innerHTML='';
    S.swatches.forEach(hex=>{
      const el=document.createElement('div'); el.className='sw-item'; el.style.background=hex; el.title=hex;
      el.addEventListener('click',e=>{if(e.shiftKey)this.remove(hex);else this.use(hex,e.altKey?'sec':'pri');});
      grid.appendChild(el);
    });
    const add=document.createElement('div'); add.className='sw-add'; add.title='Add current color'; add.textContent='+';
    add.addEventListener('click',()=>this.add());
    grid.appendChild(add);
  },
  renderHarmonies(hex) {
    const grid=document.getElementById('harm-grid'); if(!grid) return;
    grid.innerHTML='';
    const {h,s,l} = hexToHSL(hex);
    const harmonies=[
      {name:'Complement',colors:[hex,hslToHex((h+180)%360,s,l)]},
      {name:'Analogous',colors:[hslToHex((h+30)%360,s,l),hex,hslToHex((h+330)%360,s,l)]},
      {name:'Triadic',colors:[hex,hslToHex((h+120)%360,s,l),hslToHex((h+240)%360,s,l)]},
      {name:'Split',colors:[hex,hslToHex((h+150)%360,s,l),hslToHex((h+210)%360,s,l)]},
    ];
    harmonies.forEach(({name,colors})=>{
      const wrap=document.createElement('div'); wrap.style.marginBottom='8px';
      const lbl=document.createElement('div'); lbl.style.cssText='font-size:10px;color:var(--t3);margin-bottom:3px'; lbl.textContent=name;
      wrap.appendChild(lbl);
      const row=document.createElement('div'); row.style.display='flex'; row.style.gap='3px';
      colors.forEach(c=>{
        const el=document.createElement('div'); el.className='harm-item'; el.style.background=c; el.title=c;
        el.addEventListener('click',()=>A.setPri(c));
        row.appendChild(el);
      });
      wrap.appendChild(row); grid.appendChild(wrap);
    });
  }
};

// ══════════════════════════════════════════════════════
//  COMMAND PALETTE
// ══════════════════════════════════════════════════════
const CMD = {
  commands: [],
  _selIdx: 0,
  init() {
    this.commands = [
      {label:'New Canvas', icon:'🗋', fn:()=>A.newFile(), kbd:'Ctrl+N'},
      {label:'Open Image', icon:'📂', fn:()=>A.openFile(), kbd:'Ctrl+O'},
      {label:'Save Project', icon:'💾', fn:()=>A.save(), kbd:'Ctrl+S'},
      {label:'Export Image', icon:'📤', fn:()=>A.showExport(), kbd:'Ctrl+E'},
      {label:'Copy to Clipboard', icon:'📋', fn:()=>A.copyToClipboard()},
      {label:'Import from URL', icon:'🔗', fn:()=>A.importFromURL()},
      {label:'Undo', icon:'↩', fn:()=>Hs.undo(), kbd:'Ctrl+Z'},
      {label:'Redo', icon:'↪', fn:()=>Hs.redo(), kbd:'Ctrl+Y'},
      {label:'Select All', icon:'⊡', fn:()=>SEL.all(), kbd:'Ctrl+A'},
      {label:'Deselect', icon:'⊠', fn:()=>SEL.none(), kbd:'Ctrl+D'},
      {label:'Invert Selection', icon:'⊞', fn:()=>SEL.invert()},
      {label:'Flatten Image', icon:'⊕', fn:()=>LM.flatten()},
      {label:'Merge Down', icon:'⊗', fn:()=>LM.mergeDown()},
      {label:'New Layer', icon:'➕', fn:()=>LM.add(), kbd:'Ctrl+Shift+N'},
      {label:'Duplicate Layer', icon:'⊟', fn:()=>LM.dup()},
      {label:'Delete Layer', icon:'🗑', fn:()=>LM.del()},
      {label:'Flip Horizontal', icon:'↔', fn:()=>TF.flipH()},
      {label:'Flip Vertical', icon:'↕', fn:()=>TF.flipV()},
      {label:'Rotate 90° CW', icon:'↻', fn:()=>TF.rotate90(1)},
      {label:'Rotate 90° CCW',icon:'↺', fn:()=>TF.rotate90(-1)},
      {label:'Zoom In',  icon:'🔍', fn:()=>V.in_(),  kbd:'Ctrl++'},
      {label:'Zoom Out', icon:'🔎', fn:()=>V.out_(), kbd:'Ctrl+-'},
      {label:'Fit to Screen', icon:'⊞', fn:()=>V.fit(), kbd:'Ctrl+0'},
      {label:'Toggle Grid', icon:'⊞', fn:()=>V.toggleGrid(), kbd:'Ctrl+G'},
      {label:'Toggle Dark Mode', icon:'🌙', fn:()=>A.toggleTheme()},
      {label:'Remove Background', icon:'✂', fn:()=>A.removeBg()},
      {label:'Free Transform', icon:'⊡', fn:()=>TF.startFreeTransform()},
      {label:'Grayscale', icon:'◧', fn:()=>FT.q.grayscale()},
      {label:'Invert Colors', icon:'◑', fn:()=>FT.q.invert()},
      {label:'Sepia', icon:'◐', fn:()=>FT.q.sepia()},
      {label:'Emboss', icon:'◉', fn:()=>FT.q.emboss()},
      {label:'Edge Detect', icon:'◎', fn:()=>FT.q.edge()},
      {label:'Sharpen', icon:'◈', fn:()=>FT.q.sharpenJS()},
      {label:'Film Grain', icon:'◌', fn:()=>A.showFilterDlg('filmgrain')},
      {label:'Glitch Effect', icon:'◊', fn:()=>A.showFilterDlg('glitch')},
      {label:'Halftone', icon:'●', fn:()=>A.showFilterDlg('halftone')},
      {label:'Pencil Sketch', icon:'✏', fn:()=>A.showFilterDlg('pencilsketch')},
      {label:'Tilt-Shift Blur', icon:'◈', fn:()=>A.showFilterDlg('tiltshift')},
      {label:'Color Balance', icon:'⚖', fn:()=>A.showFilterDlg('colorbalance')},
      {label:'Levels', icon:'▤', fn:()=>A.showFilterDlg('levels')},
      {label:'Motion Blur', icon:'◒', fn:()=>A.showFilterDlg('motionblur')},
      {label:'Duotone', icon:'◓', fn:()=>A.showFilterDlg('duotone')},
      {label:'Brush Tool', icon:'🖌', fn:()=>A.tool('brush'), kbd:'B'},
      {label:'Eraser Tool', icon:'⌫', fn:()=>A.tool('eraser'), kbd:'E'},
      {label:'Move Tool', icon:'✛', fn:()=>A.tool('move'), kbd:'V'},
      {label:'Text Tool', icon:'T', fn:()=>A.tool('text'), kbd:'T'},
      {label:'Crop Tool', icon:'⊡', fn:()=>A.tool('crop'), kbd:'C'},
      {label:'Eyedropper', icon:'💉', fn:()=>A.tool('eyedrop'), kbd:'I'},
      {label:'Clone Stamp', icon:'⊠', fn:()=>A.tool('clone')},
      {label:'Heal Brush', icon:'✚', fn:()=>A.tool('heal')},
      {label:'Smudge Tool', icon:'◉', fn:()=>A.tool('smudge')},
      {label:'Lasso Selection', icon:'⊻', fn:()=>A.tool('lasso'), kbd:'L'},
      {label:'Polygon Lasso', icon:'⬡', fn:()=>A.tool('poly_lasso')},
      {label:'Elliptical Select', icon:'◯', fn:()=>A.tool('ellipse_sel')},
      {label:'Add Color Swatch', icon:'🎨', fn:()=>SW.add()},
      {label:'Close Code Panel', icon:'✕', fn:()=>CP.close()},
      {label:'Open Code Panel', icon:'</>', fn:()=>CP.open(), kbd:"Ctrl+`"},
    ];
  },
  show() {
    const pal=document.getElementById('cmdpal'); if(!pal) return;
    pal.classList.add("show");
    const inp=document.getElementById('cmdinp'); if(inp){inp.value='';inp.focus();}
    this._selIdx=0; this.filter('');
  },
  hide() {
    document.getElementById('cmdpal')?.classList.remove('show');
  },
  filter(q) {
    q=q.toLowerCase();
    const list=document.getElementById('cmdlist'); if(!list) return;
    list.innerHTML='';
    const filtered=q ? this.commands.filter(c=>c.label.toLowerCase().includes(q)) : this.commands;
    filtered.slice(0,12).forEach((c,i)=>{
      const item=document.createElement('div');
      item.className='cmditem'+(i===this._selIdx?' sel':'');
      item.innerHTML=`<span class="cmd-icon">${c.icon||'○'}</span>${c.label}${c.kbd?`<span class="cmd-kd kbd">${c.kbd}</span>`:''}`;
      item.addEventListener('click',()=>{this.exec(c);});
      list.appendChild(item);
    });
    this._filtered=filtered;
  },
  exec(c) { this.hide(); if(c.fn) setTimeout(c.fn,50); },
  navigate(dir) {
    const items=document.querySelectorAll('.cmditem');
    this._selIdx=cl(this._selIdx+dir,0,items.length-1);
    items.forEach((el,i)=>el.classList.toggle('sel',i===this._selIdx));
    items[this._selIdx]?.scrollIntoView({block:'nearest'});
  },
  runSelected() {
    const f=this._filtered; if(!f||!f.length) return;
    this.exec(f[this._selIdx]||f[0]);
  }
};

// ══════════════════════════════════════════════════════
//  CURVES EDITOR
// ══════════════════════════════════════════════════════
const CRV = {
  pts: [[0,0],[128,128],[255,255]],
  dragging: null, canvas: null, ctx: null,
  init(cvs) {
    this.canvas=cvs; this.ctx=cvs.getContext('2d', {
      willReadFrequently: true
    });
    cvs.addEventListener('mousedown',e=>{
      const [x,y]=this._evPt(e);
      const pi = this.pts.findIndex(p=>Math.hypot(p[0]-x,p[1]-y)<12);
      if(pi>=0) this.dragging=pi;
      else { this.pts.push([x,y]); this.pts.sort((a,b)=>a[0]-b[0]); this.dragging=this.pts.findIndex(p=>p[0]===x&&p[1]===y); }
      this.render();
    });
    cvs.addEventListener('mousemove',e=>{
      if(this.dragging===null) return;
      const [x,y]=this._evPt(e);
      this.pts[this.dragging]=[cl(x,0,255),cl(y,0,255)];
      this.pts.sort((a,b)=>a[0]-b[0]);
      this.render();
    });
    cvs.addEventListener('mouseup',()=>this.dragging=null);
    cvs.addEventListener('dblclick',e=>{
      const [x,y]=this._evPt(e);
      const pi=this.pts.findIndex(p=>Math.hypot(p[0]-x,p[1]-y)<10);
      if(pi>0&&pi<this.pts.length-1){this.pts.splice(pi,1);this.render();}
    });
    this.render();
  },

  _evPt(e) {
    const r=this.canvas.getBoundingClientRect(), w=this.canvas.width, h=this.canvas.height;
    return [cl((e.clientX-r.left)/r.width*256,0,255), cl(256-(e.clientY-r.top)/r.height*256,0,255)];
  },
  render() {
    const c=this.ctx, w=this.canvas.width, h=this.canvas.height;
    c.clearRect(0,0,w,h);
    // Grid
    c.strokeStyle='rgba(100,110,130,.15)'; c.lineWidth=1;
    [0.25,0.5,0.75].forEach(t=>{
      c.beginPath(); c.moveTo(t*w,0); c.lineTo(t*w,h); c.moveTo(0,h-t*h); c.lineTo(w,h-t*h); c.stroke();
    });
    // Diagonal
    c.strokeStyle='rgba(150,160,180,.3)'; c.lineWidth=1;
    c.beginPath(); c.moveTo(0,h); c.lineTo(w,0); c.stroke();
    // Curve
    c.strokeStyle='#4A7CF7'; c.lineWidth=2;
    c.beginPath();
    const sorted=this.pts.slice().sort((a,b)=>a[0]-b[0]);
    sorted.forEach((p,i)=>{
      const x=p[0]/255*w, y=(1-p[1]/255)*h;
      i===0?c.moveTo(x,y):c.lineTo(x,y);
    });
    c.stroke();
    // Points
    sorted.forEach(p=>{
      c.beginPath(); c.arc(p[0]/255*w,(1-p[1]/255)*h,4,0,Math.PI*2);
      c.fillStyle='#4A7CF7'; c.fill(); c.strokeStyle='#fff'; c.lineWidth=1.5; c.stroke();
    });
  }
};

// ══════════════════════════════════════════════════════
//  MAIN APP CONTROLLER
// ══════════════════════════════════════════════════════
const A = {
  init() {
    OB.init();
    LM.add('Background', null);
    Hs.save('New Document');
    R.init(); V.fit();
    UI.updateColors(); UI.updateSizeDisplay();
    this.tool('brush');
    this._bindEvents();
    this._bindKeys();
    this._bindMenus();
    CMD.init();
    SW._loadLocal();
    SW.render();
    UI.lylist(); UI.hilist();
    UI.tab('layers');
    GE.init();
    this._bindRulers();
    setTimeout(()=>toast('PixelForge Pro ready! B=Brush V=Move T=Text L=Lasso Ctrl+P=Commands'),700);
    // Theme
    const saved = localStorage.getItem('pf_theme');
    if(saved) { S.theme=saved; document.documentElement.setAttribute('data-theme',saved); }
  },

  tool(name) {
    if(name!==S.tool){
      if(S.cropRgn){S.cropRgn=null;document.getElementById('cropbar').classList.remove('show');}
      if(['crop','polygon','poly_lasso'].includes(S.tool)) S.polyPts=[];
      if(S.tool==='lasso'){ S.lassoActive=false; S.lassoPts=[]; }
      OB.commitTextEdit();
      S.drawing=false;
    }
    S.tool=name;
    document.querySelectorAll('.tt').forEach(b=>b.classList.toggle('on',b.dataset.t===name));
    const cursors={move:'default',zoom:'zoom-in',eyedrop:'crosshair',text:'text',crop:'crosshair',
      pixel:'cell',select:'crosshair',lasso:'crosshair',wand:'crosshair',ellipse_sel:'crosshair',
      poly_lasso:'crosshair',clone:'crosshair',heal:'crosshair',smudge:'crosshair',spray:'crosshair',
      sponge:'crosshair',gradient:'crosshair'};
    vp.style.cursor=cursors[name]||'crosshair';
    const sbtEl=document.getElementById('sbt'); if(sbtEl) sbtEl.textContent=name.replace(/_/g,' ');
    // Show/hide text options
    const txtOpts=document.getElementById('txt-opts');
    if(txtOpts) txtOpts.classList.toggle('show', name==='text');
    // Show/hide brush options
    const brushOpts=document.getElementById('brush-opts');
    if(brushOpts) brushOpts.style.display=['brush','eraser','blur_brush','dodge','burn','clone','smudge','spray','heal','sponge'].includes(name)?'flex':'none';
    // Clone mode hint
    if(name==='clone') toast('Clone Stamp: Alt+Click to set source, then paint');
    if(name==='heal') toast('Healing Brush: Alt+Click to set source, then paint');
    if(name==='lasso') toast('Lasso: drag to select. Release to close.');
    if(name==='poly_lasso') toast('Polygon Lasso: click points. Double-click to close.');
    if(name==='move') toast('Move tool: click object to select, drag to move, handles to resize/rotate. Double-click text to edit.');
  },

  bsize(v){ S.bsz=v; const el=document.getElementById('bszv'); if(el) el.textContent=v; },
  bopac(v){ S.bop=v; const el=document.getElementById('bopv'); if(el) el.textContent=v+'%'; },
  bhard(v){ S.bhd=v; const el=document.getElementById('bhdv'); if(el) el.textContent=v+'%'; },
  setPri(h) { S.pri=h; UI.updateColors(); SW.renderHarmonies(h); },
  setSec(h) { S.sec=h; UI.updateColors(); },
  swapCol() { [S.pri,S.sec]=[S.sec,S.pri]; UI.updateColors(); },
  pickCol(w) { S.cpick=w; document.getElementById('cinput').click(); },
  oncp(v) { if(S.cpick==='pri') this.setPri(v); else this.setSec(v); },

  // ── FILE OPS ──
  newFile()  { UI.odlg('ndlg'); },
  openFile() { document.getElementById('finput').click(); },
  preset(w,h,el) {
    document.getElementById('nw').value=w; document.getElementById('nh').value=h;
    document.querySelectorAll('.szc').forEach(c=>c.classList.remove('on'));
    if(el) el.classList.add('on');
  },
  doNew() {
    const w=+document.getElementById('nw').value||800, h=+document.getElementById('nh').value||600;
    const bg=document.querySelector('input[name="bgt"]:checked')?.value||'white';
    S.W=w; S.H=h; S.sel=null; S.cropRgn=null; S.polyPts=[];
    layers=[]; ai=0; Hs.stack=[]; Hs.idx=-1; OB.list=[];
    document.getElementById('cropbar').classList.remove('show');
    LM.add('Background', bg==='white'?'#ffffff':bg==='black'?'#000000':null);
    Hs.save('New Document'); V.fit(); UI.updateSizeDisplay(); UI.cdlg('ndlg');
    toast(`New canvas: ${w}×${h}`);
  },
  onfl(inp) {
    const file=inp.files?inp.files[0]:inp; if(!file) return;
    const img=new Image();
    img.onload=()=>{
      S.W=img.width; S.H=img.height; S.sel=null; S.cropRgn=null;
      layers=[]; ai=0; Hs.stack=[]; Hs.idx=-1; OB.list=[];
      document.getElementById('cropbar').classList.remove('show');
      const l=new Layer(S.W,S.H,'Image'); l.x.drawImage(img,0,0);
      layers=[l]; Hs.save('Open Image'); UI.lylist(); V.fit(); UI.updateSizeDisplay();
      toast(`Opened: ${img.width}×${img.height}`);
    };
    img.src=URL.createObjectURL(file); inp.value='';
  },
  importFromURL() {
    const url=prompt('Enter image URL:'); if(!url) return;
    const img=new Image(); img.crossOrigin='anonymous';
    img.onload=()=>{
      const l=LM.add('From URL');
      l.x.drawImage(img,0,0,Math.min(img.width,S.W),Math.min(img.height,S.H));
      Hs.save('Import URL'); toast('Image imported from URL');
    };
    img.onerror=()=>toast('Failed to load image from URL');
    img.src=url;
  },

  // ── PROJECT SAVE/LOAD ──
  save() {
    OB.rasterizeAll();
    const data={v:3,W:S.W,H:S.H,swatches:S.swatches,layers:layers.map(l=>{
      const tmp=document.createElement('canvas'); tmp.width=l.w; tmp.height=l.h;
      const tc=tmp.getContext('2d', {
      willReadFrequently: true
      });
      tc.drawImage(l.el,0,0);
      return {name:l.name,vis:l.vis,op:l.op,bm:l.bm,type:l.type,adj:l.adj,png:tmp.toDataURL('image/png')};
    })};
    const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
    const name =
  'pixelforge_project' +
  new Date().toISOString().slice(0,19).replace(/[:T]/g,'-') +
  '.pfp';
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click();
    URL.revokeObjectURL(a.href); toast('Project saved');
  },
  openProject() { document.getElementById('pfpinput').click(); },
  onPfpLoad(inp) {
    const file=inp.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        const data=JSON.parse(e.target.result);
        S.W=data.W; S.H=data.H; S.sel=null; S.cropRgn=null;
        if(data.swatches){ S.swatches=data.swatches; SW.render(); }
        layers=[]; ai=0; OB.list=[];
        let loaded=0;
        data.layers.forEach((s,i)=>{
          const l=new Layer(s.w||S.W,s.h||S.H,s.name,s.type||'pixel');
          l.vis=s.vis; l.op=s.op; l.bm=s.bm; l.adj=s.adj||null;
          if(s.png){const img=new Image();img.onload=()=>{l.x.drawImage(img,0,0);loaded++;if(loaded===data.layers.length){Hs.save('Open Project');UI.lylist();V.fit();UI.updateSizeDisplay();toast('Project loaded');}};img.src=s.png;}
          layers.push(l);
        });
      }catch(err){toast('Failed to load project: '+err.message);}
    };
    reader.readAsText(file); inp.value='';
  },

  // ── CLIPBOARD ──
  async copyToClipboard() {
    try{
      const tmp=document.createElement('canvas'); tmp.width=S.W; tmp.height=S.H;
      const tc=tmp.getContext('2d', {
      willReadFrequently: true
      });
      layers.slice().reverse().forEach(l=>{if(!l.vis)return;tc.globalAlpha=l.op;tc.globalCompositeOperation=l.bm;tc.drawImage(l.el,0,0);});
      OB.list.forEach(o=>OB._drawObj(tc,o));
      tc.globalAlpha=1; tc.globalCompositeOperation='source-over';
      const blob=await new Promise(r=>tmp.toBlob(r,'image/png'));
      await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
      toast('Copied to clipboard ✓');
    }catch(e){toast('Clipboard copy failed: '+e.message);}
  },
  copy() {
    const l=AL(); if(!l) return;
    const region=S.sel||{x:0,y:0,w:S.W,h:S.H};
    const tmp=document.createElement('canvas'); tmp.width=region.w; tmp.height=region.h;
    const tc=tmp.getContext('2d', {
      willReadFrequently: true
    });
    tc.drawImage(l.el,-region.x,-region.y);
    S.clip={w:region.w,h:region.h,data:tmp.toDataURL()};
    toast(`Copied: ${region.w}×${region.h}`);
  },
  cut() {
    this.copy();
    const l=AL(); if(!l||l.lk) return;
    const region=S.sel||{x:0,y:0,w:S.W,h:S.H};
    l.x.clearRect(region.x,region.y,region.w,region.h);
    Hs.save('Cut');
  },
  paste() {
    if(!S.clip) return;
    const img=new Image(); img.onload=()=>{
      const obj=OB.add('image',10,10,S.clip.w,S.clip.h,{src:S.clip.data});
      obj.data._img=img; OB.renderOverlay();
      toast('Pasted as object — use Move tool to position');
    }; img.src=S.clip.data;
  },

  selAll() { SEL.all(); },
  desel()  { SEL.none(); },
  clearLayer() {
    const l=AL(); if(!l||l.lk) return;
    if(S.sel) l.x.clearRect(S.sel.x,S.sel.y,S.sel.w,S.sel.h);
    else l.x.clearRect(0,0,S.W,S.H);
    Hs.save('Clear');
  },
  fillSel() {
    const l=AL(); if(!l||l.lk) return;
    l.x.fillStyle=S.pri;
    if(S.sel) l.x.fillRect(S.sel.x,S.sel.y,S.sel.w,S.sel.h);
    else l.x.fillRect(0,0,S.W,S.H);
    Hs.save('Fill');
  },

  // ── EXPORT ──
  showExport() { UI.odlg('exdlg'); },
  doExport() {
    const fmt=document.getElementById('exfmt')?.value||'PNG';
    const quality=+(document.getElementById('exq')?.value||95)/100;
    OB.rasterizeAll();
    const tmp=document.createElement('canvas'); tmp.width=S.W; tmp.height=S.H;
    const tc=tmp.getContext('2d', {
      willReadFrequently: true
    });
    tc.imageSmoothingEnabled=false;
    layers.slice().reverse().forEach(l=>{if(!l.vis)return;tc.globalAlpha=l.op;tc.globalCompositeOperation=l.bm;tc.drawImage(l.el,0,0);});
    tc.globalAlpha=1; tc.globalCompositeOperation='source-over';
    const mimes={'PNG':'image/png','JPEG':'image/jpeg','WEBP':'image/webp'};
    const exts={'PNG':'png','JPEG':'jpg','WEBP':'webp','GIF':'gif','ICO':'ico','SVG':'svg',
    'PDF':'pdf'};
    const name =
  'pixelforge_' +
  new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    if(fmt==='SVG'){ const png=tmp.toDataURL('image/png'); const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${S.W}" height="${S.H}" viewBox="0 0 ${S.W} ${S.H}"> <image href="${png}" width="${S.W}" height="${S.H}" image-rendering="pixelated"/></svg>`; const blob=new Blob([svg],{type:'image/svg+xml'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name+'.svg'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);} else if(fmt==='PDF') { const { jsPDF } = window.jspdf; const pdf=new jsPDF({ orientation:S.W>S.H?'landscape':'portrait', unit:'px', format:[S.W,S.H] }); pdf.addImage( tmp.toDataURL('image/png'), 'PNG', 0, 0, S.W, S.H ); pdf.save(name+'.pdf');} else { const dataURL=tmp.toDataURL( mimes[fmt]||'image/png', quality ); const a=document.createElement('a'); a.href=dataURL; a.download=name+`.${exts[fmt]||'png'}`; a.click();}
    //const dataURL=tmp.toDataURL(mimes[fmt]||'image/png', quality);
    //const a=document.createElement('a'); a.href=dataURL; a.download=`pixelforge.${exts[fmt]||'png'}`; a.click();
    UI.cdlg('exdlg'); toast('Exported as '+fmt);
  },
  async exportAllLayers() {
    const ldata=layers.map(l=>{
      const tmp=document.createElement('canvas'); tmp.width=l.w; tmp.height=l.h;
      const tc=tmp.getContext('2d', {
      willReadFrequently: true
      });
      tc.drawImage(l.el,0,0);
      return {name:l.name, data:tmp.toDataURL('image/png')};
    });
    const res=await fetch('/api/export/layers_zip',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({layers:ldata})});
    const d=await res.json();
    if(d.error){toast('Error: '+d.error);return;}
    const a=document.createElement('a'); a.href=d.data; a.download='pixelforge-layers.zip'; a.click();
    toast('All layers exported as ZIP');
  },

  // ── FILTERS (dialog launchers) ──
  showFilterDlg(type) {
    document.querySelectorAll('.flt-panel').forEach(p=>p.style.display='none');
    const panel=document.getElementById('flt-'+type);
    if(panel) panel.style.display='block';
    UI.odlg('fltdlg');
  },
  applyFilter() {
    const type=document.querySelector('.flt-panel[style*="block"]')?.dataset.type || '';
    switch(type) {
      case 'brightness': FT.brightness(+document.getElementById('flt-bright').value/100+1); break;
      case 'contrast':   FT.contrast(+document.getElementById('flt-con').value/100+1); break;
      case 'saturation': FT.saturation(+document.getElementById('flt-sat').value/100+1); break;
      case 'hsl':        FT.hsl(+document.getElementById('flt-h').value,+document.getElementById('flt-s').value,+document.getElementById('flt-l').value); break;
      case 'blur':       FT.blur(+document.getElementById('flt-blur-r').value); break;
      case 'sharpen':    FT.sharpen(+document.getElementById('flt-sharp-f').value); break;
      case 'noise':      FT.noise(+document.getElementById('flt-noise-a').value); break;
      case 'vignette':   FT.q.vignette(+document.getElementById('flt-vig-s').value,+document.getElementById('flt-vig-soft').value); break;
      case 'pixelate':   FT.q.pixelate(+document.getElementById('flt-pix-s').value); break;
      case 'levels':     FT.q.levels(+document.getElementById('flt-lvl-bl').value,+document.getElementById('flt-lvl-wh').value,+document.getElementById('flt-lvl-gm').value); break;
      case 'colorbalance': FT.q.colorBalance(+document.getElementById('cb-sr').value,+document.getElementById('cb-sg').value,+document.getElementById('cb-sb').value,+document.getElementById('cb-mr').value,+document.getElementById('cb-mg').value,+document.getElementById('cb-mb').value,+document.getElementById('cb-hr').value,+document.getElementById('cb-hg').value,+document.getElementById('cb-hb').value); break;
      case 'motionblur': FT.q.motionBlur(+document.getElementById('flt-mb-d').value,+document.getElementById('flt-mb-a').value); break;
      case 'duotone':    FT.q.duotone(document.getElementById('flt-dt-c1').value,document.getElementById('flt-dt-c2').value); break;
      case 'filmgrain':  FT.q.filmGrain(+document.getElementById('flt-fg-a').value); break;
      case 'glitch':     FT.q.glitch(+document.getElementById('flt-gl-a').value); break;
      case 'halftone':   FT.q.halftone(+document.getElementById('flt-ht-sz').value); break;
      case 'pencilsketch': FT.q.pencilSketch(+document.getElementById('flt-ps-b').value); break;
      case 'tiltshift':  FT.q.tiltShift(+document.getElementById('flt-ts-fy').value,+document.getElementById('flt-ts-band').value,+document.getElementById('flt-ts-blur').value); break;
      case 'curves':     FT.curvesJS(CRV.pts); break;
      case 'exposure':   FT.exposure(+document.getElementById('flt-exp-e').value,+document.getElementById('flt-exp-s').value,+document.getElementById('flt-exp-h').value); break;
      case 'glow':       FT.q.glow(+document.getElementById('flt-gw-r').value, +document.getElementById('flt-gw-i').value/10); break;
      case 'dropshadow': FT.q.dropShadow(+document.getElementById('flt-ds-x').value,+document.getElementById('flt-ds-y').value,+document.getElementById('flt-ds-b').value,document.getElementById('flt-ds-c').value,+document.getElementById('flt-ds-op').value); break;
    }
    UI.cdlg('fltdlg');
  },




  // ── IMAGE OPS ──
  showResize() { UI.odlg('rsdlg'); document.getElementById('rs-w').value=S.W; document.getElementById('rs-h').value=S.H; },
  doResize() {
    const nw=+document.getElementById('rs-w').value, nh=+document.getElementById('rs-h').value;
    if(!nw||!nh) return;
    const tmp=document.createElement('canvas'); tmp.width=nw; tmp.height=nh;
    const tc=tmp.getContext('2d', {
      willReadFrequently: true
    });
    tc.imageSmoothingEnabled=true; tc.imageSmoothingQuality='high';
    tc.drawImage(layers[0]?.el||document.createElement('canvas'),0,0,nw,nh);
    // Resize all layers
    layers.forEach(l=>{
      const lt=document.createElement('canvas'); lt.width=nw; lt.height=nh;
      const lc=lt.getContext('2d', {
      willReadFrequently: true
      });
      lc.drawImage(l.el,0,0,nw,nh);
      l.el.width=nw; l.el.height=nh; l.w=nw; l.h=nh;
      l.x.drawImage(lt,0,0);
    });
    S.W=nw; S.H=nh; Hs.save('Scale Image'); V.fit(); UI.updateSizeDisplay(); UI.cdlg('rsdlg');
    toast(`Scaled to ${nw}×${nh}`);
  },
  showCrop() { A.tool('crop'); toast('Drag to select crop area, then press Enter or click Apply Crop'); },
  commitCrop() {
    const rgn=S.cropRgn; if(!rgn) return;
    const nw=Math.round(rgn.w), nh=Math.round(rgn.h);
    layers.forEach(l=>{
      const tmp=document.createElement('canvas'); tmp.width=nw; tmp.height=nh;
      const tc=tmp.getContext('2d', {
      willReadFrequently: true
      });
      tc.drawImage(l.el,-rgn.x,-rgn.y);
      l.el.width=nw; l.el.height=nh; l.w=nw; l.h=nh; l.x.drawImage(tmp,0,0);
    });
    S.W=nw; S.H=nh; S.cropRgn=null;
    document.getElementById('cropbar').classList.remove('show');
    Hs.save('Crop'); V.fit(); UI.updateSizeDisplay(); toast(`Cropped to ${nw}×${nh}`);
  },
  cancelCrop() { S.cropRgn=null; document.getElementById('cropbar').classList.remove('show'); },

  // ── REMOVE BG ──
  removeBg() {
    const l=AL(); if(!l){toast('No layer');return;}
    const tmp=document.createElement('canvas'); tmp.width=S.W; tmp.height=S.H;
    const tc=tmp.getContext('2d', {
      willReadFrequently: true
    });
    tc.drawImage(l.el,0,0);
    const b64=tmp.toDataURL('image/png');
    const btn=document.getElementById('rmbgBtn'); if(btn){btn.textContent='⏳ Removing…';btn.disabled=true;}
    fetch('/api/removebg',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:b64})})
    .then(r=>r.json()).then(d=>{
      if(d.error){toast('Error: '+d.error);return;}
      const img=new Image(); img.onload=()=>{l.x.clearRect(0,0,S.W,S.H);l.x.drawImage(img,0,0);Hs.save('Remove BG');toast('Background removed ✓');};
      img.src=d.image;
    }).catch(e=>toast('Server error: '+e.message))
    .finally(()=>{if(btn){btn.textContent='✦ Remove BG';btn.disabled=false;}});
  },

  toggleTheme() {
    S.theme = S.theme==='dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', S.theme);
    localStorage.setItem('pf_theme', S.theme);
    toast('Theme: '+S.theme);
  },

  // ── RULERS ──
  _bindRulers() {
    const rh=document.getElementById('rh'), rv=document.getElementById('rv');
    if(!rh||!rv) return;
    // Draw rulers on resize/scroll
    this._drawRulers();
  },
  _drawRulers() {
    const rhc=document.getElementById('rhc'), rvc=document.getElementById('rvc'); if(!rhc||!rvc) return;
    const rh=document.getElementById('rh'), rv=document.getElementById('rv');
    rhc.width=rh.clientWidth; rhc.height=16; rvc.width=16; rvc.height=rv.clientHeight;
    const rc=rhc.getContext('2d', {
      willReadFrequently: true
    });
    rc.clearRect(0,0,rhc.width,16);
    rc.fillStyle='var(--t3)'; rc.font='8px monospace';
    const step=this._rulerStep(); const startX=(-S.panX/S.zoom); const endX=startX+rhc.width/S.zoom;
    for(let x=Math.ceil(startX/step)*step; x<endX; x+=step){
      const sx=S.panX+x*S.zoom;
      rc.strokeStyle='var(--bdr)'; rc.lineWidth=1; rc.beginPath(); rc.moveTo(sx,8); rc.lineTo(sx,16); rc.stroke();
      if(sx>20) rc.fillText(x+'', sx+2, 8);
    }
    const vc=rvc.getContext('2d', {
      willReadFrequently: true
    });
    vc.clearRect(0,0,16,rvc.height);
    vc.fillStyle='var(--t3)'; vc.font='8px monospace';
    const startY=(-S.panY/S.zoom); const endY=startY+rvc.height/S.zoom;
    for(let y=Math.ceil(startY/step)*step; y<endY; y+=step){
      const sy=S.panY+y*S.zoom;
      vc.strokeStyle='var(--bdr)'; vc.lineWidth=1; vc.beginPath(); vc.moveTo(8,sy); vc.lineTo(16,sy); vc.stroke();
      vc.save(); vc.translate(8,sy); vc.rotate(-Math.PI/2); vc.fillText(y+'',2,0); vc.restore();
    }
  },
  _rulerStep() {
    const z=S.zoom;
    if(z>=8) return 10; if(z>=2) return 50; if(z>=0.5) return 100; return 200;
  },

  // ── BIND MENUS ──
  _bindMenus() {
    document.querySelectorAll('.mi').forEach(m=>{
      m.querySelector('.mbb')?.addEventListener('click',e=>{
        e.stopPropagation();
        const was=m.classList.contains('op');
        document.querySelectorAll('.mi.op').forEach(x=>x.classList.remove('op'));
        if(!was) m.classList.add('op');
      });
    });
    document.addEventListener('click',()=>document.querySelectorAll('.mi.op').forEach(m=>m.classList.remove('op')));
  },

  // ── BIND EVENTS ──
  _bindEvents() {
      // Add this to prevent canvas from intercepting crop bar clicks
    const cropbar = document.getElementById('cropbar');
    cropbar.addEventListener('mousedown', (e) => e.stopPropagation());
    cropbar.addEventListener('mouseup', (e) => e.stopPropagation());
    cropbar.addEventListener('click', (e) => e.stopPropagation());
    vp.addEventListener('dragover',e=>e.preventDefault());
    vp.addEventListener('drop',e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f&&f.type.startsWith('image/'))A.onfl({files:[f]});});
    vp.addEventListener('mousedown',e=>this._dn(e));
    vp.addEventListener('mousemove',e=>this._mv(e));
    vp.addEventListener('mouseup',e=>this._up(e));
    vp.addEventListener('mouseleave',()=>{S.drawing=false;R.cx=0;R.cy=0;const ci=document.getElementById('ci');if(ci)ci.style.opacity=0;});
    vp.addEventListener('wheel',e=>{
      e.preventDefault();
      const rect=vp.getBoundingClientRect();
      V.setZoom(cl(S.zoom*(e.deltaY<0?1.12:.89),.02,128),e.clientX-rect.left,e.clientY-rect.top);
      this._drawRulers();
    },{passive:false});
    vp.addEventListener('contextmenu',e=>{
      e.preventDefault();
      const cm=document.getElementById('ctx'); if(!cm) return;
      cm.style.display='block'; cm.style.left=e.clientX+'px'; cm.style.top=e.clientY+'px';
      const hide=()=>{cm.style.display='none';document.removeEventListener('click',hide);};
      setTimeout(()=>document.addEventListener('click',hide),10);
    });
    vp.addEventListener('dblclick',e=>{
      const [cx,cy]=s2c(e.clientX,e.clientY);
      if(S.tool==='text'){ DT.placeText(cx,cy); }
      else if(S.tool==='move'){
        const obj=OB.hitTest(cx,cy);
        if(obj&&obj.type==='text') OB.editText(obj.id);
      }
      else if(S.tool==='polygon'&&S.polyPts.length>=2){ DT.commitPolygon(); toast('Polygon drawn'); }
      else if(S.tool==='poly_lasso'&&S.polyPts.length>=2){ SEL.commitPolyLasso(); }
      else if(S.tool==='crop'&&S.cropRgn){ this.commitCrop(); }
    });
    // Text editor commit on outside click
    document.getElementById('txed')?.addEventListener('keydown',e=>{
      if(e.key==='Escape'){ OB.commitTextEdit(); }
    });
    document.getElementById('txed')?.addEventListener('blur',()=>{ OB.commitTextEdit(); });
    // Context menu hide
    document.addEventListener('click',e=>{
      if(!e.target.closest('#ctx')) { const cm=document.getElementById('ctx'); if(cm) cm.style.display='none'; }
      if(!e.target.closest('#cmdpal') && !e.target.closest('.mbb') && !e.target.closest('.ddi'))CMD.hide();
    
    });
    // Command palette input
    document.getElementById('cmdinp')?.addEventListener('input',e=>CMD.filter(e.target.value));
    document.getElementById('cmdinp')?.addEventListener('keydown',e=>{
      if(e.key==='ArrowDown'){e.preventDefault();CMD.navigate(1);}
      else if(e.key==='ArrowUp'){e.preventDefault();CMD.navigate(-1);}
      else if(e.key==='Enter'){e.preventDefault();CMD.runSelected();}
      else if(e.key==='Escape'){CMD.hide();}
    });
    // Layer controls
    document.getElementById('lyop')?.addEventListener('input',e=>{
      LM.setOpacity(+e.target.value);
      const v=document.getElementById('lyopv'); if(v) v.textContent=e.target.value+'%';
    });
    document.getElementById('lybm')?.addEventListener('change',e=>LM.setBlend(e.target.value));
  },

  _dn(e) {
    if(e.button!==0) return;
    const [cx,cy]=s2c(e.clientX,e.clientY);
    S.sx=e.clientX; S.sy=e.clientY; S.drawing=true; S.lx=cx; S.ly=cy;

    // ── MOVE TOOL: object interaction ──
    if(S.tool==='move') {
      // Alt+click = set clone source
      if(e.altKey&&(S.tool==='clone'||S.tool==='heal')){S.cloneSrc={x:cx,y:cy};S.cloneSet=true;toast('Source set at ('+Math.round(cx)+','+Math.round(cy)+')');S.drawing=false;return;}
      const handle=OB.hitHandle(cx,cy);
      if(handle){
        if(handle==='rot') OB.startDrag('rotate',handle,cx,cy);
        else OB.startDrag('resize',handle,cx,cy);
        return;
      }
      const obj=OB.hitTest(cx,cy);
      if(obj){ OB.selId=obj.id; OB.startDrag('move',null,cx,cy); OB.renderOverlay(); UI.showObjProps(obj); return; }
      else { OB.deselect(); }
      // Pan canvas if no object hit
      return;
    }

    // Alt+click for clone/heal source
    if(e.altKey&&(S.tool==='clone'||S.tool==='heal')){
      S.cloneSrc={x:cx,y:cy}; S.cloneSet=true;
      toast('Source: ('+Math.round(cx)+','+Math.round(cy)+')'); S.drawing=false; return;
    }

    switch(S.tool) {
      case 'brush': case 'eraser': DT.startPaint(cx,cy); break;
      case 'spray':  DT.spray(cx,cy); break;
      case 'blur_brush': DT.blurBrush(cx,cy); break;
      case 'dodge': DT.dodgeBurn(cx,cy,'dodge'); break;
      case 'burn':  DT.dodgeBurn(cx,cy,'burn'); break;
      case 'sponge': DT.sponge(cx,cy, !e.altKey); break;
      case 'fill':   DT.fill(cx,cy); S.drawing=false; break;
      case 'eyedrop': DT.eyedrop(cx,cy); S.drawing=false; break;
      case 'zoom': S.drawing=false; V.setZoom(S.zoom*(e.altKey?.82:1.22),e.clientX-vp.getBoundingClientRect().left,e.clientY-vp.getBoundingClientRect().top); break;
      case 'wand': DT.wand(cx,cy); S.drawing=false; break;
      case 'clone': DT.clone(cx,cy); break;
      case 'heal':  DT.heal(cx,cy); break;
      case 'smudge': break;
      case 'polygon': case 'poly_lasso': S.polyPts.push([cx,cy]); break;
      case 'lasso': S.lassoActive=true; S.lassoPts=[{x:cx,y:cy}]; break;
      case 'pixel': if(e.shiftKey) PI.addSel(cx,cy); else{PI.inspect(cx,cy);DT.ppx(cx,cy);} break;
      case 'crop': S.cropRgn=null; document.getElementById('cropbar').classList.remove('show'); break;
      case 'text': DT.placeText(cx,cy); S.drawing=false; break;
    }
  },

  _mv(e) {
    const rect=vp.getBoundingClientRect();
    const [cx,cy]=s2c(e.clientX,e.clientY);
    S.cx=e.clientX; S.cy=e.clientY;
    R.cx=e.clientX-rect.left; R.cy=e.clientY-rect.top;
    const ix=Math.floor(cx), iy=Math.floor(cy);
    const sbp=document.getElementById('sbp'); if(sbp) sbp.textContent=`${ix}, ${iy}`;
    const ci=document.getElementById('ci');
    if(ci&&ix>=0&&iy>=0&&ix<S.W&&iy<S.H){
      ci.style.opacity=1;
      if(S.tool==='pixel'){const p=AL()?.gpx(ix,iy)||{r:0,g:0,b:0,a:0};ci.textContent=`(${ix},${iy})  ${r2h(p.r,p.g,p.b)}  R:${p.r} G:${p.g} B:${p.b}`;PI.inspect(ix,iy);}
      else ci.textContent=`${ix}, ${iy}`;
    } else if(ci) ci.style.opacity=0;

    this._drawRulers();

    // Update cursor for move tool
    if(S.tool==='move'){
      if(!S.drawing){
        const handle=OB.hitHandle(cx,cy);
        const cursorMap={tl:'nwse-resize',tr:'nesw-resize',bl:'nesw-resize',br:'nwse-resize',tc:'ns-resize',bc:'ns-resize',ml:'ew-resize',mr:'ew-resize',rot:'crosshair'};
        vp.style.cursor=handle?cursorMap[handle]||'crosshair':OB.hitTest(cx,cy)?'move':'default';
      }
      if(S.drawing&&OB._drag){ OB.continueDrag(cx,cy); return; }
      if(!OB._drag&&S.drawing){ S.panX+=e.movementX; S.panY+=e.movementY; }
      return;
    }

    if(!S.drawing) return;
    switch(S.tool) {
      case 'brush': case 'eraser': DT.paintLine(S.lx,S.ly,cx,cy); break;
      case 'spray': DT.spray(cx,cy); break;
      case 'blur_brush': DT.blurBrush(cx,cy); break;
      case 'dodge': DT.dodgeBurn(cx,cy,'dodge'); break;
      case 'burn':  DT.dodgeBurn(cx,cy,'burn'); break;
      case 'sponge': DT.sponge(cx,cy); break;
      case 'clone': DT.clone(cx,cy); break;
      case 'heal':  DT.heal(cx,cy); break;
      case 'smudge': DT.smudge(cx,cy,S.lx,S.ly); break;
      case 'lasso': if(S.lassoActive) S.lassoPts.push({x:cx,y:cy}); break;
      case 'pixel': if(!e.shiftKey) DT.ppx(cx,cy); break;
      case 'pan': S.panX+=e.movementX; S.panY+=e.movementY; break;
    }
    S.lx=cx; S.ly=cy;
  },

  _up(e) {
    if(!S.drawing){ S.drawing=false; return; }
    S.drawing=false;
    const [cx,cy]=s2c(e.clientX,e.clientY);
    const [sx,sy]=s2c(S.sx,S.sy);

    if(OB._drag){ OB.endDrag(); return; }

    switch(S.tool) {
      case 'brush': case 'eraser': DT.endPaint(); break;
      case 'spray': Hs.save('Spray'); break;
      case 'blur_brush': case 'dodge': case 'burn': case 'sponge': Hs.save(S.tool); break;
      case 'clone': Hs.save('Clone Stamp'); break;
      case 'heal':  Hs.save('Heal'); break;
      case 'smudge': Hs.save('Smudge'); break;
      case 'rect': case 'ellipse': case 'line': case 'arrow': case 'star': DT.commitShape(sx,sy,cx,cy); break;
      case 'select': {
        const x=Math.min(sx,cx),y=Math.min(sy,cy),w=Math.abs(cx-sx),h=Math.abs(cy-sy);
        if(w>2&&h>2){S.sel={x,y,w,h};UI.updateSelInfo();toast(`Selection: ${Math.round(w)}×${Math.round(h)}`);}
        else{S.sel=null;UI.updateSelInfo();}
        break;
      }
      case 'ellipse_sel': {
        const x=Math.min(sx,cx),y=Math.min(sy,cy),w=Math.abs(cx-sx),h=Math.abs(cy-sy);
        if(w>2&&h>2){S.sel={x,y,w,h};UI.updateSelInfo();}
        break;
      }
      case 'lasso': SEL.commitLasso(); break;
      case 'crop': {
        const x=Math.min(sx,cx),y=Math.min(sy,cy),w=Math.abs(cx-sx),h=Math.abs(cy-sy);
        if(w>4&&h>4){S.cropRgn={x,y,w,h};document.getElementById('cropbar').classList.add('show');}
        break;
      }
      case 'gradient': DT.gradient(sx,sy,cx,cy); break;
    }
  },

  // ── KEYBOARD SHORTCUTS ──
  _bindKeys() {
    document.addEventListener('keydown',e=>{
      if(document.getElementById('txed')?.style.display==='block') return;
      if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
      const k=e.key.toLowerCase(), ctrl=e.ctrlKey||e.metaKey;
      if(ctrl){
        if(k==='z'){e.preventDefault();Hs.undo();}
        else if(k==='y'){e.preventDefault();Hs.redo();}
        else if(k==='n'){e.preventDefault();A.newFile();}
        else if(k==='o'){e.preventDefault();e.shiftKey?A.openProject():A.openFile();}
        else if(k==='s'){e.preventDefault();A.save();}
        else if(k==='e'){e.preventDefault();A.showExport();}
        else if(k==='c'){e.preventDefault();A.copy();}
        else if(k==='x'){e.preventDefault();A.cut();}
        else if(k==='v'){e.preventDefault();A.paste();}
        else if(k==='a'){e.preventDefault();SEL.all();}
        else if(k==='d'){e.preventDefault();SEL.none();}
        else if(k==='+'||k==='='){e.preventDefault();V.in_();}
        else if(k==='-'){e.preventDefault();V.out_();}
        else if(k==='0'){e.preventDefault();V.fit();}
        else if(k==='1'){e.preventDefault();V.actual();}
        else if(k==='g'){e.preventDefault();V.toggleGrid();}
        else if(k==='p'){e.preventDefault();CMD.show();}
        else if(k==='`'||k==="'"){e.preventDefault();CP.toggle();}
        else if(e.shiftKey&&k==='n'){e.preventDefault();LM.add();}
        return;
      }
      const toolMap={v:'move',m:'select',w:'wand',c:'crop',b:'brush',e:'eraser',
        g:'fill',t:'text',i:'eyedrop',z:'zoom',u:'rect',p:'polygon',l:'lasso',
        r:'rect','1':'dodge','2':'burn','3':'sponge','4':'clone','5':'heal','6':'smudge','7':'spray','8':'ellipse_sel','9':'poly_lasso'};
      if(toolMap[k]){e.preventDefault();A.tool(toolMap[k]);}
      else if(k==='x'){e.preventDefault();A.swapCol();}
      else if(k==='escape'){
        if(TF._tfState) TF.cancelTransform();
        else if(S.cropRgn) A.cancelCrop();
        else if(S.polyPts.length>0){S.polyPts=[];toast('Cancelled');}
        else if(S.lassoActive){S.lassoActive=false;S.lassoPts=[];}
        else if(OB.editId) OB.commitTextEdit();
        else{SEL.none();OB.deselect();CMD.hide();}
      }
      else if(k==='enter'||k==='return'){
        if(TF._tfState) TF.commitTransform();
        else if(S.tool==='crop'&&S.cropRgn) A.commitCrop();
        else if(S.tool==='polygon'&&S.polyPts.length>=2){DT.commitPolygon();toast('Polygon drawn');}
        else if(S.tool==='poly_lasso'&&S.polyPts.length>=2) SEL.commitPolyLasso();
      }
      else if(k==='delete'||k==='backspace'){
        if(OB.selId){ OB.del(); }
        else A.clearLayer();
      }
      else if(k==='['&&S.bsz>1){A.bsize(S.bsz-1);const el=document.getElementById('bsz');if(el)el.value=S.bsz;}
      else if(k===']'&&S.bsz<500){A.bsize(S.bsz+1);const el=document.getElementById('bsz');if(el)el.value=S.bsz;}
      else if(k==='f') V.fit();
    });
  }
};

function toast(msg) {
  const t=document.getElementById('toast');
  if(!t) return; t.textContent=msg; t.classList.add('show');
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),2800);
}

window.addEventListener('load',()=>{
  A.init();
  document.addEventListener('click',e=>{
    if(!e.target.closest('#ctx')) { const cm=document.getElementById('ctx'); if(cm) cm.style.display='none'; }
  });
});
