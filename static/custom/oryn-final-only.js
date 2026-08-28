
(()=>{'use strict';

const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>[...r.querySelectorAll(s)];

function apiBase(){
  try{
    const raw=localStorage.getItem('orynmotion_tables');
    const activeId=localStorage.getItem('orynmotion_active_table');
    if(raw&&activeId){
      const data=JSON.parse(raw);
      const t=(data.tables||[]).find(x=>x.id===activeId);
      if(t&&!t.isCurrent&&t.url)return t.url.replace(/\/$/,'');
    }
  }catch(_){}
  return '';
}
async function req(path,opts={}){
  const r=await fetch(apiBase()+path,opts);
  const text=await r.text();
  let data={};
  try{data=text?JSON.parse(text):{}}catch(_){
    const html=/^\s*</.test(text||'')||/<html|gateway time-?out/i.test(text||'');
    data={detail:html?`Server request failed (HTTP ${r.status}). Your artwork is still loaded; retry Generate.`:(text||`HTTP ${r.status}`)};
  }
  if(!r.ok)throw new Error(data.detail||`HTTP ${r.status}`);
  return data;
}

/* Theme marker only; does not change the user's locked theme system. */
function syncTheme(){
  const dark=document.documentElement.classList.contains('dark');
  document.body.classList.toggle('oryn-theme-dark',dark);
  document.body.classList.toggle('oryn-theme-light',!dark);
}
new MutationObserver(syncTheme).observe(document.documentElement,{attributes:true,attributeFilter:['class']});

/* ---------------- Footer ---------------- */
function installFooter(){
  qa('#oryn-v35-footer,#oryn-v36-footer,#oryn-final-footer').forEach((e,i)=>{if(i>0)e.remove()});
  let f=q('#oryn-final-footer');
  const main=q('main');
  if(!main)return;

  // Never allow an injected footer to remain near the top after React rerenders.
  if(f && f.parentElement!==main){
    f.remove();f=null;
  }
  if(!f){
    f=document.createElement('footer');
    f.id='oryn-final-footer';
    f.innerHTML='<strong>ORYN</strong> — Designed to Move — by <strong>Studio Kinematics™</strong>';
  }
  if(main.lastElementChild!==f)main.appendChild(f);
}

/* ---------------- Pattern Forge ---------------- */
let forge={file:null,preview:null,sourceUrl:null,busy:false};

function forgeStatus(t,error=false){
  const e=q('#oryn-ff-status');if(!e)return;
  e.textContent=t||'';e.classList.toggle('error',!!error);
}
function setForgeBusy(v){
  forge.busy=v;
  qa('#oryn-final-forge button').forEach(b=>b.disabled=v);
  const g=q('#oryn-ff-generate');if(g)g.textContent=v?'Generating…':'Generate Clean Route';
}
function cleanupSource(){
  if(forge.sourceUrl){
    try{URL.revokeObjectURL(forge.sourceUrl)}catch(_){}
    forge.sourceUrl=null;
  }
}
function closeForge(){
  cleanupSource();
  forge={file:null,preview:null,sourceUrl:null,busy:false};
  q('#oryn-final-forge-overlay')?.remove();
}
function openForge(){
  if(q('#oryn-final-forge-overlay'))return;
  document.body.insertAdjacentHTML('beforeend',`
  <div id="oryn-final-forge-overlay">
    <div id="oryn-final-forge">
      <div class="oryn-ff-head">
        <div>
          <div class="oryn-ff-title">Pattern Forge</div>
          <div class="oryn-ff-sub">PHOTO / PAINTING · LINE ART · PNG/JPG · SVG · DXF · G-CODE · THR → clean machine-ready route</div>
        </div>
        <button class="oryn-ff-close" type="button">×</button>
      </div>

      <div class="oryn-ff-grid">
        <div class="oryn-ff-left">
          <label class="oryn-ff-drop">
            <input id="oryn-ff-file" type="file" hidden accept=".png,.jpg,.jpeg,.webp,.bmp,.svg,.dxf,.gcode,.nc,.ngc,.tap,.thr">
            <b>Choose artwork</b>
            <small>Photo, painting, line art, vector/CAD, G-code or existing THR</small>
            <div id="oryn-ff-file-name" class="oryn-ff-file">No file selected</div>
          </label>

          <div class="oryn-ff-field"><label>Pattern name</label><input id="oryn-ff-name" type="text" placeholder="My ORYN pattern"></div>

          <div class="oryn-ff-field">
            <label>Raster interpretation</label>
            <select id="oryn-ff-raster_mode">
              <option value="auto">Auto — detect artwork type</option>
              <option value="line">Line art / sketch / logo</option>
              <option value="photo">Photo / painting → contour lines</option>
            </select>
          </div>

          <div class="oryn-ff-field">
            <label>Raster detail <span id="oryn-ff-val-detail">3</span></label>
            <input id="oryn-ff-detail" type="range" min="1" max="5" step="1" value="3">
          </div>

          ${[
            ['fit','Fit inside table','.55','.98','.01','.94','94%'],
            ['threshold','Image threshold','30','235','1','128','128'],
            ['smoothing','Smoothing','0','5','1','1','1'],
            ['simplify','Geometry simplify','0','.015','.0005','.0025','.0025'],
            ['rotation_deg','Rotation','-180','180','1','0','0°'],
            ['offset_x','Horizontal offset','-.5','.5','.01','0','0'],
            ['offset_y','Vertical offset','-.5','.5','.01','0','0'],
            ['max_bridge','Max connector gap','0','.14','.005','.055','.055']
          ].map(a=>`
          <div class="oryn-ff-field">
            <label>${a[1]} <span id="oryn-ff-val-${a[0]}">${a[6]}</span></label>
            <input id="oryn-ff-${a[0]}" type="range" min="${a[2]}" max="${a[3]}" step="${a[4]}" value="${a[5]}">
          </div>`).join('')}

          <div class="oryn-ff-field">
            <label>Preferred route start</label>
            <select id="oryn-ff-start_mode">
              <option value="auto">Auto — lowest route cost</option>
              <option value="perimeter">Prefer perimeter</option>
              <option value="center">Prefer center</option>
            </select>
          </div>


          <div class="oryn-ff-field">
            <label>Disconnected-detail travel</label>
            <select id="oryn-ff-connector_mode">
              <option value="artwork">Artwork-safe local bridges — recommended</option>
              <option value="shortest">Shortest direct connector</option>
              <option value="auto">Auto — short direct / long perimeter</option>
              <option value="perimeter">Perimeter travel lane</option>
            </select>
          </div>

          <label class="oryn-ff-toggle">
            <input id="oryn-ff-preserve_all" type="checkbox" checked>
            <div><b>Keep disconnected details</b><small>Uses local bridges/retrace instead of long crossing travel where possible</small></div>
          </label>

          <label class="oryn-ff-toggle">
            <input id="oryn-ff-invert" type="checkbox">
            <div><b>Invert raster artwork</b><small>Use when the artwork is light on a dark background</small></div>
          </label>

          <div class="oryn-ff-note">
            Pattern Forge uses dedicated raster/vector/G-code/THR pipelines. Artwork-safe mode enters each disconnected detail at its nearest point and retraces existing artwork when needed, reducing passing lines across the design. Preview = saved THR = table path.
          </div>

          <div class="oryn-ff-actions">
            <button id="oryn-ff-generate" class="oryn-ff-btn primary" type="button">Generate Clean Route</button>
            <button id="oryn-ff-save" class="oryn-ff-btn" type="button" disabled>Save to Library</button>
          </div>
          <div id="oryn-ff-status" class="oryn-ff-status"></div>
        </div>

        <div class="oryn-ff-right">
          <div class="oryn-ff-source">
            <div class="oryn-ff-source-head"><b>SOURCE ARTWORK</b><span id="oryn-ff-source-name">Nothing selected</span></div>
            <div class="oryn-ff-source-box" id="oryn-ff-source-box">
              <div class="oryn-ff-source-placeholder">Select artwork to see the original here.</div>
            </div>
          </div>

          <div class="oryn-ff-output-head">
            <div><small>GENERATED OUTPUT</small><b>Exact ball path</b></div>
            <div id="oryn-ff-stats" class="oryn-ff-stats"></div>
          </div>

          <div class="oryn-ff-canvas-wrap">
            <div class="oryn-ff-disc">
              <div id="oryn-ff-empty" class="oryn-ff-empty">Generate a route.<br><small>The entire output panel can be scrolled.</small></div>
              <svg id="oryn-ff-svg" viewBox="0 0 360 360" style="display:none">
                <polyline id="oryn-ff-route"></polyline>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`);

  q('.oryn-ff-close').onclick=closeForge;
  q('#oryn-final-forge-overlay').onclick=e=>{if(e.target.id==='oryn-final-forge-overlay')closeForge()};

  q('#oryn-ff-file').onchange=e=>{
    cleanupSource();
    forge.file=e.target.files?.[0]||null;forge.preview=null;
    q('#oryn-ff-file-name').textContent=forge.file?.name||'No file selected';
    q('#oryn-ff-source-name').textContent=forge.file?.name||'Nothing selected';
    const sourceBox=q('#oryn-ff-source-box');if(sourceBox){sourceBox.style.backgroundImage='';sourceBox.classList.remove('has-source');sourceBox.removeAttribute('role');sourceBox.removeAttribute('aria-label');}
    q('#oryn-ff-save').disabled=true;
    q('#oryn-ff-svg').style.display='none';
    q('#oryn-ff-stats').innerHTML='';
    q('#oryn-ff-empty').style.display='grid';

    if(!forge.file){
      q('#oryn-ff-source-box').innerHTML='<div class="oryn-ff-source-placeholder">Select artwork to see the original here.</div>';
      return;
    }

    q('#oryn-ff-name').value=forge.file.name.replace(/\.[^.]+$/,'');
    const ext=(forge.file.name.split('.').pop()||'').toLowerCase();
    const previewable=forge.file.type.startsWith('image/')||['png','jpg','jpeg','webp','bmp','svg'].includes(ext);
    if(previewable){
      forge.sourceUrl=URL.createObjectURL(forge.file);
      const box=q('#oryn-ff-source-box');
      box.replaceChildren();
      box.classList.add('has-source');
      box.style.backgroundImage=`url(${JSON.stringify(forge.sourceUrl)})`;
      box.setAttribute('role','img');
      box.setAttribute('aria-label','Complete uploaded source artwork');
    }else{
      q('#oryn-ff-source-box').innerHTML=`<div class="oryn-ff-source-placeholder"><b>${forge.file.name}</b><br><br>${ext.toUpperCase()} geometry will appear below after Generate.</div>`;
    }
  };

  qa('#oryn-final-forge input[type="range"]').forEach(el=>{
    const update=()=>{
      let v=el.value;
      if(el.id.endsWith('fit'))v=Math.round(Number(v)*100)+'%';
      if(el.id.endsWith('rotation_deg'))v=v+'°';
      q('#oryn-ff-val-'+el.id.replace('oryn-ff-','')).textContent=v;
    };
    el.oninput=update;update();
  });

  q('#oryn-ff-generate').onclick=generateForge;
  q('#oryn-ff-save').onclick=saveForge;
  q('.oryn-ff-left').scrollTop=0;
  q('.oryn-ff-right').scrollTop=0;
}

async function generateForge(){
  if(!forge.file)return forgeStatus('Choose an artwork file first.',true);
  setForgeBusy(true);forgeStatus('');
  try{
    const fd=new FormData();
    fd.append('file',forge.file);
    ['fit','threshold','detail','smoothing','simplify','rotation_deg','offset_x','offset_y','max_bridge'].forEach(k=>{
      fd.append(k,q('#oryn-ff-'+k).value);
    });
    fd.append('invert',String(q('#oryn-ff-invert').checked));
    fd.append('start_mode',q('#oryn-ff-start_mode').value);
    fd.append('preserve_all',String(q('#oryn-ff-preserve_all')?.checked ?? true));
    fd.append('raster_mode',q('#oryn-ff-raster_mode')?.value||'auto');
    fd.append('connector_mode',q('#oryn-ff-connector_mode')?.value||'artwork');

    const started=await req('/api/v2/pattern-generator/preview-start',{method:'POST',body:fd});
    if(!started.job_id)throw new Error('Pattern Forge could not start generation.');
    forgeStatus('Processing artwork…');
    const deadline=Date.now()+5*60*1000;
    while(true){
      if(Date.now()>deadline)throw new Error('Generation exceeded 5 minutes. Lower Raster detail or use a cleaner source.');
      await new Promise(resolve=>setTimeout(resolve,650));
      const job=await req('/api/v2/pattern-generator/preview-job/'+encodeURIComponent(started.job_id));
      if(job.status==='error')throw new Error(job.error||'Pattern generation failed.');
      if(job.status==='done'){forge.preview=job;break;}
      forgeStatus(job.status==='queued'?'Queued…':'Processing artwork…');
    }
    const coords=forge.preview.coordinates||[];
    if(!coords.length)throw new Error('No route points were generated.');

    const pts=coords.map(([t,r])=>`${(180+Math.cos(t)*r*160).toFixed(2)},${(180+Math.sin(t)*r*160).toFixed(2)}`).join(' ');
    q('#oryn-ff-route').setAttribute('points',pts);
    q('#oryn-ff-svg').style.display='block';
    q('#oryn-ff-empty').style.display='none';

    const s=forge.preview.stats||{};
    q('#oryn-ff-stats').innerHTML=[
      `${forge.preview.points||0} pts`,
      `${s.input_paths??'—'} source paths`,
      s.raster_mode?`${s.raster_mode} mode`:null,
      s.connector_mode?`${s.connector_mode} travel`:null,
      `${s.skipped_islands??0} long islands skipped`,
      `${s.clipped_points??0} clipped`,
      s.trace_mode?`${s.trace_mode} trace`:null,
      s.small_gaps_repaired!=null?`${s.small_gaps_repaired} gaps repaired`:null
    ].filter(Boolean).map(x=>`<span class="oryn-ff-chip">${x}</span>`).join('');

    q('#oryn-ff-save').disabled=false;
    forgeStatus('Route generated. Scroll the right panel to inspect the complete output, then Save.');
  }catch(e){
    forge.preview=null;
    forgeStatus(e.message||String(e),true);
  }finally{
    setForgeBusy(false);
    q('#oryn-ff-save').disabled=!forge.preview;
  }
}

async function saveForge(){
  if(!forge.preview)return;
  const name=(q('#oryn-ff-name').value||'').trim();
  if(!name)return forgeStatus('Enter a pattern name.',true);

  setForgeBusy(true);
  try{
    const d=await req('/api/v2/pattern-generator/save',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({token:forge.preview.token,name})
    });
    forgeStatus(`Saved: ${d.name||name}`);
    setTimeout(()=>{closeForge();location.reload()},550);
  }catch(e){
    forgeStatus(e.message||String(e),true);
  }finally{setForgeBusy(false)}
}

function installForgeButton(){
  if(location.pathname!=='/'&&!location.pathname.includes('browse'))return;
  if(q('#oryn-final-forge-launch'))return;

  const heading=qa('h1,h2').find(e=>(e.textContent||'').trim()==='Browse Patterns');
  if(!heading)return;

  // Prefer the same header row that contains Add Pattern / Import THR.
  let row=heading.parentElement?.parentElement;
  if(!row)return;

  const b=document.createElement('button');
  b.id='oryn-final-forge-launch';b.type='button';
  b.innerHTML='◇&nbsp; Pattern Forge';b.onclick=openForge;
  row.appendChild(b);
}

/* ---------------- Delete ---------------- */
function norm(s){
  return String(s||'').toLowerCase().replace(/\.thr$/,'').replace(/[^a-z0-9]+/g,'');
}
function detailsPanel(){
  return qa('[role="dialog"]').find(p=>{
    const t=(p.textContent||'');
    return /Clearing strategy|Play Next|Add to Queue|Run Pattern|Tap to preview animation/i.test(t);
  })||null;
}
async function resolveSelectedPattern(){
  const panel=detailsPanel();if(!panel)return null;
  const files=await req('/list_theta_rho_files');
  if(!Array.isArray(files))return null;

  // Exact title first.
  const titles=qa('h1,h2,h3,[data-radix-dialog-title]',panel)
    .map(e=>(e.textContent||'').trim()).filter(Boolean);
  for(const title of titles){
    const nt=norm(title);
    const exact=files.find(p=>norm(String(p).replace(/\\/g,'/').split('/').pop())===nt);
    if(exact)return exact;
  }

  // Then compare all visible panel text to basenames.
  const visible=norm(panel.textContent||'');
  return files
    .map(p=>({p,n:norm(String(p).replace(/\\/g,'/').split('/').pop())}))
    .filter(x=>x.n&&visible.includes(x.n))
    .sort((a,b)=>b.n.length-a.n.length)[0]?.p||null;
}
async function deleteSelected(){
  try{
    const path=await resolveSelectedPattern();
    if(!path)throw new Error('Selected pattern file could not be resolved.');

    const file=String(path).replace(/\\/g,'/').split('/').pop().toLowerCase();
    if(['clear_from_in.thr','clear_from_out.thr','clear_sideway.thr'].includes(file)){
      throw new Error('System clearing patterns are protected.');
    }

    if(!confirm(`Delete "${String(path).replace(/\\/g,'/').split('/').pop()}"?\n\nThis permanently removes it from the ORYN Library.`))return;

    await req('/delete_theta_rho_file',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({file_name:path})
    });
    alert('Pattern deleted.');
    location.reload();
  }catch(e){alert('Delete failed: '+(e.message||e))}
}
function installDelete(){
  const panel=detailsPanel();if(!panel)return;
  qa('#oryn-final-delete').forEach(b=>{if(!panel.contains(b))b.remove()});
  if(q('#oryn-final-delete',panel))return;

  const buttons=qa('button',panel);
  const play=buttons.find(b=>/^(Play|Run Pattern)$/i.test((b.textContent||'').trim()))
    || buttons.find(b=>/Play|Run Pattern/i.test(b.textContent||''));
  if(!play)return;

  const row=play.parentElement;
  if(!row)return;

  const b=document.createElement('button');
  b.id='oryn-final-delete';b.type='button';
  b.innerHTML='⌫&nbsp; Delete Pattern';b.onclick=deleteSelected;
  row.appendChild(b);
}

/* ---------------- installer ---------------- */
/* ==========================================================
   ORYN WINDOWS — HEADER LOGO LOCAL FALLBACK ONLY
   Keeps remote/custom logo when it loads successfully.
   If the active Raspberry Pi does not serve that logo, fall
   back to the Windows app's packaged Studio Kinematics logo.
   ========================================================== */
function installHeaderLogoFallback(){
  const logo=document.querySelector('img.km-brand-logo');
  if(!logo)return;

  const fallback=new URL('/static/custom/studio-kinematics-logo.png',window.location.origin).href;

  if(!logo.dataset.orynLogoFallback){
    logo.dataset.orynLogoFallback='1';
    logo.addEventListener('error',()=>{
      if(logo.src!==fallback)logo.src=fallback;
    });
  }

  if(logo.complete && logo.naturalWidth===0 && logo.src!==fallback){
    logo.src=fallback;
  }
}


function install(){
  syncTheme();installFooter();installForgeButton();installDelete();installHeaderLogoFallback();
}
new MutationObserver(install).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('DOMContentLoaded',install);
setInterval(install,500);

})();
