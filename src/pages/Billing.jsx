import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DollarSign, CreditCard, TrendingUp } from "lucide-react";

export default function Billing() {
  const { data: accounts, isLoading } = useQuery({
    queryKey: ['billing-accounts'],
    queryFn: () => base44.entities.BillingAccount.list(),
    initialData: [],
  });

  const { data: buyers } = useQuery({
    queryKey: ['buyers'],
    queryFn: () => base44.entities.Buyer.list(),
    initialData: [],
  });

  const getBuyerName = (buyerId) => {
    const buyer = buyers.find(b => b.id === buyerId || b.buyer_id === buyerId);
    return buyer?.name || buyerId;
  };

  const totalBalance = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
  const totalSpend = accounts.reduce((sum, acc) => sum + (acc.total_spend || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Billing & Accounts</h1>
        <p className="text-gray-400">Manage client accounts and invoicing</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="glass-card border-white/10">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-400 text-sm mb-1">Total Balance</p>
                <p className="text-3xl font-bold text-white">
                  ${totalBalance.toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-gradient-to-br from-green-500 to-green-600 bg-opacity-20">
                <DollarSign className="w-6 h-6 text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-white/10">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-400 text-sm mb-1">Total Spend</p>
                <p className="text-3xl font-bold text-white">
                  ${totalSpend.toLocaleString()}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 bg-opacity-20">
                <CreditCard className="w-6 h-6 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-white/10">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-400 text-sm mb-1">Active Accounts</p>
                <p className="text-3xl font-bold text-white">{accounts.length}</p>
              </div>
              <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 bg-opacity-20">
                <TrendingUp className="w-6 h-6 text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Client Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-white/5">
                  <TableHead className="text-gray-400">Buyer</TableHead>
                  <TableHead className="text-gray-400">Account Balance</TableHead>
                  <TableHead className="text-gray-400">Total Spend</TableHead>
                  <TableHead className="text-gray-400">Last Payment</TableHead>
                  <TableHead className="text-gray-400">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-gray-400 py-8">
                      No billing accounts found
                    </TableCell>
                  </TableRow>
                ) : (
                  accounts.map((account) => (
                    <TableRow key={account.id} className="border-white/10 hover:bg-white/5">
                      <TableCell className="text-white font-medium">
                        {getBuyerName(account.buyer_id)}
                      </TableCell>
                      <TableCell className="text-green-400 font-medium">
                        ${(account.balance || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-white">
                        ${(account.total_spend || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-gray-400">
                        {account.last_payment_date || 'N/A'}
                      </TableCell>
                      <TableCell>
                        <Badge className={
                          (account.balance || 0) > 0 
                            ? "bg-green-500/20 text-green-400 border-green-500/30 border"
                            : "bg-red-500/20 text-red-400 border-red-500/30 border"
                        }>
                          {(account.balance || 0) > 0 ? 'Active' : 'Low Balance'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}