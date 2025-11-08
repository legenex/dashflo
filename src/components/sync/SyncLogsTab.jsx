import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { AlertCircle, CheckCircle, Clock, FileText, Trash2, XCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function SyncLogsTab({ logs, configs }) {
  const queryClient = useQueryClient();
  const [showClearDialog, setShowClearDialog] = useState(false);

  const getConfigName = (configId) => {
    const config = configs.find(c => c.id === configId);
    return config?.name || 'Unknown';
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'running':
        return <Clock className="w-4 h-4 text-blue-400 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const deleteLogMutation = useMutation({
    mutationFn: (logId) => base44.entities.SyncLog.delete(logId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-logs'] });
    }
  });

  const clearAllLogsMutation = useMutation({
    mutationFn: async () => {
      // Delete all sync logs
      const deletePromises = logs.map(log => base44.entities.SyncLog.delete(log.id));
      await Promise.all(deletePromises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-logs'] });
      setShowClearDialog(false);
      alert('All sync logs cleared successfully');
    }
  });

  const clearStuckLogsMutation = useMutation({
    mutationFn: async () => {
      // Delete only logs stuck in "running" status
      const stuckLogs = logs.filter(log => log.status === 'running');
      const deletePromises = stuckLogs.map(log => base44.entities.SyncLog.delete(log.id));
      await Promise.all(deletePromises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-logs'] });
      alert('Cleared all stuck "running" logs');
    }
  });

  const stopSyncMutation = useMutation({
    mutationFn: async (log) => {
      // Mark the sync as failed/stopped
      await base44.entities.SyncLog.update(log.id, {
        status: 'failed',
        end_time: new Date().toISOString(),
        error_message: 'Manually stopped by user'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-logs'] });
      alert('Sync stopped');
    }
  });

  const handleDeleteLog = (logId) => {
    if (confirm('Delete this sync log?')) {
      deleteLogMutation.mutate(logId);
    }
  };

  const handleStopSync = (log) => {
    if (confirm('Stop this running sync?')) {
      stopSyncMutation.mutate(log);
    }
  };

  const runningLogs = logs.filter(l => l.status === 'running');

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-white">Sync History</h3>
          <p className="text-sm text-gray-400 mt-1">
            {logs.length > 0 
              ? `Showing ${logs.length} sync logs`
              : 'No sync history yet. Click "Sync Now" on any data source to start.'
            }
          </p>
          {runningLogs.length > 0 && (
            <p className="text-sm text-orange-400 mt-1">
              ⚠️ {runningLogs.length} sync(s) are stuck in "running" status
            </p>
          )}
        </div>

        {logs.length > 0 && (
          <div className="flex gap-2">
            {runningLogs.length > 0 && (
              <Button
                variant="outline"
                onClick={() => clearStuckLogsMutation.mutate()}
                className="glass-card border-orange-500/30 text-orange-400 hover:bg-orange-500/20"
                disabled={clearStuckLogsMutation.isPending}
              >
                <XCircle className="w-4 h-4 mr-2" />
                Clear Stuck Syncs
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setShowClearDialog(true)}
              className="glass-card border-red-500/30 text-red-400 hover:bg-red-500/20"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All Logs
            </Button>
          </div>
        )}
      </div>

      {logs.length === 0 ? (
        <div className="glass-card border-white/10 rounded-lg p-12 text-center">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h4 className="text-xl font-bold text-white mb-2">No Sync Logs Yet</h4>
          <p className="text-gray-400 mb-4">Start syncing your data sources to see history here</p>
          <div className="text-sm text-gray-500">
            <p>• Go to the BigQuery Tables or Cloud Run APIs tab</p>
            <p>• Click the <span className="text-green-400">▶</span> (Sync Now) button on any source</p>
            <p>• Sync logs will appear here automatically</p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-white/5">
                <TableHead className="text-gray-400">Status</TableHead>
                <TableHead className="text-gray-400">Sync Name</TableHead>
                <TableHead className="text-gray-400">Start Time</TableHead>
                <TableHead className="text-gray-400">Duration</TableHead>
                <TableHead className="text-gray-400">Records</TableHead>
                <TableHead className="text-gray-400">Inserted</TableHead>
                <TableHead className="text-gray-400">Updated</TableHead>
                <TableHead className="text-gray-400">Error</TableHead>
                <TableHead className="text-gray-400">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id} className="border-white/10 hover:bg-white/5">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(log.status)}
                      <Badge className={
                        log.status === 'success'
                          ? "bg-green-500/20 text-green-400 border-green-500/30 border"
                          : log.status === 'failed'
                          ? "bg-red-500/20 text-red-400 border-red-500/30 border"
                          : "bg-blue-500/20 text-blue-400 border-blue-500/30 border"
                      }>
                        {log.status}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-white font-medium">
                    {log.sync_name || getConfigName(log.sync_config_id)}
                  </TableCell>
                  <TableCell className="text-gray-400">
                    {log.start_time 
                      ? format(new Date(log.start_time), 'MMM dd, yyyy HH:mm:ss')
                      : format(new Date(log.created_date), 'MMM dd, yyyy HH:mm:ss')
                    }
                  </TableCell>
                  <TableCell className="text-white">
                    {log.duration_seconds ? `${log.duration_seconds}s` : '-'}
                  </TableCell>
                  <TableCell className="text-white">
                    {(log.records_synced || 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-green-400">
                    {(log.records_inserted || 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-blue-400">
                    {(log.records_updated || 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-red-400 max-w-xs truncate" title={log.error_message || '-'}>
                    {log.error_message || '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {log.status === 'running' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleStopSync(log)}
                          className="text-orange-400 hover:bg-orange-500/20"
                          title="Stop Sync"
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteLog(log.id)}
                        className="text-red-400 hover:bg-red-500/20"
                        title="Delete Log"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent className="glass-card border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Clear All Sync Logs?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              This will permanently delete all {logs.length} sync logs. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="glass-card border-white/10 text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearAllLogsMutation.mutate()}
              className="bg-red-500 hover:bg-red-600 text-white"
              disabled={clearAllLogsMutation.isPending}
            >
              {clearAllLogsMutation.isPending ? 'Clearing...' : 'Clear All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}