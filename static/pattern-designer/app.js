'use strict';

// ORYN Pattern Designer V2.0 Pro
// Clean-room standalone implementation. The reference project was used to understand
// expected generator behavior and parameter semantics; this source is independently written.

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const $ = (s) => document.querySelector(s);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const lerp = (a,b,t) => a + (b-a)*t;
const linspace = (a,b,n) => Array.from({length:Math.max(1,n)},(_,i)=>n<=1?a:lerp(a,b,i/(n-1)));
const pointPolar = (r,t) => [r*Math.cos(t), r*Math.sin(t)];
const gcd = (a,b) => { a=Math.abs(Math.round(a)); b=Math.abs(Math.round(b)); while(b){const q=a%b;a=b;b=q;} return a||1; };
const hypot = (p) => Math.hypot(p[0],p[1]);
const rotatePoint = ([x,y],a) => [x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a)];
const rotatePath = (p,a) => a ? p.map(q=>rotatePoint(q,a)) : p.slice();
const translatePath = (p,x,y) => p.map(([px,py])=>[px+x,py+y]);
const scalePath = (p,sx,sy=sx) => p.map(([x,y])=>[x*sx,y*sy]);
const reversePath = (p) => p.slice().reverse();
const dist = (a,b) => Math.hypot(b[0]-a[0],b[1]-a[1]);
const store = {
  get(k){try{return localStorage.getItem(k)}catch(_){return null}},
  set(k,v){try{localStorage.setItem(k,v)}catch(_){}}
};

const integrationParams = new URLSearchParams(window.location.search);
const isORYNEmbedded = integrationParams.get('embedded') === '1';
if(isORYNEmbedded) document.body.classList.add('oryn-embedded');
const backToORYN=$('#backToORYN');
if(backToORYN && location.protocol==='file:') backToORYN.style.display='none';

const canvas = $('#canvas');
const ctx = canvas.getContext('2d');
const state = {
  pattern:'spiral', config:{}, rawPath:[], path:[], previewIndex:0,
  playing:true,lastFrame:0, drawPath:[], pointerDown:false,
  viewScale:1, viewPan:[0,0], filteredKeys:[]
};

function env(){
  return {
    x:Math.max(10,+$('#xRange').value||472),
    y:Math.max(10,+$('#yRange').value||380),
    speed:Math.max(1,+$('#speed').value||4000),
    ball:Math.max(.1,+$('#ball').value||10),
    format:$('#format').value
  };
}
function bounds(){const e=env();return {rx:e.x/2,ry:e.y/2,r:Math.min(e.x,e.y)/2};}
function fitPath(path, scale=.96){
  if(!path.length)return [];
  let max=0; for(const p of path) max=Math.max(max,Math.hypot(p[0],p[1]));
  const target=bounds().r*scale, k=max?target/max:1;
  return path.map(([x,y])=>[x*k,y*k]);
}
function fitRect(path, scale=.96){
  if(!path.length)return [];
  const xs=path.map(p=>p[0]), ys=path.map(p=>p[1]);
  const minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...ys),maxy=Math.max(...ys);
  const w=maxx-minx||1,h=maxy-miny||1,{rx,ry}=bounds();
  const k=Math.min((2*rx*scale)/w,(2*ry*scale)/h);
  const cx=(minx+maxx)/2,cy=(miny+maxy)/2;
  return path.map(([x,y])=>[(x-cx)*k,(y-cy)*k]);
}
function regularPolygon(n,r,phase=0,closed=true){
  const out=[]; for(let i=0;i<(closed?n+1:n);i++) out.push(pointPolar(r,phase+TAU*(i%n)/n)); return out;
}
function resampleClosed(path,n){
  if(path.length<2)return path.slice();
  const pts=path.slice(); if(dist(pts[0],pts[pts.length-1])>1e-9)pts.push(pts[0]);
  const cum=[0]; for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+dist(pts[i-1],pts[i]));
  const total=cum[cum.length-1]||1,out=[];
  for(let k=0;k<n;k++){
    const d=total*k/n; let j=1; while(j<cum.length&&cum[j]<d)j++;
    const a=pts[j-1],b=pts[Math.min(j,pts.length-1)],span=(cum[j]-cum[j-1])||1,t=(d-cum[j-1])/span;
    out.push([lerp(a[0],b[0],t),lerp(a[1],b[1],t)]);
  }
  return out;
}
function morphPaths(a,b,t,n=120){const A=resampleClosed(a,n),B=resampleClosed(b,n);return A.map((p,i)=>[lerp(p[0],B[i][0],t),lerp(p[1],B[i][1],t)]);}
function subdivide(path,maxLen){
  if(path.length<2)return path.slice(); let out=[];
  for(let i=0;i<path.length-1;i++){
    const a=path[i],b=path[i+1],n=Math.max(1,Math.ceil(dist(a,b)/maxLen));
    for(let j=0;j<n;j++)out.push([lerp(a[0],b[0],j/n),lerp(a[1],b[1],j/n)]);
  }
  out.push(path[path.length-1]); return out;
}
function arcConnector(a,b,steps=18){
  const ra=hypot(a),rb=hypot(b),ta=Math.atan2(a[1],a[0]),tb=Math.atan2(b[1],b[0]);
  let d=tb-ta; while(d>Math.PI)d-=TAU;while(d<-Math.PI)d+=TAU;
  return linspace(0,1,steps).map(u=>pointPolar(lerp(ra,rb,u),ta+d*u));
}
function rotateAndFit(path,deg,scale=.96){return fitPath(rotatePath(path,deg*DEG),scale);}
function deterministicNoise(i,seed=12345){const x=Math.sin(i*12.9898+seed*78.233)*43758.5453;return x-Math.floor(x);}

const C={
  range:(name,label,min,max,step,value,unit='')=>({type:'range',name,label,min,max,step,value,unit}),
  number:(name,label,min,max,step,value,unit='')=>({type:'number',name,label,min,max,step,value,unit}),
  check:(name,label,value=false)=>({type:'check',name,label,value}),
  select:(name,label,value,options)=>({type:'select',name,label,value,options}),
  textarea:(name,label,value,rows=8)=>({type:'textarea',name,label,value,rows}),
  text:(name,label,value)=>({type:'text',name,label,value})
};
const P={};
function addPattern(key,name,category,origin,description,controls,calc,special=null){P[key]={key,name,category,origin,description,controls,calc,special};}
function dyn(v){return typeof v==='function'?v():v;}
function defaultsFor(p){const o={};for(const c of p.controls)o[c.name]=dyn(c.value);return o;}
function maybeReverse(path,c){return c.reverse?reversePath(path):path;}
function shapeByName(name,r){
  if(name==='circle')return regularPolygon(96,r,0,true);
  if(name==='square')return regularPolygon(4,r,Math.PI/4,true);
  if(name==='star'){let q=[];for(let i=0;i<=10;i++)q.push(pointPolar(i%2?r*.45:r,-Math.PI/2+i*Math.PI/5));return q;}
  if(name==='heart'){let q=[];for(const t of linspace(0,TAU,120)){q.push([r*.052*16*Math.sin(t)**3,r*.052*(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))]);}return q;}
  return regularPolygon(6,r,0,true);
}

const easing={
  linear:t=>t,
  easeInSine:t=>1-Math.cos(t*Math.PI/2), easeOutSine:t=>Math.sin(t*Math.PI/2), easeInOutSine:t=>-(Math.cos(Math.PI*t)-1)/2,
  easeInQuad:t=>t*t, easeOutQuad:t=>1-(1-t)*(1-t), easeInOutQuad:t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2,
  easeInCubic:t=>t*t*t, easeOutCubic:t=>1-Math.pow(1-t,3), easeInOutCubic:t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2,
  easeInQuart:t=>t**4, easeOutQuart:t=>1-(1-t)**4, easeInOutQuart:t=>t<.5?8*t**4:1-(-2*t+2)**4/2,
  easeInQuint:t=>t**5, easeOutQuint:t=>1-(1-t)**5, easeInOutQuint:t=>t<.5?16*t**5:1-(-2*t+2)**5/2,
  easeInExpo:t=>t===0?0:2**(10*t-10), easeOutExpo:t=>t===1?1:1-2**(-10*t), easeInOutExpo:t=>t===0?0:t===1?1:t<.5?2**(20*t-10)/2:(2-2**(-20*t+10))/2,
  easeInCirc:t=>1-Math.sqrt(1-t*t), easeOutCirc:t=>Math.sqrt(1-(t-1)**2), easeInOutCirc:t=>t<.5?(1-Math.sqrt(1-(2*t)**2))/2:(Math.sqrt(1-(-2*t+2)**2)+1)/2
};

// -----------------------------------------------------------------------------
// 37 reference-set generator types — independently implemented for ORYN.
// -----------------------------------------------------------------------------
addPattern('circle','Circle','Geometry','Reference set','Circle with reference-style radius, start angle and reverse controls.',[
  C.range('radius','Radius (r)',1,()=>bounds().r,1,()=>bounds().r/2,'mm'),C.range('angle','Start Angle (θ)',0,360,1,0,'°'),C.check('reverse','Reverse',false)
],c=>maybeReverse(linspace(0,TAU,61).map(t=>pointPolar(c.radius,t+c.angle*DEG)),c));

addPattern('coordinates','Coordinates','Input','Reference set','Paste Cartesian X,Y coordinates. Values are centered around table origin.',[
  C.textarea('coordinates','Coordinates','100,0\n0,100\n-100,0\n0,-100\n100,0',10),C.check('reverse','Reverse',false)
],c=>maybeReverse(c.coordinates.split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('#')).map(s=>s.split(/[ ,\t]+/).map(Number)).filter(p=>p.length>=2&&p.every(Number.isFinite)).map(p=>[p[0],p[1]]),c));

addPattern('cross','Cross','Geometry','Reference set','Cross motif with adjustable intersection height and optional starburst approach.',[
  C.range('width','Width',1,()=>env().x,1,()=>env().x*.30,'mm'),C.range('height','Height',1,()=>env().y,1,()=>env().y*.50,'mm'),C.range('intersect','Intersect Height',0,100,1,75,'%'),C.check('starburst','Starburst',true),C.check('reverse','Reverse',false)
],c=>{const yc=(c.intersect/100)*c.height-c.height/2,w=c.width/2,h=c.height/2;let q=[];if(c.starburst){q.push([0,yc]);for(let i=0;i<16;i++){const a=TAU*i/16,rx=w*(1+.12*(i%4)),ry=(h+Math.abs(yc))*(1+.08*(i%3));q.push([rx*Math.cos(a),yc+ry*Math.sin(a)]);}q.push([0,yc]);}const arm=[[0,yc],[w,yc],[w,h],[w*.34,h],[w*.34,yc+c.height*.12],[-w*.34,yc+c.height*.12],[-w*.34,h],[-w,h],[-w,yc],[-w,-h],[-w*.34,-h],[-w*.34,yc-c.height*.12],[w*.34,yc-c.height*.12],[w*.34,-h],[w,-h],[w,yc],[0,yc]];q.push(...arm,...reversePath(arm));return maybeReverse(q,c);});

addPattern('curvature','Curvature','Experimental','Reference set','Symmetric curvature study built from progressively expanding arcs.',[
  C.range('radius','Start Radius',0,1,.01,.05),C.range('iterations','Iterations',2,100,2,40)
],c=>{const R=bounds().r,ball=env().ball;let right=[];for(let i=0;i<c.iterations;i++){const u=i/(c.iterations-1),r=R*(c.radius+(1-c.radius)*u),ang=Math.PI*(.18+.82*u);const sides=Math.max(8,Math.round(TAU*r/Math.max(ball*.5,1)));for(const t of linspace(Math.PI/2-ang/2,Math.PI/2+ang/2,Math.min(90,sides)))right.push(pointPolar(r,t));}let left=rotatePath(right,Math.PI);let p=[pointPolar(R,Math.PI/2),...right,...left,pointPolar(R,Math.PI/2)];return p;});

addPattern('cycloid','Cycloid','Curves','Reference set','Epi/hypocycloid family using signed rolling radius as in the reference control model.',[
  C.range('radius_a','Fixed Radius (A)',1,()=>bounds().r,1,30,'mm'),C.range('radius_b','Fixed Radius (B)',()=>-bounds().r,-1,1,()=>-Math.floor(bounds().r/2),'mm'),C.range('arm_length','Arm Length',1,()=>bounds().r,1,()=>Math.floor(bounds().r/2),'mm'),C.check('reverse','Reverse',false)
],c=>{const period=Math.abs(c.radius_b/gcd(c.radius_a,c.radius_b))*TAU,step=10*DEG,n=Math.max(2,Math.ceil(period/step));let p=[];for(let i=0;i<=n;i++){const t=i*step,ratio=(c.radius_a+c.radius_b)/c.radius_b;p.push([(c.radius_a+c.radius_b)*Math.cos(t)+c.arm_length*Math.cos(ratio*t),(c.radius_a+c.radius_b)*Math.sin(t)+c.arm_length*Math.sin(ratio*t)]);}return maybeReverse(p,c);});

addPattern('diameters','Diameters','Radial','Reference set','Rotating diameters with transverse wave modulation.',[
  C.range('spokes','Spokes',2,60,2,12),C.range('waves','Waves',1,30,1,4),C.range('amplitude','Amplitude',0,60,1,20,'mm')
],c=>{const R=bounds().r,p=[],sub=80;for(let s=0;s<c.spokes;s++){const a=TAU*s/c.spokes,dir=s%2?1:-1;for(let j=0;j<=sub;j++){const x=dir*R*(2*j/sub-1),y=c.amplitude*Math.sin(TAU*c.waves*j/sub);p.push(rotatePoint([x,y],a));}}return p;});

addPattern('draw','Draw','Input','Reference set','Freehand drawing directly on the preview. The recorded path remains continuous and exports normally.',[],()=>state.drawPath.length?state.drawPath.slice():[[0,0]],'draw');

addPattern('egg','Egg','Organic','Reference set','Egg-shaped closed curve with scalable size.',[
  C.range('radius','Size',20,()=>bounds().r,1,()=>bounds().r/2,'mm'),C.check('reverse','Reverse',false)
],c=>{let p=[];for(const t of linspace(-Math.PI,Math.PI,361)){const den=1+.32*Math.sin(t),x=c.radius*.78*Math.cos(t)/den,y=c.radius*Math.sin(t);p.push(rotatePoint([x,y],-Math.PI/2));}return maybeReverse(fitPath(p,Math.min(.96,c.radius/bounds().r)),c);});

addPattern('farris','Farris Curve','Curves','Reference set','Three-frequency Farris curve.',[
  C.range('A','A Coefficient',0,20,1,1),C.range('B','B Coefficient',0,20,1,6),C.range('C','C Coefficient',0,20,1,14),C.range('scale','Scale',0,100,1,25,'%'),C.range('rotation','Rotation',-180,180,1,0,'°')
],c=>{const d=Math.min(env().x,env().y),p=[];for(const t of linspace(0,TAU,1201)){p.push([(c.scale/100)*d*(Math.cos(c.A*t)+Math.cos(c.B*t)/2+Math.sin(c.C*t)/3),(c.scale/100)*d*(Math.sin(c.A*t)+Math.sin(c.B*t)/2+Math.cos(c.C*t)/3)]);}return rotatePath(p,(c.rotation-Math.atan2(1/3,1.5)/DEG)*DEG);});

addPattern('fermatspiral','Fermat Spiral','Spirals','Reference set','Two-arm Fermat-style spiral with optional perimeter return.',[
  C.range('revolutions','Revolutions',1,10,1,3),C.check('returnHome','Return Home',false),C.check('reverse','Reverse',false)
],c=>{const a=30/c.revolutions,steps=60*c.revolutions,tmax=TAU*c.revolutions,p=[];for(let i=steps;i>=0;i--){const t=tmax*i/steps;p.push([a*t*Math.cos(t),a*t*Math.sin(t)]);}for(let i=0;i<=steps;i++){const t=tmax*i/steps;p.push([-a*t*Math.cos(t),-a*t*Math.sin(t)]);}if(c.returnHome){const R=bounds().r;for(const t of linspace(Math.PI,TAU,25))p.push(pointPolar(R,t));}return maybeReverse(p,c);});

addPattern('fibonacci','Fibonacci','Organic','Reference set','Golden-angle floret with reference-style easing, transitions and optional point sorting.',[
  C.range('points','Points',100,2000,100,500),C.select('easing','Easing','linear',Object.fromEntries(Object.keys(easing).map(k=>[k,k]))),C.select('transition','Transition','direct',{direct:'Direct',center:'Center',bezier:'Bezier Curve',arc:'Arc'}),C.check('sort','Sort Points',false),C.check('reverse','Reverse',false)
],c=>{const R=bounds().r,rmin=env().ball/2,pts=[];for(let k=0;k<=c.points;k++){const u=k/c.points,r=R*(1-(easing[c.easing]||easing.linear)(u));const t=k*Math.PI*(3-Math.sqrt(5));pts.push(pointPolar(Math.max(rmin,r),t));}let seq=pts;if(c.sort){seq=pts.slice().sort((a,b)=>hypot(b)-hypot(a));}let p=[];for(const q of seq){if(p.length&&c.transition==='center')p.push([0,0]);else if(p.length&&c.transition==='arc')p.push(...arcConnector(p[p.length-1],q,8));else if(p.length&&c.transition==='bezier'){const a=p[p.length-1];for(let i=1;i<8;i++){const u=i/8,mid=[0,0];p.push([(1-u)*(1-u)*a[0]+2*(1-u)*u*mid[0]+u*u*q[0],(1-u)*(1-u)*a[1]+2*(1-u)*u*mid[1]+u*u*q[1]]);}}p.push(q);}p.push([0,0]);return maybeReverse(p,c);});

addPattern('fibonaccilollipops','Fibonacci Lollipops','Organic','Reference set','Golden-angle sequence of shrinking spiral lollipops.',[
  C.range('lollipopradius','Lollipop Radius',10,60,1,30,'mm'),C.range('lollipopsides','Lollipop Sides',3,12,1,6),C.range('lollipopturns','Lollipop Turns',1.5,7.5,1,3.5),C.range('spiral_factor','Shrink Factor',-.020,-.003,.0001,-.010)
],c=>{const R=bounds().r,rmin=env().ball/2,imax=Math.max(3,Math.floor(Math.log(rmin/R)/c.spiral_factor)),p=[];for(let i=0;i<Math.min(imax,220);i++){const a=i*Math.PI*(3-Math.sqrt(5)),rad=(R-c.lollipopradius)*Math.exp(c.spiral_factor*i),n=Math.round(c.lollipopturns*c.lollipopsides);for(let k=0;k<=n;k++){const t=TAU*k/c.lollipopsides,rr=c.lollipopradius*(1-.5*i/imax)*k/n;const q=rotatePoint(pointPolar(rr,t),a);p.push([q[0]+rad*Math.cos(a),q[1]+rad*Math.sin(a)]);}p.push([0,0]);}return p;});

addPattern('flower','Flower','Organic','Reference set','Dense multi-petal sand flower. Deterministic ORYN implementation keeps a continuous routed path.',[
  C.range('petals','Petals',13,31,2,23)
],c=>{const R=bounds().r,p=[[0,0]],base=R*.23;for(let i=0;i<c.petals;i++){const a=-TAU*i/c.petals,petal=[];for(const t of linspace(0,TAU,90)){const x=base+R*.33*Math.cos(t)*(1+.18*Math.sin(t)),y=R*.10*Math.sin(t);petal.push(rotatePoint([x,y],a));}p.push(...petal);p.push([0,0]);}return p;});

addPattern('frame','Frame','Spirals','Reference set','Ring of logarithmic spiral flourishes around a circular frame.',[
  C.range('num_spiral','Spirals',2,12,1,4),C.range('a','a',-1,1,.01,.5),C.range('b','b',-1,0,.01,-.35),C.range('revolutions','Revolutions',.1,4,.1,2),C.range('rotate','Rotate',0,360,1,0,'°')
],c=>{const R=bounds().r,p=[];p.push(...regularPolygon(80,R,0,true).reverse());for(let j=0;j<c.num_spiral;j++){let q=[];for(const t of linspace(0,TAU*c.revolutions,120)){const rr=R*.25*c.a*Math.exp(c.b*t);q.push(pointPolar(rr,t));}q=translatePath(q,R*.72,0);q=rotatePath(q,-TAU*j/c.num_spiral);p.push(...q);}return rotatePath(p,c.rotate*DEG);});

addPattern('gcode','G-code Input','Input','Reference set','Paste G0/G1 Cartesian G-code. X/Y are interpreted in positive machine coordinates and recentered for preview.',[
  C.textarea('gcode','G-Code','G0 X336.00 Y190.00\nG1 X236.00 Y290.00\nG1 X136.00 Y190.00\nG1 X236.00 Y90.00\nG1 X336.00 Y190.00',10),C.check('reverse','Reverse',false)
],c=>{const {rx,ry}=bounds(),p=[];for(const line of c.gcode.split(/\r?\n/)){if(!/^\s*G0?1?\b/i.test(line))continue;const mx=line.match(/X\s*(-?\d+(?:\.\d+)?)/i),my=line.match(/Y\s*(-?\d+(?:\.\d+)?)/i);if(mx&&my)p.push([+mx[1]-rx,+my[1]-ry]);}return maybeReverse(p.length?p:[[0,0]],c);});

addPattern('gravity','Gravity','Simulation','Reference set','Single-attractor orbital simulation with adjustable mass, start position and velocity.',[
  C.range('steps','Iteration Steps',1000,10000,100,2000),C.range('A1m','Attractor Mass',.1,100,.1,50),C.range('xp0','X0 Position',()=>-bounds().rx,()=>bounds().rx,1,0,'mm'),C.range('yp0','Y0 Position',()=>-bounds().ry,()=>bounds().ry,.1,0,'mm'),C.range('xv0','X0 Velocity',-20,20,.01,5),C.range('yv0','Y0 Velocity',-20,20,.01,5)
],c=>{let x=c.xp0,y=c.yp0,vx=c.xv0,vy=c.yv0,p=[];const dt=.035,G=14;for(let i=0;i<c.steps;i++){const r2=x*x+y*y+25,r=Math.sqrt(r2),a=-G*c.A1m/r2;vx+=a*x/r*dt;vy+=a*y/r*dt;x+=vx*dt;y+=vy*dt;p.push([x,y]);if(Math.hypot(x,y)>bounds().r*1.5){vx*=-.7;vy*=-.7;}}return fitPath(p,.95);});

addPattern('heart','Heart','Organic','Reference set','Spiralized parametric heart with coefficient, shrink and twist controls.',[
  C.range('a','X cof. a',1,20,1,16),C.range('b','Y cof. b',1,20,1,13),C.range('c','Y cof. c',1,20,1,5),C.range('d','Y cof. d',1,20,1,2),C.range('e','Y cof. e',1,20,1,1),C.range('scale','Scale',1,20,.2,10),C.range('shrink','Shrink',.0002,.002,.0001,.0003),C.range('twist','Twist',-1,1,.01,0),C.check('reverse','Reverse',false)
],c=>{let p=[],r=1,step=0;while(r>0&&step<6000){const t=TAU*step/80,x=r*c.scale*c.a*Math.sin(t)**3,y=r*c.scale*(c.b*Math.cos(t)-c.c*Math.cos(2*t)-c.d*Math.cos(3*t)-c.e*Math.cos(4*t));p.push(rotatePoint([x,y],c.twist*t/80));r-=c.shrink;step++;}return maybeReverse(p,c);});

addPattern('lindenmayer','Lindenmayer','Fractals','Reference set','Hilbert, Gosper and Sierpiński-arrowhead L-system paths.',[
  C.select('curve','Curve','hilbert_curve',{hilbert_curve:'Hilbert Curve',gosper_curve:'Gosper Curve',sierpinski_arrowhead:'Sierpinski Arrowhead'}),C.range('iterations','Iterations',1,7,1,3),C.range('length','Line Length',1,50,.1,10,'mm'),C.range('rotate','Rotate',0,360,1,0,'°'),C.check('reverse','Reverse',false)
],c=>{let axiom,rules,ang;if(c.curve==='gosper_curve'){axiom='A';rules={A:'A-B--B+A++AA+B-',B:'+A-BB--B-A++A+B'};ang=60;}else if(c.curve==='sierpinski_arrowhead'){axiom='A';rules={A:'B-A-B',B:'A+B+A'};ang=60;}else{axiom='A';rules={A:'+BF-AFA-FB+',B:'-AF+BFB+FA-'};ang=90;}let s=axiom;for(let it=0;it<c.iterations;it++){let n='';for(const ch of s)n+=rules[ch]||ch;s=n;if(s.length>180000)break;}let x=0,y=0,a=0,p=[[0,0]];for(const ch of s){if('FAB'.includes(ch)){const nx=x+c.length*Math.cos(a),ny=y+c.length*Math.sin(a);x=nx;y=ny;p.push([x,y]);}else if(ch==='+')a+=ang*DEG;else if(ch==='-')a-=ang*DEG;}p=fitRect(p,.94);p=rotatePath(p,c.rotate*DEG);return maybeReverse(p,c);});

addPattern('lissajous','Lissajous Curve','Curves','Reference set','Reference-style cosine Lissajous with amplitude, frequency, phase and rotation.',[
  C.range('A','X Amplitude',0,()=>bounds().rx,1,()=>bounds().rx,'mm'),C.range('a1','X Frequency (a)',1,100,1,8),C.range('B','Y Amplitude',0,()=>bounds().ry,1,()=>bounds().ry,'mm'),C.range('b1','Y Frequency (b)',1,100,1,9),C.range('phase','Phase Offset',-Math.PI,Math.PI,Math.PI/32,0,'rad'),C.range('rotation','Rotation',-180,180,1,0,'°')
],c=>{const period=TAU/gcd(c.a1,c.b1),p=[];for(const t of linspace(0,period,5001))p.push([c.A*Math.cos(c.a1*t+c.phase),c.B*Math.cos(c.b1*t)]);return rotatePath(p,c.rotation*DEG);});

addPattern('logspiral','Logarithmic Spiral','Spirals','Reference set','Logarithmic spiral with reference a/b/revolution controls.',[
  C.range('a','a',-1,1,.1,1),C.range('b','b',-1,0,.01,-.25),C.range('revolutions','Revolutions',1,60,1,4),C.range('rotate','Rotate',0,360,1,0,'°'),C.check('reverse','Reverse',false)
],c=>{const R=bounds().r,p=[],sides=60,imax=Math.ceil((c.revolutions+1/sides)*sides);for(let i=0;i<imax;i++){const t=TAU*i/sides,r=R*c.a*Math.exp(c.b*t);p.push(pointPolar(r,t));}p.splice(0,p.length,...rotatePath(p,c.rotate*DEG));return maybeReverse(p,c);});

addPattern('parametric','Parametric','Curves','Reference set','Custom parametric equations. Use JavaScript Math functions and variable t.',[
  C.text('x','X','Math.sin(t)*(Math.exp(Math.cos(t))-2*Math.cos(4*t)-Math.pow(Math.sin(t/12),5))*60'),C.text('y','Y','Math.cos(t)*(Math.exp(Math.cos(t))-2*Math.cos(4*t)-Math.pow(Math.sin(t/12),5))*60'),C.number('tmin','t min',-100,100,.1,0),C.number('tmax','t max',-100,100,.1,TAU),C.number('steps','Steps',20,10000,10,720)
],c=>{let fx,fy;try{fx=new Function('t','Math',`return (${c.x})`);fy=new Function('t','Math',`return (${c.y})`);}catch(_){return [[0,0]];}const p=[];for(const t of linspace(c.tmin,c.tmax,Math.round(c.steps))){try{const x=+fx(t,Math),y=+fy(t,Math);if(Number.isFinite(x)&&Number.isFinite(y))p.push([x,y]);}catch(_){}}return p.length?p:[[0,0]];});

addPattern('rectangle','Rectangle','Geometry','Reference set','Centered rectangle with reference width/height controls.',[
  C.range('width','Width',1,()=>env().x,1,()=>env().x/2,'mm'),C.range('height','Height',1,()=>env().y,1,()=>env().y/2,'mm'),C.check('reverse','Reverse',false)
],c=>maybeReverse([[-c.width/2,-c.height/2],[c.width/2,-c.height/2],[c.width/2,c.height/2],[-c.width/2,c.height/2],[-c.width/2,-c.height/2]],c));

addPattern('rhodonea','Rhodonea (Rose) Curve','Curves','Reference set','Classic rose curve r = A sin(kθ), sampled over one full revolution.',[
  C.range('amplitude','Amplitude',0,()=>bounds().r,1,()=>bounds().r,'mm'),C.range('petals','Petal Value (k)',.5,20,.5,5)
],c=>linspace(0,TAU,501).map(t=>pointPolar(c.amplitude*Math.sin(c.petals*t),t)));

addPattern('shapemorph','Shape Morph','Morph','Reference set','Morphs between circle, heart, star and square while radius grows outward.',[
  C.select('startShape','Inside Shape','square',{circle:'Circle',heart:'Heart',star:'Star',square:'Square'}),C.select('endShape','Outside Shape','circle',{circle:'Circle',heart:'Heart',star:'Star',square:'Square'}),C.range('revolutions','Revolutions',1,40,1,10),C.range('twist','Twist',-1,1,.01,0),C.range('completion','Completion',.1,1,.1,.5),C.check('reverse','Reverse',false)
],c=>{const R=bounds().r,A=shapeByName(c.startShape,R),B=shapeByName(c.endShape,R),n=120,p=[],steps=Math.round(c.revolutions*n);for(let i=0;i<=steps;i++){const u=i/steps,rev=i/n,m=clamp((u/c.completion),0,1),shape=morphPaths(A,B,m,n);let q=shape[i%n];q=[q[0]*u,q[1]*u];p.push(rotatePoint(q,c.twist*TAU*rev/n));}return maybeReverse(p,c);});

addPattern('shapespin','Shape Spin','Morph','Reference set','Rotates an offset ellipse-like shape around the table center.',[
  C.range('steps','Steps',1,120,1,30)
],c=>{const R=bounds().r,base=[];for(const t of linspace(0,TAU,61))base.push([.3*R+.7*R*Math.cos(t),.3*R*Math.sin(t)]);let p=[];for(let i=0;i<c.steps;i++)p.push(...rotatePath(base,TAU*i/c.steps));return fitPath(p,.96);});

addPattern('sinewaves','Sine Waves','Waves','Reference set','Circularly clipped field of sinusoidal lines with vertical/horizontal period modulation.',[
  C.range('lineCount','Line Count',10,200,1,50),C.range('amplitude','Amplitude (% of R)',0,.25,.01,.1),C.range('vertPeriods','Vert Periods',1,10,.5,2.5),C.range('horPeriods','Hor Periods',1,10,.5,2.5)
],c=>{const R=bounds().r,p=[];for(let i=0;i<c.lineCount;i++){const x=lerp(R,-R,i/(c.lineCount-1)),amp=R*c.amplitude*Math.sin(TAU*c.horPeriods*i/c.lineCount),row=[];for(let j=0;j<100;j++){const y=lerp(-R,R,j/99),xx=x+amp*Math.sin(TAU*c.vertPeriods*j/99);if(Math.hypot(xx,y)<=R)row.push([xx,y]);}if(i%2)row.reverse();p.push(...row);}return p;});

addPattern('spinmorph','Spin Morph','Morph','Reference set','Spins an offset square, then transitions it into a shrinking circle.',[
  C.range('radius','Radius (r)',1,()=>bounds().r,1,()=>bounds().r/2,'mm'),C.range('angle','Start Angle (θ)',0,360,1,0,'°'),C.check('reverse','Reverse',false)
],c=>{const R=c.radius,sq=translatePath(regularPolygon(4,R*.5,Math.PI/4,true),R*.5,0),cir=translatePath(regularPolygon(60,R*.5,0,true),R*.5,0),p=[];for(let i=0;i<90;i++)p.push(...rotatePath(sq,TAU*i/90));for(let i=0;i<90;i++){const u=i/89,m=morphPaths(scalePath(sq,1-u),scalePath(cir,1-u),u,60);p.push(...rotatePath(m,TAU*i/90));}const q=rotatePath(p,c.angle*DEG);return maybeReverse(q,c);});

addPattern('spiral','Spiral','Spirals','Reference set','Reference-style polygonal spiral: sides, revolutions, start radius, theta, twist, deterministic noise and reverse.',[
  C.range('sides','Sides',3,60,1,12),C.range('revolutions','Revolutions',1,60,1,20),C.range('start_r','Start Radius',0,1,.01,0),C.range('start_theta','Start Theta',0,360,1,0,'°'),C.range('twist','Twist',-1,1,.01,0),C.range('noise','Noise',0,50,1,0,'mm'),C.check('reverse','Reverse',false)
],c=>{const R=bounds().r,iMax=Math.round(c.sides*c.revolutions),thetaMax=TAU*c.revolutions,sx=c.start_r*R*Math.cos(c.start_theta*DEG),sy=c.start_r*R*Math.sin(c.start_theta*DEG),p=[];for(let i=0;i<=iMax;i++){const u=i/iMax,tw=(1-u)*c.twist*TAU,t=u*thetaMax-tw;let r=R*u;if(c.noise&&i>0&&i<iMax)r-=c.noise*deterministicNoise(i,17);p.push([r*Math.cos(t)+sx*(1-u),r*Math.sin(t)+sy*(1-u)]);}return maybeReverse(p,c);});

addPattern('spiralzigzag','Spiral Zig Zag','Spirals','Reference set','Zig-zag fill derived from a nine-turn inward spiral, ball-size aware.',[
  C.range('radius','Radius (r)',1,()=>bounds().r,1,()=>bounds().r/2,'mm'),C.range('angle','Start Angle (θ)',0,360,1,0,'°'),C.check('reverse','Reverse',false)
],c=>{const R=bounds().r-env().ball,rev=9,inner=Math.max(0,R-rev*2*env().ball),base=[];for(let i=0;i<=rev*120;i++){const u=i/(rev*120),r=lerp(R,inner,u),t=TAU*rev*u;base.push(pointPolar(r,t));}const p=[];for(let i=0;i<base.length;i++){const q=base[i],a=Math.atan2(q[1],q[0]),rr=hypot(q)+(i%2?env().ball:-env().ball)*.5;p.push(pointPolar(rr,a));}p.unshift([bounds().r,0]);let q=scalePath(p,-1,1);q=rotatePath(q,c.angle*DEG);return maybeReverse(q,c);});

addPattern('spokes','Spokes','Radial','Reference set','Alternating radial spokes with sinusoidal transverse wave.',[
  C.range('spokes','Spokes',1,120,1,60),C.range('waves','Waves',.5,10,.5,4),C.range('amplitude','Amplitude',0,60,1,10,'mm'),C.check('reverse','Reverse',false)
],c=>{const R=bounds().r,p=[],sub=60;for(let s=0;s<c.spokes;s++){const a=TAU*s/c.spokes,dir=s%2?1:-1;for(let j=0;j<=sub;j++){const u=j/sub,x=dir*R*u,y=dir*c.amplitude*Math.sin(TAU*c.waves*u);p.push(rotatePoint([x,y],a));}}return maybeReverse(p,c);});

addPattern('star','Star','Geometry','Reference set','Expanding spiral-star with pointiness, revolutions and twist.',[
  C.range('points','Points',2,12,1,5),C.range('pointiness','Pointiness',0,1,.01,.5),C.range('revolutions','Revolutions',1,60,1,20),C.range('twist','Twist',-1,1,.01,0),C.check('reverse','Reverse',false)
],c=>{const R=bounds().r,sides=2*c.points,iMax=sides*c.revolutions,p=[];for(let i=0;i<=iMax;i++){const u=i/iMax,t=u*TAU*c.revolutions-(1-u)*c.twist*TAU,r=(1-(i%2)*c.pointiness)*R*u;p.push(pointPolar(r,t));}return maybeReverse(p,c);});

addPattern('sunset','Sunset','Scenes','Reference set','Continuous stylized sunset: sky arc, horizon strokes, sun and lower wave field.',[],()=>{const R=bounds().r,p=[];for(const t of linspace(0,Math.PI/2,13))p.push(pointPolar(R,t));let dir=1;for(let j=1;j<=20;j++){const y=R*Math.exp(-j/20),x=Math.sqrt(Math.max(0,R*R-y*y));p.push([dir*x,y],[-dir*x,y]);dir*=-1;}const yh=R*.18;p.push([0,yh]);for(let ring=1;ring<=5;ring++)for(const t of linspace(-Math.PI/2,1.5*Math.PI,25))p.push([R*.03*ring*Math.cos(t),yh+R*.03*ring*Math.sin(t)]);let y=yh,step=0;while(y>-R&&step<90){const spacing=env().ball*.33*Math.pow(2/.33,step/90);const x=Math.sqrt(Math.max(0,R*R-y*y));p.push([dir*x,y],[-dir*x,y]);dir*=-1;y-=spacing;step++;}return p;});

addPattern('superellipse','Superellipse','Geometry','Reference set','Superellipse with optional progressive spiralization.',[
  C.range('width','Width',0,()=>bounds().rx,1,()=>bounds().r,'mm'),C.range('height','Height',0,()=>bounds().ry,1,()=>bounds().r,'mm'),C.range('n','n-value',.1,10,.1,1.5),C.check('spiralize','Spiralize',true),C.check('reverse','Reverse',false)
],c=>{const p=[],sg=v=>v===0?0:Math.sign(v),sides=60;if(c.spiralize){const loops=30;for(let loop=0;loop<loops;loop++){const nb=.1+(c.n-.1)*loop/loops;for(let j=0;j<=sides;j++){const t=TAU*j/sides,a=c.width*(loop+j/sides)/loops,b=c.height*(loop+j/sides)/loops;p.push([sg(Math.cos(t))*Math.abs(Math.cos(t))**(2/nb)*a,sg(Math.sin(t))*Math.abs(Math.sin(t))**(2/nb)*b]);}}}else for(let j=0;j<=sides;j++){const t=TAU*j/sides;p.push([sg(Math.cos(t))*Math.abs(Math.cos(t))**(2/c.n)*c.width,sg(Math.sin(t))*Math.abs(Math.sin(t))**(2/c.n)*c.height]);}return maybeReverse(p,c);});

const FONT5={
 A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],G:['01111','10000','10000','10111','10001','10001','01111'],H:['10001','10001','10001','11111','10001','10001','10001'],I:['11111','00100','00100','00100','00100','00100','11111'],J:['00111','00010','00010','00010','10010','10010','01100'],K:['10001','10010','10100','11000','10100','10010','10001'],L:['10000','10000','10000','10000','10000','10000','11111'],M:['10001','11011','10101','10101','10001','10001','10001'],N:['10001','11001','10101','10011','10001','10001','10001'],O:['01110','10001','10001','10001','10001','10001','01110'],P:['11110','10001','10001','11110','10000','10000','10000'],Q:['01110','10001','10001','10001','10101','10010','01101'],R:['11110','10001','10001','11110','10100','10010','10001'],S:['01111','10000','10000','01110','00001','00001','11110'],T:['11111','00100','00100','00100','00100','00100','00100'],U:['10001','10001','10001','10001','10001','10001','01110'],V:['10001','10001','10001','10001','10001','01010','00100'],W:['10001','10001','10001','10101','10101','10101','01010'],X:['10001','10001','01010','00100','01010','10001','10001'],Y:['10001','10001','01010','00100','00100','00100','00100'],Z:['11111','00001','00010','00100','01000','10000','11111'],
 '0':['01110','10001','10011','10101','11001','10001','01110'],'1':['00100','01100','00100','00100','00100','00100','01110'],'2':['01110','10001','00001','00010','00100','01000','11111'],'3':['11110','00001','00001','01110','00001','00001','11110'],'4':['00010','00110','01010','10010','11111','00010','00010'],'5':['11111','10000','10000','11110','00001','00001','11110'],'6':['01110','10000','10000','11110','10001','10001','01110'],'7':['11111','00001','00010','00100','01000','01000','01000'],'8':['01110','10001','10001','01110','10001','10001','01110'],'9':['01110','10001','10001','01111','00001','00001','01110'],' ':['00000','00000','00000','00000','00000','00000','00000']
};
function rasterTextPath(text,scale){const cell=env().ball*1.15*scale,lines=String(text).toUpperCase().split('\n'),p=[];for(let li=0;li<lines.length;li++){let x0=0;for(const ch of lines[li]){const glyph=FONT5[ch]||FONT5[' '];for(let r=0;r<7;r++){const runs=[];let on=false,start=0;for(let col=0;col<=5;col++){const bit=col<5&&glyph[r][col]==='1';if(bit&&!on){on=true;start=col;}if(on&&!bit){runs.push([start,col-1]);on=false;}}if(r%2)runs.reverse();for(const [a,b] of runs){p.push([x0+a*cell,-(li*9+r)*cell],[x0+b*cell,-(li*9+r)*cell]);}}x0+=6*cell;}}return fitRect(p.length?p:[[0,0]],.9);}
addPattern('text','Text','Input','Reference set','Offline single-line raster/vector text for A–Z and 0–9. No external fonts or web dependency.',[
  C.range('scale','Scale',.8,1.2,.1,1),C.textarea('text','Text','HELLO\nWORLD',6)
],c=>rasterTextPath(c.text,c.scale));

addPattern('thr','Theta–Rho Input','Input','Reference set','Paste theta-rho lines as “theta rho”. Rho is normalized 0–1. Continuous theta is accepted.',[
  C.textarea('thr','Theta Rho','# theta rho\n0 0\n1.5708 0.35\n3.1416 0.70\n4.7124 0.90\n6.2832 1.0',10)
],c=>{const R=bounds().r,cmd=[];for(const line of c.thr.split(/\r?\n/)){const s=line.trim();if(!s||s.startsWith('#'))continue;const v=s.split(/[ ,\t]+/).map(Number);if(v.length>=2&&Number.isFinite(v[0])&&Number.isFinite(v[1]))cmd.push(v);}if(!cmd.length)return [[0,0]];const p=[];for(let i=0;i<cmd.length;i++){if(i===0){const q=pointPolar(R*cmd[i][1],cmd[i][0]);p.push([q[1],q[0]]);continue;}const [ta,ra]=cmd[i-1],[tb,rb]=cmd[i],n=Math.max(1,Math.ceil(Math.abs(tb-ta)/TAU*60));for(let j=1;j<=n;j++){const u=j/n,q=pointPolar(R*lerp(ra,rb,u),lerp(ta,tb,u));p.push([q[1],q[0]]);}}return p;});

addPattern('wigglyspiral','Wiggly Spiral','Spirals','Reference set','Inward Archimedean spiral with radial sine modulation.',[
  C.range('offset','Offset',2,40,1,20,'mm/rev'),C.range('amplitude','Amplitude',1,10,.1,5,'mm'),C.range('wiggles','Wiggles/Rev',0,40,.1,20)
],c=>{const R=bounds().r,p=[];let step=0,r=R;while(r>0&&step<20000){const t=TAU*step/300;r=R-c.offset*(step/300)-c.amplitude*Math.sin(c.wiggles*t);p.push(pointPolar(r,t));step++;}return p;});

addPattern('zigzag','Zig Zag','Waves','Reference set','Alternating zig-zag sweep bounded by rectangle or circle, with margin, rotation and optional border.',[
  C.select('bound','Bounding Shape','rectangle',{rectangle:'Max Rectangle',circle:'Max Circle'}),C.range('spacing','Spacing',()=>-bounds().ry,-1,1,()=>-bounds().ry/2,'mm'),C.range('margin','Margin',0,()=>bounds().r/5,1,0,'mm'),C.range('rotation','Rotation',-180,180,1,0,'°'),C.check('border','Border',false),C.check('reverse','Reverse',false)
],c=>{const {rx,ry,r}=bounds(),spacing=Math.max(1,Math.abs(c.spacing)),p=[];let y=-ry+c.margin,dir=1;while(y<=ry-c.margin){let xlim=rx-c.margin;if(c.bound==='circle')xlim=Math.sqrt(Math.max(0,(r-c.margin)**2-y*y));p.push([dir*-xlim,y],[dir*xlim,y]);dir*=-1;y+=spacing;}if(c.border){if(c.bound==='circle')p.push(...regularPolygon(90,r-c.margin,0,true));else p.push([-rx+c.margin,-ry+c.margin],[rx-c.margin,-ry+c.margin],[rx-c.margin,ry-c.margin],[-rx+c.margin,ry-c.margin],[-rx+c.margin,-ry+c.margin]);}let q=rotatePath(p,c.rotation*DEG);return maybeReverse(q,c);});

// -----------------------------------------------------------------------------
// 40 additional ORYN generators.
// -----------------------------------------------------------------------------
addPattern('archimedean','Archimedean Spiral','ORYN Spirals','ORYN original','Smooth Archimedean spiral with independent inner radius, turns and direction.',[
  C.range('turns','Turns',1,80,1,18),C.range('inner','Inner Radius',0,90,1,0,'%'),C.range('points','Points',120,6000,20,2200),C.check('reverse','Reverse',false)
],c=>{const R=bounds().r,r0=R*c.inner/100,p=linspace(0,TAU*c.turns,c.points).map((t,i)=>pointPolar(lerp(r0,R,i/(c.points-1)),t));return maybeReverse(p,c);});

addPattern('goldenspiral','Golden Spiral','ORYN Spirals','ORYN original','Logarithmic golden-ratio spiral normalized to the table.',[
  C.range('turns','Turns',1,16,1,7),C.range('tightness','Tightness',.5,2,.05,1),C.check('reverse','Reverse',false)
],c=>{const p=[];for(const t of linspace(-TAU*c.turns,0,1800)){const r=Math.pow((1+Math.sqrt(5))/2,(2*t/Math.PI)*c.tightness);p.push(pointPolar(r,t));}return maybeReverse(fitPath(p,.96),c);});

addPattern('hyperbolicspiral','Hyperbolic Spiral','ORYN Spirals','ORYN original','Hyperbolic spiral r = a/θ, trimmed near the singularity.',[
  C.range('turns','Turns',1,30,1,10),C.range('a','Scale',1,100,1,35),C.check('reverse','Reverse',false)
],c=>{const p=[];for(const t of linspace(.18,TAU*c.turns,1800))p.push(pointPolar(c.a/t,t));return maybeReverse(fitPath(p,.96),c);});

addPattern('doublespiral','Double Spiral','ORYN Spirals','ORYN original','Outward spiral paired with a mirrored return arm.',[
  C.range('turns','Turns',1,40,1,12),C.range('separation','Angular Separation',0,180,1,180,'°')
],c=>{const R=bounds().r,a=linspace(0,1,1400).map(u=>pointPolar(R*u,TAU*c.turns*u)),b=linspace(1,0,1400).map(u=>pointPolar(R*u,TAU*c.turns*u+c.separation*DEG));return [...a,...b];});

addPattern('concentriccircles','Concentric Circles','ORYN Geometry','ORYN original','Alternating concentric circles routed as one continuous pattern.',[
  C.range('rings','Rings',2,80,1,24),C.range('inner','Inner Radius',0,80,1,3,'%')
],c=>{const R=bounds().r,p=[];for(let i=0;i<c.rings;i++){const r=lerp(R*c.inner/100,R,i/(c.rings-1)),ring=regularPolygon(90,r,0,true);if(i%2)ring.reverse();p.push(...ring);}return p;});

addPattern('concentricpolygons','Concentric Polygons','ORYN Geometry','ORYN original','Nested regular polygons with alternating route direction.',[
  C.range('sides','Sides',3,20,1,6),C.range('rings','Rings',2,60,1,20),C.range('rotation','Rotation',0,180,1,0,'°')
],c=>{const R=bounds().r,p=[];for(let i=0;i<c.rings;i++){let q=regularPolygon(c.sides,R*(i+1)/c.rings,c.rotation*DEG,true);if(i%2)q.reverse();p.push(...q);}return p;});

addPattern('polygonspiral','Polygon Spiral','ORYN Spirals','ORYN original','Expanding polygonal spiral with selectable sides and twist.',[
  C.range('sides','Sides',3,18,1,5),C.range('turns','Turns',1,50,1,18),C.range('twist','Twist',-2,2,.05,.25)
],c=>{const R=bounds().r,p=[],n=c.sides*c.turns;for(let i=0;i<=n;i++){const u=i/n,t=TAU*i/c.sides+c.twist*TAU*u;p.push(pointPolar(R*u,t));}return p;});

addPattern('squarespiral','Square Spiral','ORYN Spirals','ORYN original','Orthogonal square spiral from center to perimeter.',[
  C.range('turns','Turns',2,80,1,24),C.range('spacing','Spacing',1,20,.5,6,'mm')
],c=>{let p=[[0,0]],x=0,y=0,len=c.spacing,dir=0;for(let k=0;k<c.turns*4;k++){if(dir===0)x+=len;else if(dir===1)y+=len;else if(dir===2)x-=len;else y-=len;p.push([x,y]);dir=(dir+1)%4;if(dir%2===0)len+=c.spacing;}return fitPath(p,.96);});

addPattern('trianglespiral','Triangle Spiral','ORYN Spirals','ORYN original','Three-sided expanding spiral.',[
  C.range('turns','Turns',2,80,1,22),C.range('phase','Phase',-180,180,1,-90,'°')
],c=>{const R=bounds().r,p=[],n=c.turns*3;for(let i=0;i<=n;i++)p.push(pointPolar(R*i/n,c.phase*DEG+TAU*i/3));return p;});

addPattern('hexspiral','Hex Spiral','ORYN Spirals','ORYN original','Six-sided expanding spiral suited to crisp geometric sand patterns.',[
  C.range('turns','Turns',2,80,1,20),C.range('phase','Phase',-180,180,1,0,'°')
],c=>{const R=bounds().r,p=[],n=c.turns*6;for(let i=0;i<=n;i++)p.push(pointPolar(R*i/n,c.phase*DEG+TAU*i/6));return p;});

addPattern('maurerrose','Maurer Rose','ORYN Curves','ORYN original','Maurer rose connecting discrete samples of a rhodonea curve.',[
  C.range('n','Rose n',1,20,1,6),C.range('d','Step d',1,179,1,71,'°'),C.range('steps','Segments',60,1440,1,360)
],c=>{const R=bounds().r,p=[];for(let i=0;i<=c.steps;i++){const k=i*c.d*DEG,r=R*Math.sin(c.n*k);p.push(pointPolar(r,k));}return p;});

addPattern('epicycloid','Epicycloid','ORYN Curves','ORYN original','Point on a circle rolling outside a fixed circle.',[
  C.range('R','Fixed Radius',10,160,1,80),C.range('r','Rolling Radius',2,80,1,20)
],c=>{const period=TAU*c.r/gcd(c.R,c.r),p=[];for(const t of linspace(0,Math.abs(period),1600)){const k=(c.R+c.r)/c.r;p.push([(c.R+c.r)*Math.cos(t)-c.r*Math.cos(k*t),(c.R+c.r)*Math.sin(t)-c.r*Math.sin(k*t)]);}return fitPath(p,.96);});

addPattern('hypocycloid','Hypocycloid','ORYN Curves','ORYN original','Point on a circle rolling inside a fixed circle.',[
  C.range('R','Fixed Radius',10,180,1,100),C.range('r','Rolling Radius',2,90,1,25)
],c=>{const period=TAU*c.r/gcd(c.R,c.r),p=[];for(const t of linspace(0,Math.abs(period),1600)){const k=(c.R-c.r)/c.r;p.push([(c.R-c.r)*Math.cos(t)+c.r*Math.cos(k*t),(c.R-c.r)*Math.sin(t)-c.r*Math.sin(k*t)]);}return fitPath(p,.96);});

addPattern('epitrochoid','Epitrochoid','ORYN Curves','ORYN original','Generalized epicycloid with adjustable pen offset.',[
  C.range('R','Fixed Radius',10,160,1,70),C.range('r','Rolling Radius',2,80,1,22),C.range('d','Pen Offset',0,120,1,45)
],c=>{const period=TAU*c.r/gcd(c.R,c.r),p=[];for(const t of linspace(0,Math.abs(period),1800)){const k=(c.R+c.r)/c.r;p.push([(c.R+c.r)*Math.cos(t)-c.d*Math.cos(k*t),(c.R+c.r)*Math.sin(t)-c.d*Math.sin(k*t)]);}return fitPath(p,.96);});

addPattern('hypotrochoid','Hypotrochoid','ORYN Curves','ORYN original','Generalized hypocycloid with adjustable pen offset.',[
  C.range('R','Fixed Radius',10,180,1,105),C.range('r','Rolling Radius',2,90,1,35),C.range('d','Pen Offset',0,120,1,55)
],c=>{const period=TAU*c.r/gcd(c.R,c.r),p=[];for(const t of linspace(0,Math.abs(period),1800)){const k=(c.R-c.r)/c.r;p.push([(c.R-c.r)*Math.cos(t)+c.d*Math.cos(k*t),(c.R-c.r)*Math.sin(t)-c.d*Math.sin(k*t)]);}return fitPath(p,.96);});

addPattern('astroid','Astroid','ORYN Curves','ORYN original','Four-cusped hypocycloid / astroid.',[
  C.range('size','Size',10,100,1,90,'%'),C.range('turns','Repeats',1,12,1,1)
],c=>{const R=bounds().r*c.size/100,p=[];for(const t of linspace(0,TAU*c.turns,1000))p.push([R*Math.cos(t)**3,R*Math.sin(t)**3]);return p;});

addPattern('deltoid','Deltoid','ORYN Curves','ORYN original','Three-cusped hypocycloid.',[
  C.range('size','Size',10,100,1,90,'%'),C.range('rotation','Rotation',-180,180,1,0,'°')
],c=>{const a=bounds().r*c.size/300,p=[];for(const t of linspace(0,TAU,1000))p.push([2*a*Math.cos(t)+a*Math.cos(2*t),2*a*Math.sin(t)-a*Math.sin(2*t)]);return rotatePath(p,c.rotation*DEG);});

addPattern('nephroid','Nephroid','ORYN Curves','ORYN original','Six-cusped-looking epicycloid form generated from the nephroid equations.',[
  C.range('size','Size',10,100,1,80,'%'),C.range('rotation','Rotation',-180,180,1,0,'°')
],c=>{const a=bounds().r*c.size/600,p=[];for(const t of linspace(0,TAU,1200))p.push([3*a*Math.cos(t)-a*Math.cos(3*t),3*a*Math.sin(t)-a*Math.sin(3*t)]);return rotateAndFit(p,c.rotation,.96);});

addPattern('cardioid','Cardioid','ORYN Curves','ORYN original','Polar cardioid with adjustable lobe orientation.',[
  C.range('size','Size',10,100,1,88,'%'),C.range('rotation','Rotation',-180,180,1,-90,'°')
],c=>{const R=bounds().r*c.size/200,p=[];for(const t of linspace(0,TAU,1000))p.push(pointPolar(R*(1-Math.cos(t)),t+c.rotation*DEG));return fitPath(p,.96);});

addPattern('lemniscateb','Lemniscate of Bernoulli','ORYN Curves','ORYN original','Classic figure-eight lemniscate.',[
  C.range('size','Size',10,100,1,90,'%'),C.range('rotation','Rotation',-180,180,1,0,'°')
],c=>{const a=bounds().r*c.size/100,p=[];for(const t of linspace(-Math.PI/4,7*Math.PI/4,1400)){const d=1+Math.sin(t)**2;p.push([a*Math.cos(t)/d,a*Math.sin(t)*Math.cos(t)/d]);}return rotatePath(p,c.rotation*DEG);});

addPattern('gerono','Gerono Lemniscate','ORYN Curves','ORYN original','Smooth figure-eight using x=cos(t), y=sin(t)cos(t).',[
  C.range('size','Size',10,100,1,90,'%'),C.range('rotation','Rotation',-180,180,1,0,'°')
],c=>{const R=bounds().r*c.size/100,p=linspace(0,TAU,1200).map(t=>[R*Math.cos(t),R*Math.sin(t)*Math.cos(t)]);return rotatePath(p,c.rotation*DEG);});

addPattern('butterfly','Butterfly Curve','ORYN Curves','ORYN original','Butterfly curve with controllable scale and repetition.',[
  C.range('turns','Turns',1,12,1,4),C.range('size','Size',10,100,1,90,'%')
],c=>{const p=[];for(const t of linspace(0,TAU*c.turns,2400)){const q=Math.exp(Math.cos(t))-2*Math.cos(4*t)-Math.sin(t/12)**5;p.push([Math.sin(t)*q,Math.cos(t)*q]);}return fitPath(p,c.size/100);});

addPattern('trefoil','Trefoil Curve','ORYN Curves','ORYN original','Three-lobed trefoil projection.',[
  C.range('size','Size',10,100,1,90,'%'),C.range('rotation','Rotation',-180,180,1,0,'°')
],c=>{const p=[];for(const t of linspace(0,TAU,1400))p.push([Math.sin(t)+2*Math.sin(2*t),Math.cos(t)-2*Math.cos(2*t)]);return rotateAndFit(p,c.rotation,c.size/100);});

addPattern('torusknot','Torus Knot Projection','ORYN Curves','ORYN original','2D projection of a torus knot with p/q frequencies.',[
  C.range('p','p',1,12,1,3),C.range('q','q',1,12,1,5),C.range('tube','Tube',5,80,1,35,'%')
],c=>{const p=[];for(const t of linspace(0,TAU,2200)){const rr=1+(c.tube/100)*Math.cos(c.q*t),x=rr*Math.cos(c.p*t),y=rr*Math.sin(c.p*t);p.push([x,y]);}return fitPath(p,.96);});

addPattern('harmonograph','Harmonograph','ORYN Curves','ORYN original','Damped harmonic drawing with two frequencies per axis.',[
  C.range('fx1','X Freq 1',1,20,.1,3),C.range('fx2','X Freq 2',1,20,.1,5),C.range('fy1','Y Freq 1',1,20,.1,4),C.range('fy2','Y Freq 2',1,20,.1,7),C.range('decay','Decay',.001,.05,.001,.008)
],c=>{const p=[];for(const t of linspace(0,120,3000)){const d=Math.exp(-c.decay*t);p.push([d*(Math.sin(c.fx1*t)+.6*Math.sin(c.fx2*t+.7)),d*(Math.sin(c.fy1*t+.4)+.6*Math.sin(c.fy2*t))]);}return fitPath(p,.96);});

addPattern('phyllotaxis','Phyllotaxis','ORYN Organic','ORYN original','Golden-angle botanical point route from perimeter toward center.',[
  C.range('points','Points',100,3000,50,800),C.range('angle','Divergence Angle',120,160,.1,137.5,'°'),C.select('route','Route','radial',{radial:'Radial Order',center:'Center Spokes',arc:'Arc Connect'})
],c=>{const R=bounds().r,p=[];for(let i=c.points;i>=0;i--){const u=i/c.points,q=pointPolar(R*Math.sqrt(u),i*c.angle*DEG);if(c.route==='center'&&p.length)p.push([0,0]);else if(c.route==='arc'&&p.length)p.push(...arcConnector(p[p.length-1],q,5));p.push(q);}return p;});

addPattern('sunflower','Sunflower','ORYN Organic','ORYN original','Sunflower seed distribution connected into a continuous golden-angle path.',[
  C.range('seeds','Seeds',100,2500,50,900),C.range('angle','Divergence Angle',130,145,.1,137.5,'°'),C.range('edge','Edge Radius',50,100,1,95,'%')
],c=>{const R=bounds().r*c.edge/100,p=[];for(let i=0;i<c.seeds;i++){const r=R*Math.sqrt(i/(c.seeds-1)),t=i*c.angle*DEG;p.push(pointPolar(r,t));}return p;});

addPattern('superformula','Superformula','ORYN Geometry','ORYN original','Gielis superformula with adjustable symmetry and exponents.',[
  C.range('m','Symmetry m',1,24,1,7),C.range('n1','n1',.1,8,.1,.3),C.range('n2','n2',.1,8,.1,.3),C.range('n3','n3',.1,8,.1,.3),C.range('turns','Turns',1,8,1,1)
],c=>{const p=[];for(const t of linspace(0,TAU*c.turns,2200)){const a=Math.abs(Math.cos(c.m*t/4))**c.n2,b=Math.abs(Math.sin(c.m*t/4))**c.n3,r=(a+b)>1e-9?(a+b)**(-1/c.n1):0;p.push(pointPolar(r,t));}return fitPath(p,.96);});

addPattern('involute','Involute of Circle','ORYN Curves','ORYN original','Involute curve unwinding from a base circle.',[
  C.range('turns','Turns',1,16,1,5),C.range('base','Base Radius',5,80,1,25,'mm')
],c=>{const p=[];for(const t of linspace(0,TAU*c.turns,1800))p.push([c.base*(Math.cos(t)+t*Math.sin(t)),c.base*(Math.sin(t)-t*Math.cos(t))]);return fitPath(p,.96);});

addPattern('clothoid','Clothoid / Cornu','ORYN Curves','ORYN original','Euler spiral approximation with curvature increasing along arc length.',[
  C.range('length','Length',2,20,.5,9),C.range('density','Density',200,4000,100,1800)
],c=>{const p=[],n=Math.round(c.density),half=Math.floor(n/2);let x=0,y=0,a=0,step=c.length/n;p.push([0,0]);for(let i=1;i<=half;i++){a+=(i/half)*.035;x+=Math.cos(a)*step;y+=Math.sin(a)*step;p.push([x,y]);}const pos=p.slice(),neg=pos.slice(1).map(([x,y])=>[-x,y]).reverse();return fitPath([...neg,...pos],.96);});

function kochSegment(a,b,depth,out){if(depth<=0){out.push(a);return;}const p1=[lerp(a[0],b[0],1/3),lerp(a[1],b[1],1/3)],p3=[lerp(a[0],b[0],2/3),lerp(a[1],b[1],2/3)],v=[p3[0]-p1[0],p3[1]-p1[1]],pk=[p1[0]+v[0]*.5-v[1]*Math.sqrt(3)/2,p1[1]+v[1]*.5+v[0]*Math.sqrt(3)/2];kochSegment(a,p1,depth-1,out);kochSegment(p1,pk,depth-1,out);kochSegment(pk,p3,depth-1,out);kochSegment(p3,b,depth-1,out);}
addPattern('koch','Koch Snowflake','ORYN Fractals','ORYN original','Recursive Koch snowflake with bounded iteration depth.',[
  C.range('iterations','Iterations',0,5,1,3),C.range('rotation','Rotation',-180,180,1,-90,'°')
],c=>{const tri=regularPolygon(3,1,c.rotation*DEG,true),p=[];for(let i=0;i<3;i++)kochSegment(tri[i],tri[i+1],c.iterations,p);p.push(tri[0]);return fitPath(p,.94);});

function sierpinskiPath(a,b,c,depth,out){if(depth<=0){out.push(a,b,c,a);return;}const ab=[(a[0]+b[0])/2,(a[1]+b[1])/2],bc=[(b[0]+c[0])/2,(b[1]+c[1])/2],ca=[(c[0]+a[0])/2,(c[1]+a[1])/2];sierpinskiPath(a,ab,ca,depth-1,out);sierpinskiPath(ab,b,bc,depth-1,out);sierpinskiPath(ca,bc,c,depth-1,out);}
addPattern('sierpinski','Sierpiński Triangle','ORYN Fractals','ORYN original','Recursive triangular fractal routed as a continuous path.',[
  C.range('iterations','Iterations',1,6,1,4),C.range('rotation','Rotation',-180,180,1,-90,'°')
],c=>{const tri=regularPolygon(3,1,c.rotation*DEG,false),p=[];sierpinskiPath(tri[0],tri[1],tri[2],c.iterations,p);return fitPath(p,.94);});

function dragonTurns(n){let s='';for(let i=0;i<n;i++){let inv='';for(let j=s.length-1;j>=0;j--)inv+=s[j]==='L'?'R':'L';s=s+'L'+inv;}return s;}
addPattern('dragon','Dragon Curve','ORYN Fractals','ORYN original','Heighway dragon curve.',[
  C.range('iterations','Iterations',5,15,1,11),C.range('rotation','Rotation',-180,180,1,0,'°')
],c=>{const turns=dragonTurns(c.iterations),p=[[0,0]];let x=0,y=0,a=c.rotation*DEG,step=1;for(let i=0;i<=turns.length;i++){x+=Math.cos(a)*step;y+=Math.sin(a)*step;p.push([x,y]);if(i<turns.length)a+=(turns[i]==='L'?1:-1)*Math.PI/2;}return fitRect(p,.94);});

addPattern('radialwave','Radial Wave','ORYN Radial','ORYN original','Circular radial wave with independent lobes and carrier turns.',[
  C.range('lobes','Lobes',1,80,1,18),C.range('depth','Depth',0,90,1,35,'%'),C.range('turns','Turns',1,30,1,6)
],c=>{const R=bounds().r,p=[];for(const t of linspace(0,TAU*c.turns,2200)){const r=R*(1-c.depth/200+c.depth/200*Math.sin(c.lobes*t));p.push(pointPolar(r,t));}return p;});

addPattern('polargrid','Polar Grid','ORYN Radial','ORYN original','Concentric rings connected with radial spokes.',[
  C.range('rings','Rings',2,40,1,12),C.range('spokes','Spokes',3,72,1,18)
],c=>{const R=bounds().r,p=[];for(let i=1;i<=c.rings;i++){let ring=regularPolygon(Math.max(36,c.spokes*3),R*i/c.rings,0,true);if(i%2)ring.reverse();p.push(...ring);}for(let s=0;s<c.spokes;s++){const t=TAU*s/c.spokes;p.push([0,0],pointPolar(R,t));}return p;});

addPattern('mandala','Mandala','ORYN Radial','ORYN original','Layered polar mandala made from harmonic petals.',[
  C.range('layers','Layers',2,12,1,5),C.range('petals','Petals',3,32,1,12),C.range('twist','Layer Twist',0,90,1,12,'°')
],c=>{const R=bounds().r,p=[];for(let l=1;l<=c.layers;l++){const base=R*l/c.layers;for(const t of linspace(0,TAU,500)){const r=base*(.72+.28*Math.cos(c.petals*t));p.push(pointPolar(r,t+l*c.twist*DEG));}}return p;});

addPattern('rosette','Rosette','ORYN Radial','ORYN original','Interlaced rosette based on sum of circular harmonics.',[
  C.range('lobes','Lobes',2,40,1,9),C.range('secondary','Secondary',1,40,1,4),C.range('mix','Mix',0,100,1,45,'%')
],c=>{const m=c.mix/100,p=[];for(const t of linspace(0,TAU,1800)){const x=(1-m)*Math.cos(c.lobes*t)+m*Math.cos(c.secondary*t),y=(1-m)*Math.sin(c.lobes*t)-m*Math.sin(c.secondary*t);p.push([x,y]);}return fitPath(p,.96);});

addPattern('petalweave','Petal Weave','ORYN Organic','ORYN original','Continuous layered petal weave designed for dense sand texture.',[
  C.range('petals','Petals',3,40,1,14),C.range('layers','Layers',1,10,1,4),C.range('weave','Weave',0,100,1,35,'%')
],c=>{const R=bounds().r,p=[];for(let l=1;l<=c.layers;l++){const base=R*l/c.layers;for(const t of linspace(0,TAU,600)){const r=base*(.62+.38*Math.abs(Math.sin(c.petals*t/2))),a=t+(c.weave/100)*.25*Math.sin(c.petals*t);p.push(pointPolar(r,a));}}return p;});

addPattern('moirerings','Moiré Rings','ORYN Geometry','ORYN original','Two offset ring families connected into a moiré interference pattern.',[
  C.range('rings','Rings',4,50,1,18),C.range('offset','Offset',0,80,1,28,'%')
],c=>{const R=bounds().r,p=[],off=R*c.offset/100;for(let i=1;i<=c.rings;i++){const r=R*i/c.rings*.55;let a=translatePath(regularPolygon(72,r,0,true),off,0),b=translatePath(regularPolygon(72,r,0,true),-off,0);if(i%2){a.reverse();b.reverse();}p.push(...a,...b);}return fitPath(p,.96);});

addPattern('wavegrid','Wave Grid','ORYN Waves','ORYN original','Serpentine Cartesian wave grid with independent X/Y frequencies.',[
  C.range('rows','Rows',2,80,1,22),C.range('xwaves','X Waves',1,30,1,7),C.range('ywobble','Y Wobble',0,50,1,18,'%')
],c=>{const {rx,ry}=bounds(),p=[];for(let row=0;row<c.rows;row++){const y0=lerp(-ry,ry,row/(c.rows-1)),q=[];for(let i=0;i<180;i++){const x=lerp(-rx,rx,i/179),y=y0+(2*ry/c.rows)*(c.ywobble/100)*Math.sin(TAU*c.xwaves*i/179+row*.45);q.push([x,y]);}if(row%2)q.reverse();p.push(...q);}return p;});

// -----------------------------------------------------------------------------
// UI, preview, persistence and export.
// -----------------------------------------------------------------------------
function saveBlob(name,data,type='text/plain'){
  const blob=new Blob([data],{type}),a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function setStatus(text,kind='ready'){const el=$('#status');el.textContent=text;el.className='status '+kind;}
function safeName(){return 'oryn-'+state.pattern.replace(/[^a-z0-9_-]+/gi,'-').toLowerCase();}
function formatValue(v,c){if(typeof v==='number'){const step=+dyn(c.step)||1;let d=step<.001?4:step<.01?3:step<.1?2:step<1?1:0;return v.toFixed(d)+(c.unit?` ${c.unit}`:'');}return String(v);}
function transformPath(path){
  const r=(+$('#globalRotation').value||0)*DEG,s=(+$('#globalScale').value||100)/100,ox=+$('#offsetX').value||0,oy=+$('#offsetY').value||0,mx=$('#mirrorX').checked?-1:1,my=$('#mirrorY').checked?-1:1;
  let p=path.map(([x,y])=>[x*s*mx,y*s*my]);p=rotatePath(p,r);p=translatePath(p,ox,oy);if($('#globalReverse').checked)p.reverse();return p;
}
function calculate(){
  const pat=P[state.pattern]; if(!pat)return;
  setStatus('CALCULATING','busy');
  try{
    let raw=pat.calc(state.config)||[];
    raw=raw.filter(q=>Array.isArray(q)&&q.length>=2&&Number.isFinite(q[0])&&Number.isFinite(q[1])).map(q=>[+q[0],+q[1]]);
    if(!raw.length)raw=[[0,0]];
    state.rawPath=raw;state.path=transformPath(raw);state.previewIndex=0;
    $('#timeline').min=0;$('#timeline').max=Math.max(0,state.path.length-1);$('#timeline').value=0;
    store.set('oryn.v2.cfg.'+state.pattern,JSON.stringify(state.config));
    updateStats();draw();
    const e=env(),b=bounds(),outside=e.format==='polar'
      ? state.path.some(q=>hypot(q)>b.r*1.001)
      : state.path.some(q=>Math.abs(q[0])>b.rx*1.001||Math.abs(q[1])>b.ry*1.001);
    setStatus(outside?'OUT OF BOUNDS':'READY',outside?'busy':'ready');
  }catch(err){console.error(err);state.rawPath=[[0,0]];state.path=[[0,0]];updateStats();draw();setStatus('ERROR','error');}
}
let recalcTimer=null;function queueCalculate(delay=0){clearTimeout(recalcTimer);recalcTimer=setTimeout(calculate,delay);}
function updateStats(){
  let length=0,maxrho=0;for(let i=0;i<state.path.length;i++){maxrho=Math.max(maxrho,hypot(state.path[i]));if(i)length+=dist(state.path[i-1],state.path[i]);}
  const R=bounds().r||1;let span=0;if(state.path.length>1){let prev=Math.atan2(state.path[0][1],state.path[0][0]),min=prev,max=prev;for(let i=1;i<state.path.length;i++){let a=Math.atan2(state.path[i][1],state.path[i][0]),d=a-prev;while(d>Math.PI)d-=TAU;while(d<-Math.PI)d+=TAU;prev+=d;min=Math.min(min,prev);max=Math.max(max,prev);}span=(max-min)/TAU;}
  $('#pointsStat').textContent=state.path.length.toLocaleString();$('#distanceStat').textContent=length.toFixed(1)+' mm';$('#timeStat').textContent=(length/env().speed).toFixed(2)+' min';$('#rhoStat').textContent=(maxrho/R).toFixed(3);$('#thetaStat').textContent=span.toFixed(2)+' rev';
}
function canvasGeometry(){const W=canvas.width,H=canvas.height,e=env(),base=Math.min(W/e.x,H/e.y)*.90*state.viewScale;return {W,H,e,scale:base,cx:W/2+state.viewPan[0],cy:H/2+state.viewPan[1]};}
function drawGrid(g){
  const {W,H,e,scale,cx,cy}=g,{rx,ry,r}=bounds();ctx.save();ctx.translate(cx,cy);ctx.scale(scale,-scale);
  ctx.lineWidth=1/scale;ctx.strokeStyle='#aab4bd';ctx.beginPath();if(e.format==='polar')ctx.arc(0,0,r,0,TAU);else ctx.rect(-rx,-ry,e.x,e.y);ctx.stroke();
  if($('#gridToggle').checked){ctx.strokeStyle='#c7cdd244';ctx.lineWidth=.7/scale;if(e.format==='polar'){for(let k=1;k<5;k++){ctx.beginPath();ctx.arc(0,0,r*k/5,0,TAU);ctx.stroke();}for(let k=0;k<12;k++){const t=TAU*k/12;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(r*Math.cos(t),r*Math.sin(t));ctx.stroke();}}else{for(let k=1;k<10;k++){const x=-rx+e.x*k/10,y=-ry+e.y*k/10;ctx.beginPath();ctx.moveTo(x,-ry);ctx.lineTo(x,ry);ctx.moveTo(-rx,y);ctx.lineTo(rx,y);ctx.stroke();}}}
  ctx.strokeStyle='#79879366';ctx.beginPath();ctx.moveTo(-rx,0);ctx.lineTo(rx,0);ctx.moveTo(0,-ry);ctx.lineTo(0,ry);ctx.stroke();ctx.restore();
}
function draw(){
  const g=canvasGeometry(),{W,H,scale,cx,cy,e}=g;ctx.clearRect(0,0,W,H);ctx.fillStyle='#d9dde0';ctx.fillRect(0,0,W,H);drawGrid(g);
  if(state.path.length){ctx.save();ctx.translate(cx,cy);ctx.scale(scale,-scale);ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#728391';ctx.lineWidth=1.5/scale;ctx.beginPath();state.path.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();const n=clamp(state.previewIndex,0,state.path.length-1);ctx.strokeStyle='#25bfff';ctx.lineWidth=2.2/scale;ctx.beginPath();for(let i=0;i<=n;i++){const [x,y]=state.path[i];i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();const start=state.path[0],end=state.path[state.path.length-1],cur=state.path[n];for(const [q,col,size] of [[start,'#28d17c',4],[end,'#ff6273',4],[cur,'#ffdb4d',5]]){ctx.fillStyle=col;ctx.beginPath();ctx.arc(q[0],q[1],size/scale,0,TAU);ctx.fill();}if($('#coordsToggle').checked){ctx.strokeStyle='#15202a33';ctx.lineWidth=1.5/scale;ctx.beginPath();if(e.format==='polar'){const R=bounds().r,t=Math.atan2(cur[1],cur[0]);ctx.moveTo(-R*Math.cos(t),-R*Math.sin(t));ctx.lineTo(R*Math.cos(t),R*Math.sin(t));}else{ctx.moveTo(-bounds().rx,cur[1]);ctx.lineTo(bounds().rx,cur[1]);ctx.moveTo(cur[0],-bounds().ry);ctx.lineTo(cur[0],bounds().ry);}ctx.stroke();}ctx.restore();
    if($('#coordsToggle').checked){const n2=clamp(state.previewIndex,0,state.path.length-1),[x,y]=state.path[n2];ctx.fillStyle='#4a5b68';ctx.font=`${Math.max(11,Math.round(W/75))}px ui-monospace,monospace`;let txt;if(e.format==='polar'){let a=Math.atan2(y,x);if(a<0)a+=TAU;txt=`ρ ${(Math.hypot(x,y)/bounds().r).toFixed(4)}   θ ${a.toFixed(4)} rad`;}else txt=`X ${(x+bounds().rx).toFixed(2)}   Y ${(y+bounds().ry).toFixed(2)} mm`;ctx.fillText(txt,18,H-18);}
  }
  ctx.fillStyle='#566673';ctx.font=`${Math.max(11,Math.round(W/80))}px system-ui`;ctx.fillText(e.format==='polar'?'THETA–RHO / POLAR':'CARTESIAN / XY',16,24);
  if($('#overlayToggle').checked){const p=P[state.pattern];ctx.fillStyle='#0a1118dc';const rows=Math.min(11,Object.keys(state.config).length),boxH=46+rows*18;ctx.fillRect(12,38,310,boxH);ctx.fillStyle='#ecf7ff';ctx.font=`${Math.max(10,Math.round(W/90))}px ui-monospace,monospace`;ctx.fillText(p.name,22,58);let y=78,k=0;for(const [name,val] of Object.entries(state.config)){if(k++>=rows)break;ctx.fillText(`${name}: ${String(val).replace(/\s+/g,' ').slice(0,31)}`,22,y);y+=18;}}
  $('#stepLabel').textContent=state.path.length?`${Math.min(state.previewIndex+1,state.path.length).toLocaleString()} / ${state.path.length.toLocaleString()}`:'0 / 0';
}
function animate(ts){if(state.playing&&state.path.length&&ts-state.lastFrame>20){state.previewIndex+=Math.max(1,Math.floor(state.path.length/1100));if(state.previewIndex>=state.path.length)state.previewIndex=0;$('#timeline').value=state.previewIndex;state.lastFrame=ts;draw();}requestAnimationFrame(animate);}

function renderCategories(){const cats=[...new Set(Object.values(P).map(p=>p.category))].sort();const s=$('#categoryFilter');for(const cat of cats){const o=document.createElement('option');o.value=cat;o.textContent=cat;s.appendChild(o);}}
function filterPatterns(){const q=$('#patternSearch').value.trim().toLowerCase(),cat=$('#categoryFilter').value,origin=$('#originFilter').value;state.filteredKeys=Object.keys(P).filter(k=>{const p=P[k],originOk=origin==='all'||(origin==='reference'&&p.origin==='Reference set')||(origin==='oryn'&&p.origin==='ORYN original');return originOk&&(cat==='all'||p.category===cat)&&(!q||(`${p.name} ${p.category} ${p.description} ${p.origin}`).toLowerCase().includes(q));}).sort((a,b)=>P[a].category.localeCompare(P[b].category)||P[a].name.localeCompare(P[b].name));renderGeneratorList();}
function renderGeneratorList(){const box=$('#generatorList');box.innerHTML='';let lastCat='';for(const k of state.filteredKeys){const p=P[k];if($('#categoryFilter').value==='all'&&p.category!==lastCat){const h=document.createElement('div');h.className='category-label';h.textContent=p.category;box.appendChild(h);lastCat=p.category;}const b=document.createElement('button');b.className='generator-item'+(k===state.pattern?' active':'');b.dataset.key=k;b.innerHTML=`<span>${p.name}</span><span class="small">${p.origin==='Reference set'?'REFERENCE 37':'ORYN'} • ${p.category}</span>`;b.onclick=()=>selectPattern(k);box.appendChild(b);}$('#filteredCount').textContent=state.filteredKeys.length;}
function selectPattern(key){if(!P[key])return;state.pattern=key;store.set('oryn.v2.pattern',key);const saved=store.get('oryn.v2.cfg.'+key);let cfg=defaultsFor(P[key]);if(saved){try{cfg={...cfg,...JSON.parse(saved)};}catch(_){}}state.config=cfg;libraryNameTouched=false;renderGeneratorList();renderPatternPanel();syncLibraryName(true);calculate();}
function renderPatternPanel(){const p=P[state.pattern];$('#patternName').textContent=p.name;$('#patternOrigin').textContent=p.origin==='Reference set'?'REFERENCE SET • ORIGINAL 37':'ORYN ORIGINAL GENERATOR';$('#patternDescription').textContent=p.description;const box=$('#controls');box.innerHTML='';for(const c of p.controls){const value=state.config[c.name];if(c.type==='check'){const l=document.createElement('label');l.className='control-check';const input=document.createElement('input');input.type='checkbox';input.checked=!!value;input.onchange=()=>{state.config[c.name]=input.checked;calculate();};l.append(input,document.createTextNode(c.label));box.appendChild(l);continue;}if(c.type==='textarea'){const l=document.createElement('label');l.className='control-textarea';l.textContent=c.label;const ta=document.createElement('textarea');ta.rows=c.rows||8;ta.value=value??'';ta.oninput=()=>{state.config[c.name]=ta.value;queueCalculate(180);};l.appendChild(ta);box.appendChild(l);continue;}if(c.type==='text'){const l=document.createElement('label');l.className='control-text';l.textContent=c.label;const input=document.createElement('input');input.type='text';input.value=value??'';input.oninput=()=>{state.config[c.name]=input.value;queueCalculate(180);};l.appendChild(input);box.appendChild(l);continue;}const row=document.createElement('div');row.className='control-row';const lab=document.createElement('label');lab.textContent=c.label;let input;if(c.type==='select'){input=document.createElement('select');for(const [v,t] of Object.entries(c.options)){const o=document.createElement('option');o.value=v;o.textContent=t;input.appendChild(o);}input.value=value;input.onchange=()=>{state.config[c.name]=input.value;val.textContent=input.options[input.selectedIndex]?.text||input.value;calculate();};}else{input=document.createElement('input');input.type=c.type==='number'?'number':'range';input.min=dyn(c.min);input.max=dyn(c.max);input.step=dyn(c.step);input.value=value;input.oninput=()=>{state.config[c.name]=+input.value;val.textContent=formatValue(state.config[c.name],c);queueCalculate(c.type==='range'?0:80);};}const val=document.createElement('span');val.className='value';val.textContent=c.type==='select'?(input.options[input.selectedIndex]?.text||value):formatValue(+value,c);row.append(lab,input,val);box.appendChild(row);}renderSpecialActions();$('#drawHint').classList.toggle('hidden',p.special!=='draw');}
function renderSpecialActions(){const box=$('#specialActions');box.innerHTML='';const p=P[state.pattern];if(p.special==='draw'){const clear=document.createElement('button');clear.className='btn';clear.textContent='Clear Drawing';clear.onclick=()=>{state.drawPath=[];calculate();};const smooth=document.createElement('button');smooth.className='btn';smooth.textContent='Simplify Drawing';smooth.onclick=()=>{if(state.drawPath.length<3)return;const tol=Math.max(.2,env().ball*.12),out=[state.drawPath[0]];for(let i=1;i<state.drawPath.length-1;i++)if(dist(out[out.length-1],state.drawPath[i])>=tol)out.push(state.drawPath[i]);out.push(state.drawPath[state.drawPath.length-1]);state.drawPath=out;calculate();};box.append(clear,smooth);}if(['coordinates','gcode','thr'].includes(state.pattern)){const inp=document.createElement('input');inp.type='file';inp.accept='.txt,.thr,.gcode,.nc,.tap,.csv';inp.className='hidden';const b=document.createElement('button');b.className='btn';b.textContent='Load Text File';b.onclick=()=>inp.click();inp.onchange=async()=>{const f=inp.files?.[0];if(!f)return;const text=await f.text();const key=state.pattern==='coordinates'?'coordinates':state.pattern==='gcode'?'gcode':'thr';state.config[key]=text;renderPatternPanel();calculate();};box.append(b,inp);}}

function worldFromPointer(ev){const rect=canvas.getBoundingClientRect(),dpr=canvas.width/rect.width,g=canvasGeometry(),px=(ev.clientX-rect.left)*dpr,py=(ev.clientY-rect.top)*dpr;return [(px-g.cx)/g.scale,-(py-g.cy)/g.scale];}
canvas.addEventListener('pointerdown',ev=>{if(P[state.pattern]?.special!=='draw')return;state.pointerDown=true;canvas.setPointerCapture(ev.pointerId);const p=worldFromPointer(ev);if(!state.drawPath.length||dist(state.drawPath[state.drawPath.length-1],p)>env().ball*.05)state.drawPath.push(p);calculate();});
canvas.addEventListener('pointermove',ev=>{if(!state.pointerDown||P[state.pattern]?.special!=='draw')return;const p=worldFromPointer(ev);if(!state.drawPath.length||dist(state.drawPath[state.drawPath.length-1],p)>Math.max(.15,env().ball*.08)){state.drawPath.push(p);state.rawPath=state.drawPath.slice();state.path=transformPath(state.rawPath);state.previewIndex=state.path.length-1;updateStats();draw();}});
canvas.addEventListener('pointerup',()=>{if(state.pointerDown){state.pointerDown=false;calculate();}});canvas.addEventListener('dblclick',()=>{if(P[state.pattern]?.special==='draw'){state.drawPath=[];calculate();}});

function toThr(path){if(!path.length)return '';const R=bounds().r,e=env();let p=subdivide(path,Math.max(.01,.125*e.ball));p=p.map(([x,y])=>[y,x]);const lines=['# Created using ORYN Pattern Designer V2.0 Pro','# Studio Kinematics','#','# Track'];let prev=Math.atan2(p[0][1],p[0][0]);if(prev<0)prev+=TAU;lines.push(`${prev.toFixed(4)} ${(hypot(p[0])/R).toFixed(4)}`);for(let i=1;i<p.length;i++){let cur=Math.atan2(p[i][1],p[i][0]);if(cur<0)cur+=TAU;cur+=Math.floor(prev/TAU)*TAU;let d=cur-prev;if(d<-Math.PI)d+=TAU;else if(d>Math.PI)d-=TAU;const theta=prev+d,rho=hypot(p[i])/R;lines.push(`${theta.toFixed(4)} ${rho.toFixed(4)}`);prev=theta;}return lines.join('\n')+'\n';}
function toGcode(path){const e=env(),{rx,ry}=bounds(),lines=['; ORYN Pattern Designer V2.0 Pro','G90','G21'];for(const [x,y] of path)lines.push(`G1 X${(x+rx).toFixed(2)} Y${(y+ry).toFixed(2)} F${e.speed.toFixed(0)}`);return lines.join('\n')+'\n';}
function toCsv(path){return 'index,x_mm,y_mm\n'+path.map((p,i)=>`${i},${p[0].toFixed(5)},${p[1].toFixed(5)}`).join('\n')+'\n';}
function toSvg(path){const e=env(),w=e.x,h=e.y;if(!path.length)return '';const pts=path.map(([x,y])=>`${(x+w/2).toFixed(3)},${(h/2-y).toFixed(3)}`).join(' ');return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm"><rect width="100%" height="100%" fill="white"/><polyline points="${pts}" fill="none" stroke="black" stroke-width="0.5" stroke-linejoin="round" stroke-linecap="round"/></svg>\n`;}

let libraryNameTouched=false;
const libraryNameEl=$('#libraryName');
const saveMessageEl=$('#saveMessage');
const saveLibraryBtn=$('#saveLibrary');
function suggestedLibraryName(){return `${P[state.pattern]?.name||state.pattern}`.replace(/[^A-Za-z0-9 _.-]+/g,' ').replace(/\s+/g,' ').trim()||safeName();}
function syncLibraryName(force=false){if(!libraryNameEl)return;if(force||!libraryNameTouched||!libraryNameEl.value.trim())libraryNameEl.value=suggestedLibraryName();}
function setSaveMessage(text,kind=''){if(!saveMessageEl)return;saveMessageEl.textContent=text;saveMessageEl.className='save-message'+(kind?' '+kind:'');}
if(libraryNameEl) libraryNameEl.addEventListener('input',()=>{libraryNameTouched=true;setSaveMessage('');});
async function saveToORYNLibrary(){
  if(!saveLibraryBtn||!libraryNameEl)return;
  const name=libraryNameEl.value.trim();
  if(!name){setSaveMessage('Enter a pattern name first.','error');libraryNameEl.focus();return;}
  if(!state.path.length){setSaveMessage('Generate a valid path first.','error');return;}
  saveLibraryBtn.disabled=true;setSaveMessage('Saving generated THR to ORYN library…','busy');
  try{
    const response=await fetch('/api/pattern-designer/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,thr:toThr(state.path)})});
    let data={};try{data=await response.json();}catch(_){}
    if(!response.ok)throw new Error(data.detail||`Save failed (${response.status})`);
    setSaveMessage(`Saved: ${data.path||data.name||name}`,'ok');
    try{window.parent?.postMessage({type:'oryn-pattern-designer-saved',path:data.path,name:data.name},window.location.origin);}catch(_){}
  }catch(err){
    const msg=(err&&err.message)||'Could not save to ORYN library';
    setSaveMessage(location.protocol==='file:'?'ORYN library saving is available when Pattern Designer is opened inside the ORYN desktop app.':msg,'error');
  }finally{saveLibraryBtn.disabled=false;}
}
if(saveLibraryBtn)saveLibraryBtn.onclick=saveToORYNLibrary;

$('#downloadThr').onclick=()=>saveBlob(safeName()+'.thr',toThr(state.path));
$('#downloadGcode').onclick=()=>saveBlob(safeName()+'.gcode',toGcode(state.path));
$('#downloadSvg').onclick=()=>saveBlob(safeName()+'.svg',toSvg(state.path),'image/svg+xml');
$('#downloadCsv').onclick=()=>saveBlob(safeName()+'.csv',toCsv(state.path),'text/csv');
$('#downloadJson').onclick=()=>saveBlob(safeName()+'.json',JSON.stringify({app:'ORYN Pattern Designer V2.0 Pro',pattern:state.pattern,generator:P[state.pattern].name,origin:P[state.pattern].origin,config:state.config,transform:{rotation:+$('#globalRotation').value,scale:+$('#globalScale').value,offsetX:+$('#offsetX').value,offsetY:+$('#offsetY').value,mirrorX:$('#mirrorX').checked,mirrorY:$('#mirrorY').checked,reverse:$('#globalReverse').checked},path:state.path},null,2),'application/json');
$('#downloadPng').onclick=()=>{draw();const a=document.createElement('a');a.download=safeName()+'.png';a.href=canvas.toDataURL('image/png');a.click();};

$('#patternSearch').addEventListener('input',filterPatterns);$('#categoryFilter').addEventListener('change',filterPatterns);$('#originFilter').addEventListener('change',filterPatterns);
$('#playBtn').onclick=()=>{state.playing=!state.playing;$('#playBtn').textContent=state.playing?'Pause':'Play';};
$('#resetBtn').onclick=()=>{state.previewIndex=0;$('#timeline').value=0;draw();};
$('#fitBtn').onclick=()=>{state.viewScale=1;state.viewPan=[0,0];draw();};
$('#timeline').addEventListener('input',e=>{state.previewIndex=+e.target.value;state.playing=false;$('#playBtn').textContent='Play';draw();});
for(const id of ['coordsToggle','overlayToggle','gridToggle'])$('#'+id).addEventListener('change',draw);
for(const id of ['format','xRange','yRange','speed','ball'])$('#'+id).addEventListener('input',()=>{store.set('oryn.v2.'+id,$('#'+id).value);renderPatternPanel();calculate();});
for(const id of ['globalRotation','globalScale','offsetX','offsetY'])$('#'+id).addEventListener('input',calculate);
for(const id of ['mirrorX','mirrorY','globalReverse'])$('#'+id).addEventListener('change',calculate);
$('#resetPatternBtn').onclick=()=>{state.config=defaultsFor(P[state.pattern]);store.set('oryn.v2.cfg.'+state.pattern,JSON.stringify(state.config));renderPatternPanel();calculate();};

function resizeCanvas(){const rect=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1),w=Math.max(480,Math.round(rect.width*dpr)),h=Math.max(480,Math.round(rect.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}draw();}
if('ResizeObserver' in window)new ResizeObserver(resizeCanvas).observe($('#canvasWrap'));else window.addEventListener('resize',resizeCanvas);

function runGeneratorSelfTest(){
  const prevPattern=state.pattern,prevConfig={...state.config},prevDraw=state.drawPath.slice();
  const results=[];
  for(const [key,pat] of Object.entries(P)){
    try{
      state.pattern=key;state.config=defaultsFor(pat);
      if(key==='draw')state.drawPath=[[0,0],[10,10],[20,0]];
      let path=pat.calc(state.config)||[];
      const finite=path.filter(q=>Array.isArray(q)&&q.length>=2&&Number.isFinite(q[0])&&Number.isFinite(q[1]));
      if(!finite.length)throw new Error('No finite path points');
      let maxRadius=0;for(const q of finite)maxRadius=Math.max(maxRadius,Math.hypot(q[0],q[1]));
      results.push({key,name:pat.name,origin:pat.origin,ok:true,points:finite.length,maxRadius:+maxRadius.toFixed(4)});
    }catch(error){results.push({key,name:pat.name,origin:pat.origin,ok:false,error:String(error&&error.message||error)});}
  }
  state.pattern=prevPattern;state.config=prevConfig;state.drawPath=prevDraw;
  return results;
}
window.ORYN_PATTERN_DESIGNER={version:'2.0 Pro',generatorCount:Object.keys(P).length,runGeneratorSelfTest};

function init(){
  const keys=Object.keys(P);const refCount=keys.filter(k=>P[k].origin==='Reference set').length,orynCount=keys.length-refCount;$('#generatorCount').textContent=`${refCount} REF + ${orynCount} ORYN • ${keys.length} TOTAL`;if(keys.length!==77)console.warn('Expected 77 generators, found',keys.length);
  for(const id of ['format','xRange','yRange','speed','ball']){const v=store.get('oryn.v2.'+id);if(v!==null)$('#'+id).value=v;}
  renderCategories();state.filteredKeys=keys;const saved=store.get('oryn.v2.pattern');selectPattern(saved&&P[saved]?saved:'spiral');filterPatterns();syncLibraryName();if(location.protocol==='file:')setSaveMessage('Open Pattern Designer from ORYN Pi to save directly into its pattern library.');resizeCanvas();requestAnimationFrame(animate);
}
init();
