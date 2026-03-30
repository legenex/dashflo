import React, { useState } from "react";
import { Drawer } from "vaul";
import { base44 } from "@/api/base44Client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";

const DIMENSIONS = ['date','Buyer','Supplier','State','UTM Source','Accident SOL','Treatment_Time','Phone Verification','Lead Type','Vertical','Feedback','Source'];
const COL_SPANS = [1,2,3,4];
const ROW_HEIGHTS = ['compact','default','tall'];
const CHART_TYPES = [
  { value: 'line_chart', label: '📈 Line' },
  { value: 'bar_chart', label: '📊 Bar' },
  { value: 'area_chart', label: '🏔 Area' },
];

export default function AddWidgetDrawer({ open, onClose, allMetrics, onAdd }) {
  const [selMetrics, setSelMetrics] = useState([]);
  const [colSpan, setColSpan] = useState(2);
  const [rowHeight, setRowHeight] = useState('default');
  const [showSpark, setShowSpark] = useState(true);
  const [showDelta, setShowDelta] = useState(true);
  const [metricSearch, setMetricSearch] = useState('');

  const [tblTitle, setTblTitle] = useState('');
  const [tblDim, setTblDim] = useState('');
  const [tblCols, setTblCols] = useState([]);
  const [tblSort, setTblSort] = useState('');
  const [tblLimit, setTblLimit] = useState(25);
  const [tblSearch, setTblSearch] = useState('');

  const [chartTitle, setChartTitle] = useState('');
  const [chartType, setChartType] = useState('line_chart');
  const [chartDim, setChartDim] = useState('date');
  const [chartMetrics, setChartMetrics] = useState([]);
  const [chartColSpan, setChartColSpan] = useState(4);
  const [chartSearch, setChartSearch] = useState('');

  const [saving, setSaving] = useState(false);

  const tierOrder = ['system','approved','custom','experimental'];
  const grouped = tierOrder.reduce((acc, t) => {
    acc[t] = allMetrics.filter(m => m.tier === t);
    return acc;
  }, {});

  const filtered = (search) => allMetrics.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) || m.field_id.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddMetricCards = async () => {
    if (!selMetrics.length) return;
    setSaving(true);
    const widgets = await Promise.all(selMetrics.map((fid, i) =>
      base44.entities.DashboardWidget.create({
        type: 'metric_card',
        title: allMetrics.find(m => m.field_id === fid)?.name || fid,
        metric_ids: [fid],
        col_span: colSpan,
        row_height: rowHeight,
        show_sparkline: showSpark,
        show_comparison: showDelta,
        position: i,
      })
    ));
    onAdd(widgets.map(w => w.id));
    setSaving(false);
    onClose();
  };

  const handleAddTable = async () => {
    if (!tblDim || !tblCols.length) return alert('Select a dimension and at least one column');
    setSaving(true);
    const w = await base44.entities.DashboardWidget.create({
      type: 'table', title: tblTitle, dimension: tblDim, column_ids: tblCols,
      sort_field: tblSort || tblDim, sort_direction: 'desc', row_limit: tblLimit, col_span: 4,
    });
    onAdd([w.id]);
    setSaving(false);
    onClose();
  };

  const handleAddChart = async () => {
    if (!chartDim || !chartMetrics.length) return alert('Select a dimension and at least one metric');
    setSaving(true);
    const w = await base44.entities.DashboardWidget.create({
      type: chartType, title: chartTitle, dimension: chartDim,
      metric_ids: chartMetrics, col_span: chartColSpan, show_comparison: true,
    });
    onAdd([w.id]);
    setSaving(false);
    onClose();
  };

  const Toggle = ({ active, onClick, children }) => (
    <button onClick={onClick} className={`px-3 py-1.5 rounded text-xs font-medium transition-all border ${active ? 'bg-[#00d4ff]/20 border-[#00d4ff]/50 text-[#00d4ff]' : 'border-white/10 text-gray-400 hover:text-white'}`}>
      {children}
    </button>
  );

  return (
    <Drawer.Root open={open} onOpenChange={v => !v && onClose()} direction="right">
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-[70]" />
        <Drawer.Content className="fixed top-0 right-0 h-full w-full max-w-md bg-[#1a1a3e] border-l border-white/10 z-[80] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <h2 className="text-lg font-bold text-white">Add Widget</h2>
            <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <Tabs defaultValue="metric">
              <TabsList className="w-full rounded-none border-b border-white/10 bg-transparent px-4 gap-1">
                <TabsTrigger value="metric" className="text-white data-[state=active]:bg-white/10 flex-1">Metric Card</TabsTrigger>
                <TabsTrigger value="table" className="text-white data-[state=active]:bg-white/10 flex-1">Table</TabsTrigger>
                <TabsTrigger value="chart" className="text-white data-[state=active]:bg-white/10 flex-1">Chart</TabsTrigger>
              </TabsList>

              {/* ── Metric Card Tab ── */}
              <TabsContent value="metric" className="p-4 space-y-4 m-0">
                <Input placeholder="Search metrics..." value={metricSearch} onChange={e => setMetricSearch(e.target.value)} className="glass-card border-white/10 text-white" />
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {(metricSearch ? [{ tier: 'results', metrics: filtered(metricSearch) }] : tierOrder.map(t => ({ tier: t, metrics: grouped[t] }))).map(({ tier, metrics: mList }) =>
                    mList?.length > 0 && (
                      <div key={tier}>
                        {!metricSearch && <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">{tier}</p>}
                        {mList.map(m => (
                          <button
                            key={m.field_id}
                            onClick={() => setSelMetrics(s => s.includes(m.field_id) ? s.filter(x => x !== m.field_id) : [...s, m.field_id])}
                            className={`w-full text-left p-2 rounded flex items-center gap-2 mb-0.5 transition-all border ${selMetrics.includes(m.field_id) ? 'bg-[#00d4ff]/10 border-[#00d4ff]/30' : 'border-transparent hover:bg-white/5'}`}
                          >
                            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${selMetrics.includes(m.field_id) ? 'bg-[#00d4ff] border-[#00d4ff]' : 'border-white/20'}`}>
                              {selMetrics.includes(m.field_id) && <span className="text-white text-[8px]">✓</span>}
                            </div>
                            <span className="text-white text-sm flex-1">{m.name}</span>
                            <Badge className="bg-white/10 text-white text-[10px]">{m.format}</Badge>
                          </button>
                        ))}
                      </div>
                    )
                  )}
                </div>
                <div className="space-y-3 border-t border-white/10 pt-3">
                  <div>
                    <Label className="text-white text-xs">Col Span</Label>
                    <div className="flex gap-1.5 mt-1">{COL_SPANS.map(s => <Toggle key={s} active={colSpan===s} onClick={() => setColSpan(s)}>{s}</Toggle>)}</div>
                  </div>
                  <div>
                    <Label className="text-white text-xs">Row Height</Label>
                    <div className="flex gap-1.5 mt-1">{ROW_HEIGHTS.map(h => <Toggle key={h} active={rowHeight===h} onClick={() => setRowHeight(h)} className="capitalize">{h}</Toggle>)}</div>
                  </div>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={showSpark} onChange={e => setShowSpark(e.target.checked)} className="w-4 h-4" />
                      <span className="text-white text-sm">Show sparkline</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={showDelta} onChange={e => setShowDelta(e.target.checked)} className="w-4 h-4" />
                      <span className="text-white text-sm">Show Δ%</span>
                    </label>
                  </div>
                </div>
                <div className="pt-2">
                  <Button onClick={handleAddMetricCards} disabled={!selMetrics.length || saving} className="w-full bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white">
                    <Plus className="w-4 h-4 mr-2" />{saving ? 'Adding...' : `Add ${selMetrics.length || ''} Card${selMetrics.length !== 1 ? 's' : ''}`}
                  </Button>
                </div>
              </TabsContent>

              {/* ── Table Tab ── */}
              <TabsContent value="table" className="p-4 space-y-4 m-0">
                <div>
                  <Label className="text-white text-xs">Table Title</Label>
                  <Input value={tblTitle} onChange={e => setTblTitle(e.target.value)} placeholder="e.g. Daily Metrics" className="glass-card border-white/10 text-white mt-1" />
                </div>
                <div>
                  <Label className="text-white text-xs">Dimension</Label>
                  <div className="grid grid-cols-2 gap-1.5 mt-1 mb-1">
                    {DIMENSIONS.slice(0,6).map(d => <Toggle key={d} active={tblDim===d} onClick={() => setTblDim(d)}>{d}</Toggle>)}
                  </div>
                  <Input value={tblDim} onChange={e => setTblDim(e.target.value)} placeholder="Or type custom…" className="glass-card border-white/10 text-white" />
                </div>
                <div>
                  <Label className="text-white text-xs">Columns</Label>
                  <Input placeholder="Search metrics..." value={tblSearch} onChange={e => setTblSearch(e.target.value)} className="glass-card border-white/10 text-white mt-1 mb-2" />
                  <div className="max-h-52 overflow-y-auto space-y-0.5">
                    {filtered(tblSearch).map(m => (
                      <button key={m.field_id} onClick={() => setTblCols(c => c.includes(m.field_id) ? c.filter(x=>x!==m.field_id) : [...c, m.field_id])}
                        className={`w-full text-left p-2 rounded flex items-center gap-2 text-sm transition-all border ${tblCols.includes(m.field_id) ? 'bg-[#00d4ff]/10 border-[#00d4ff]/30' : 'border-transparent hover:bg-white/5'}`}>
                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${tblCols.includes(m.field_id) ? 'bg-[#00d4ff] border-[#00d4ff]' : 'border-white/20'}`}>
                          {tblCols.includes(m.field_id) && <span className="text-white text-[8px]">✓</span>}
                        </div>
                        <span className="text-white flex-1">{m.name}</span>
                        <Badge className="bg-white/10 text-white text-[10px]">{m.format}</Badge>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-white text-xs">Row Limit</Label>
                  <div className="flex gap-1.5 mt-1">
                    {[10,25,50,100].map(l => <Toggle key={l} active={tblLimit===l} onClick={() => setTblLimit(l)}>{l}</Toggle>)}
                  </div>
                </div>
                <Button onClick={handleAddTable} disabled={saving} className="w-full bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white">
                  <Plus className="w-4 h-4 mr-2" />{saving ? 'Adding...' : 'Add Table'}
                </Button>
              </TabsContent>

              {/* ── Chart Tab ── */}
              <TabsContent value="chart" className="p-4 space-y-4 m-0">
                <div>
                  <Label className="text-white text-xs">Chart Title</Label>
                  <Input value={chartTitle} onChange={e => setChartTitle(e.target.value)} placeholder="e.g. Revenue Trend" className="glass-card border-white/10 text-white mt-1" />
                </div>
                <div>
                  <Label className="text-white text-xs">Chart Type</Label>
                  <div className="flex gap-2 mt-1">
                    {CHART_TYPES.map(ct => <Toggle key={ct.value} active={chartType===ct.value} onClick={() => setChartType(ct.value)}>{ct.label}</Toggle>)}
                  </div>
                </div>
                <div>
                  <Label className="text-white text-xs">X-Axis Dimension</Label>
                  <div className="grid grid-cols-2 gap-1.5 mt-1 mb-1">
                    {DIMENSIONS.slice(0,6).map(d => <Toggle key={d} active={chartDim===d} onClick={() => setChartDim(d)}>{d}</Toggle>)}
                  </div>
                </div>
                <div>
                  <Label className="text-white text-xs">Y-Axis Metrics (up to 3)</Label>
                  <Input placeholder="Search metrics..." value={chartSearch} onChange={e => setChartSearch(e.target.value)} className="glass-card border-white/10 text-white mt-1 mb-2" />
                  <div className="max-h-52 overflow-y-auto space-y-0.5">
                    {filtered(chartSearch).map(m => {
                      const sel = chartMetrics.includes(m.field_id);
                      const disabled = !sel && chartMetrics.length >= 3;
                      return (
                        <button key={m.field_id} disabled={disabled} onClick={() => setChartMetrics(c => sel ? c.filter(x=>x!==m.field_id) : [...c, m.field_id])}
                          className={`w-full text-left p-2 rounded flex items-center gap-2 text-sm transition-all border ${sel ? 'bg-[#00d4ff]/10 border-[#00d4ff]/30' : disabled ? 'border-transparent opacity-40' : 'border-transparent hover:bg-white/5'}`}>
                          <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${sel ? 'bg-[#00d4ff] border-[#00d4ff]' : 'border-white/20'}`}>
                            {sel && <span className="text-white text-[8px]">✓</span>}
                          </div>
                          <span className="text-white flex-1">{m.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label className="text-white text-xs">Col Span</Label>
                  <div className="flex gap-1.5 mt-1">{COL_SPANS.map(s => <Toggle key={s} active={chartColSpan===s} onClick={() => setChartColSpan(s)}>{s}</Toggle>)}</div>
                </div>
                <Button onClick={handleAddChart} disabled={saving} className="w-full bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white">
                  <Plus className="w-4 h-4 mr-2" />{saving ? 'Adding...' : 'Add Chart'}
                </Button>
              </TabsContent>
            </Tabs>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}