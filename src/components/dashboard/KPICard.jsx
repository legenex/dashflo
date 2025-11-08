import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, MoreVertical, Pencil, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function KPICard({ title, value, icon: Icon, trend, trendUp, color, onHide, onEdit }) {
  return (
    <Card className="glass-card border-white/10 overflow-hidden relative group hover:scale-105 transition-transform duration-300">
      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${color} opacity-20 blur-3xl group-hover:opacity-30 transition-opacity`} />
      <CardContent className="p-6 relative z-10">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <p className="text-sm text-gray-400 mb-1">{title}</p>
            <p className="text-3xl font-bold text-white">{value}</p>
          </div>
          <div className="flex items-start gap-2">
            <div className={`p-3 rounded-xl bg-gradient-to-br ${color} bg-opacity-20`}>
              <Icon className="w-6 h-6 text-white" />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-white hover:bg-white/10 h-8 w-8"
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="glass-card border-white/10">
                {onEdit && (
                  <DropdownMenuItem onClick={onEdit} className="text-white hover:bg-white/10 cursor-pointer">
                    <Pencil className="w-4 h-4 mr-2" />
                    Configure
                  </DropdownMenuItem>
                )}
                {onHide && (
                  <DropdownMenuItem onClick={onHide} className="text-orange-400 hover:bg-orange-500/20 cursor-pointer">
                    <EyeOff className="w-4 h-4 mr-2" />
                    Hide Widget
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {trend && (
          <div className="flex items-center gap-1">
            {trendUp ? (
              <TrendingUp className="w-4 h-4 text-green-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-400" />
            )}
            <span className={`text-sm font-medium ${trendUp ? 'text-green-400' : 'text-red-400'}`}>
              {trend}
            </span>
            <span className="text-xs text-gray-400 ml-1">vs last period</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}