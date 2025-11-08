import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function DebugData() {
  const [selectedSource, setSelectedSource] = useState('');

  const { data: syncConfigs } = useQuery({
    queryKey: ['sync-configs'],
    queryFn: () => base44.entities.SyncConfiguration.list(),
    initialData: [],
  });

  const { data: rawData, isLoading } = useQuery({
    queryKey: ['debug-raw-data', selectedSource],
    queryFn: async () => {
      if (!selectedSource) return [];
      
      const response = await base44.functions.invoke('fetchWidgetData', {
        data_source: selectedSource,
        query_config: {
          columns: [],
          filters: [],
          limit: 10
        }
      });
      return response.data;
    },
    enabled: !!selectedSource,
    initialData: [],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Debug Raw Data</h1>
        <p className="text-gray-400">View first 10 records from your data source</p>
      </div>

      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Select Data Source</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedSource} onValueChange={setSelectedSource}>
            <SelectTrigger className="glass-card border-white/10 text-white">
              <SelectValue placeholder="Choose a data source" />
            </SelectTrigger>
            <SelectContent className="glass-card border-white/10 text-white">
              {syncConfigs.map(config => (
                <SelectItem key={config.id} value={config.local_table_name || config.name} className="text-white">
                  {config.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedSource && (
        <Card className="glass-card border-white/10">
          <CardHeader>
            <CardTitle className="text-white">Raw Data (First 10 Records)</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-gray-400">Loading...</p>
            ) : rawData.length === 0 ? (
              <p className="text-gray-400">No data found</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10">
                      {Object.keys(rawData[0]).map(key => (
                        <TableHead key={key} className="text-gray-300">{key}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rawData.map((row, idx) => (
                      <TableRow key={idx} className="border-white/10">
                        {Object.entries(row).map(([key, value]) => (
                          <TableCell key={key} className="text-white">
                            {value === null || value === undefined ? '-' : String(value)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}