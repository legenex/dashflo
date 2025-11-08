import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { RefreshCcw } from "lucide-react";

export default function DebugWidget() {
  const [selectedWidget, setSelectedWidget] = useState('');
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(false);

  const { data: widgets } = useQuery({
    queryKey: ['all-widgets'],
    queryFn: () => base44.entities.Widget.list(),
    initialData: [],
  });

  const testWidget = async () => {
    if (!selectedWidget) {
      alert('Please select a widget');
      return;
    }

    setLoading(true);
    setLogs('Loading...');

    try {
      const widget = widgets.find(w => w.id === selectedWidget);
      
      const response = await base44.functions.invoke('fetchWidgetData', {
        data_source: widget.data_source,
        query_config: widget.query_config,
        date_range: {
          start: '2024-01-01',
          end: '2024-12-31'
        },
        custom_filters: []
      });

      setLogs(JSON.stringify(response.data, null, 2));
    } catch (error) {
      setLogs(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Debug Widget</h1>
        <p className="text-gray-400">Test widget data fetching and see backend logs</p>
      </div>

      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Select Widget to Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedWidget} onValueChange={setSelectedWidget}>
            <SelectTrigger className="glass-card border-white/10 text-white">
              <SelectValue placeholder="Select a widget" />
            </SelectTrigger>
            <SelectContent className="glass-card border-white/10 text-white">
              {widgets.map(w => (
                <SelectItem key={w.id} value={w.id} className="text-white">
                  {w.name} ({w.type})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            onClick={testWidget}
            disabled={loading}
            className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white"
          >
            <RefreshCcw className="w-4 h-4 mr-2" />
            {loading ? 'Testing...' : 'Test Widget'}
          </Button>

          {logs && (
            <div className="mt-4">
              <Label className="text-white mb-2 block">Response Data:</Label>
              <pre className="glass-card border-white/10 p-4 text-white text-xs overflow-auto max-h-96 rounded">
                {logs}
              </pre>
              <p className="text-xs text-gray-400 mt-2">
                💡 Check browser console (F12) for detailed backend logs
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}