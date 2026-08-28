import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { apiClient } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FileImage, FileCode2, DraftingCompass, Sparkles, Save, RefreshCw, Route } from 'lucide-react'

type Coord=[number,number]
interface PreviewResponse { success:boolean; token:string; coordinates:Coord[]; points:number; stats?:Record<string,number|string> }

export function PatternGeneratorDialog({open,onOpenChange,onSaved}:{open:boolean;onOpenChange:(v:boolean)=>void;onSaved:()=>void}){
  const [file,setFile]=useState<File|null>(null)
  const [name,setName]=useState('')
  const [threshold,setThreshold]=useState(128)
  const [invert,setInvert]=useState(false)
  const [fit,setFit]=useState(.94)
  const [preview,setPreview]=useState<PreviewResponse|null>(null)
  const [working,setWorking]=useState(false)
  const sourcePreview=useMemo(()=>file&&file.type.startsWith('image/')?URL.createObjectURL(file):null,[file])

  const points=useMemo(()=>{
    if(!preview?.coordinates?.length)return ''
    const size=360,c=size/2,r=size*.45
    return preview.coordinates.map(([t,rho])=>`${(c+Math.cos(t)*rho*r).toFixed(1)},${(c+Math.sin(t)*rho*r).toFixed(1)}`).join(' ')
  },[preview])

  const generate=async()=>{
    if(!file)return toast.error('Choose SVG, DXF, PNG, JPG or THR first')
    setWorking(true)
    try{
      const r=await apiClient.uploadFile('/api/v2/pattern-generator/preview',file,'file',{
        threshold:String(threshold),invert:String(invert),fit:String(fit)
      }) as PreviewResponse
      setPreview(r)
      if(!name)setName(file.name.replace(/\.[^.]+$/,''))
      toast.success('Clean route preview generated')
    }catch(e){toast.error(e instanceof Error?e.message:'Pattern generation failed')}
    finally{setWorking(false)}
  }

  const save=async()=>{
    if(!preview)return
    setWorking(true)
    try{
      await apiClient.post('/api/v2/pattern-generator/save',{token:preview.token,name})
      toast.success('Pattern added to library')
      onSaved();onOpenChange(false);setPreview(null);setFile(null);setName('')
    }catch(e){toast.error(e instanceof Error?e.message:'Save failed')}
    finally{setWorking(false)}
  }

  const ext=file?.name.split('.').pop()?.toUpperCase()||'—'
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-5xl max-h-[92vh] p-0 overflow-hidden border-white/10 bg-[#0d1218] text-white rounded-[22px] flex flex-col">
      <DialogHeader className="px-6 py-5 border-b border-white/10 bg-gradient-to-r from-[#151c24] to-[#0d1218]">
        <DialogTitle className="flex items-center gap-3 text-xl">
          <span className="km-icon-tile km-icon-tile-gold"><Sparkles size={20}/></span>
          Pattern Forge
          <span className="text-xs font-normal text-white/45">SVG · DXF · PNG · JPG · THR</span>
        </DialogTitle>
      </DialogHeader>
      <div className="grid md:grid-cols-[360px_1fr] min-h-0 flex-1 overflow-hidden">
        <div className="p-6 border-r border-white/10 space-y-5 overflow-y-auto min-h-0 pb-14">
          <label className="km-drop-zone">
            <input type="file" className="sr-only" accept=".svg,.dxf,.png,.jpg,.jpeg,.webp,.bmp,.thr" onChange={e=>{const f=e.target.files?.[0]||null;setFile(f);setPreview(null);if(f)setName(f.name.replace(/\.[^.]+$/,''))}}/>
            <div className="flex gap-3 items-center"><span className="km-icon-tile"><FileImage size={22}/></span><div><b>{file?file.name:'Choose artwork'}</b><p>Vector or high-contrast line artwork</p></div></div>
            <span className="km-format-chip">{ext}</span>
          </label>
          <div><Label>Pattern name</Label><Input value={name} onChange={e=>setName(e.target.value)} className="mt-2" placeholder="My clean pattern"/></div>
          <div><div className="flex justify-between"><Label>Fit inside table</Label><span className="text-xs text-white/50">{Math.round(fit*100)}%</span></div><Slider value={[fit]} min={.55} max={.98} step={.01} onValueChange={v=>setFit(v[0])} className="mt-3"/></div>
          <div><div className="flex justify-between"><Label>Image line threshold</Label><span className="text-xs text-white/50">{threshold}</span></div><Slider value={[threshold]} min={30} max={235} step={1} onValueChange={v=>setThreshold(v[0])} className="mt-3"/></div>
          <button className={`km-toggle-row ${invert?'is-on':''}`} onClick={()=>setInvert(v=>!v)}><span className="km-toggle-dot"/><div><b>Invert artwork</b><small>Use for light lines on a dark image</small></div></button>
          <div className="km-generator-note"><Route size={17}/><span>Long disconnected islands are skipped instead of drawing a straight pass-line through the design.</span></div>
          <Button onClick={generate} disabled={!file||working} className="w-full h-12 km-action-primary gap-2">{working?<RefreshCw className="animate-spin" size={18}/>:<DraftingCompass size={18}/>} Generate Clean Route</Button>
        </div>
        <div className="p-6 flex flex-col min-h-0 overflow-y-auto">
          {sourcePreview && (
            <div className="mb-4 rounded-xl border border-white/10 bg-white/[.03] p-3">
              <div className="text-[10px] tracking-[.16em] text-white/40 mb-2">SOURCE ARTWORK</div>
              <div className="h-36 rounded-lg overflow-hidden bg-[#eee6da] flex items-center justify-center">
                <img src={sourcePreview} alt="Original uploaded artwork" className="w-full h-full object-contain"/>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between mb-4"><div><p className="text-xs uppercase tracking-[.2em] text-white/35">Route Preview</p><h3 className="text-lg font-semibold">Sand-table path</h3></div>{preview&&<div className="flex gap-2"><span className="km-stat-chip">{preview.points} pts</span><span className="km-stat-chip">{Number(preview.stats?.skipped_islands||0)} crossings removed</span></div>}</div>
          <div className={`km-forge-preview flex-1 ${sourcePreview&&preview?'grid md:grid-cols-2 gap-3 p-3':'grid place-items-center'}`}>
            {sourcePreview&&preview&&<div className="km-forge-source-panel"><span className="km-forge-panel-label">ORIGINAL</span><img src={sourcePreview} alt="Original uploaded artwork" className="km-forge-source-image"/></div>}
            {preview?<div className="km-forge-route-panel"><span className="km-forge-panel-label">CLEAN ROUTE</span><svg viewBox="0 0 360 360" className="w-full max-w-[520px] aspect-square"><circle cx="180" cy="180" r="162" className="km-table-disc"/><polyline points={points} className="km-route-line" fill="none"/><circle cx="180" cy="180" r="3" className="km-center-dot"/></svg></div>:<div className="text-center text-white/35"><FileCode2 size={46} className="mx-auto mb-3 opacity-50"/><p>Generate a preview before saving.</p><p className="text-xs mt-1">Only the previewed THR route is added to the library.</p></div>}
          </div>
          <div className="flex justify-end gap-3 mt-5"><Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button onClick={save} disabled={!preview||working||!name.trim()} className="km-action-primary gap-2"><Save size={18}/>Save to Library</Button></div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
}
