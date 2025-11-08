import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Bell } from "lucide-react";

export default function NotificationHistory({ notifications }) {
  const getTypeColor = (type) => {
    const colors = {
      info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      success: 'bg-green-500/20 text-green-400 border-green-500/30',
      warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      error: 'bg-red-500/20 text-red-400 border-red-500/30'
    };
    return colors[type] || colors.info;
  };

  if (notifications.length === 0) {
    return (
      <Card className="glass-card border-white/10">
        <CardContent className="p-12 text-center">
          <Bell className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">No notifications yet</h3>
          <p className="text-gray-400">Notification history will appear here</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card border-white/10">
      <CardContent className="p-6">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10">
                <TableHead className="text-gray-400">Time</TableHead>
                <TableHead className="text-gray-400">Type</TableHead>
                <TableHead className="text-gray-400">Message</TableHead>
                <TableHead className="text-gray-400">Title</TableHead>
                <TableHead className="text-gray-400">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notifications.map((notif) => (
                <TableRow key={notif.id} className="border-white/10 hover:bg-white/5">
                  <TableCell className="text-white">
                    {format(new Date(notif.created_date), 'MMM dd, HH:mm')}
                  </TableCell>
                  <TableCell>
                    <Badge className={getTypeColor(notif.type)}>
                      {notif.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-white max-w-md truncate">
                    {notif.message}
                  </TableCell>
                  <TableCell className="text-gray-400">
                    {notif.title || '-'}
                  </TableCell>
                  <TableCell>
                    <Badge className={notif.read ? 'bg-gray-500/20 text-gray-400' : 'bg-green-500/20 text-green-400'}>
                      {notif.read ? 'Read' : 'Unread'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}