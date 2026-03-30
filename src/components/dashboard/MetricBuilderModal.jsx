import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Save } from "lucide-react";
import { formatValue } from "../../utils/metricUtils";

const AGG_OPTIONS = ['SUM','AVG','COUNT','COUNT_DISTINCT','RATIO','FORMULA'];
const FMT_OPTIONS = ['currency','percent','number','integer'];
const TIER_OPTIONS = ['custom','experimental'];
const TIER_COLORS = { system: 'bg-blue-500/20 text-blue-400', approved: 'bg-green-500/20 text-green-400', custom: 'bg-purple-500/20 text-purple-400', experimental: 'bg-amber-500/20 text-amber-400' };

const MOCK_VALUES = { currency: 1234.56, percent: 14.2, number: 98765, integer: 1337 };

function slugify(str) { return str.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,''); }

function validateFormula(formula, allMetrics) {
  if (!formula) return null;
  const tokens = [...formula.matchAll(/\{([^}]+)\}/g)].map(m => m[1]);
  const unknown = tokens.filter(t => !allMetrics.find(m => m.field_id === t));
  if (unknown.length) return `Unresolved token: {${unknown[0]}}`;
  if (/\/\s*0(?!\.\d)/.test(formula)) return `Possible divide-by-zero — use NULLIF pattern`;
  return null;
}

function formulaToEnglish(formula, allMetrics) {
  if (!formula) return '—';
  return formula.replace(/\{([^}]+)\}/g, (_, fid) => {
    const m = allMetrics.find(x => x.field_id === fid);
    return m ? `[${m.name}]` : `[${fid}]`;
  });
}

export default function MetricBuilderModal({ metric, allMetrics, onClose }) {
  const [form, setForm] = useState({ name: '', field_id: '', aggregation: 'SUM', format: 'number', formula: '', description: '', tier: 'custom', is_active: true });
  const [saving, setSaving] = useState(false);
  const [fieldIdTouched, setFieldIdTouched] = useState(false);
  const formulaRef = useRef(null);

  useEffect(() => {
    if (metric) {
      setForm({ name: metric.name||'', field_id: metric.field_id||'', aggregation: metric.aggregation||'SUM', format: metric.format||'number', formula: metric.formula||'', description: metric.description||'', tier: metric.tier||'custom', is_active: metric.is_active!==false });
      setFieldIdTouched(true);
    }
  }, [metric]);

  const setName = (name) => {
    setForm(f => ({ ...f, name, field_id: fieldIdTouched ? f.field_id : slugify(name) }));
  };

  const insertToken = (field_id) => {
    const ta = formulaRef.current;
    if (!ta) { setForm(f => ({ ...f, formula: f.formula + `{${field_id}}` })); return; }
    const s = ta.selectionStart, e = ta.selectionEnd;
    const token = `{${field_id}}`;
    const next = form.formula.slice(0, s) + token + form.formula.slice(e);
    setForm(f => ({ ...f, formula: next }));
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + token.length; ta.focus(); }, 0);
  };

  const isFormula = form.aggregation === 'FORMULA' || form.aggregation === 'RATIO';
  const fieldIdExists = allMetrics.find(m => m.field_id === form.field_id && (!metric || m.field_id !== metric.field_id));
  const fieldIdValid = /^[a-z][a-z0-9_]*$/.test(form.field_id);
  const formulaError = isFormula ? validateFormula(form.formula, allMetrics) : null;
  const canSave = form.name && form.field_id && fieldIdValid && !fieldIdExists && (!isFormula || (form.formula && !formulaError));

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const data = { ...form };
      if (!isFormula) delete data.formula;
      if (metric?.id && metric.tier !== 'system') {
        await base44.entities.CustomMetric.update(metric.id, data);
      } else if (!metric) {
        await base44.entities.CustomMetric.create(data);
      }
      onClose();
    } catch (e) { alert('Error: ' + e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[90] flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#1a1a3e] border border-white/10 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-bold text-white">{metric && metric.tier !== 'system' ? 'Edit Metric' : 'New Metric'}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-0 divide-x divide-white/10">
            {/* Left: 3/5 */}
            <div className="md:col-span-3 p-5 space-y-4">
              <div>
                <Label className="text-white text-xs">Field Name *</Label>
                <Input value={form.name} onChange={e => setName(e.target.value)} placeholder="e.g. Net Profit Per Lead" className="glass-card border-white/10 text-white mt-1" />
              </div>
              <div>
                <Label className="text-white text-xs">Field ID *</Label>
                <Input
                  value={form.field_id}
                  onChange={e => { setFieldIdTouched(true); setForm(f => ({ ...f, field_id: slugify(e.target.value) })); }}
                  placeholder="net_profit_per_lead"
                  className={`glass-card text-white mt-1 font-mono text-sm border ${fieldIdExists ? 'border-red-500/50' : fieldIdValid && form.field_id ? 'border-emerald-500/50' : 'border-white/10'}`}
                />
                <p className={`text-[10px] mt-1 ${fieldIdExists ? 'text-red-400' : fieldIdValid && form.field_id ? 'text-emerald-400' : 'text-gray-500'}`}>
                  {fieldIdExists ? '✗ ID already taken' : fieldIdValid && form.field_id ? '✓ Valid unique ID' : 'lowercase letters, numbers, underscore'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-white text-xs">Aggregation</Label>
                  <Select value={form.aggregation} onValueChange={v => setForm(f => ({ ...f, aggregation: v }))}>
                    <SelectTrigger className="glass-card border-white/10 text-white mt-1 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent className="glass-card border-white/10">
                      {AGG_OPTIONS.map(o => <SelectItem key={o} value={o} className="text-white">{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-white text-xs">Format</Label>
                  <Select value={form.format} onValueChange={v => setForm(f => ({ ...f, format: v }))}>
                    <SelectTrigger className="glass-card border-white/10 text-white mt-1 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent className="glass-card border-white/10">
                      {FMT_OPTIONS.map(o => <SelectItem key={o} value={o} className="text-white capitalize">{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isFormula && (
                <div>
                  <Label className="text-white text-xs">Formula *</Label>
                  <textarea
                    ref={formulaRef}
                    value={form.formula}
                    onChange={e => setForm(f => ({ ...f, formula: e.target.value }))}
                    placeholder={`e.g. {net_profit} / {total_leads}`}
                    rows={4}
                    className="w-full mt-1 p-3 bg-black/50 border border-white/10 rounded-lg text-[#00d4ff] font-mono text-sm resize-none focus:outline-none focus:border-[#00d4ff]/40"
                  />
                  <div className="mt-1.5 flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                    {allMetrics.filter(m => m.aggregation !== 'FORMULA' && m.aggregation !== 'RATIO').map(m => (
                      <button key={m.field_id} onClick={() => insertToken(m.field_id)}
                        className={`text-[10px] px-1.5 py-0.5 rounded border cursor-pointer hover:opacity-80 ${TIER_COLORS[m.tier] || 'bg-white/10 text-white border-white/10'}`}>
                        {`{${m.field_id}}`}
                      </button>
                    ))}
                  </div>
                  {formulaError && <p className="text-[10px] text-red-400 mt-1">✗ {formulaError}</p>}
                  {!formulaError && form.formula && <p className="text-[10px] text-emerald-400 mt-1">✓ Valid</p>}
                </div>
              )}

              <div>
                <Label className="text-white text-xs">Description (optional)</Label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="w-full mt-1 p-2 bg-black/30 border border-white/10 rounded-lg text-white text-sm resize-none focus:outline-none focus:border-white/20"
                />
              </div>

              <div>
                <Label className="text-white text-xs">Tier</Label>
                <Select value={form.tier} onValueChange={v => setForm(f => ({ ...f, tier: v }))}>
                  <SelectTrigger className="glass-card border-white/10 text-white mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent className="glass-card border-white/10">
                    {TIER_OPTIONS.map(o => <SelectItem key={o} value={o} className="text-white capitalize">{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Right: 2/5 preview */}
            <div className="md:col-span-2 p-5 space-y-4 bg-black/20">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Live Preview</p>
              <div className="glass-card border-white/10 rounded-lg p-3">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{form.name || 'Metric Name'}</div>
                <div className="text-2xl font-bold text-white">{formatValue(MOCK_VALUES[form.format], form.format)}</div>
                <div className="text-xs text-emerald-400 mt-1">↑ +8.3% vs prior</div>
              </div>
              {isFormula && form.formula && (
                <div className="bg-black/30 rounded-lg p-3">
                  <p className="text-[10px] text-gray-400 mb-1">Plain English</p>
                  <p className="text-xs text-[#a855f7] leading-relaxed">{formulaToEnglish(form.formula, allMetrics)}</p>
                </div>
              )}
              <div className="space-y-1">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Validation</p>
                {!form.name && <p className="text-[10px] text-yellow-400">⚠ Name required</p>}
                {form.field_id && fieldIdExists && <p className="text-[10px] text-red-400">✗ Field ID taken</p>}
                {isFormula && !form.formula && <p className="text-[10px] text-yellow-400">⚠ Formula required</p>}
                {formulaError && <p className="text-[10px] text-red-400">✗ {formulaError}</p>}
                {canSave && <p className="text-[10px] text-emerald-400">✓ Ready to save</p>}
              </div>
              <div className="pt-2">
                <Badge className={`${TIER_COLORS[form.tier]} capitalize text-xs`}>{form.tier}</Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-white/10 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="glass-card border-white/10 text-white">Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave || saving || metric?.tier === 'system'} className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white">
            <Save className="w-4 h-4 mr-2" />{saving ? 'Saving…' : metric?.tier === 'system' ? 'Read-only' : 'Save Metric'}
          </Button>
        </div>
      </div>
    </div>
  );
}