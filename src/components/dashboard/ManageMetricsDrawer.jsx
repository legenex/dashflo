import React, { useState } from "react";
import { Drawer } from "vaul";
import { base44 } from "@/api/base44Client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Info } from "lucide-react";
import MetricBuilderModal from "./MetricBuilderModal";

export default function ManageMetricsDrawer({ open, onClose, allMetrics, onRefresh }) {
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingMetric, setEditingMetric] = useState(null);

  const tierGroups = {
    system: allMetrics.filter(m => m.tier === 'system'),
    approved: allMetrics.filter(m => m.tier === 'approved'),
    custom: allMetrics.filter(m => m.tier === 'custom'),
    experimental: allMetrics.filter(m => m.tier === 'experimental'),
  };

  const handleDelete = async (metric) => {
    if (!confirm(`Delete "${metric.name}"? This cannot be undone.`)) return;
    await base44.entities.CustomMetric.delete(metric.id);
    onRefresh();
  };

  const handleEdit = (metric) => {
    setEditingMetric(metric);
    setBuilderOpen(true);
  };

  const MetricRow = ({ m, readonly }) => (
    <div className="flex items-center gap-2 p-2.5 glass-card border-white/10 rounded-lg mb-1.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-white text-sm font-medium">{m.name}</span>
          <code className="text-[10px] text-[#00d4ff] bg-black/30 px-1.5 py-0.5 rounded">{m.field_id}</code>
        </div>
        {m.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{m.description}</p>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Badge className="bg-white/10 text-white text-[10px]">{m.aggregation}</Badge>
        <Badge className="bg-white/10 text-white text-[10px]">{m.format}</Badge>
        {!readonly ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => handleEdit(m)} className="text-[#00d4ff] hover:bg-[#00d4ff]/10 h-6 px-2 text-xs">Edit</Button>
            <Button size="sm" variant="ghost" onClick={() => handleDelete(m)} className="text-red-400 hover:bg-red-500/10 h-6 px-2 text-xs">Del</Button>
          </>
        ) : (
          <Badge className="bg-gray-500/10 text-gray-500 text-[10px]">read-only</Badge>
        )}
      </div>
    </div>
  );

  return (
    <>
      <Drawer.Root open={open} onOpenChange={v => !v && onClose()} direction="right">
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/50 z-[70]" />
          <Drawer.Content className="fixed top-0 right-0 h-full w-full max-w-lg bg-[#1a1a3e] border-l border-white/10 z-[80] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h2 className="text-lg font-bold text-white">Manage Metrics</h2>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => { setEditingMetric(null); setBuilderOpen(true); }} className="bg-[#00d4ff] text-white h-8">
                  <Plus className="w-3 h-3 mr-1" />New Metric
                </Button>
                <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <Tabs defaultValue="system">
                <TabsList className="w-full rounded-none border-b border-white/10 bg-transparent px-4 gap-1">
                  {['system','custom','experimental','approved'].map(t => (
                    <TabsTrigger key={t} value={t} className="text-white data-[state=active]:bg-white/10 capitalize flex-1 text-xs">
                      {t} <span className="ml-1 text-gray-500">({tierGroups[t]?.length || 0})</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
                {['system','approved'].map(t => (
                  <TabsContent key={t} value={t} className="p-4 m-0">
                    {tierGroups[t]?.length === 0
                      ? <p className="text-gray-500 text-sm text-center py-8">No {t} metrics</p>
                      : tierGroups[t].map(m => <MetricRow key={m.id || m.field_id} m={m} readonly />)
                    }
                  </TabsContent>
                ))}
                {['custom','experimental'].map(t => (
                  <TabsContent key={t} value={t} className="p-4 m-0">
                    {tierGroups[t]?.length === 0
                      ? <p className="text-gray-500 text-sm text-center py-8">No {t} metrics yet. Click "+ New Metric" to create one.</p>
                      : tierGroups[t].map(m => <MetricRow key={m.id} m={m} readonly={false} />)
                    }
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {builderOpen && (
        <MetricBuilderModal
          metric={editingMetric}
          allMetrics={allMetrics}
          onClose={() => { setBuilderOpen(false); setEditingMetric(null); onRefresh(); }}
        />
      )}
    </>
  );
}