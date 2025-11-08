import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Play, Pause, FileJson, Eye } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

import SchemaViewer from "./SchemaViewer";
import SyncedDataViewer from "./SyncedDataViewer";

export default function CloudRunTab({ configs }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [schemaViewerOpen, setSchemaViewerOpen] = useState(false);
  const [viewingConfig, setViewingConfig] = useState(null);
  const [dataViewerOpen, setDataViewerOpen] = useState(false);
  const [viewingDataConfig, setViewingDataConfig] = useState(null);

  // Fetch all sync logs to calculate totals
  const { data: syncLogs } = useQuery({
    queryKey: ['sync-logs'],
    queryFn: () => base44.entities.SyncLog.list('-created_date', 1000),
    initialData: [],
  });

  // Debug logging
  useEffect(() => {
    if (syncLogs.length > 0) {
      console.log('=== CLOUD RUN SYNC LOGS DEBUG ===');
      console.log('Total sync logs:', syncLogs.length);
      console.log('Sync logs:', syncLogs);
      
      configs.forEach(config => {
        const configLogs = syncLogs.filter(log => log.sync_config_id === config.id);
        console.log(`\nConfig "${config.name}" (${config.id}):`);
        console.log('  Matching logs:', configLogs.length);
        console.log('  Logs:', configLogs);
        
        const successLogs = configLogs.filter(log => log.status === 'success');
        console.log('  Success logs:', successLogs.length);
        
        const total = successLogs.reduce((sum, log) => {
          console.log(`    Log ${log.id}: records_synced = ${log.records_synced}`);
          return sum + (log.records_synced || 0);
        }, 0);
        console.log('  Total records:', total);
      });
    }
  }, [syncLogs, configs]);

  // Calculate total records synced for each config
  const getTotalRecords = (configId) => {
    const configLogs = syncLogs.filter(log => 
      log.sync_config_id === configId && log.status === 'success'
    );
    return configLogs.reduce((sum, log) => sum + (log.records_synced || 0), 0);
  };

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.SyncConfiguration.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-configs'] });
      alert("Cloud Run API sync deleted");
    }
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }) => base44.entities.SyncConfiguration.update(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-configs'] });
      alert("Sync status updated");
    }
  });

  const syncNowMutation = useMutation({
    mutationFn: async (config) => {
      const logEntry = await base44.entities.SyncLog.create({
        sync_config_id: config.id,
        sync_name: config.name,
        status: 'running',
        start_time: new Date().toISOString(),
        records_synced: 0,
        records_inserted: 0,
        records_updated: 0
      });
      
      await base44.entities.SyncConfiguration.update(config.id, {
        last_sync_time: new Date().toISOString(),
        last_sync_status: 'running'
      });
      
      return { config, logEntry };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-logs'] });
      queryClient.invalidateQueries({ queryKey: ['sync-configs'] });
      alert("Sync started - check Sync Logs tab for progress");
    }
  });

  const handleEdit = (config) => {
    navigate(createPageUrl('EditCloudRunSync') + '?id=' + config.id);
  };

  const handleAdd = () => {
    navigate(createPageUrl('EditCloudRunSync'));
  };

  const handleViewSchema = (config) => {
    setViewingConfig(config);
    setSchemaViewerOpen(true);
  };

  const handleViewData = (config) => {
    setViewingDataConfig(config);
    setDataViewerOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-white">Cloud Run API Syncs</h3>
        <Button 
          onClick={handleAdd}
          className="bg-gradient-to-r from-[#00d4ff] to-[#a855f7]"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Cloud Run API
        </Button>
      </div>

      {syncLogs.length === 0 && (
        <div className="glass-card border-yellow-500/30 bg-yellow-500/10 p-4 rounded-lg">
          <p className="text-yellow-400 text-sm">
            ℹ️ No sync logs found. Total records will show 0 until syncs are completed. Run a sync to populate the logs.
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-white/5">
              <TableHead className="text-gray-400">Status</TableHead>
              <TableHead className="text-gray-400">Name</TableHead>
              <TableHead className="text-gray-400">Service URL</TableHead>
              <TableHead className="text-gray-400">Method</TableHead>
              <TableHead className="text-gray-400">Format</TableHead>
              <TableHead className="text-gray-400">Frequency</TableHead>
              <TableHead className="text-gray-400">Last Sync</TableHead>
              <TableHead className="text-gray-400">Last Sync Records</TableHead>
              <TableHead className="text-gray-400">Total Records</TableHead>
              <TableHead className="text-gray-400">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {configs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-gray-400 py-8">
                  No Cloud Run API syncs configured. Click "Add Cloud Run API" to get started.
                </TableCell>
              </TableRow>
            ) : (
              configs.map((config) => {
                const totalRecords = getTotalRecords(config.id);
                const lastSyncRecords = config.last_sync_records || 0;
                
                return (
                  <TableRow key={config.id} className="border-white/10 hover:bg-white/5">
                    <TableCell>
                      <Badge className={
                        config.enabled
                          ? "bg-green-500/20 text-green-400 border-green-500/30 border"
                          : "bg-gray-500/20 text-gray-400 border-gray-500/30 border"
                      }>
                        {config.enabled ? "Active" : "Paused"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-white font-medium">{config.name}</TableCell>
                    <TableCell className="text-gray-400 font-mono text-sm max-w-xs truncate">
                      {config.api_url}
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 border">
                        {config.api_method || 'GET'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-white capitalize">
                      {config.response_format || 'JSON Array'}
                    </TableCell>
                    <TableCell className="text-white capitalize">
                      {config.frequency?.replace('_', ' ')}
                    </TableCell>
                    <TableCell className="text-gray-400">
                      {config.last_sync_time 
                        ? format(new Date(config.last_sync_time), 'MMM dd, HH:mm')
                        : 'Never'}
                    </TableCell>
                    <TableCell>
                      <Badge className={lastSyncRecords > 0 ? "bg-green-500/20 text-green-400 border-green-500/30 border" : "bg-gray-500/20 text-gray-400 border-gray-500/30 border"}>
                        {lastSyncRecords.toLocaleString()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={totalRecords > 0 ? "bg-[#00d4ff]/20 text-[#00d4ff] border-[#00d4ff]/30 border" : "bg-gray-500/20 text-gray-400 border-gray-500/30 border"}>
                        {totalRecords.toLocaleString()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleViewData(config)}
                          className="text-cyan-400 hover:bg-cyan-500/20"
                          title="View Data"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleViewSchema(config)}
                          className="text-purple-400 hover:bg-purple-500/20"
                          title="View Schema"
                        >
                          <FileJson className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => syncNowMutation.mutate(config)}
                          className="text-green-400 hover:bg-green-500/20"
                          title="Sync Now"
                        >
                          <Play className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleMutation.mutate({ id: config.id, enabled: !config.enabled })}
                          className={config.enabled ? "text-orange-400 hover:bg-orange-500/20" : "text-green-400 hover:bg-green-500/20"}
                          title={config.enabled ? "Pause" : "Enable"}
                        >
                          {config.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEdit(config)}
                          className="text-blue-400 hover:bg-blue-500/20"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(config.id)}
                          className="text-red-400 hover:bg-red-500/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <SchemaViewer
        config={viewingConfig}
        open={schemaViewerOpen}
        onClose={() => {
          setSchemaViewerOpen(false);
          setViewingConfig(null);
        }}
      />

      <SyncedDataViewer
        config={viewingDataConfig}
        open={dataViewerOpen}
        onClose={() => {
          setDataViewerOpen(false);
          setViewingDataConfig(null);
        }}
      />
    </div>
  );
}