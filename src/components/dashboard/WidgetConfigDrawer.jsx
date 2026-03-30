import React, { useState, useEffect } from "react";
import { Drawer } from "vaul";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Trash2, Check, ChevronDown } from "lucide-react";


const DIMENSIONS = ['date','Buyer','Supplier','State','UTM Source','Accident SOL','Treatment_Time','Phone Verification','Lead Type','Vertical','Feedback','Source'];

function DataSourceSelector({ cfg, update }) {
  const { data: syncConfigs = [] } = useQuery({
    queryKey: ['sync-configs-drawer'],
    queryFn: () => base44.entities.SyncConfiguration.list(),
    initialData: [],
  });

  if (syncConfigs.length === 0) {
    return <p className="text-yellow-400 text-xs mt-1">No data sources configured — go to Data Sync to set one up</p>;
  }

  const selectedLabel = syncConfigs.find(s => (s.local_table_name || s.id) === cfg.data_source)?.name || 'Dashboard default';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full glass-card border-white/10 text-white mt-1 justify-between">
          {selectedLabel}<ChevronDown className="w-4 h-4 ml-2 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="glass-card border-white/10 max-h-60 overflow-y-auto w-[--radix-dropdown-menu-trigger-width]" style={{ zIndex: 200 }}>
        <DropdownMenuItem onSelect={() => update('data_source', '')} className={`text-white cursor-pointer ${!cfg.data_source ? 'bg-[#00d4ff]/20' : 'hover:bg-white/10'}`}>Dashboard default</DropdownMenuItem>
        {syncConfigs.map(s => (
          <DropdownMenuItem key={s.id} onSelect={() => update('data_source', s.local_table_name || s.id)} className={`text-white cursor-pointer ${cfg.data_source === (s.local_table_name || s.id) ? 'bg-[#00d4ff]/20' : 'hover:bg-white/10'}`}>{s.name}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
const CF_OPS = ['>','<','=','!=','>=','<='];
const CF_COLORS = ['green','red','amber','blue','gray'];

function useAutoSave(widget) {
  const timerRef = React.useRef(null);

  const save = React.useCallback((updated) => {
    if (!widget?.id) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        await base44.entities.DashboardWidget.update(widget.id, updated);
      } catch (e) {
        console.error('Widget save failed:', e);
      }
    }, 600);
  }, [widget?.id]);

  return save;
}

export default function WidgetConfigDrawer({ open, onClose, widget, allMetrics, onUpdate }) {
  const [cfg, setCfg] = useState({});
  useEffect(() => { if (widget) setCfg({ ...widget }); }, [widget]);

  const save = useAutoSave(widget);

  const update = (key, value) => {
    const updated = { ...cfg, [key]: value };
    setCfg(updated);
    save(updated);
    onUpdate && onUpdate({ ...widget, ...updated });
  };

  const Toggle = ({ active, onClick, children }) => (
    <button onClick={onClick} className={`px-3 py-1.5 rounded text-xs font-medium transition-all border ${active ? 'bg-[#00d4ff]/20 border-[#00d4ff]/50 text-[#00d4ff]' : 'border-white/10 text-gray-400 hover:text-white'}`}>
      {children}
    </button>
  );

  const addCFRule = () => {
    const rules = [...(cfg.conditional_formatting || []), { field_id: '', operator: '>', value: '', color: 'green' }];
    update('conditional_formatting', rules);
  };
  const removeCFRule = (i) => {
    update('conditional_formatting', (cfg.conditional_formatting || []).filter((_, idx) => idx !== i));
  };
  const updateCFRule = (i, key, val) => {
    const rules = [...(cfg.conditional_formatting || [])];
    rules[i] = { ...rules[i], [key]: val };
    update('conditional_formatting', rules);
  };

  if (!widget) return null;
  const t = widget.type;
  const colMetrics = (cfg.column_ids || []).map(fid => allMetrics.find(m => m.field_id === fid)).filter(Boolean);

  return (
    <Drawer.Root open={open} onOpenChange={v => !v && onClose()} direction="right">
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-[70]" />
        <Drawer.Content className="fixed top-0 right-0 h-full w-full max-w-md bg-[#1a1a3e] border-l border-white/10 z-[80] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div>
              <h2 className="text-lg font-bold text-white capitalize">{t.replace('_', ' ')} Config</h2>
              <p className="text-xs text-gray-400">{cfg.title || 'Untitled'}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Title */}
            <div>
              <Label className="text-white text-xs">Title</Label>
              <Input value={cfg.title || ''} onChange={e => update('title', e.target.value)} className="glass-card border-white/10 text-white mt-1" placeholder="Widget title" />
            </div>


            {/* Metric Card */}
            {t === 'metric_card' && (
              <>
                <div>
                  <Label className="text-white text-xs">Metric</Label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full glass-card border-white/10 text-white mt-1 justify-between">
                        {allMetrics.find(m => m.field_id === (cfg.metric_ids || [])[0])?.name || 'Select metric'}
                        <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="glass-card border-white/10 max-h-60 overflow-y-auto w-[--radix-dropdown-menu-trigger-width]" style={{ zIndex: 200 }}>
                      {allMetrics.map(m => (
                        <DropdownMenuItem key={m.field_id} onSelect={() => update('metric_ids', [m.field_id])} className={`text-white cursor-pointer ${(cfg.metric_ids || [])[0] === m.field_id ? 'bg-[#00d4ff]/20' : 'hover:bg-white/10'}`}>{m.name}</DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div>
                  <Label className="text-white text-xs">Data Source</Label>
                  <DataSourceSelector cfg={cfg} update={update} />
                </div>
                <div>
                  <Label className="text-white text-xs">Col Span</Label>
                  <div className="flex gap-1.5 mt-1">{[1,2,3,4].map(s => <Toggle key={s} active={cfg.col_span===s} onClick={() => update('col_span', s)}>{s}</Toggle>)}</div>
                </div>
                <div>
                  <Label className="text-white text-xs">Row Height</Label>
                  <div className="flex gap-1.5 mt-1">{['compact','default','tall'].map(h => <Toggle key={h} active={cfg.row_height===h} onClick={() => update('row_height', h)}>{h}</Toggle>)}</div>
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={cfg.show_sparkline !== false} onChange={e => update('show_sparkline', e.target.checked)} className="w-4 h-4" />
                    <span className="text-white text-sm">Sparkline</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={cfg.show_comparison !== false} onChange={e => update('show_comparison', e.target.checked)} className="w-4 h-4" />
                    <span className="text-white text-sm">Delta %</span>
                  </label>
                </div>
              </>
            )}

            {/* Stat Bar */}
            {t === 'stat_bar' && (
              <div>
                <Label className="text-white text-xs">Metrics (ordered)</Label>
                <div className="space-y-1 mt-2 max-h-64 overflow-y-auto">
                  {allMetrics.map(m => {
                    const sel = (cfg.metric_ids || []).includes(m.field_id);
                    return (
                      <button key={m.field_id} onClick={() => update('metric_ids', sel ? (cfg.metric_ids||[]).filter(x=>x!==m.field_id) : [...(cfg.metric_ids||[]), m.field_id])}
                        className={`w-full text-left p-2 rounded flex items-center gap-2 text-sm border ${sel ? 'bg-[#00d4ff]/10 border-[#00d4ff]/30' : 'border-transparent hover:bg-white/5'}`}>
                        <div className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center ${sel ? 'bg-[#00d4ff] border-[#00d4ff]' : 'border-white/20'}`}>
                          {sel && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <span className="text-white flex-1">{m.name}</span>
                        <Badge className="bg-white/10 text-white text-[10px]">{m.format}</Badge>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Table */}
            {t === 'table' && (
              <>
                <div>
                  <Label className="text-white text-xs">Dimension</Label>
                  <div className="grid grid-cols-2 gap-1 mt-1 mb-1">
                    {DIMENSIONS.slice(0,6).map(d => <Toggle key={d} active={cfg.dimension===d} onClick={() => update('dimension', d)}>{d}</Toggle>)}
                  </div>
                  <Input value={cfg.dimension || ''} onChange={e => update('dimension', e.target.value)} placeholder="Custom column..." className="glass-card border-white/10 text-white" />
                </div>
                <div>
                  <Label className="text-white text-xs">Columns</Label>
                  <div className="space-y-1 mt-2 max-h-52 overflow-y-auto">
                    {colMetrics.map((m, i) => (
                      <div key={m.field_id} className="flex items-center gap-2 p-2 glass-card border-white/10 rounded">
                        <span className="text-white text-sm flex-1">{m.name}</span>
                        <button onClick={() => update('column_ids', (cfg.column_ids||[]).filter(x=>x!==m.field_id))} className="text-red-400 hover:text-red-300">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <Select onValueChange={v => { if (!(cfg.column_ids||[]).includes(v)) update('column_ids', [...(cfg.column_ids||[]), v]); }}>
                      <SelectTrigger className="glass-card border-white/10 text-[#00d4ff] mt-1"><SelectValue placeholder="+ Add column" /></SelectTrigger>
                      <SelectContent className="glass-card border-white/10 max-h-60">
                        {allMetrics.filter(m => !(cfg.column_ids||[]).includes(m.field_id)).map(m => (
                          <SelectItem key={m.field_id} value={m.field_id} className="text-white">{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-white text-xs">Sort Field</Label>
                  <Select value={cfg.sort_field || ''} onValueChange={v => update('sort_field', v)}>
                    <SelectTrigger className="glass-card border-white/10 text-white mt-1"><SelectValue placeholder="Sort by..." /></SelectTrigger>
                    <SelectContent className="glass-card border-white/10">
                      {colMetrics.map(m => <SelectItem key={m.field_id} value={m.field_id} className="text-white">{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-1.5 mt-1">
                    <Toggle active={cfg.sort_direction==='desc'} onClick={() => update('sort_direction','desc')}>↓ Desc</Toggle>
                    <Toggle active={cfg.sort_direction==='asc'} onClick={() => update('sort_direction','asc')}>↑ Asc</Toggle>
                  </div>
                </div>
                <div>
                  <Label className="text-white text-xs">Row Limit</Label>
                  <div className="flex gap-1.5 mt-1">{[10,25,50,100].map(l => <Toggle key={l} active={cfg.row_limit===l} onClick={() => update('row_limit', l)}>{l}</Toggle>)}</div>
                </div>
                {/* Conditional formatting */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-white text-xs">Conditional Formatting</Label>
                    <Button size="sm" variant="outline" onClick={addCFRule} className="glass-card border-white/10 text-white h-7 px-2 text-xs"><Plus className="w-3 h-3 mr-1" />Rule</Button>
                  </div>
                  <div className="space-y-2">
                    {(cfg.conditional_formatting || []).map((rule, i) => (
                      <div key={i} className="flex items-center gap-1.5 p-2 glass-card border-white/10 rounded">
                        <Select value={rule.field_id} onValueChange={v => updateCFRule(i, 'field_id', v)}>
                          <SelectTrigger className="h-7 text-xs bg-transparent border-white/10 text-white flex-1"><SelectValue placeholder="Field" /></SelectTrigger>
                          <SelectContent className="glass-card border-white/10">{colMetrics.map(m => <SelectItem key={m.field_id} value={m.field_id} className="text-white text-xs">{m.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <Select value={rule.operator} onValueChange={v => updateCFRule(i,'operator',v)}>
                          <SelectTrigger className="h-7 text-xs bg-transparent border-white/10 text-white w-14"><SelectValue /></SelectTrigger>
                          <SelectContent className="glass-card border-white/10">{CF_OPS.map(o => <SelectItem key={o} value={o} className="text-white text-xs">{o}</SelectItem>)}</SelectContent>
                        </Select>
                        <Input value={rule.value} onChange={e => updateCFRule(i,'value',e.target.value)} className="h-7 text-xs bg-transparent border-white/10 text-white w-16" />
                        <Select value={rule.color} onValueChange={v => updateCFRule(i,'color',v)}>
                          <SelectTrigger className="h-7 text-xs bg-transparent border-white/10 text-white w-20"><SelectValue /></SelectTrigger>
                          <SelectContent className="glass-card border-white/10">{CF_COLORS.map(c => <SelectItem key={c} value={c} className="text-white text-xs capitalize">{c}</SelectItem>)}</SelectContent>
                        </Select>
                        <button onClick={() => removeCFRule(i)} className="text-red-400 hover:text-red-300 shrink-0"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Chart */}
            {['line_chart','bar_chart','area_chart','combo_chart'].includes(t) && (
              <>
                <div>
                  <Label className="text-white text-xs">Chart Type</Label>
                  <div className="flex gap-1.5 mt-1">
                    {[{v:'line_chart',l:'Line'},{v:'bar_chart',l:'Bar'},{v:'area_chart',l:'Area'}].map(ct =>
                      <Toggle key={ct.v} active={cfg.type===ct.v} onClick={() => update('type', ct.v)}>{ct.l}</Toggle>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-white text-xs">X-Axis Dimension</Label>
                  <div className="grid grid-cols-2 gap-1 mt-1 mb-1">
                    {DIMENSIONS.slice(0,6).map(d => <Toggle key={d} active={cfg.dimension===d} onClick={() => update('dimension',d)}>{d}</Toggle>)}
                  </div>
                </div>
                <div>
                  <Label className="text-white text-xs">Y-Axis Metrics (up to 3)</Label>
                  <div className="space-y-1 mt-2 max-h-52 overflow-y-auto">
                    {allMetrics.map(m => {
                      const sel = (cfg.metric_ids||[]).includes(m.field_id);
                      const disabled = !sel && (cfg.metric_ids||[]).length >= 3;
                      return (
                        <button key={m.field_id} disabled={disabled} onClick={() => update('metric_ids', sel ? (cfg.metric_ids||[]).filter(x=>x!==m.field_id) : [...(cfg.metric_ids||[]), m.field_id])}
                          className={`w-full text-left p-2 rounded flex items-center gap-2 text-sm border ${sel ? 'bg-[#00d4ff]/10 border-[#00d4ff]/30' : disabled ? 'border-transparent opacity-40' : 'border-transparent hover:bg-white/5'}`}>
                          <div className={`w-3.5 h-3.5 rounded border shrink-0 ${sel ? 'bg-[#00d4ff] border-[#00d4ff]' : 'border-white/20'}`} />
                          <span className="text-white flex-1">{m.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label className="text-white text-xs">Col Span</Label>
                  <div className="flex gap-1.5 mt-1">{[1,2,3,4].map(s => <Toggle key={s} active={cfg.col_span===s} onClick={() => update('col_span',s)}>{s}</Toggle>)}</div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={cfg.show_comparison !== false} onChange={e => update('show_comparison', e.target.checked)} className="w-4 h-4" />
                  <span className="text-white text-sm">Show prior period overlay</span>
                </label>
              </>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}