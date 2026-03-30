import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { RefreshCw, Check, AlertCircle } from 'lucide-react';

export default function RebuildMetrics() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  const handleRebuild = async () => {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const res = await base44.functions.invoke('rebuildMetrics', {});
      if (res.data?.success) {
        setStatus(res.data.message);
      } else {
        setError(res.data?.error || 'Rebuild failed');
      }
    } catch (err) {
      setError(err.message || 'Error invoking rebuild function');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Rebuild Metrics Library</h1>
        <p className="text-gray-400 text-sm">Reset and rebuild all system metrics with correct source field mappings.</p>
      </div>

      <div className="glass-card border border-white/10 rounded-xl p-6 space-y-4">
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-blue-400 text-sm">
          This will delete all system metrics and rebuild them with the following fields:
          <ul className="mt-3 list-disc list-inside space-y-1 text-xs">
            <li>Revenue, Net Revenue, Cost, Profit, Net Profit (SUM)</li>
            <li>CPL, ROAS, Margin (AVG)</li>
            <li>Total Leads, Conversions, Rejections, Returns (COUNT)</li>
          </ul>
        </div>

        {status && (
          <div className="flex items-center gap-2 p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm">
            <Check className="w-4 h-4" />
            {status}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <Button
          onClick={handleRebuild}
          disabled={loading}
          className="w-full bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Rebuilding...' : 'Rebuild Metrics Library'}
        </Button>
      </div>

      <div className="glass-card border border-white/10 rounded-xl p-4">
        <p className="text-gray-400 text-xs">
          After rebuilding, go to <strong>PerformanceOverview</strong> or <strong>Dashboard</strong> pages to select and configure the metrics for display.
        </p>
      </div>
    </div>
  );
}