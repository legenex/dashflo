import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Save, Plus } from "lucide-react";

const AGG_OPTIONS = ['SUM', 'AVG', 'COUNT', 'COUNT_DISTINCT', 'RATIO', 'FORMULA'];
const FMT_OPTIONS = ['currency', 'percent', 'number', 'integer'];
const TIER_OPTIONS = ['custom', 'experimental', 'approved'];

const EMPTY_FORM = {
  name: '', field_id: '', source_field: '', formula: '',
  description: '', aggregation: 'SUM', format: 'number', tier: 'custom', is_active: true,
};

export default function MetricBuilderModal({ metric, allMetrics, onClose }) {
  const [view, setView] = useState('builder');
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [managedMetrics, setManagedMetrics] = useState([]);

  useEffect(() => {
    if (metric) {
      setFormData({
        name: metric.name || '', field_id: metric.field_id || '',
        source_field: metric.source_field || '', formula: metric.formula || '',
        description: metric.description || '', aggregation: metric.aggregation || 'SUM',
        format: metric.format || 'number', tier: metric.tier || 'custom',
        is_active: metric.is_active !== false,
      });
    } else {
      setFormData(EMPTY_FORM);
    }
  }, [metric]);

  useEffect(() => {
    if (view === 'manage') {
      base44.entities.CustomMetric.list().then(setManagedMetrics).catch(() => {});
    }
  }, [view]);

  const handleNameChange = (name) => {
    const slug = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    setFormData(f => ({ ...f, name, field_id: metric ? f.field_id : slug }));
  };

  const insertField = (field_id) => {
    setFormData(f => ({ ...f, formula: f.formula + `{${field_id}}` }));
  };

  const handleSave = async () => {
    if (!formData.name || !formData.field_id) return alert('Name and Field ID are required');
    setSaving(true);
    try {
      if (metric?.id && metric.tier !== 'system') {
        await base44.entities.CustomMetric.update(metric.id, formData);
      } else if (!metric) {
        await base44.entities.CustomMetric.create(formData);
      }
      onClose();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this metric?')) return;
    await base44.entities.CustomMetric.delete(id);
    setManagedMetrics(m => m.filter(x => x.id !== id));
  };

  const tierGroups = {
    system: managedMetrics.filter(m => m.tier === 'system'),
    approved: managedMetrics.filter(m => m.tier === 'approved'),
    custom: managedMetrics.filter(m => m.tier === 'custom'),
    experimental: managedMetrics.filter(m => m.tier === 'experimental'),
  };

  const isFormula = formData.aggregation === 'FORMULA' || formData.aggregation === 'RATIO';

  return (
    <div className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#1a1a3e] border border-white/10 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-white">Metric Builder</h2>
            <div className="flex gap-1 bg-white/5 rounded-lg p-1">
              {['builder', 'manage'].map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-all capitalize ${
                    view === v ? 'bg-[#00d4ff] text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {v === 'builder' ? 'Builder' : 'Manage Metrics'}
                </button>
              ))}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {view === 'builder' ? (
            <div className="p-4 grid grid-cols-2 gap-4">
              {/* Left: Form */}
              <div className="space-y-3">
                <div>
                  <Label className="text-white text-xs">Metric Name</Label>
                  <Input value={formData.name} onChange={e => handleNameChange(e.target.value)} placeholder="e.g. Net Profit Per Lead" className="glass-card border-white/10 text-white mt-1" />
                </div>
                <div>
                  <Label className="text-white text-xs">Field ID (slug)</Label>
                  <Input value={formData.field_id} onChange={e => setFormData(f => ({ ...f, field_id: e.target.value }))} placeholder="net_profit_per_lead" className="glass-card border-white/10 text-white mt-1 font-mono text-sm" />
                </div>
                <div>
                  <Label className="text-white text-xs">BigQuery Source Column</Label>
                  <Input value={formData.source_field} onChange={e => setFormData(f => ({ ...f, source_field: e.target.value }))} placeholder="e.g. Net Profit" className="glass-card border-white/10 text-white mt-1" />
                  <p className="text-[10px] text-gray-500 mt-1">Leave empty for FORMULA / RATIO metrics</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-white text-xs">Aggregation</Label>
                    <Select value={formData.aggregation} onValueChange={v => setFormData(f => ({ ...f, aggregation: v }))}>
                      <SelectTrigger className="glass-card border-white/10 text-white mt-1 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent className="glass-card border-white/10">
                        {AGG_OPTIONS.map(o => <SelectItem key={o} value={o} className="text-white">{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-white text-xs">Format</Label>
                    <Select value={formData.format} onValueChange={v => setFormData(f => ({ ...f, format: v }))}>
                      <SelectTrigger className="glass-card border-white/10 text-white mt-1 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent className="glass-card border-white/10">
                        {FMT_OPTIONS.map(o => <SelectItem key={o} value={o} className="text-white capitalize">{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {isFormula && (
                  <div>
                    <Label className="text-white text-xs">Formula Expression</Label>
                    <textarea
                      value={formData.formula}
                      onChange={e => setFormData(f => ({ ...f, formula: e.target.value }))}
                      placeholder="e.g. {net_profit} / Math.max({total_leads}, 1)"
                      className="w-full mt-1 p-3 bg-black/40 border border-white/10 rounded-lg text-[#00d4ff] font-mono text-sm resize-none min-h-[80px] focus:outline-none focus:border-[#00d4ff]/50"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">Use &#123;field_id&#125; tokens. Standard JS math supported.</p>
                  </div>
                )}
                <div>
                  <Label className="text-white text-xs">Tier</Label>
                  <Select value={formData.tier} onValueChange={v => setFormData(f => ({ ...f, tier: v }))}>
                    <SelectTrigger className="glass-card border-white/10 text-white mt-1 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent className="glass-card border-white/10">
                      {TIER_OPTIONS.map(o => <SelectItem key={o} value={o} className="text-white capitalize">{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-white text-xs">Description (optional)</Label>
                  <Input value={formData.description} onChange={e => setFormData(f => ({ ...f, description: e.target.value }))} className="glass-card border-white/10 text-white mt-1" />
                </div>
              </div>

              {/* Right: Field picker + preview */}
              <div className="space-y-3">
                <div>
                  <Label className="text-white text-xs mb-2 block">Insert Field Reference</Label>
                  <div className="bg-black/30 rounded-lg p-2 max-h-52 overflow-y-auto space-y-0.5">
                    {allMetrics.filter(m => m.aggregation !== 'FORMULA' && m.aggregation !== 'RATIO').map(m => (
                      <button
                        key={m.field_id}
                        onClick={() => insertField(m.field_id)}
                        className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-white/5 flex items-center justify-between transition-colors"
                      >
                        <span className="text-[#00d4ff] font-mono">{`{${m.field_id}}`}</span>
                        <span className="text-gray-500">{m.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {formData.formula && (
                  <div className="bg-black/30 rounded-lg p-3">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Formula Preview</p>
                    <code className="text-xs text-[#a855f7] leading-relaxed">
                      {formData.formula.replace(/\{(\w+)\}/g, (_, id) => {
                        const m = allMetrics.find(x => x.field_id === id);
                        return m ? `[${m.name}]` : `[${id}]`;
                      })}
                    </code>
                    <p className="text-[10px] text-gray-500 mt-2">Output: <span className="text-white">{formData.format}</span></p>
                  </div>
                )}

                <div className="bg-black/20 rounded-lg p-3 space-y-1">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Validation</p>
                  {!formData.name && <p className="text-[10px] text-yellow-400">⚠ Name required</p>}
                  {!formData.field_id && <p className="text-[10px] text-yellow-400">⚠ Field ID required</p>}
                  {isFormula && !formData.formula && <p className="text-[10px] text-yellow-400">⚠ Formula required for FORMULA aggregation</p>}
                  {formData.formula?.includes('/ 0') && <p className="text-[10px] text-red-400">⚠ Potential divide-by-zero risk</p>}
                  {formData.name && formData.field_id && (!isFormula || formData.formula) && (
                    <p className="text-[10px] text-emerald-400">✓ Ready to save</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-6">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => { setFormData(EMPTY_FORM); setView('builder'); }} className="bg-[#00d4ff] text-white h-8">
                  <Plus className="w-3 h-3 mr-1" />New Metric
                </Button>
              </div>
              {Object.entries(tierGroups).map(([tier, mList]) => mList.length > 0 && (
                <div key={tier}>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                    {tier} <span className="text-gray-600 font-normal">({mList.length})</span>
                  </h3>
                  <div className="space-y-1.5">
                    {mList.map(m => (
                      <div key={m.id} className="flex items-center justify-between p-2.5 glass-card border-white/10 rounded-lg">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-[#00d4ff] text-xs shrink-0">{m.field_id}</span>
                          <span className="text-white text-sm truncate">{m.name}</span>
                          <Badge className="bg-white/10 text-white text-[10px] shrink-0">{m.aggregation}</Badge>
                          <Badge className="bg-white/10 text-white text-[10px] shrink-0">{m.format}</Badge>
                        </div>
                        {tier !== 'system' ? (
                          <div className="flex gap-1 shrink-0 ml-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setFormData({ name: m.name, field_id: m.field_id, source_field: m.source_field || '', formula: m.formula || '', description: m.description || '', aggregation: m.aggregation, format: m.format, tier: m.tier, is_active: m.is_active });
                                setView('builder');
                              }}
                              className="text-[#00d4ff] hover:bg-[#00d4ff]/10 h-6 px-2 text-xs"
                            >Edit</Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(m.id)}
                              className="text-red-400 hover:bg-red-500/10 h-6 px-2 text-xs"
                            >Del</Button>
                          </div>
                        ) : (
                          <Badge className="bg-gray-500/10 text-gray-500 text-[10px] ml-2">read-only</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {view === 'builder' && (
          <div className="p-4 border-t border-white/10 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} className="glass-card border-white/10 text-white">Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saving || metric?.tier === 'system'}
              className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : metric?.tier === 'system' ? 'Read-only' : 'Save Metric'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}