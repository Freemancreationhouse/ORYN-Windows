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
    """
    Center artwork and scale it by its true radial extent so every point fits
    inside the circular sand table. This avoids the old square-bounds scaling
    that could clip diagonal corners after conversion.
    """
    pts=[p for path in paths for p in path]
    if not pts:
        raise ValueError("No usable geometry found")
    xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
    cx=(min(xs)+max(xs))/2.0
    cy=(min(ys)+max(ys))/2.0
    centered=[(x-cx,y-cy) for x,y in pts]
    max_r=max((math.hypot(x,y) for x,y in centered),default=0.0)
    if max_r<1e-9:
        raise ValueError("Artwork geometry has no measurable size")
    target=max(0.1,min(float(fit),0.98))
    k=target/max_r
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


def _polar(p: Point) -> Tuple[float,float]:
    return math.atan2(p[1],p[0]), math.hypot(p[0],p[1])


def _arc_connector(a: Point, b: Point, lane_radius: float=.985, step: float=.012) -> List[Point]:
    """
    Route a long unavoidable travel move around the quiet outer lane instead
    of cutting a straight line through the artwork.

    Pattern artwork is normally fitted to <= .94 radius, leaving the .985
    perimeter lane available for disconnected-island travel.
    """
    lane=max(.955,min(.997,float(lane_radius)))
    ta,ra=_polar(a); tb,rb=_polar(b)

    # unwrap the shortest boundary arc
    while tb-ta>math.pi: tb-=2*math.pi
    while tb-ta<-math.pi: tb+=2*math.pi

    out=[]
    # radial outward from a to lane
    n=max(1,int(math.ceil(abs(lane-ra)/step)))
    for i in range(n+1):
        r=ra+(lane-ra)*i/n
        out.append((math.cos(ta)*r,math.sin(ta)*r))

    # boundary arc
    arc_len=abs(tb-ta)*lane
    n=max(1,int(math.ceil(arc_len/step)))
    for i in range(1,n+1):
        t=ta+(tb-ta)*i/n
        out.append((math.cos(t)*lane,math.sin(t)*lane))

    # radial inward from lane to b
    n=max(1,int(math.ceil(abs(lane-rb)/step)))
    for i in range(1,n+1):
        r=lane+(rb-lane)*i/n
        out.append((math.cos(tb)*r,math.sin(tb)*r))

    if out:
        out[-1]=b
    return _dedupe(out)


def _path_is_closed(path: List[Point]) -> bool:
    return len(path)>3 and _dist(path[0],path[-1]) <= 0.02


def _orient_path_for_entry(path: List[Point], entry: Point) -> Tuple[List[Point], float]:
    """Choose the cheapest physically drawable entry point for a path.

    Raster/vector closed loops have an arbitrary source-file start vertex. The
    old forge treated that arbitrary vertex as mandatory, creating huge radial
    connector strokes. Closed loops can safely start at any point on the same
    loop, so rotate them to the vertex nearest the previous route endpoint.
    Open strokes may only be reversed.
    """
    p=path[:]
    if not p:
        return p,1e99
    closed=_path_is_closed(p)
    if closed:
        core=p[:-1] if _dist(p[0],p[-1])<0.02 else p[:]
        if not core:
            return p,1e99
        i=min(range(len(core)),key=lambda j:_dist(entry,core[j]))
        q=core[i:]+core[:i]
        q.append(q[0])
        return q,_dist(entry,q[0])
    d0=_dist(entry,p[0]); d1=_dist(entry,p[-1])
    if d1<d0:
        p.reverse(); return p,d1
    return p,d0


def _route_order(paths: List[List[Point]], start_mode: str="auto") -> List[List[Point]]:
    """Endpoint/closed-loop-aware route ordering with minimal connector cost."""
    paths=[p[:] for p in paths if len(p)>1]
    if len(paths)<2:
        return paths
    mode=(start_mode or "auto").lower()

    def radial_min(p): return min(math.hypot(x,y) for x,y in p)
    def radial_max(p): return max(math.hypot(x,y) for x,y in p)
    indices=list(range(len(paths)))
    if mode=="center":
        seeds=sorted(indices,key=lambda i:radial_min(paths[i]))[:min(7,len(paths))]
    elif mode=="perimeter":
        seeds=sorted(indices,key=lambda i:-radial_max(paths[i]))[:min(7,len(paths))]
    else:
        seeds=set(sorted(indices,key=lambda i:radial_min(paths[i]))[:3])
        seeds.update(sorted(indices,key=lambda i:-radial_max(paths[i]))[:3])
        seeds.update(sorted(indices,key=lambda i:-len(paths[i]))[:3])
        seeds=list(seeds)

    best_order=None; best_cost=None
    origin=(0.0,0.0)
    for seed in seeds:
        pending=[p[:] for i,p in enumerate(paths) if i!=seed]
        first=paths[seed][:]
        if _path_is_closed(first):
            target=origin if mode=="center" else max(first,key=lambda z:math.hypot(*z)) if mode=="perimeter" else first[0]
            first,_=_orient_path_for_entry(first,target)
        elif mode=="center" and math.hypot(*first[-1])<math.hypot(*first[0]):
            first.reverse()
        elif mode=="perimeter" and math.hypot(*first[-1])>math.hypot(*first[0]):
            first.reverse()
        ordered=[first]; cost=0.0
        while pending:
            endp=ordered[-1][-1]
            best=None
            for i,q0 in enumerate(pending):
                q,d=_orient_path_for_entry(q0,endp)
                cand=(d,i,q)
                if best is None or d<best[0]:
                    best=cand
            d,i,q=best
            pending.pop(i); cost+=d; ordered.append(q)
        if best_cost is None or cost<best_cost:
            best_cost=cost; best_order=ordered
    return best_order or paths

def _enter_path_near(path: List[Point], entry: Point) -> Tuple[List[Point], float, int]:
    """Enter a disconnected artwork path at its nearest point.

    Closed loops are simply rotated. Open paths are covered from the nearest
    interior point by retracing only *existing artwork* to one end and then
    continuing through to the other end. This avoids a long artificial travel
    line just because the source path happened to start far away.
    """
    p=path[:]
    if not p:
        return p,1e99,0
    closed=_path_is_closed(p)
    core=p[:-1] if closed and _dist(p[0],p[-1])<0.02 else p
    i=min(range(len(core)),key=lambda j:_dist(entry,core[j]))
    gap=_dist(entry,core[i])
    if closed:
        q=core[i:]+core[:i]+[core[i]]
        return q,gap,0
    if i==0:
        return core,gap,0
    if i==len(core)-1:
        return list(reversed(core)),gap,0
    # Nearest-point entry for an open stroke. Trace to the nearer end first,
    # retrace that existing segment back to the entry, then cover the other side.
    left=core[i::-1]
    right=core[i+1:]
    q=left + list(reversed(left[:-1])) + right
    return q,gap,max(0,len(left)-1)


def _join_artwork_safe(paths: List[List[Point]], start_mode: str="auto") -> Tuple[List[Point],dict]:
    """Create one continuous route using local minimum bridges + artwork retrace.

    The disconnected source paths are first connected with a Prim-style
    minimum bridge tree (nearest artwork points). We then Eulerise the combined
    graph by duplicating existing graph edges only. This keeps all unavoidable
    travel on artwork/local bridges and avoids the long diagonal repositioning
    lines produced by arbitrary path starts.
    """
    paths=[_dedupe(p,1e-9) for p in paths if len(p)>1]
    if not paths:
        return [],{"skipped_islands":0,"direct_connectors":0,"perimeter_connectors":0,
                   "connector_distance":0.0,"artwork_retrace_edges":0,"max_connector":0.0}

    def sample_idx(n,limit=140):
        if n<=limit: return list(range(n))
        step=max(1,n//limit); out=list(range(0,n,step))
        if out[-1]!=n-1: out.append(n-1)
        return out

    # Find a near-minimum attachment pair between two source paths.
    def nearest_pair(a,b):
        ai=sample_idx(len(a)); bi=sample_idx(len(b)); best=None
        for i in ai:
            pa=a[i]
            j=min(bi,key=lambda k:_dist(pa,b[k])); d=_dist(pa,b[j])
            if best is None or d<best[0]: best=(d,i,j)
        _,i0,j0=best
        # Refine locally/exactly against the winning sampled attachment.
        j=min(range(len(b)),key=lambda k:_dist(a[i0],b[k]))
        i=min(range(len(a)),key=lambda k:_dist(a[k],b[j]))
        j=min(range(len(b)),key=lambda k:_dist(a[i],b[k]))
        return _dist(a[i],b[j]),i,j

    # Prim tree over source components so every new bridge is local.
    connected={0}; pending=set(range(1,len(paths))); bridges=[]
    while pending:
        best=None
        for i in connected:
            for j in pending:
                d,ia,jb=nearest_pair(paths[i],paths[j])
                cand=(d,i,j,ia,jb)
                if best is None or d<best[0]: best=cand
        d,i,j,ia,jb=best
        bridges.append((i,ia,j,jb,d)); connected.add(j); pending.remove(j)

    # Build an undirected multigraph from artwork polylines and local bridges.
    # Quantize only for graph identity; keep enough precision to preserve form.
    def key(p): return (round(float(p[0]),7),round(float(p[1]),7))
    counts={}; adj={}
    def add_edge(a,b,m=1):
        a=key(a); b=key(b)
        if a==b:return
        e=(a,b) if a<=b else (b,a)
        counts[e]=counts.get(e,0)+m
        adj.setdefault(a,set()).add(b); adj.setdefault(b,set()).add(a)
    for pth in paths:
        for a,b in zip(pth,pth[1:]): add_edge(a,b)
    connector_distance=0.0; max_connector=0.0
    for i,ia,j,jb,d in bridges:
        br=_resample_line(paths[i][ia],paths[j][jb],.010)
        for a,b in zip(br,br[1:]): add_edge(a,b)
        connector_distance += d; max_connector=max(max_connector,d)

    # Pair all but at most two odd vertices along the graph itself. Duplicated
    # edges are existing artwork/bridge geometry, never new crossing geometry.
    odd=[v for v in adj if sum(counts.get((v,n) if v<=n else (n,v),0) for n in adj[v])%2==1]
    pending_odd=set(odd); duplicated=0
    while len(pending_odd)>2:
        a=min(pending_odd); pending_odd.remove(a)
        path=_bfs_path(adj,a,pending_odd)
        if not path: break
        b=path[-1]; pending_odd.discard(b)
        for u,v in zip(path,path[1:]):
            e=(u,v) if u<=v else (v,u); counts[e]=counts.get(e,0)+1; duplicated+=1

    multi={v:{} for v in adj}
    for (a,b),c in counts.items():
        multi[a][b]=multi[a].get(b,0)+c; multi[b][a]=multi[b].get(a,0)+c
    odd2=[v for v,ns in multi.items() if sum(ns.values())%2==1]
    mode=(start_mode or "auto").lower()
    candidates=odd2 or list(multi)
    if mode=="center": start=min(candidates,key=lambda p:math.hypot(*p))
    elif mode=="perimeter": start=max(candidates,key=lambda p:math.hypot(*p))
    else: start=min(candidates)

    stack=[start]; circuit=[]
    while stack:
        v=stack[-1]; nbs=[n for n,c in multi[v].items() if c>0]
        if nbs:
            n=nbs[0]; multi[v][n]-=1; multi[n][v]-=1; stack.append(n)
        else: circuit.append(stack.pop())
    route=list(reversed(circuit))
    return _dedupe(route,1e-9),{
        "skipped_islands":0,"direct_connectors":len(bridges),"perimeter_connectors":0,
        "connector_distance":round(connector_distance,4),"max_connector":round(max_connector,4),
        "artwork_retrace_edges":duplicated,
    }


def _join_clean(paths: List[List[Point]], max_bridge: float=.065,
                start_mode: str="auto", preserve_all: bool=True,
                lane_radius: float=.985, connector_mode: str="shortest") -> Tuple[List[Point],dict]:
    """
    Produce one physically executable continuous XY route.

    Short gaps use a direct connector. Longer unavoidable gaps are routed
    around a reserved perimeter travel lane instead of crossing through the
    design. If preserve_all=False they are skipped (legacy behavior).
    """
    mode=(connector_mode or "artwork").lower()
    if mode=="artwork":
        return _join_artwork_safe(paths,start_mode)
    ordered=_route_order(paths,start_mode)
    if not ordered:
        return [],{"skipped_islands":0,"direct_connectors":0,"perimeter_connectors":0,
                   "connector_distance":0.0}

    route=list(ordered[0])
    skipped=0; direct=0; perimeter=0; connector_distance=0.0
    for path in ordered[1:]:
        if not path: continue
        gap=_dist(route[-1],path[0])
        connector_distance+=gap
        mode=(connector_mode or "shortest").lower()
        use_direct = (mode=="shortest") or (mode=="auto" and gap<=max_bridge)
        if use_direct:
            bridge=_resample_line(route[-1],path[0],.010)
            route.extend(bridge[1:]); direct+=1
        elif preserve_all and mode in {"auto","perimeter"}:
            bridge=_arc_connector(route[-1],path[0],lane_radius=lane_radius,step=.010)
            route.extend(bridge[1:]); perimeter+=1
        elif preserve_all:
            bridge=_resample_line(route[-1],path[0],.010)
            route.extend(bridge[1:]); direct+=1
        else:
            skipped+=1; continue
        route.extend(path[1:])

    return _dedupe(route),{
        "skipped_islands":skipped,
        "direct_connectors":direct,
        "perimeter_connectors":perimeter,
        "connector_distance":round(connector_distance,4),
    }


def _resample_polyline(points: List[Point], max_step: float=.012) -> List[Point]:
    """Bound XY step length for smoother real-machine motion."""
    if len(points)<2:return points[:]
    step=max(.003,min(.035,float(max_step)))
    out=[points[0]]
    for a,b in zip(points,points[1:]):
        d=_dist(a,b)
        n=max(1,int(math.ceil(d/step)))
        for i in range(1,n+1):
            out.append((a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n))
    return _dedupe(out,1e-7)


def _xy_to_thr(points: List[Point]) -> List[Tuple[float,float]]:
    """
    Convert normalized XY to machine THR while avoiding meaningless theta
    whipping at the exact center.
    """
    if len(points)<2:
        raise ValueError("Generated route is too short")
    out=[]
    last_theta=0.0
    center_freeze=.012
    for x,y in points:
        rho=min(1.0,max(0.0,math.hypot(x,y)))
        if rho<center_freeze:
            theta=last_theta
        else:
            theta=math.atan2(y,x)
            while theta-last_theta>math.pi: theta-=2*math.pi
            while theta-last_theta<-math.pi: theta+=2*math.pi
        if not (math.isfinite(theta) and math.isfinite(rho)):
            raise ValueError("Generated route contains a non-finite coordinate")
        out.append((theta,rho))
        last_theta=theta
    return out



def _densify_thr(points: List[Tuple[float,float]], max_theta_step: float=0.11, max_rho_step: float=0.012) -> List[Tuple[float,float]]:
    """Bound polar step size so generated artwork cannot cause a sharp motor jerk.

    This is especially important when a Cartesian stroke passes very close to
    table centre, where theta can change rapidly while rho is tiny.  The
    interpolated THR points are also what the preview displays and what gets
    saved, preserving preview == machine route.
    """
    if len(points)<2:
        return points[:]
    mt=max(0.03,min(0.30,float(max_theta_step)))
    mr=max(0.004,min(0.03,float(max_rho_step)))
    out=[points[0]]
    for (t0,r0),(t1,r1) in zip(points,points[1:]):
        dt=t1-t0; dr=r1-r0
        n=max(1,int(math.ceil(abs(dt)/mt)),int(math.ceil(abs(dr)/mr)))
        for i in range(1,n+1):
            f=i/n
            out.append((t0+dt*f,r0+dr*f))
    return out

def _validate_thr(points: List[Tuple[float,float]]) -> dict:
    if len(points)<2:
        raise ValueError("Generated THR route is too short")
    max_dt=0.0; max_dr=0.0
    for i,(t,r) in enumerate(points):
        if not (math.isfinite(t) and math.isfinite(r)):
            raise ValueError(f"Invalid THR coordinate at point {i}")
        if r < -1e-9 or r > 1.000001:
            raise ValueError(f"Rho outside table boundary at point {i}: {r}")
        if i:
            max_dt=max(max_dt,abs(t-points[i-1][0]))
            max_dr=max(max_dr,abs(r-points[i-1][1]))
    return {
        "max_theta_step":round(max_dt,5),
        "max_rho_step":round(max_dr,5),
        "validated":1,
    }


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
    """Return 8-connected foreground components, scanning only ink pixels.

    The original implementation scanned every image pixel in Python.  On a
    Raspberry Pi that cost a large fraction of Pattern Forge runtime for big
    photos.  This version stores only foreground coordinates and therefore
    scales with artwork complexity rather than canvas area.
    """
    import numpy as np
    foreground={tuple(map(int,p)) for p in np.argwhere(mask)}
    comps=[]
    while foreground:
        seed=foreground.pop()
        stack=[seed]; comp=[seed]
        while stack:
            y,x=stack.pop()
            for dy in (-1,0,1):
                for dx in (-1,0,1):
                    if not (dx or dy):
                        continue
                    q=(y+dy,x+dx)
                    if q in foreground:
                        foreground.remove(q)
                        stack.append(q); comp.append(q)
        comps.append(comp)
    return comps

def _zhang_suen(mask, max_iterations: int = 96):
    """Fast NumPy-vectorized Zhang-Suen thinning.

    V10.1 scanned every pixel in Python for every thinning pass. On a Pi Zero
    that could take long enough for the reverse proxy to return a 504. This
    implementation performs the same topology-preserving thinning conditions
    with array operations and normally completes in a fraction of that time.
    """
    import numpy as np
    im=np.asarray(mask,dtype=np.uint8).copy()
    if im.ndim!=2 or min(im.shape)<3:
        return im.astype(bool)
    im[[0,-1],:]=0; im[:,[0,-1]]=0
    for _ in range(max(1,int(max_iterations))):
        changed=False
        for phase in (0,1):
            c=im[1:-1,1:-1]
            p2=im[:-2,1:-1]; p3=im[:-2,2:]; p4=im[1:-1,2:]; p5=im[2:,2:]
            p6=im[2:,1:-1]; p7=im[2:,:-2]; p8=im[1:-1,:-2]; p9=im[:-2,:-2]
            n=p2+p3+p4+p5+p6+p7+p8+p9
            trans=((p2==0)&(p3==1)).astype(np.uint8)
            trans+=((p3==0)&(p4==1)); trans+=((p4==0)&(p5==1)); trans+=((p5==0)&(p6==1))
            trans+=((p6==0)&(p7==1)); trans+=((p7==0)&(p8==1)); trans+=((p8==0)&(p9==1)); trans+=((p9==0)&(p2==1))
            cond=(c==1)&(n>=2)&(n<=6)&(trans==1)
            if phase==0:
                cond &= ~((p2*p4*p6).astype(bool)) & ~((p4*p6*p8).astype(bool))
            else:
                cond &= ~((p2*p4*p8).astype(bool)) & ~((p2*p6*p8).astype(bool))
            if np.any(cond):
                c[cond]=0
                changed=True
        if not changed:
            break
    return im.astype(bool)

def _skeleton_adjacency(pixels):
    """Build a clean pixel graph from a thinned skeleton.

    Diagonal neighbours are kept for real diagonal strokes but the redundant
    diagonal of an ordinary 90-degree corner is suppressed.  This prevents
    tiny triangular loops that make the sand ball chatter at corners.
    """
    pixels=set(pixels)
    adj={}
    for y,x in pixels:
        ns=[]
        for dy in (-1,0,1):
            for dx in (-1,0,1):
                if not (dx or dy):
                    continue
                q=(y+dy,x+dx)
                if q not in pixels:
                    continue
                if dx and dy and ((y,x+dx) in pixels or (y+dy,x) in pixels):
                    continue
                ns.append(q)
        adj[(y,x)]=ns
    return adj


def _prune_short_spurs(pixels, max_len=4, passes=3):
    """Remove only tiny skeleton whiskers caused by JPEG/photo noise."""
    pixels=set(pixels)
    removed=0
    for _ in range(max(1,int(passes))):
        adj=_skeleton_adjacency(pixels)
        kill=set()
        endpoints=[v for v,n in adj.items() if len(n)==1]
        for start in endpoints:
            if start in kill or start not in adj:
                continue
            trail=[start]
            prev=None
            cur=start
            for _step in range(max_len+1):
                nbs=[n for n in adj.get(cur,()) if n!=prev]
                if not nbs:
                    break
                nxt=nbs[0]
                trail.append(nxt)
                prev,cur=cur,nxt
                deg=len(adj.get(cur,()))
                if deg!=2:
                    # A tiny dead branch ending at a junction is photographic
                    # noise.  Keep the junction itself.
                    if deg>=3 and len(trail)-1<=max_len:
                        kill.update(trail[:-1])
                    break
                if len(trail)-1>max_len:
                    break
        if not kill:
            break
        pixels.difference_update(kill)
        removed += len(kill)
    return pixels,removed


def _bfs_path(adj, start, targets):
    """Shortest existing skeleton path from start to any target."""
    from collections import deque
    q=deque([start]); prev={start:None}
    target_set=set(targets)
    found=None
    while q:
        v=q.popleft()
        if v!=start and v in target_set:
            found=v; break
        for n in adj.get(v,()):
            if n not in prev:
                prev[n]=v; q.append(n)
    if found is None:
        return None
    out=[]; cur=found
    while cur is not None:
        out.append(cur); cur=prev[cur]
    out.reverse()
    return out


def _trace_component_paths(comp, shape):
    """Decompose one skeleton component into smooth edge-disjoint trails.

    Every skeleton edge is emitted once.  At crossings/junctions the tracer
    prefers the straightest unused continuation, preserving geometric strokes
    instead of Eulerising the graph by duplicating large sections.  This is
    both much faster and much cleaner for logos, knot drawings and line art.
    """
    pixels,spur_removed=_prune_short_spurs(comp,max_len=4,passes=2)
    adj=_skeleton_adjacency(pixels)
    adj={v:[n for n in ns if n in adj] for v,ns in adj.items() if ns}
    if not adj:
        return [],{"skeleton_edges":0,"spur_pixels_removed":spur_removed,"trail_count":0}

    def ek(a,b): return (a,b) if a<=b else (b,a)
    unvisited={ek(a,b) for a,ns in adj.items() for b in ns}
    if not unvisited:
        return [],{"skeleton_edges":0,"spur_pixels_removed":spur_removed,"trail_count":0}
    edge_count=len(unvisited)

    # Start at real endpoints first, then junctions, then any residual cycle.
    priority=[v for v,ns in adj.items() if len(ns)==1]
    priority += [v for v,ns in adj.items() if len(ns)!=2 and len(ns)>1]
    priority += list(adj.keys())
    trails=[]

    def available(v):
        return [n for n in adj.get(v,()) if ek(v,n) in unvisited]

    def straightest(prev,cur,cands):
        if prev is None or len(cands)==1:
            return cands[0]
        py,px=prev; cy,cx=cur
        iv=(cx-px,cy-py); il=math.hypot(*iv) or 1.0
        def score(n):
            ny,nx=n; ov=(nx-cx,ny-cy); ol=math.hypot(*ov) or 1.0
            # larger cosine = straighter continuation
            return (iv[0]*ov[0]+iv[1]*ov[1])/(il*ol)
        return max(cands,key=score)

    for seed in priority:
        while available(seed):
            trail=[seed]; prev=None; cur=seed
            while True:
                cands=available(cur)
                if not cands: break
                nxt=straightest(prev,cur,cands)
                unvisited.discard(ek(cur,nxt))
                trail.append(nxt); prev,cur=cur,nxt
            if len(trail)>1:
                trails.append([(float(x),float(y)) for y,x in trail])
        if not unvisited:
            break

    while unvisited:
        a,b=next(iter(unvisited)); seed=a
        trail=[seed]; prev=None; cur=seed
        while True:
            cands=available(cur)
            if not cands: break
            nxt=straightest(prev,cur,cands)
            unvisited.discard(ek(cur,nxt)); trail.append(nxt); prev,cur=cur,nxt
            if cur==seed: break
        if len(trail)>1:
            trails.append([(float(x),float(y)) for y,x in trail])

    return trails,{"skeleton_edges":edge_count,"spur_pixels_removed":spur_removed,"trail_count":len(trails),"retrace_edges":0,"retrace_ratio":0.0}


def _walk_component(comp, shape):
    """Create a continuous, low-retrace route through one skeleton component.

    The old Pattern Forge used a DFS walk that returned to every branch point,
    which duplicated large parts of a drawing and produced visibly messy,
    jerky paths.  This version treats the skeleton as an undirected graph,
    eulerises only the unavoidable odd vertices by duplicating *existing ink
    strokes*, and then emits one Euler trail.  A one-stroke free-hand drawing
    is therefore followed once, in its natural geometry.
    """
    pixels,spur_removed=_prune_short_spurs(comp,max_len=4,passes=3)
    adj=_skeleton_adjacency(pixels)
    # Drop graph-isolated residue.
    adj={v:[n for n in ns if n in adj] for v,ns in adj.items() if ns}
    if not adj:
        return []

    def edge(a,b):
        return (a,b) if a<=b else (b,a)

    base_edges=set()
    for a,ns in adj.items():
        for b in ns:
            base_edges.add(edge(a,b))
    if not base_edges:
        return []

    # Edge multiplicity starts at one.  Pair odd graph vertices using shortest
    # paths along the artwork itself; those are the only segments that may be
    # retraced, and only when topology makes a single continuous route
    # impossible otherwise.
    counts={e:1 for e in base_edges}
    odd=[v for v,ns in adj.items() if len(ns)%2==1]
    original_odd=len(odd)
    pending=set(odd)
    duplicated=0
    while len(pending)>2:
        a=min(pending)
        pending.remove(a)
        path=_bfs_path(adj,a,pending)
        if not path:
            break
        b=path[-1]
        pending.discard(b)
        for u,v in zip(path,path[1:]):
            e=edge(u,v); counts[e]=counts.get(e,0)+1; duplicated+=1

    # Build mutable multigraph.
    multi={v:{} for v in adj}
    for (a,b),c in counts.items():
        multi.setdefault(a,{})[b]=multi.setdefault(a,{}).get(b,0)+c
        multi.setdefault(b,{})[a]=multi.setdefault(b,{}).get(a,0)+c

    remaining_odd=[v for v,ns in multi.items() if sum(ns.values())%2==1]
    if remaining_odd:
        start=min(remaining_odd)
    else:
        # Prefer an endpoint nearest the component's lower-left source order;
        # deterministic output is important for repeatable previews.
        start=min(multi)

    stack=[start]; circuit=[]
    while stack:
        v=stack[-1]
        candidates=[n for n,c in multi.get(v,{}).items() if c>0]
        if candidates:
            # Prefer straight continuation.  This reduces jitter at crossings
            # while Hierholzer still guarantees every multigraph edge is used.
            if len(stack)>=2:
                py,px=stack[-2]; vy,vx=v
                iv=(vx-px,vy-py)
                il=(iv[0]*iv[0]+iv[1]*iv[1])**0.5 or 1.0
                def turn_score(n):
                    ny,nx=n; ov=(nx-vx,ny-vy)
                    ol=(ov[0]*ov[0]+ov[1]*ov[1])**0.5 or 1.0
                    return -(iv[0]*ov[0]+iv[1]*ov[1])/(il*ol), n
                n=min(candidates,key=turn_score)
            else:
                n=min(candidates)
            multi[v][n]-=1; multi[n][v]-=1
            stack.append(n)
        else:
            circuit.append(stack.pop())

    route=list(reversed(circuit))
    _walk_component.last_stats={
        "skeleton_edges":len(base_edges),
        "odd_vertices":original_odd,
        "retrace_edges":duplicated,
        "spur_pixels_removed":spur_removed,
        "retrace_ratio":round(duplicated/max(1,len(base_edges)),4),
    }
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


def _otsu_threshold(arr):
    """Small NumPy-only Otsu implementation (no OpenCV dependency on Pi)."""
    import numpy as np
    a=np.asarray(arr,dtype=np.uint8)
    hist=np.bincount(a.ravel(),minlength=256).astype(float)
    total=a.size
    if total<=0:
        return 128
    sum_total=float(np.dot(np.arange(256),hist))
    sum_b=0.0; w_b=0.0; best=-1.0; threshold=128
    for t in range(256):
        w_b += hist[t]
        if w_b<=0: continue
        w_f=total-w_b
        if w_f<=0: break
        sum_b += t*hist[t]
        m_b=sum_b/w_b; m_f=(sum_total-sum_b)/w_f
        between=w_b*w_f*(m_b-m_f)*(m_b-m_f)
        if between>best:
            best=between; threshold=t
    return int(threshold)


def _mask_quality(mask):
    """Score a candidate line mask for photographed/sketched artwork."""
    import numpy as np
    cov=float(mask.mean())
    if cov<0.0008 or cov>0.42:
        return -1e9
    comps=_components(mask)
    if not comps:
        return -1e9
    sizes=sorted((len(c) for c in comps),reverse=True)
    ink=max(1,int(mask.sum()))
    largest=sizes[0]/ink
    # Thin drawings commonly occupy 0.5–15% of a page.  Reward coherent ink
    # without forcing a single component (letters/facial details may separate).
    coverage_score=1.0-min(1.0,abs(cov-0.045)/0.18)
    coherent=min(1.0,sum(sizes[:12])/ink)
    clutter=min(1.0,len(sizes)/180.0)
    return coverage_score*1.8 + largest*0.9 + coherent*0.8 - clutter*0.45


def _sobel_edges(arr):
    """Return a normalized Sobel-like edge magnitude using NumPy only."""
    import numpy as np
    a=np.asarray(arr,dtype=np.float32)
    p=np.pad(a,1,mode="edge")
    gx=(p[:-2,2:]+2*p[1:-1,2:]+p[2:,2:])-(p[:-2,:-2]+2*p[1:-1,:-2]+p[2:,:-2])
    gy=(p[2:,:-2]+2*p[2:,1:-1]+p[2:,2:])-(p[:-2,:-2]+2*p[:-2,1:-1]+p[:-2,2:])
    return np.hypot(gx,gy)


def _looks_like_line_art(arr):
    """Robustly separate graphic/line artwork from tonal photos.

    High-contrast black/white mandalas and logos may contain a lot of black
    area, so dark_fraction alone must not force them into photo-edge mode.
    """
    import numpy as np
    a=np.asarray(arr,dtype=np.uint8)
    white=float((a>220).mean())
    dark=float((a<90).mean())
    mid=float(((a>=90)&(a<=220)).mean())
    near_extremes=float(((a<55)|(a>200)).mean())
    # Graphic art is dominated by near-black/near-white pixels and has little
    # continuous midtone content, even when thick black fills are present.
    graphic=(near_extremes>0.72 and mid<0.34) or (white>0.48 and mid<0.28)
    return graphic, {"white_fraction":round(white,4),"dark_fraction":round(dark,4),"midtone_fraction":round(mid,4),"extreme_fraction":round(near_extremes,4)}


def _prepare_raster_mask(path: Path, threshold=128, invert=False, raster_mode="auto", detail=3):
    """Production raster artwork extraction for sketches, line art and photos.

    - line/sketch mode: centerline-oriented adaptive ink extraction
    - photo/painting mode: tonal image -> important edge/contour network
    - auto mode: selects between the two from image statistics

    The input is upscaled when tiny so low-resolution JPEGs do not become
    angular/saggy after skeletonization, and capped for Raspberry Pi memory.
    """
    import numpy as np
    from PIL import Image, ImageOps, ImageFilter

    im=Image.open(path)
    im=ImageOps.exif_transpose(im).convert("L")
    im=_auto_crop_gray(im)

    # Small web images benefit strongly from vectorization at a larger raster.
    w,h=im.size
    mx=max(w,h)
    if mx<560 and mx>0:
        scale=560.0/mx
        im=im.resize((max(24,int(round(w*scale))),max(24,int(round(h*scale)))),Image.Resampling.LANCZOS)
    else:
        im.thumbnail((700,700),Image.Resampling.LANCZOS)

    im=ImageOps.autocontrast(im,cutoff=0.35)
    arr=np.asarray(im,dtype=np.uint8)
    manual=max(20,min(240,int(threshold)))
    detail=max(1,min(5,int(detail)))
    requested=(raster_mode or "auto").strip().lower()
    is_line,tones=_looks_like_line_art(arr)
    mode=("line" if is_line else "photo") if requested=="auto" else requested
    if mode not in {"line","photo"}:
        mode="line" if is_line else "photo"

    if mode=="line":
        radius=max(7.0,min(im.size)/30.0)
        bg=np.asarray(im.filter(ImageFilter.GaussianBlur(radius=radius)),dtype=np.float32)
        a=arr.astype(np.float32)
        sensitivity=1.42-(manual/255.0)*0.82
        candidates=[]
        # Use the page/background border to establish polarity. A white page
        # should trace dark ink even if the inverse field scores as one giant
        # connected component. Only fall back to the opposite polarity when
        # the preferred mask is unusable.
        border=np.concatenate([arr[0,:],arr[-1,:],arr[:,0],arr[:,-1]])
        border_level=float(np.median(border)) if border.size else 127.0
        if border_level>=155:
            preferred_invert=False
        elif border_level<=100:
            preferred_invert=True
        else:
            preferred_invert=bool(invert)

        def polarity_candidates(inv):
            raw = arr>manual if inv else arr<manual
            signal=(a-bg) if inv else (bg-a)
            ink=np.clip(signal,0,255).astype(np.uint8)
            ot=_otsu_threshold(ink)
            local_cut=max(3,int(max(ot,6)*sensitivity))
            adaptive=ink>=local_cut
            pos=ink[ink>2]
            faint=ink>=max(3,min(local_cut,int(np.percentile(pos,56)))) if pos.size else adaptive
            tag='light-on-dark' if inv else 'dark-on-light'
            return [(_mask_quality(m),f"line-{name}-{tag}",m,local_cut,ot,inv) for name,m in (("adaptive",adaptive),("faint",faint),("global",raw))]

        preferred=polarity_candidates(preferred_invert)
        best_pref=max(preferred,key=lambda z:z[0])
        if best_pref[0]>-1e8:
            score,trace_mode,mask,local_cut,ot,used_invert=best_pref
        else:
            score,trace_mode,mask,local_cut,ot,used_invert=max(polarity_candidates(not preferred_invert),key=lambda z:z[0])
        source_coverage=float(mask.mean())
        if source_coverage>0.28:
            er=_binary_erode(mask)
            mask=mask & ~er
            trace_mode += "-outline"
        # Close only one-pixel antialias breaks; do not fatten artwork heavily.
        mask=_binary_dilate(mask)
        mask=_binary_erode(mask)
        extra={"local_threshold":local_cut,"otsu_detail":ot,"effective_invert":1 if used_invert else 0,"border_level":round(border_level,2)}
    else:
        # Photo/painting -> line interpretation using meaningful tonal edges.
        # A light blur removes JPEG grain before gradient extraction.
        smooth=np.asarray(im.filter(ImageFilter.GaussianBlur(radius=0.8)),dtype=np.uint8)
        mag=_sobel_edges(smooth)
        nonzero=mag[mag>0.5]
        if nonzero.size<20:
            raise ValueError("This image has too little visual contrast to create a line pattern.")
        # Higher sensitivity and higher detail retain more contours.
        sensitivity=(manual-20)/220.0
        percentile=95.0 - sensitivity*18.0 - (detail-3)*2.5
        percentile=max(66.0,min(97.0,percentile))
        cut=float(np.percentile(nonzero,percentile))
        mask=mag>=max(3.0,cut)
        # Keep contour strokes connected enough to skeletonize, but thin again
        # later. One close pass is much cheaper and cleaner than tracing every
        # shaded pixel.
        mask=_binary_dilate(mask)
        mask=_binary_erode(mask)
        trace_mode="photo-painting-edges"
        source_coverage=float(mask.mean())
        extra={"edge_percentile":round(percentile,2),"edge_threshold":round(cut,2)}

    if mask.shape[0]>8 and mask.shape[1]>8:
        mask[:4,:]=0; mask[-4:,:]=0; mask[:,:4]=0; mask[:,-4:]=0

    _prepare_raster_mask.last_stats={
        "trace_mode":trace_mode,
        "raster_mode":mode,
        "requested_raster_mode":requested,
        "source_coverage":round(source_coverage,4),
        "processing_width":int(mask.shape[1]),
        "processing_height":int(mask.shape[0]),
        "detail":detail,
        "photo_cleanup":1,
        **tones,
        **extra,
    }
    return mask,trace_mode,source_coverage


def _raster_paths(path: Path, threshold=128, invert=False, raster_mode="auto", detail=3) -> List[List[Point]]:
    """Turn raster artwork into clean drawable stroke/contour paths."""
    mask,trace_mode,coverage=_prepare_raster_mask(path,threshold,invert,raster_mode,detail)
    detail=max(1,min(5,int(detail)))
    comps=_components(mask)
    if not comps:
        raise ValueError("No artwork lines were detected. Try Photo/Painting mode, Invert, or adjust sensitivity.")
    comps.sort(key=len,reverse=True)
    largest=len(comps[0])

    # Noise filtering scales with detail. Higher detail preserves smaller motifs.
    frac={1:.010,2:.006,3:.0035,4:.0022,5:.0013}[detail]
    min_pixels=max(8,min(80,int(largest*frac)))
    clean,kept=_remove_small_components(mask,min_pixels)
    if not kept:
        raise ValueError("No clean drawable geometry remained after noise removal.")

    gap_px={1:4,2:5,3:7,4:9,5:12}[detail]
    clean,joined=_bridge_short_gaps(clean,max_gap_px=gap_px)
    skel=_zhang_suen(clean,max_iterations=80)
    comps=[c for c in _components(skel) if len(c)>=6]
    comps.sort(key=len,reverse=True)
    if not comps:
        raise ValueError("Artwork could not be converted into a clean line network.")

    largest=len(comps[0])
    min_keep=max(6,int(largest*({1:.010,2:.006,3:.003,4:.0018,5:.001}[detail])))
    max_components={1:70,2:110,3:180,4:260,5:360}[detail]
    selected=[c for c in comps if len(c)>=min_keep][:max_components]

    paths=[]; retrace_edges=0; skeleton_edges=0; spurs=0; odd_vertices=0
    for comp in selected:
        # One continuous route per truly connected artwork component.  The
        # Euler route retraces only existing ink when graph topology requires
        # it, so connected drawings never acquire artificial perimeter spokes.
        route=_walk_component(comp,skel.shape)
        st=getattr(_walk_component,"last_stats",{}) or {}
        retrace_edges+=int(st.get("retrace_edges",0))
        skeleton_edges+=int(st.get("skeleton_edges",0))
        spurs+=int(st.get("spur_pixels_removed",0))
        odd_vertices+=int(st.get("odd_vertices",0))
        if len(route)>=4:
            paths.append(route)
    if not paths:
        raise ValueError("Generated route is empty.")

    prep=getattr(_prepare_raster_mask,"last_stats",{}) or {}
    _raster_paths.last_stats={
        **prep,"trace_mode":trace_mode,"source_coverage":round(coverage,4),
        "components_detected":len(comps),"components_retained":len(paths),
        "small_gaps_repaired":joined,"skeleton_edges":skeleton_edges,
        "retrace_edges":retrace_edges,"retrace_ratio":round(retrace_edges/max(1,skeleton_edges),4),
        "odd_vertices":odd_vertices,"spur_pixels_removed":spurs,
    }
    return paths

def _gcode_paths(path: Path) -> List[List[Point]]:
    """Extract drawable XY geometry from common G-code.

    Supports modal G0/G1/G2/G3, G90/G91, G20/G21, I/J arcs and common R
    arcs.  G0 is treated as a non-drawing reposition (new island).  Z and
    other machine-only axes are ignored because a sand-table ball cannot lift.
    """
    text=path.read_text(encoding="utf-8",errors="ignore")
    absolute=True; unit=1.0; motion_mode=0
    x=y=0.0; have_pos=False
    current=[]; paths=[]

    def flush():
        nonlocal current
        q=_dedupe(current,1e-9)
        if len(q)>1: paths.append(q)
        current=[]

    def words(line):
        line=re.sub(r'\([^)]*\)',' ',line)
        line=line.split(';',1)[0].upper()
        out=[]
        for m in re.finditer(r'([A-Z])\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][-+]?\d+)?)',line):
            try: out.append((m.group(1),float(m.group(2))))
            except ValueError: pass
        return out

    def arc_center_from_r(start,end,radius,clockwise):
        x0,y0=start; x1,y1=end
        dx=x1-x0; dy=y1-y0; chord=math.hypot(dx,dy)
        R=abs(radius)
        if chord<1e-12 or R<chord/2:
            return None
        mx=(x0+x1)/2; my=(y0+y1)/2
        h=math.sqrt(max(0.0,R*R-(chord/2)**2))
        ux=-dy/chord; uy=dx/chord
        candidates=[(mx+ux*h,my+uy*h),(mx-ux*h,my-uy*h)]
        def sweep_for(c):
            cx,cy=c; a0=math.atan2(y0-cy,x0-cx); a1=math.atan2(y1-cy,x1-cx)
            if clockwise:
                while a1>=a0: a1-=2*math.pi
            else:
                while a1<=a0: a1+=2*math.pi
            return a1-a0
        scored=[(abs(sweep_for(c)),c,sweep_for(c)) for c in candidates]
        # Positive R normally requests the minor arc; negative R the major.
        if radius>=0:
            _,c,sw=min(scored,key=lambda z:z[0])
        else:
            _,c,sw=max(scored,key=lambda z:z[0])
        return c,sw

    for raw in text.splitlines():
        ws=words(raw)
        if not ws: continue
        gs=[int(round(v)) for k,v in ws if k=='G']
        if 20 in gs: unit=25.4
        if 21 in gs: unit=1.0
        if 90 in gs: absolute=True
        if 91 in gs: absolute=False
        explicit=next((g for g in gs if g in (0,1,2,3)),None)
        if explicit is not None:
            motion_mode=explicit
        # Coordinate-only lines inherit the current modal motion.
        if not any(k in ('X','Y','I','J','R') for k,_ in ws):
            continue
        motion=motion_mode
        vals={k:v for k,v in ws if k!='G'}
        tx=x; ty=y
        if 'X' in vals: tx=(vals['X']*unit if absolute else x+vals['X']*unit)
        if 'Y' in vals: ty=(vals['Y']*unit if absolute else y+vals['Y']*unit)
        if not have_pos:
            x,y=tx,ty; have_pos=True
            if motion!=0: current=[(x,y)]
            continue
        start=(x,y); end=(tx,ty)
        if motion==0:
            flush(); x,y=end; continue
        if not current: current=[start]
        if motion==1 or _dist(start,end)<1e-12:
            current.append(end)
        else:
            clockwise=(motion==2)
            center=None; sweep=None
            if 'I' in vals or 'J' in vals:
                cx=x+vals.get('I',0.0)*unit
                cy=y+vals.get('J',0.0)*unit
                a0=math.atan2(y-cy,x-cx); a1=math.atan2(ty-cy,tx-cx)
                if clockwise:
                    while a1>=a0: a1-=2*math.pi
                else:
                    while a1<=a0: a1+=2*math.pi
                center=(cx,cy); sweep=a1-a0
            elif 'R' in vals:
                rr=arc_center_from_r(start,end,vals['R']*unit,clockwise)
                if rr:
                    center,sweep=rr
            if center is None or sweep is None:
                current.append(end)
            else:
                cx,cy=center
                r=max(1e-12,math.hypot(x-cx,y-cy))
                a0=math.atan2(y-cy,x-cx)
                n=max(8,min(2400,int(abs(sweep)*r/0.8)+1))
                for i in range(1,n+1):
                    a=a0+sweep*i/n
                    current.append((cx+r*math.cos(a),cy+r*math.sin(a)))
                current[-1]=end
        x,y=end
    flush()
    if not paths:
        raise ValueError("No drawable G1/G2/G3 XY geometry found in G-code")
    _gcode_paths.last_stats={"gcode_paths":len(paths),"gcode_modal":1}
    return paths

def _moving_average_path(path: List[Point], passes: int=0) -> List[Point]:
    """Corner-preserving jitter smoothing.

    Pixel centerlines need de-jagging, but averaging sharp turns makes geometric
    artwork look saggy. Only near-straight/noisy vertices are smoothed; strong
    corners are preserved.
    """
    pts=list(path)
    passes=max(0,min(int(passes),5))
    for _ in range(passes):
        if len(pts)<3: break
        nxt=[pts[0]]
        for i in range(1,len(pts)-1):
            a,b,c=pts[i-1],pts[i],pts[i+1]
            v1=(b[0]-a[0],b[1]-a[1]); v2=(c[0]-b[0],c[1]-b[1])
            l1=math.hypot(*v1); l2=math.hypot(*v2)
            if l1<1e-9 or l2<1e-9:
                nxt.append(b); continue
            cosang=max(-1.0,min(1.0,(v1[0]*v2[0]+v1[1]*v2[1])/(l1*l2)))
            # Smooth only if direction changes less than about 38 degrees.
            if cosang>0.79:
                nxt.append(((a[0]+2*b[0]+c[0])/4.0,(a[1]+2*b[1]+c[1])/4.0))
            else:
                nxt.append(b)
        nxt.append(pts[-1]); pts=nxt
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
                          max_bridge: float=0.055, start_mode: str="auto",
                          preserve_all: bool=True, machine_step: float=0.012,
                          raster_mode: str="auto", detail: int=3, connector_mode: str="artwork"):
    """
    Professional machine-oriented artwork -> THR pipeline.

    The preview coordinates and saved THR are generated from this exact final
    route, so preview == saved file == machine path.
    """
    ext=path.suffix.lower()
    if ext==".thr":
        pts=[]
        for line in path.read_text(encoding="utf-8",errors="ignore").splitlines():
            line=line.strip()
            if not line or line.startswith("#"): continue
            sp=line.replace(","," ").split()
            if len(sp)>=2:
                try:
                    t=float(sp[0]); r=float(sp[1])
                    if math.isfinite(t) and math.isfinite(r):
                        pts.append((t,max(0.0,min(1.0,r))))
                except Exception:
                    pass
        if len(pts)<2:
            raise ValueError("THR file has too few valid points")
        stats={"source":"thr","route_points":len(pts),"skipped_islands":0}
        stats.update(_validate_thr(pts))
        return pts,stats

    if ext==".svg":
        paths=_svg_paths(path)
    elif ext==".dxf":
        paths=_dxf_paths(path)
    elif ext in {".png",".jpg",".jpeg",".webp",".bmp"}:
        paths=_raster_paths(path,threshold,invert,raster_mode,detail)
    elif ext in {".gcode",".nc",".ngc",".tap"}:
        paths=_gcode_paths(path)
    else:
        raise ValueError("Supported formats: PNG/JPG, SVG, DXF, GCODE/NC/NGC/TAP, THR")

    if not paths:
        raise ValueError("No usable artwork geometry was detected")

    # Keep artwork inside a reserved travel lane. Even if the user requests
    # 98%, cap artwork slightly lower when preserving all disconnected islands.
    requested_fit=max(.55,min(float(fit),.98))
    effective_fit=min(requested_fit,.94) if preserve_all else requested_fit
    paths=_normalize(paths,effective_fit)
    paths=_transform_paths(paths,rotation_deg,offset_x,offset_y)

    smooth=max(0,min(int(smoothing),6))
    paths=[_moving_average_path(q,smooth) for q in paths]

    simp=max(0.0,min(float(simplify),0.025))
    # Pixel skeletons contain sub-pixel stair-step wobble. A small minimum RDP
    # tolerance removes that wobble without rounding deliberate corners.
    if ext in {".png",".jpg",".jpeg",".webp",".bmp"}:
        rstats=getattr(_raster_paths,"last_stats",{}) or {}
        if rstats.get("raster_mode")=="line":
            simp=max(simp,0.0028)
    if simp>0:
        paths=[_rdp(q,simp) if len(q)>3 else q for q in paths]

    # Circular boundary verification after transforms.
    clipped=[]
    clipped_points=0
    for q in paths:
        clean=[]
        for x,y in q:
            r=math.hypot(x,y)
            if r<=effective_fit+0.015:
                clean.append((x,y))
            else:
                clipped_points+=1
        if len(clean)>1:
            clipped.append(_dedupe(clean))

    if not clipped:
        raise ValueError("Artwork falls outside the table after positioning")

    bridge=max(0.0,min(float(max_bridge),0.20))
    route,join_stats=_join_clean(
        clipped,
        max_bridge=bridge,
        start_mode=start_mode,
        preserve_all=bool(preserve_all),
        lane_radius=.985,
        connector_mode=connector_mode,
    )
    if len(route)<2:
        raise ValueError("Could not create a continuous machine route")

    # Real-machine smoothing: cap Cartesian spacing before polar conversion.
    route=_resample_polyline(route,machine_step)
    thr=_densify_thr(_xy_to_thr(route),0.11,0.012)
    validation=_validate_thr(thr)

    stats={
        "source":ext.lstrip("."),
        "route_points":len(thr),
        "input_paths":len(paths),
        "retained_paths":len(clipped),
        "clipped_points":clipped_points,
        "smoothing":smooth,
        "simplify":round(simp,5),
        "rotation_deg":round(float(rotation_deg),2),
        "max_bridge":round(bridge,4),
        "start_mode":start_mode,
        "preserve_all":1 if preserve_all else 0,
        "requested_fit":round(requested_fit,3),
        "effective_fit":round(effective_fit,3),
        "machine_step":round(max(.003,min(.035,float(machine_step))),4),
        "connector_mode":connector_mode,
        "raster_mode":raster_mode if ext in {".png",".jpg",".jpeg",".webp",".bmp"} else None,
        "detail":int(max(1,min(5,int(detail)))) if ext in {".png",".jpg",".jpeg",".webp",".bmp"} else None,
    }
    stats.update(join_stats)
    stats.update(validation)
    if ext in {".png",".jpg",".jpeg",".webp",".bmp"}:
        stats.update(getattr(_raster_paths,"last_stats",{}) or {})
    elif ext in {".gcode",".nc",".ngc",".tap"}:
        stats.update(getattr(_gcode_paths,"last_stats",{}) or {})
    return thr,stats


def thr_text(points):
    return "\n".join(f"{t:.7f} {r:.7f}" for t,r in points)+"\n"
