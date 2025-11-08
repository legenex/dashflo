import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock } from "lucide-react";
import { format, addHours, addDays } from "date-fns";

export default function SyncSchedulesTab({ configs }) {
  const activeConfigs = configs.filter(c => c.enabled);

  const getNextSync = (config) => {
    const now = new Date();
    switch(config.frequency) {
      case '5min': return addHours(now, 0.083);
      case '15min': return addHours(now, 0.25);
      case 'hourly': return addHours(now, 1);
      case 'daily_2am': return addDays(now, 1);
      case 'weekly': return addDays(now, 7);
      default: return null;
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-white">Scheduled Syncs</h3>

      {activeConfigs.length === 0 ? (
        <Card className="glass-card border-white/10">
          <CardContent className="p-8 text-center">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-400">No active sync schedules</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeConfigs.map((config) => {
            const nextSync = getNextSync(config);
            return (
              <Card key={config.id} className="glass-card border-white/10">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h4 className="text-white font-medium mb-1">{config.name}</h4>
                      <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 border text-xs">
                        {config.sync_type}
                      </Badge>
                    </div>
                    <Clock className="w-5 h-5 text-[#00d4ff]" />
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Frequency:</span>
                      <span className="text-white capitalize">{config.frequency?.replace('_', ' ')}</span>
                    </div>
                    {nextSync && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Next Run:</span>
                        <span className="text-green-400">{format(nextSync, 'MMM dd, HH:mm')}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-400">Last Sync:</span>
                      <span className="text-white">
                        {config.last_sync_time 
                          ? format(new Date(config.last_sync_time), 'MMM dd, HH:mm')
                          : 'Never'}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}