import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, RefreshCw } from "lucide-react";

import BigQueryTab from "../components/sync/BigQueryTab";
import CloudRunTab from "../components/sync/CloudRunTab";
import SyncSchedulesTab from "../components/sync/SyncSchedulesTab";
import SyncLogsTab from "../components/sync/SyncLogsTab";

export default function DataSyncSources() {
  const queryClient = useQueryClient();

  const { data: syncConfigs, isLoading } = useQuery({
    queryKey: ['sync-configs'],
    queryFn: () => base44.entities.SyncConfiguration.list('-updated_date'),
    initialData: [],
  });

  const { data: syncLogs } = useQuery({
    queryKey: ['sync-logs'],
    queryFn: () => base44.entities.SyncLog.list('-created_date', 100),
    initialData: [],
  });

  const bigqueryConfigs = syncConfigs.filter(c => c.sync_type === 'bigquery');
  const cloudRunConfigs = syncConfigs.filter(c => c.sync_type === 'cloud_run');
  const activeConfigs = syncConfigs.filter(c => c.enabled);
  const recentErrors = syncLogs.filter(l => l.status === 'failed').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Data Sync Sources</h1>
          <p className="text-gray-400">Configure and manage data synchronization</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="glass-card border-white/10">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-400 text-sm mb-1">Total Syncs</p>
                <p className="text-3xl font-bold text-white">{syncConfigs.length}</p>
              </div>
              <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 bg-opacity-20">
                <RefreshCw className="w-6 h-6 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-white/10">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-400 text-sm mb-1">Active</p>
                <p className="text-3xl font-bold text-white">{activeConfigs.length}</p>
              </div>
              <div className="p-3 rounded-xl bg-gradient-to-br from-green-500 to-green-600 bg-opacity-20">
                <RefreshCw className="w-6 h-6 text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-white/10">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-400 text-sm mb-1">BigQuery</p>
                <p className="text-3xl font-bold text-white">{bigqueryConfigs.length}</p>
              </div>
              <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 bg-opacity-20">
                <RefreshCw className="w-6 h-6 text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-white/10">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-400 text-sm mb-1">Recent Errors</p>
                <p className="text-3xl font-bold text-white">{recentErrors}</p>
              </div>
              <div className="p-3 rounded-xl bg-gradient-to-br from-red-500 to-red-600 bg-opacity-20">
                <RefreshCw className="w-6 h-6 text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Card className="glass-card border-white/10">
        <CardContent className="p-6">
          <Tabs defaultValue="bigquery" className="w-full">
            <TabsList className="glass-card border-white/10 w-full justify-start">
              <TabsTrigger value="bigquery" className="data-[state=active]:bg-white/10">
                BigQuery Tables ({bigqueryConfigs.length})
              </TabsTrigger>
              <TabsTrigger value="cloudrun" className="data-[state=active]:bg-white/10">
                Cloud Run APIs ({cloudRunConfigs.length})
              </TabsTrigger>
              <TabsTrigger value="schedules" className="data-[state=active]:bg-white/10">
                Sync Schedules
              </TabsTrigger>
              <TabsTrigger value="logs" className="data-[state=active]:bg-white/10">
                Sync Logs ({syncLogs.length})
              </TabsTrigger>
            </TabsList>

            <div className="mt-6">
              <TabsContent value="bigquery">
                <BigQueryTab configs={bigqueryConfigs} />
              </TabsContent>

              <TabsContent value="cloudrun">
                <CloudRunTab configs={cloudRunConfigs} />
              </TabsContent>

              <TabsContent value="schedules">
                <SyncSchedulesTab configs={syncConfigs} />
              </TabsContent>

              <TabsContent value="logs">
                <SyncLogsTab logs={syncLogs} configs={syncConfigs} />
              </TabsContent>
            </div>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}