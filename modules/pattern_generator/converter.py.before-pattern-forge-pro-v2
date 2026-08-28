"""ORYN Pattern Forge artwork import/generation.

This module is intentionally isolated from the proven motion/controller core.
It only turns artwork into normalized theta/rho coordinates and writes .thr text.
"""
from __future__ import annotations
from pathlib import Path
import math, re, xml.etree.ElementTree as ET
from typing import Iterable, List, Tuple

Point = Tuple[float, float]


def _dist(a: Point, b: Point) -> float:
    return math.hypot(a[0]-b[0], a[1]-b[1])


def _dedupe(points: Iterable[Point], eps: float = 1e-5) -> List[Point]:
    out=[]
    for p in points:
        p=(float(p[0]),float(p[1]))
        if not out or _dist(out[-1],p)>eps:
            out.append(p)
    return out


def _normalize(paths: List[List[Point]], fit: float = 0.94) -> List[List[Point]]:
    pts=[p for path in paths for p in path]
    if not pts: raise ValueError("No usable geometry found")
    xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
    cx=(min(xs)+max(xs))/2; cy=(min(ys)+max(ys))/2
    scale=max(max(xs)-min(xs), max(ys)-min(ys), 1e-9)
    k=(2*max(0.1,min(float(fit),0.98)))/scale
    return [[((x-cx)*k,(y-cy)*k) for x,y in path] for path in paths]


def _nearest_order(paths: List[List[Point]]) -> List[List[Point]]:
    pending=[p[:] for p in paths if len(p)>1]
    if not pending: return []
    ordered=[pending.pop(0)]
    while pending:
        end=ordered[-1][-1]
        best=None
        for i,p in enumerate(pending):
            d0=_dist(end,p[0]); d1=_dist(end,p[-1])
            cand=(min(d0,d1),i,d1<d0)
            if best is None or cand<best: best=cand
        _,i,rev=best
        p=pending.pop(i)
        if rev: p.reverse()
        ordered.append(p)
    return ordered


def _resample_line(a: Point,b: Point,step=.02):
    d=_dist(a,b); n=max(1,int(math.ceil(d/step)))
    return [(a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n) for i in range(n+1)]


def _join_clean(paths: List[List[Point]], max_bridge: float=.065) -> Tuple[List[Point],int]:
    """Join only short gaps. Long disconnected islands are skipped, never crossed."""
    ordered=_nearest_order(paths)
    if not ordered: return [],0
    route=list(ordered[0]); skipped=0
    for path in ordered[1:]:
        gap=_dist(route[-1],path[0])
        if gap>max_bridge:
            skipped+=1
            continue
        route.extend(_resample_line(route[-1],path[0],.012)[1:])
        route.extend(path[1:])
    return _dedupe(route),skipped


def _xy_to_thr(points: List[Point]) -> List[Tuple[float,float]]:
    if len(points)<2: raise ValueError("Generated route is too short")
    out=[]; last_theta=0.0
    for x,y in points:
        rho=min(1.0,math.hypot(x,y))
        theta=math.atan2(y,x) if rho>1e-8 else last_theta
        # unwrap theta for continuous rotary motion
        while theta-last_theta>math.pi: theta-=2*math.pi
        while theta-last_theta<-math.pi: theta+=2*math.pi
        out.append((theta,rho)); last_theta=theta
    return out


def _svg_paths(path: Path) -> List[List[Point]]:
    try:
        from svgpathtools import svg2paths2
    except Exception as e:
        raise RuntimeError("SVG import requires svgpathtools") from e
    segs, attrs, svgattrs = svg2paths2(str(path))
    paths=[]
    for seg in segs:
        length=max(float(seg.length(error=1e-3)),1.0)
        n=max(12,min(2500,int(length/2.0)))
        pts=[]
        for i in range(n+1):
            z=seg.point(i/n); pts.append((z.real,-z.imag))
        pts=_dedupe(pts)
        if len(pts)>2: paths.append(pts)
    return paths


def _dxf_paths(path: Path) -> List[List[Point]]:
    try:
        import ezdxf
    except Exception as e:
        raise RuntimeError("DXF import requires ezdxf") from e
    doc=ezdxf.readfile(str(path)); msp=doc.modelspace(); paths=[]
    for e in msp:
        typ=e.dxftype()
        try:
            if typ=="LINE":
                paths.append([(e.dxf.start.x,-e.dxf.start.y),(e.dxf.end.x,-e.dxf.end.y)])
            elif typ in ("LWPOLYLINE","POLYLINE"):
                pts=[]
                if typ=="LWPOLYLINE": pts=[(p[0],-p[1]) for p in e.get_points("xy")]
                else: pts=[(v.dxf.location.x,-v.dxf.location.y) for v in e.vertices]
                if getattr(e,"closed",False) and pts: pts.append(pts[0])
                if len(pts)>1: paths.append(pts)
            elif typ in ("CIRCLE","ARC"):
                c=e.dxf.center; r=float(e.dxf.radius)
                a0=0.0 if typ=="CIRCLE" else math.radians(float(e.dxf.start_angle))
                a1=2*math.pi if typ=="CIRCLE" else math.radians(float(e.dxf.end_angle))
                if a1<=a0: a1+=2*math.pi
                n=max(48,int(abs(a1-a0)*r/2))
                paths.append([(c.x+r*math.cos(a0+(a1-a0)*i/n),-(c.y+r*math.sin(a0+(a1-a0)*i/n))) for i in range(n+1)])
            elif typ in ("SPLINE","ELLIPSE"):
                pts=[(p.x,-p.y) for p in e.flattening(0.5)]
                if len(pts)>1: paths.append(pts)
        except Exception:
            continue
    return paths


def _components(mask):
    import numpy as np
    h,w=mask.shape; seen=np.zeros_like(mask,dtype=bool); comps=[]
    for y in range(h):
        for x in range(w):
            if not mask[y,x] or seen[y,x]: continue
            stack=[(y,x)]; seen[y,x]=1; c=[]
            while stack:
                yy,xx=stack.pop(); c.append((yy,xx))
                for dy in (-1,0,1):
                    for dx in (-1,0,1):
                        if not(dx or dy): continue
                        ny,nx=yy+dy,xx+dx
                        if 0<=ny<h and 0<=nx<w and mask[ny,nx] and not seen[ny,nx]:
                            seen[ny,nx]=1; stack.append((ny,nx))
            comps.append(c)
    return comps


def _zhang_suen(mask):
    import numpy as np
    im=mask.astype(np.uint8).copy(); h,w=im.shape; changed=True
    while changed:
        changed=False
        for phase in (0,1):
            rem=[]
            for y in range(1,h-1):
                for x in range(1,w-1):
                    if im[y,x]!=1: continue
                    p2,p3,p4,p5,p6,p7,p8,p9=im[y-1,x],im[y-1,x+1],im[y,x+1],im[y+1,x+1],im[y+1,x],im[y+1,x-1],im[y,x-1],im[y-1,x-1]
                    ns=[p2,p3,p4,p5,p6,p7,p8,p9]; n=sum(ns)
                    if n<2 or n>6: continue
                    trans=sum(1 for a,b in zip(ns,ns[1:]+ns[:1]) if a==0 and b==1)
                    if trans!=1: continue
                    if phase==0 and (p2*p4*p6 or p4*p6*p8): continue
                    if phase==1 and (p2*p4*p8 or p2*p6*p8): continue
                    rem.append((y,x))
            if rem:
                changed=True
                for p in rem: im[p]=0
    return im.astype(bool)


def _walk_component(comp, shape):
    """Iterative skeleton traversal safe for detailed raster artwork."""
    pixels=set(comp)
    adj={}
    for p in pixels:
        y,x=p
        ns=[]
        for dy in (-1,0,1):
            for dx in (-1,0,1):
                if not (dx or dy):
                    continue
                q=(y+dy,x+dx)
                if q not in pixels:
                    continue

                # A thinned raster uses 8-neighbour pixels so true diagonal
                # strokes remain connected. But at an ordinary 90-degree
                # corner, adding the diagonal neighbour as well creates a tiny
                # triangular graph shortcut. Traversing thousands of those
                # shortcuts produced the jagged/triangular Pattern Forge
                # output seen in the user's video. Suppress only that shortcut
                # when an orthogonal bridge pixel already connects the corner.
                if dx and dy and ((y, x+dx) in pixels or (y+dy, x) in pixels):
                    continue

                ns.append(q)
        adj[p]=ns

    endpoints=[p for p,v in adj.items() if len(v)==1]
    start=endpoints[0] if endpoints else next(iter(pixels))

    def edge(a,b):
        return tuple(sorted((a,b)))

    used=set()
    route=[start]
    stack=[[start,0]]

    while stack:
        v,idx=stack[-1]
        neighbours=adj[v]

        while idx<len(neighbours) and edge(v,neighbours[idx]) in used:
            idx+=1
        stack[-1][1]=idx

        if idx>=len(neighbours):
            stack.pop()
            if stack:
                route.append(stack[-1][0])
            continue

        u=neighbours[idx]
        stack[-1][1]+=1
        e=edge(v,u)
        if e in used:
            continue

        used.add(e)
        route.append(u)
        stack.append([u,0])

    return [(float(x),float(y)) for y,x in route]



def _binary_erode(mask):
    """3x3 binary erosion using NumPy only."""
    import numpy as np
    h,w=mask.shape
    if h<3 or w<3:
        return mask.copy()
    out=np.ones_like(mask,dtype=bool)
    padded=np.pad(mask,1,mode="constant",constant_values=False)
    for dy in range(3):
        for dx in range(3):
            out &= padded[dy:dy+h,dx:dx+w]
    return out


def _binary_dilate(mask):
    """3x3 binary dilation using NumPy only."""
    import numpy as np
    h,w=mask.shape
    out=np.zeros_like(mask,dtype=bool)
    padded=np.pad(mask,1,mode="constant",constant_values=False)
    for dy in range(3):
        for dx in range(3):
            out |= padded[dy:dy+h,dx:dx+w]
    return out


def _remove_small_components(mask, min_pixels):
    import numpy as np
    clean=np.zeros_like(mask,dtype=bool)
    comps=_components(mask)
    if not comps:
        return clean,[]
    comps.sort(key=len,reverse=True)
    kept=[]
    for comp in comps:
        if len(comp)>=min_pixels:
            kept.append(comp)
            for p in comp:
                clean[p]=1
    return clean,kept


def _component_bbox(comp):
    ys=[p[0] for p in comp]; xs=[p[1] for p in comp]
    return min(xs),min(ys),max(xs),max(ys)


def _bridge_short_gaps(mask, max_gap_px=8):
    """
    Join only genuinely small breaks between major line fragments.
    This repairs broken JPEG/PNG antialiasing without creating long
    pass-lines across the artwork.
    """
    import numpy as np, math
    comps=[c for c in _components(mask) if len(c)>=8]
    if len(comps)<2:
        return mask,0
    comps.sort(key=len,reverse=True)
    joined=0
    # Work from large to small; bounded pair search.
    for _ in range(min(12,len(comps)-1)):
        comps=[c for c in _components(mask) if len(c)>=8]
        comps.sort(key=len,reverse=True)
        best=None
        for i in range(min(len(comps),18)):
            a=comps[i]
            aa=a[::max(1,len(a)//180)]
            for j in range(i+1,min(len(comps),18)):
                b=comps[j]
                bb=b[::max(1,len(b)//180)]
                for pa in aa:
                    for pb in bb:
                        d2=(pa[0]-pb[0])**2+(pa[1]-pb[1])**2
                        if best is None or d2<best[0]:
                            best=(d2,pa,pb)
        if best is None or math.sqrt(best[0])>max_gap_px:
            break
        _,a,b=best
        y0,x0=a; y1,x1=b
        dx=abs(x1-x0); sx=1 if x0<x1 else -1
        dy=-abs(y1-y0); sy=1 if y0<y1 else -1
        err=dx+dy
        while True:
            mask[y0,x0]=1
            if x0==x1 and y0==y1: break
            e2=2*err
            if e2>=dy: err+=dy; x0+=sx
            if e2<=dx: err+=dx; y0+=sy
        joined+=1
    return mask,joined


def _auto_crop_gray(im):
    """
    Crop broad blank margins without cutting artwork.
    Helps web-downloaded images where the actual line art occupies only
    the central portion of a large white/black canvas.
    """
    import numpy as np
    arr=np.asarray(im,dtype=np.uint8)
    if arr.size==0:
        return im
    # Difference from median border tone.
    border=np.concatenate([arr[0,:],arr[-1,:],arr[:,0],arr[:,-1]])
    bg=float(np.median(border))
    delta=np.abs(arr.astype(float)-bg)
    ys,xs=np.where(delta>14)
    if len(xs)<20:
        return im
    pad=8
    x0=max(0,int(xs.min())-pad); x1=min(arr.shape[1],int(xs.max())+pad+1)
    y0=max(0,int(ys.min())-pad); y1=min(arr.shape[0],int(ys.max())+pad+1)
    if x1-x0<20 or y1-y0<20:
        return im
    return im.crop((x0,y0,x1,y1))


def _prepare_raster_mask(path: Path, threshold=128, invert=False):
    """
    Auto-select a line-art or outline mask while preserving visual structure.
    """
    import numpy as np
    from PIL import Image, ImageOps, ImageFilter

    im=Image.open(path).convert("L")
    im=_auto_crop_gray(im)
    im.thumbnail((620,620),Image.Resampling.LANCZOS)
    im=ImageOps.autocontrast(im,cutoff=1)

    if invert:
        im=ImageOps.invert(im)

    arr=np.asarray(im,dtype=np.uint8)
    dark=arr<int(threshold)
    coverage=float(dark.mean())

    # Normal line-art: retain source strokes.
    if 0.003 <= coverage <= 0.26:
        mask=dark
        mode="line"

    # Filled logos/shapes/photographic regions: trace outlines, not the filled mass.
    else:
        # Use threshold boundary plus FIND_EDGES response.
        er=_binary_erode(dark)
        boundary=dark & ~er
        edge=np.asarray(im.filter(ImageFilter.FIND_EDGES),dtype=np.uint8)
        edge_mask=edge>max(18,int(threshold*.30))
        mask=boundary | edge_mask
        mode="outline"

    # Remove image-frame artifacts.
    if mask.shape[0]>4 and mask.shape[1]>4:
        mask[:2,:]=0; mask[-2:,:]=0; mask[:,:2]=0; mask[:,-2:]=0

    # Gentle close repairs antialiased broken strokes.
    mask=_binary_dilate(mask)
    mask=_binary_erode(mask)

    return mask,mode,coverage

def _raster_paths(path: Path, threshold=128, invert=False) -> List[List[Point]]:
    """
    KinetiQ v3.2 clean raster tracer.

    Goals:
    - preserve the major line/outline structure of the uploaded artwork;
    - avoid collapsing a complex image into one dominant central skeleton;
    - repair only small broken gaps;
    - keep disconnected geometry separate so long crossing lines are never
      invented merely to make the route continuous.
    """
    import numpy as np

    mask,trace_mode,coverage=_prepare_raster_mask(path,threshold,invert)

    comps=_components(mask)
    if not comps:
        raise ValueError("No artwork lines detected. Adjust threshold or invert.")

    comps.sort(key=len,reverse=True)
    largest=len(comps[0])

    # Much less destructive filtering than v3.1.
    # Retain small-but-meaningful interior details.
    min_pixels=max(8,min(30,int(largest*.006)))
    clean,kept=_remove_small_components(mask,min_pixels)
    if not kept:
        raise ValueError("No clean line geometry detected. Adjust threshold/invert.")

    # Repair small antialiasing gaps only.
    clean,joined=_bridge_short_gaps(clean,max_gap_px=7)

    # Thin broad strokes to a route centerline, but do not discard components.
    skel=_zhang_suen(clean)
    comps=[c for c in _components(skel) if len(c)>=6]
    comps.sort(key=len,reverse=True)
    if not comps:
        raise ValueError("Artwork could not be converted into a clean route.")

    largest=len(comps[0])
    # Keep substantially more detail than the previous 4% cutoff.
    min_keep=max(6,int(largest*.0075))
    selected=[c for c in comps if len(c)>=min_keep][:96]

    paths=[]
    for comp in selected:
        route=_walk_component(comp,skel.shape)
        if len(route)>=4:
            paths.append(route)

    if not paths:
        raise ValueError("Generated route is empty.")

    _raster_paths.last_stats={
        "trace_mode":trace_mode,
        "source_coverage":round(coverage,4),
        "components_detected":len(comps),
        "components_retained":len(paths),
        "small_gaps_repaired":joined,
    }
    return paths


def _moving_average_path(path: List[Point], passes: int=0) -> List[Point]:
    """Gentle geometry smoothing without changing endpoints."""
    pts=list(path)
    passes=max(0,min(int(passes),6))
    for _ in range(passes):
        if len(pts)<3:
            break
        nxt=[pts[0]]
        for i in range(1,len(pts)-1):
            x=(pts[i-1][0]+2*pts[i][0]+pts[i+1][0])/4.0
            y=(pts[i-1][1]+2*pts[i][1]+pts[i+1][1])/4.0
            nxt.append((x,y))
        nxt.append(pts[-1])
        pts=nxt
    return pts


def _transform_paths(paths: List[List[Point]], rotation_deg: float=0.0,
                     offset_x: float=0.0, offset_y: float=0.0) -> List[List[Point]]:
    """Rotate and offset normalized artwork inside the table."""
    a=math.radians(float(rotation_deg))
    ca,sa=math.cos(a),math.sin(a)
    ox=max(-0.75,min(0.75,float(offset_x)))
    oy=max(-0.75,min(0.75,float(offset_y)))
    out=[]
    for path in paths:
        q=[]
        for x,y in path:
            q.append((x*ca-y*sa+ox, x*sa+y*ca+oy))
        out.append(q)
    return out


def _nearest_route_cost(paths: List[List[Point]]) -> float:
    ordered=_nearest_order(paths)
    if not ordered:
        return 0.0
    total=0.0
    for a,b in zip(ordered,ordered[1:]):
        total += _dist(a[-1],b[0])
    return total


def _choose_start_path(paths: List[List[Point]], start_mode: str="auto") -> List[List[Point]]:
    """
    Reorder the first drawable island. 'perimeter' prefers geometry nearest the
    circular edge; 'center' prefers geometry nearest the origin; 'auto' chooses
    whichever gives the lower nearest-neighbour connector cost.
    """
    paths=[p[:] for p in paths if len(p)>1]
    if len(paths)<2:
        return paths

    def score_center(p):
        a=min(_dist((0.0,0.0),p[0]),_dist((0.0,0.0),p[-1]))
        return a

    def score_perimeter(p):
        ra=max(math.hypot(*p[0]),math.hypot(*p[-1]))
        return -ra

    mode=(start_mode or "auto").lower()
    if mode=="center":
        idx=min(range(len(paths)),key=lambda i:score_center(paths[i]))
    elif mode=="perimeter":
        idx=min(range(len(paths)),key=lambda i:score_perimeter(paths[i]))
    else:
        # compare center/perimeter candidates by total connector cost
        ci=min(range(len(paths)),key=lambda i:score_center(paths[i]))
        pi=min(range(len(paths)),key=lambda i:score_perimeter(paths[i]))
        candidates=[]
        for idx0 in {ci,pi}:
            test=[paths[idx0]]+[p for j,p in enumerate(paths) if j!=idx0]
            candidates.append((_nearest_route_cost(test),idx0))
        idx=min(candidates)[1]
    return [paths[idx]]+[p for j,p in enumerate(paths) if j!=idx]


def _rdp(points: List[Point], epsilon: float) -> List[Point]:
    """Ramer-Douglas-Peucker simplification."""
    if len(points)<3 or epsilon<=0:
        return points[:]
    a,b=points[0],points[-1]
    vx,vy=b[0]-a[0],b[1]-a[1]
    denom=math.hypot(vx,vy)
    best_d=-1.0; best_i=0
    for i,p in enumerate(points[1:-1],1):
        if denom<1e-12:
            d=_dist(a,p)
        else:
            d=abs(vy*p[0]-vx*p[1]+b[0]*a[1]-b[1]*a[0])/denom
        if d>best_d:
            best_d=d;best_i=i
    if best_d>epsilon:
        left=_rdp(points[:best_i+1],epsilon)
        right=_rdp(points[best_i:],epsilon)
        return left[:-1]+right
    return [a,b]


def convert_upload_to_thr(path: Path, threshold: int=128, invert: bool=False, fit: float=.94,
                          smoothing: int=1, simplify: float=0.0025,
                          rotation_deg: float=0.0, offset_x: float=0.0, offset_y: float=0.0,
                          max_bridge: float=0.055, start_mode: str="auto"):
    ext=path.suffix.lower()
    if ext==".thr":
        pts=[]
        for line in path.read_text(encoding="utf-8",errors="ignore").splitlines():
            line=line.strip()
            if not line or line.startswith("#"): continue
            sp=line.replace(","," ").split()
            if len(sp)>=2:
                try: pts.append((float(sp[0]),max(0,min(1,float(sp[1])))))
                except: pass
        if len(pts)<2: raise ValueError("THR file has too few valid points")
        return pts,{"source":"thr","skipped_islands":0,"route_points":len(pts)}
    if ext==".svg": paths=_svg_paths(path)
    elif ext==".dxf": paths=_dxf_paths(path)
    elif ext in {".png",".jpg",".jpeg",".webp",".bmp"}: paths=_raster_paths(path,threshold,invert)
    else: raise ValueError("Supported formats: SVG, DXF, PNG, JPG/JPEG, WEBP, BMP, THR")
    paths=_normalize(paths,fit)
    paths=_transform_paths(paths,rotation_deg,offset_x,offset_y)
    paths=[_moving_average_path(p,smoothing) for p in paths]
    simp=max(0.0,min(float(simplify),0.025))
    if simp>0:
        paths=[_rdp(p,simp) if len(p)>3 else p for p in paths]
    paths=_choose_start_path(paths,start_mode)

    # Trim anything outside circular table radius.
    clipped=[]
    clipped_points=0
    for p in paths:
        q=[]
        for x,y in p:
            r=math.hypot(x,y)
            if r<=1.001:
                q.append((x,y))
            else:
                clipped_points += 1
        if len(q)>1:
            clipped.append(q)

    bridge=max(0.0,min(float(max_bridge),0.16))
    route,skipped=_join_clean(clipped,max_bridge=bridge)
    thr=_xy_to_thr(route)
    stats={
        "source":ext.lstrip('.'),
        "skipped_islands":skipped,
        "route_points":len(thr),
        "input_paths":len(paths),
        "clipped_points":clipped_points,
        "smoothing":int(max(0,min(int(smoothing),6))),
        "simplify":round(simp,5),
        "rotation_deg":round(float(rotation_deg),2),
        "max_bridge":round(bridge,4),
        "start_mode":start_mode,
    }
    if ext in {".png",".jpg",".jpeg",".webp",".bmp"}:
        stats.update(getattr(_raster_paths,"last_stats",{}) or {})
    return thr,stats


def thr_text(points):
    return "\n".join(f"{t:.7f} {r:.7f}" for t,r in points)+"\n"
