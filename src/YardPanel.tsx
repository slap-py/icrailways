import { Check, Pencil, Plus, Trash2, Warehouse } from "lucide-react";
import type { Building, Depot } from "./types";
import { depotMetrics } from "./depots";
import { compactMoney } from "./cost";

interface Props {
  yard: Depot | null;
  yards: Depot[];
  editable: boolean;
  placing: "entrance" | "exit" | null;
  affected: Building[];
  error: string;
  onChange: (yard: Depot) => void;
  onSelect: (yard: Depot) => void;
  onEdit: () => void;
  onCancel: () => void;
  onCommit: () => void;
  onRemove: () => void;
  onPlace: (end: "entrance" | "exit") => void;
  onFocusBuilding: (id: string) => void;
}
export function YardPanel(p: Props) {
  const yard = p.yard;
  const metrics = yard ? depotMetrics(yard) : null;
  return <div className="yard-panel">
    {!yard ? <><p className="intro">A home for your rolling stock.</p><p className="description">Click a railway to start a yard, or select an existing yard below.</p></> : !p.editable ? <>
      <div className="selection-name"><Warehouse size={16} /><strong>{yard.name}</strong></div>
      <p className="description">{metrics?.tracks} tracks &middot; {yard.through ? "Through yard" : "Terminal yard"}</p>
      <button className="primary full station-edit-button" onClick={p.onEdit}><Pencil size={15} />Edit yard</button>
    </> : <>
      <div className="draft-status"><i />Unapplied yard draft</div>
      <label className="yard-field">Name<input maxLength={60} value={yard.name} onChange={e => p.onChange({ ...yard, name: e.target.value })} /></label>
      <dl className="yard-capacity" aria-live="polite">
        <div><dt>Tracks</dt><dd><output aria-label="Yard track count">{metrics?.tracks ?? 0}</output></dd></div>
        <div><dt>Usable length</dt><dd><output aria-label="Yard usable length">{Math.round(metrics?.lengthMeters ?? 0)}</output><small>m</small></dd></div>
      </dl>
      <p className="helper">Calculated from the boundary. Widen the yard for more tracks; extend it for longer tracks.</p>
      <label className="yard-field">Side of railway<select value={yard.side} onChange={e => p.onChange({ ...yard, side: Number(e.target.value) as 1 | -1 })}><option value="1">Right</option><option value="-1">Left</option></select></label>
      <button className="secondary full" onClick={() => p.onChange({ ...yard, direction: yard.direction === -1 ? 1 : -1, exit: undefined })}>Reverse yard direction</button>
      <p className="helper">Extend from the other direction, keeping the same side of the railway. The exit reconnects automatically.</p>
      <div className="editor-section yard-connections">
        <label className="symmetric-resize"><span><strong>Connect both ends</strong><small>Join the far end back to the railway.</small></span><input type="checkbox" checked={yard.through === true} onChange={e => p.onChange({ ...yard, through: e.target.checked })} /></label>
        <button onClick={() => p.onPlace("entrance")}>Move entrance connection</button>
        {yard.through && <button onClick={() => p.onPlace("exit")}>Choose exit connection</button>}
        {p.placing && <p className="route-status" role="status">Click a railway for the {p.placing} connection.</p>}
      </div>
      <div className="editor-section"><div className="field-label">BUILDING ACQUISITION <span>{p.affected.length}</span></div>
        <strong>{compactMoney(p.affected.reduce((sum, b) => sum + b.estimatedCost, 0))}</strong>
        <p className="helper">Buildings inside the yard or its approaches are acquired and cleared when you build.</p>
        {!!p.affected.length && <details><summary>Review affected buildings</summary>{p.affected.map(b => <button className="yard-building" key={b.id} onClick={() => p.onFocusBuilding(b.id)}>{b.buildingType} &middot; {compactMoney(b.estimatedCost)}</button>)}</details>}
      </div>
      {p.error && <p className="validation" role="alert">{p.error}</p>}
      <div className="editor-action-strip">
        <button className="primary full" disabled={!!p.error || !yard.name.trim() || !!p.placing} onClick={p.onCommit}><Check size={16} />Build yard</button>
        <button className="secondary full" onClick={p.onCancel}>Cancel changes</button>
        <small>Draft changes are not built until confirmed.</small>
      </div>
      {p.yards.some(d => d.id === yard.id) && <button className="station-delete" onClick={p.onRemove}><Trash2 size={14} />Remove yard</button>}
    </>}
    {!p.editable && <div className="depot-list"><span className="eyebrow">YOUR YARDS</span>{p.yards.map(d => <button key={d.id} onClick={() => p.onSelect(d)}><Warehouse size={14} /><span>{d.name}</span><b>{depotMetrics(d).tracks} tracks</b></button>)}
      {yard && <button onClick={p.onCancel}><Plus size={14} />Start another yard</button>}
    </div>}
  </div>;
}
