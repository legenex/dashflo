import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Save, ChevronRight, ChevronLeft } from "lucide-react";

const DIMENSION_PRESETS = [
  'date', 'Buyer', 'Supplier', 'State', 'Vertical',
  'UTM Source', 'Accident SOL', 'Treatment_Time',
  'Phone Verification', 'Feedback', 'Source',
];

const EMPTY_FORM = {
  name: '', description: '', dimension_field: '', secondary_dimension: '',
  metric_field_ids: [], default_sort_field: '', default_sort_direction: 'desc', is_system: false,
};

export default function TableBuilderModal({ table, allMetrics, onClose }) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [metricSearch, setMetricSearch] = useState('');

  useEffect(() => {
    if (table) {
      setFormData({
        name: table.name || '', description: table.description || '',
        dimension_field: table.dimension_field || '', secondary_dimension: table.secondary_dimension || '',
        metric_field_ids: table.metric_field_ids || [],
        default_sort_field: table.default_sort_field || '',
        default_sort_direction: table.default_sort_direction || 'desc',
        is_system: table.is_system || false,
      });
    } else {
      setFormData(EMPTY_FORM);
    }
  }, [table]);

  const toggleMetric = (field_id) => {
    setFormData(f => ({
      ...f,
      metric_field_ids: f.metric_field_ids.includes(field_id)
        ? f.metric_field_ids.filter(id => id !== field_id)
        : [...f.metric_field_ids, field_id],
    }));
  };

  const handleSave = async () => {
    if (!formData.name || !formData.dimension_field) return alert('Name and dimension are required');
    setSaving(true);
    try {
      if (table?.id) {
        await base44.entities.DashboardTable.update(table.id, formData);
      } else {
        await base44.entities.DashboardTable.create(formData);
      }
      onClose();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredMetrics = allMetrics.filter(m =>
    m.name.toLowerCase().includes(metricSearch.toLowerCase()) ||
    m.field_id.toLowerCase().includes(metricSearch.toLowerCase())
  );

  const selectedMetrics = allMetrics.filter(m => formData.metric_field_ids.includes(m.field_id));

  const canProceed = step === 1
    ? formData.name && formData.dimension_field
    : step === 2 ? formData.metric_field_ids.length > 0 : true;

  return (
    <div className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#1a1a3e] border border-white/10 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div>
            <h2 className="text-lg font-bold text-white">Table Builder</h2>
            <div className="flex gap-1.5 mt-2">
              {[1, 2, 3].map(s => (
                <div
                  key={s}
                  className={`h-1 rounded-full transition-all ${
                    step > s ? 'w-8 bg-[#00d4ff]' : step === s ? 'w-8 bg-[#00d4ff]/60' : 'w-4 bg-white/10'
                  }`}
                />
              ))}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-white font-semibold">Step 1: Name & Dimension</h3>
              <div>
                <Label className="text-white text-sm">Table Name</Label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Buyers Performance"
                  className="glass-card border-white/10 text-white mt-1"
                />
              </div>
              <div>
                <Label className="text-white text-sm">Primary Dimension</Label>
                <div className="grid grid-cols-3 gap-1.5 mt-1 mb-2">
                  {DIMENSION_PRESETS.map(d => (
                    <button
                      key={d}
                      onClick={() => setFormData(f => ({ ...f, dimension_field: d }))}
                      className={`p-2 rounded text-xs text-left transition-all ${
                        formData.dimension_field === d
                          ? 'bg-[#00d4ff]/20 border border-[#00d4ff]/50 text-[#00d4ff]'
                          : 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <Input
                  value={formData.dimension_field}
                  onChange={e => setFormData(f => ({ ...f, dimension_field: e.target.value }))}
                  placeholder="Or type custom column name..."
                  className="glass-card border-white/10 text-white"
                />
              </div>
              <div>
                <Label className="text-white text-sm">Description (optional)</Label>
                <Input
                  value={formData.description}
                  onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
                  className="glass-card border-white/10 text-white mt-1"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <h3 className="text-white font-semibold">Step 2: Select Columns</h3>
              <Input
                placeholder="Search metrics..."
                value={metricSearch}
                onChange={e => setMetricSearch(e.target.value)}
                className="glass-card border-white/10 text-white"
              />
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {filteredMetrics.map(m => {
                  const selected = formData.metric_field_ids.includes(m.field_id);
                  return (
                    <button
                      key={m.field_id}
                      onClick={() => toggleMetric(m.field_id)}
                      className={`w-full text-left p-2.5 rounded flex items-center justify-between transition-all border ${
                        selected
                          ? 'bg-[#00d4ff]/10 border-[#00d4ff]/30'
                          : 'bg-transparent border-transparent hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${
                          selected ? 'bg-[#00d4ff] border-[#00d4ff]' : 'border-white/20'
                        }`}>
                          {selected && <span className="text-white text-[8px]">✓</span>}
                        </div>
                        <span className="text-white text-sm">{m.name}</span>
                      </div>
                      <div className="flex gap-1">
                        <Badge className="bg-white/10 text-white text-[10px]">{m.aggregation}</Badge>
                        <Badge className="bg-white/10 text-white text-[10px]">{m.format}</Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400">{formData.metric_field_ids.length} columns selected</p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-white font-semibold">Step 3: Sorting</h3>
              <div>
                <Label className="text-white text-sm">Default Sort Column</Label>
                <Select value={formData.default_sort_field || ''} onValueChange={v => setFormData(f => ({ ...f, default_sort_field: v }))}>
                  <SelectTrigger className="glass-card border-white/10 text-white mt-1">
                    <SelectValue placeholder="Select sort column..." />
                  </SelectTrigger>
                  <SelectContent className="glass-card border-white/10">
                    <SelectItem value={formData.dimension_field} className="text-white">
                      {formData.dimension_field} (dimension)
                    </SelectItem>
                    {selectedMetrics.map(m => (
                      <SelectItem key={m.field_id} value={m.field_id} className="text-white">
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-white text-sm">Sort Direction</Label>
                <Select value={formData.default_sort_direction} onValueChange={v => setFormData(f => ({ ...f, default_sort_direction: v }))}>
                  <SelectTrigger className="glass-card border-white/10 text-white mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="glass-card border-white/10">
                    <SelectItem value="desc" className="text-white">Descending (highest first)</SelectItem>
                    <SelectItem value="asc" className="text-white">Ascending (lowest first)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Summary */}
              <div className="bg-black/20 rounded-lg p-3 space-y-1">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Summary</p>
                <p className="text-sm text-white">Name: <span className="text-[#00d4ff]">{formData.name}</span></p>
                <p className="text-sm text-white">Dimension: <span className="text-[#00d4ff]">{formData.dimension_field}</span></p>
                <p className="text-sm text-white">Columns: <span className="text-[#00d4ff]">{formData.metric_field_ids.length} metrics</span></p>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-white/10 flex justify-between">
          <Button
            variant="outline"
            onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
            className="glass-card border-white/10 text-white"
          >
            {step > 1 ? <><ChevronLeft className="w-4 h-4 mr-1" />Back</> : 'Cancel'}
          </Button>
          {step < 3 ? (
            <Button
              onClick={() => setStep(s => s + 1)}
              disabled={!canProceed}
              className="bg-[#00d4ff] text-white disabled:opacity-40"
            >
              Next<ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
            >
              <Save className="w-4 h-4 mr-2" />{saving ? 'Saving...' : 'Save Table'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}