(function () {
  'use strict';
  const ID='oryn-universal-machine-profile-v7';
  const DRIVER_STEPS={
    A4988:[1,2,4,8,16], DRV8825:[1,2,4,8,16,32],
    TMC2208:[1,2,4,8,16,32,64,128,256], TMC2209:[1,2,4,8,16,32,64,128,256],
    TMC5160:[1,2,4,8,16,32,64,128,256], CUSTOM_STEP_DIR:[1,2,4,8,16,32,64,128,256]
  };
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function microLabel(n){return Number(n)===1?'Full step':'1/'+n;}
  function findHost(){
    const h=[...document.querySelectorAll('h1,h2')].find(x=>/Hardware Setup/i.test(x.textContent||''));
    if(!h) return null;
    return h.closest('.max-w-4xl') || h.parentElement?.parentElement || document.querySelector('main') || document.body;
  }
  function style(){if(document.getElementById(ID+'-style'))return;const s=document.createElement('style');s.id=ID+'-style';s.textContent=`
#${ID}{border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:16px;background:var(--card,#151515);margin:12px 0;color:inherit}
#${ID} .umh{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px}
#${ID} .umtitle{font-weight:700;font-size:17px} #${ID} .umsub{opacity:.7;font-size:12px;margin-top:2px}
#${ID} .umgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px} @media(max-width:700px){#${ID} .umgrid{grid-template-columns:1fr}}
#${ID} .umaxis{border:1px solid rgba(255,255,255,.10);border-radius:10px;padding:12px}
#${ID} label{display:block;font-size:11px;opacity:.75;margin:7px 0 4px} #${ID} select{width:100%;height:38px;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:#111;color:#fff;padding:0 10px}
#${ID} button{border:1px solid #f5c518;border-radius:8px;padding:9px 13px;background:#f5c518;color:#090909;font-weight:700;cursor:pointer} #${ID} button.secondary{background:transparent;color:#f5c518}
#${ID} button:disabled{opacity:.45;cursor:not-allowed}.umstats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px}.umstat{background:rgba(255,255,255,.05);border-radius:7px;padding:7px;font-size:11px}.umstat b{display:block;font-size:12px;margin-top:2px}.umnote{margin-top:10px;padding:10px;border-radius:8px;background:rgba(245,197,24,.08);border:1px solid rgba(245,197,24,.28);font-size:12px;line-height:1.45}.umgeo{margin-top:10px;font-size:12px;opacity:.85}.umok{color:#54d17a}.umwarn{color:#f5c518}
`;document.head.appendChild(s);}
  async function json(url,opt){const r=await fetch(url,opt);let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.detail||('HTTP '+r.status));return d;}
  function axisHtml(axis, a, cfg, supported){
    const drivers=Object.keys(supported||DRIVER_STEPS);const drv=(a&&a.driver)||'A4988';const ms=Number((a&&a.microsteps)||16);const allowed=(supported&&supported[drv])||DRIVER_STEPS[drv]||[1];
    return `<div class="umaxis" data-axis="${axis}"><b>${axis.toUpperCase()} — ${axis==='x'?'Theta / Rotation':'Rho / Radial'}</b><div class="umsub">STEP/DIR hardware profile</div>
    <label>Driver</label><select class="umdriver">${drivers.map(d=>`<option value="${esc(d)}" ${d===drv?'selected':''}>${d==='CUSTOM_STEP_DIR'?'Custom STEP/DIR':d}</option>`).join('')}</select>
    <label>Physical microstep (DIP/jumper/UART setting)</label><select class="ummicro">${allowed.map(n=>`<option value="${n}" ${Number(n)===ms?'selected':''}>${microLabel(n)}</option>`).join('')}</select>
    <div class="umstats"><div class="umstat">Steps/unit<b>${esc(cfg?.steps_per_mm??'—')}</b></div><div class="umstat">Max rate<b>${esc(cfg?.max_rate_mm_per_min??'—')}</b></div><div class="umstat">Acceleration<b>${esc(cfg?.acceleration_mm_per_sec2??'—')}</b></div></div></div>`;
  }
  function wire(root,data){
    root.querySelectorAll('.umaxis').forEach(box=>{
      const d=box.querySelector('.umdriver'),m=box.querySelector('.ummicro');
      d.onchange=()=>{const arr=(data.supported_drivers||DRIVER_STEPS)[d.value]||[1];m.innerHTML=arr.map(n=>`<option value="${n}">${microLabel(n)}</option>`).join('');};
    });
    const readBtn=root.querySelector('.umread');
    const applyBtn=root.querySelector('.umapply');
    if(readBtn) readBtn.onclick=()=>load(root,true);
    if(data.read_only){
      if(applyBtn) applyBtn.disabled=true;
      root.querySelectorAll('select').forEach(el=>el.disabled=true);
    }
    if(applyBtn) applyBtn.onclick=async()=>{
      const btn=root.querySelector('.umapply');btn.disabled=true;btn.textContent='Applying…';
      try{
        const axes={};root.querySelectorAll('.umaxis').forEach(box=>{axes[box.dataset.axis]={driver:box.querySelector('.umdriver').value,microsteps:Number(box.querySelector('.ummicro').value)}});
        const res=await json('/api/machine-hardware-profile/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({x:axes.x,y:axes.y})});
        alert('Machine profile saved. FluidNC steps/unit adjusted for the selected physical microstep.\n\n'+(res.message||''));
        await load(root,false);
      }catch(e){alert('Machine profile error: '+e.message);}finally{btn.disabled=false;btn.textContent='Apply Driver / Microstep';}
    };
  }
  async function load(root,notify){
    try{
      const statusEl=root.querySelector('.umstatus');
      if(statusEl) statusEl.textContent='Reading controller…';
      const d=await json('/api/machine-hardware-profile');
      const p=d.profile||{},c=d.controller?.axes||{},g=d.geometry||{};
      root.innerHTML=`<div class="umh"><div><div class="umtitle">Universal Machine Profile</div><div class="umsub">Driver + microstepping → FluidNC scale → physical 360° / radius calibration</div></div><div><button class="secondary umread">${d.read_only?'Refresh cached view':'Read'}</button> <button class="umapply" ${d.read_only?'disabled':''}>Apply Driver / Microstep</button></div></div>
      <div class="umstatus umsub">Build ${esc(d.build||'V7')} · ${p.initialized?'<span class="umok">PROFILE SAVED</span>':'<span class="umwarn">FIRST SETUP</span>'} · ${d.read_only?'<span class="umwarn">READ-ONLY WHILE PATTERN RUNS</span>':esc(d.controller_source||'controller')}</div>
      ${d.read_only?'<div class="umnote"><b>Pattern running:</b> this page is safely displaying cached machine values. ORYN will not send <code>$CD</code>, <code>$$</code>, flush serial input, jog calibration, or alter hardware until playback stops.</div>':''}
      <div class="umgrid">${axisHtml('x',p.x,c.x,d.supported_drivers)}${axisHtml('y',p.y,c.y,d.supported_drivers)}</div>
      <div class="umgeo">360°: <b>${g.theta_calibrated?Number(g.theta_revolution_units).toFixed(4)+' units':'Not calibrated'}</b> &nbsp; · &nbsp; Centre→Perimeter: <b>${g.rho_calibrated?Number(g.rho_travel_units).toFixed(4)+' units':'Not calibrated'}</b></div>
      ${!p.initialized?'<div class="umnote"><b>Current A4988 situation:</b> ORYN legacy reference is A4988 at 1/16 microstep. If all three A4988 jumpers are now removed, choose <b>Full step</b> on X and Y and press Apply. With your previous FluidNC values this scales X 410 → 25.625 and Y 287 → 17.9375, keeping the same physical controller-unit scale instead of making both motors run about 16× farther.</div>':''}
      <div class="umnote"><b>Important:</b> ORYN cannot electrically detect standalone DIP/jumper positions. After any physical driver/microstep change, select the matching setting here once. You do not edit code or terminal values. Max rate and acceleration remain FluidNC safety limits; 360° and Perimeter calibration remain the final geometry.</div>`;
      wire(root,d);if(notify) console.info('ORYN machine profile loaded',d);
    }catch(e){root.innerHTML=`<div class="umtitle">Universal Machine Profile</div><div class="umnote">Connect the FluidNC controller, then press Read. ${esc(e.message)}</div><button class="secondary umread" style="margin-top:8px">Read</button>`;root.querySelector('.umread').onclick=()=>load(root,true);}
  }
  function mount(){
    if(!/setup/i.test(location.pathname) && ![...document.querySelectorAll('h1,h2')].some(x=>/Hardware Setup/i.test(x.textContent||''))) return;
    style();if(document.getElementById(ID)) return;const host=findHost();if(!host)return;
    const el=document.createElement('section');el.id=ID;
    const accordion=[...host.children].find(c=>String(c.className||'').includes('w-full') || (c.querySelector&&c.querySelector('[data-state]')));
    if(accordion) host.insertBefore(el,accordion); else host.appendChild(el);
    el.innerHTML='<div class="umtitle">Universal Machine Profile</div><div class="umsub">Loading controller profile…</div>';load(el,false);
  }
  setInterval(mount,800);window.addEventListener('popstate',()=>setTimeout(mount,100));setTimeout(mount,200);
})();
