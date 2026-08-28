
(() => {
  'use strict';

  let state = { file:null, preview:null, working:false, objectUrl:null };

  function apiBase() {
    try {
      const stored=localStorage.getItem('orynmotion_tables');
      const activeId=localStorage.getItem('orynmotion_active_table');
      if(stored&&activeId){
        const data=JSON.parse(stored);
        const t=(data.tables||[]).find(x=>x.id===activeId);
        if(t&&!t.isCurrent&&t.url)return t.url.replace(/\/$/,'');
      }
    } catch(_) {}
    return '';
  }

  function qs(id){ return document.getElementById(id); }
  function status(text,error=false){
    const e=qs('oryn-forge-status'); if(!e)return;
    e.textContent=text||''; e.classList.toggle('oryn-forge-error',!!error);
  }
  function setWorking(v){
    state.working=v;
    document.querySelectorAll('#oryn-forge-modal button').forEach(b=>b.disabled=v);
    const g=qs('oryn-forge-generate'); if(g)g.textContent=v?'Generating…':'Generate Clean Route';
  }

  async function generate(){
    if(!state.file)return status('Choose SVG, DXF, PNG, JPG or THR first.',true);
    setWorking(true);status('');
    try{
      const fd=new FormData();
      fd.append('file',state.file);
      for(const id of ['threshold','fit','smoothing','simplify','rotation_deg','offset_x','offset_y','max_bridge']){
        const el=qs('oryn-forge-'+id); if(el)fd.append(id,el.value);
      }
      fd.append('invert',String(!!qs('oryn-forge-invert')?.checked));
      fd.append('start_mode',qs('oryn-forge-start_mode')?.value||'auto');

      const r=await fetch(apiBase()+'/api/v2/pattern-generator/preview',{method:'POST',body:fd});
      const raw=await r.text(); let data={};
      try{data=raw?JSON.parse(raw):{}}catch(_){data={detail:raw}}
      if(!r.ok)throw new Error(data.detail||`HTTP ${r.status}`);
      state.preview=data;
      renderRoute();
      renderStats();
      status('Clean THR route generated. Review the exact ball path before saving.');
      qs('oryn-forge-save').disabled=false;
    }catch(e){status(e.message||String(e),true)}
    finally{setWorking(false)}
  }

  async function save(){
    if(!state.preview)return;
    const name=(qs('oryn-forge-name')?.value||'').trim();
    if(!name)return status('Enter a pattern name.',true);
    setWorking(true);status('');
    try{
      const r=await fetch(apiBase()+'/api/v2/pattern-generator/save',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token:state.preview.token,name})
      });
      const raw=await r.text();let data={};
      try{data=raw?JSON.parse(raw):{}}catch(_){data={detail:raw}}
      if(!r.ok)throw new Error(data.detail||`HTTP ${r.status}`);
      status(`Saved to Library: ${data.name||name}`);
      setTimeout(()=>{ closeForge(); location.reload(); },650);
    }catch(e){status(e.message||String(e),true)}
    finally{setWorking(false)}
  }

  function renderRoute(){
    const svg=qs('oryn-forge-svg'), route=qs('oryn-forge-route');
    if(!svg||!route||!state.preview?.coordinates?.length)return;
    const pts=state.preview.coordinates.map(([t,r])=>{
      const x=180+Math.cos(t)*r*160;
      const y=180+Math.sin(t)*r*160;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
    route.setAttribute('points',pts);
    qs('oryn-forge-empty')?.remove();
    svg.style.display='block';
  }

  function renderStats(){
    const box=qs('oryn-forge-stats'); if(!box||!state.preview)return;
    const s=state.preview.stats||{};
    const values=[
      `${state.preview.points||0} route pts`,
      `${s.input_paths??'—'} input paths`,
      `${s.skipped_islands??0} long islands skipped`,
      `${s.clipped_points??0} clipped outside`,
      s.trace_mode?`${s.trace_mode} trace`:null,
      s.small_gaps_repaired!=null?`${s.small_gaps_repaired} tiny gaps repaired`:null
    ].filter(Boolean);
    box.innerHTML=values.map(v=>`<span class="oryn-forge-chip">${v}</span>`).join('');
  }

  function fileChanged(e){
    const f=e.target.files?.[0]||null;state.file=f;state.preview=null;
    qs('oryn-forge-svg').style.display='none';
    qs('oryn-forge-stats').innerHTML='';
    qs('oryn-forge-save').disabled=true;
    if(f){
      qs('oryn-forge-file').textContent=f.name;
      const n=qs('oryn-forge-name'); if(n&&!n.value)n.value=f.name.replace(/\.[^.]+$/,'');
    }
  }

  function modalHtml(){
    return `
      <div id="oryn-forge-overlay">
        <div id="oryn-forge-modal">
          <div class="oryn-forge-head">
            <div>
              <div class="oryn-forge-title">Pattern Forge</div>
              <div class="oryn-forge-sub">PNG · JPG · SVG · DXF · THR → clean sand-table route</div>
            </div>
            <button class="oryn-forge-close" id="oryn-forge-close">×</button>
          </div>
          <div class="oryn-forge-grid">
            <div class="oryn-forge-controls">
              <label class="oryn-forge-drop">
                <input id="oryn-forge-file-input" type="file" hidden accept=".svg,.dxf,.png,.jpg,.jpeg,.webp,.bmp,.thr">
                <b>Choose artwork</b>
                <small>Vector or clean/high-contrast raster artwork</small>
                <div id="oryn-forge-file" class="oryn-forge-file">No file selected</div>
              </label>

              <div class="oryn-forge-field"><label>Pattern name</label><input id="oryn-forge-name" type="text" placeholder="My ORYN pattern"></div>

              <div class="oryn-forge-field"><label>Fit inside table <span id="oryn-fit-val">94%</span></label><input id="oryn-forge-fit" type="range" min=".55" max=".98" step=".01" value=".94"></div>
              <div class="oryn-forge-field"><label>Image threshold <span id="oryn-threshold-val">128</span></label><input id="oryn-forge-threshold" type="range" min="30" max="235" step="1" value="128"></div>
              <div class="oryn-forge-field"><label>Smoothing <span id="oryn-smoothing-val">1</span></label><input id="oryn-forge-smoothing" type="range" min="0" max="5" step="1" value="1"></div>
              <div class="oryn-forge-field"><label>Geometry simplify <span id="oryn-simplify-val">0.0025</span></label><input id="oryn-forge-simplify" type="range" min="0" max=".015" step=".0005" value=".0025"></div>
              <div class="oryn-forge-field"><label>Rotation <span id="oryn-rotation-val">0°</span></label><input id="oryn-forge-rotation_deg" type="range" min="-180" max="180" step="1" value="0"></div>
              <div class="oryn-forge-field"><label>Horizontal offset <span id="oryn-offsetx-val">0</span></label><input id="oryn-forge-offset_x" type="range" min="-.5" max=".5" step=".01" value="0"></div>
              <div class="oryn-forge-field"><label>Vertical offset <span id="oryn-offsety-val">0</span></label><input id="oryn-forge-offset_y" type="range" min="-.5" max=".5" step=".01" value="0"></div>
              <div class="oryn-forge-field"><label>Max connector gap <span id="oryn-bridge-val">0.055</span></label><input id="oryn-forge-max_bridge" type="range" min="0" max=".14" step=".005" value=".055"></div>

              <div class="oryn-forge-field">
                <label>Preferred start</label>
                <select id="oryn-forge-start_mode" class="oryn-forge-input" style="width:100%;height:39px;background:#0b0d10;color:white;border:1px solid #353a40;border-radius:9px;padding:0 10px">
                  <option value="auto">Auto — lowest route cost</option>
                  <option value="perimeter">Prefer perimeter</option>
                  <option value="center">Prefer center</option>
                </select>
              </div>

              <label class="oryn-forge-toggle"><input id="oryn-forge-invert" type="checkbox"><div><b>Invert raster artwork</b><small>Use for light lines on dark images</small></div></label>

              <div class="oryn-forge-note">
                Long disconnected islands are skipped instead of drawing a large straight pass-line across the artwork.
                The preview at right is the actual THR route that will be saved.
              </div>

              <div class="oryn-forge-actions">
                <button id="oryn-forge-generate" class="oryn-forge-btn primary" style="flex:1">Generate Clean Route</button>
                <button id="oryn-forge-save" class="oryn-forge-btn" disabled>Save to Library</button>
              </div>
              <div id="oryn-forge-status" class="oryn-forge-status"></div>
            </div>

            <div class="oryn-forge-preview">
              <div style="display:flex;justify-content:space-between;gap:12px;align-items:end;margin-bottom:12px">
                <div><div style="font-size:10px;letter-spacing:.18em;color:#737674">ROUTE PREVIEW</div><b>Exact ball path</b></div>
                <div id="oryn-forge-stats" class="oryn-forge-stats"></div>
              </div>
              <div class="oryn-forge-canvas-wrap">
                <div class="oryn-forge-disc">
                  <div id="oryn-forge-empty" class="oryn-forge-empty" style="padding:42% 12%">Import artwork and generate a route.<br><small>Nothing is saved until you approve the preview.</small></div>
                  <svg id="oryn-forge-svg" viewBox="0 0 360 360" style="display:none">
                    <polyline id="oryn-forge-route" points=""></polyline>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  function openForge(){
    if(qs('oryn-forge-overlay'))return;
    document.body.insertAdjacentHTML('beforeend',modalHtml());
    qs('oryn-forge-close').onclick=closeForge;
    qs('oryn-forge-overlay').addEventListener('click',e=>{if(e.target.id==='oryn-forge-overlay')closeForge()});
    qs('oryn-forge-file-input').addEventListener('change',fileChanged);
    qs('oryn-forge-generate').onclick=generate;
    qs('oryn-forge-save').onclick=save;

    const bind=(id,out,fmt=v=>v)=>{
      const el=qs(id),label=qs(out);if(!el||!label)return;
      const up=()=>label.textContent=fmt(el.value);el.addEventListener('input',up);up();
    };
    bind('oryn-forge-fit','oryn-fit-val',v=>`${Math.round(Number(v)*100)}%`);
    bind('oryn-forge-threshold','oryn-threshold-val');
    bind('oryn-forge-smoothing','oryn-smoothing-val');
    bind('oryn-forge-simplify','oryn-simplify-val');
    bind('oryn-forge-rotation_deg','oryn-rotation-val',v=>`${v}°`);
    bind('oryn-forge-offset_x','oryn-offsetx-val');
    bind('oryn-forge-offset_y','oryn-offsety-val');
    bind('oryn-forge-max_bridge','oryn-bridge-val');
  }

  function closeForge(){
    if(state.objectUrl)URL.revokeObjectURL(state.objectUrl);
    qs('oryn-forge-overlay')?.remove();
    state={file:null,preview:null,working:false,objectUrl:null};
  }

  function installLaunchButton(){
    if(location.pathname!=='/' && !location.pathname.includes('browse'))return;
    if(qs('oryn-pattern-forge-launch'))return;

    const candidates=[...document.querySelectorAll('button')];
    const add=candidates.find(b=>(b.textContent||'').trim()==='Add Pattern');
    if(!add||!add.parentElement)return;

    const btn=document.createElement('button');
    btn.id='oryn-pattern-forge-launch';
    btn.type='button';
    btn.innerHTML='<span style="font-size:17px">◇</span> Pattern Forge';
    btn.onclick=openForge;
    add.parentElement.insertBefore(btn,add);
  }

  const obs=new MutationObserver(installLaunchButton);
  obs.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',installLaunchButton);
  setInterval(installLaunchButton,1200);
})();
