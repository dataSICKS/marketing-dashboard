import React, { useState } from "react";
import { useGetNewsletterData, useSyncNewsletter, getGetNewsletterDataQueryKey } from "@workspace/api-client-react";
import type { GetNewsletterDataGroupBy } from "@workspace/api-client-react/src/generated/api.schemas";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { RefreshCw, Mail, MousePointerClick, Target, ArrowUpRight, BarChart3 } from "lucide-react";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar, Line } from "recharts";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [groupBy, setGroupBy] = useState<GetNewsletterDataGroupBy>("day");

  const { data, isLoading, isError } = useGetNewsletterData(
    { groupBy },
    { query: { enabled: true, queryKey: getGetNewsletterDataQueryKey({ groupBy }) } }
  );

  const syncMutation = useSyncNewsletter({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetNewsletterDataQueryKey({ groupBy: "day" }) });
        queryClient.invalidateQueries({ queryKey: getGetNewsletterDataQueryKey({ groupBy: "week" }) });
        queryClient.invalidateQueries({ queryKey: getGetNewsletterDataQueryKey({ groupBy: "month" }) });
        queryClient.invalidateQueries({ queryKey: getGetNewsletterDataQueryKey({ groupBy: "scenario" }) });
      }
    }
  });

  const handleSync = () => {
    syncMutation.mutate(undefined);
  };

  const summary = data?.summary;
  const items = data?.items || [];
  const lastSyncedAt = data?.lastSyncedAt;

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6 lg:p-8 flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2" data-testid="heading-title">
            <BarChart3 className="w-8 h-8 text-primary" />
            メルマガレポート
          </h1>
          <p className="text-sm text-muted-foreground mt-1" data-testid="text-last-sync">
            最終更新: {formatDate(lastSyncedAt)}
          </p>
        </div>
        <Button 
          onClick={handleSync} 
          disabled={syncMutation.isPending}
          className="w-full md:w-auto font-medium shadow-md shadow-primary/20 transition-all hover:shadow-primary/40"
          data-testid="button-sync"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
          スプレッドシートから更新
        </Button>
      </header>

      {/* Main Content */}
      <main className="flex flex-col gap-6">
        
        {/* Tabs */}
        <div className="flex justify-between items-center">
          <Tabs 
            value={groupBy} 
            onValueChange={(val) => setGroupBy(val as GetNewsletterDataGroupBy)}
            className="w-full md:w-auto"
          >
            <TabsList className="grid grid-cols-4 md:w-auto h-11 bg-muted/50 p-1" data-testid="tabs-groupby">
              <TabsTrigger value="day" data-testid="tab-day" className="font-medium">日別</TabsTrigger>
              <TabsTrigger value="week" data-testid="tab-week" className="font-medium">週別</TabsTrigger>
              <TabsTrigger value="month" data-testid="tab-month" className="font-medium">月別</TabsTrigger>
              <TabsTrigger value="scenario" data-testid="tab-scenario" className="font-medium">シナリオ別</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? (
          <div className="space-y-6" data-testid="loading-skeleton">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-28 rounded-xl bg-card border border-border" />)}
            </div>
            <Skeleton className="h-[400px] w-full rounded-xl bg-card border border-border" />
            <Skeleton className="h-[300px] w-full rounded-xl bg-card border border-border" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center p-12 border border-destructive/20 bg-destructive/5 rounded-xl" data-testid="error-state">
            <p className="text-destructive font-medium mb-4">データの取得に失敗しました</p>
            <Button variant="outline" onClick={() => queryClient.invalidateQueries()}>再試行</Button>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <KpiCard 
                title="配信数" 
                value={formatNumber(summary?.deliveryCount)} 
                icon={<Mail className="w-4 h-4 text-muted-foreground" />} 
                testId="kpi-delivery"
              />
              <KpiCard 
                title="開封率" 
                value={formatPercent(summary?.openRate)} 
                icon={<EyeIcon className="w-4 h-4 text-muted-foreground" />} 
                testId="kpi-open-rate"
              />
              <KpiCard 
                title="クリック率" 
                value={formatPercent(summary?.clickRate)} 
                icon={<MousePointerClick className="w-4 h-4 text-muted-foreground" />} 
                testId="kpi-click-rate"
              />
              <KpiCard 
                title="CVR" 
                value={formatPercent(summary?.cvr)} 
                icon={<ArrowUpRight className="w-4 h-4 text-muted-foreground" />} 
                testId="kpi-cvr"
              />
              <KpiCard 
                title="CV数" 
                value={formatNumber(summary?.cvCount)} 
                icon={<Target className="w-4 h-4 text-muted-foreground" />} 
                testId="kpi-cv-count"
              />
            </div>

            {/* Trend Chart */}
            <Card className="border-border shadow-sm overflow-hidden bg-card" data-testid="card-chart">
              <CardHeader className="pb-2 border-b border-border/50 bg-muted/20">
                <CardTitle className="text-base font-medium">パフォーマンストレンド</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-6 h-[400px]">
                {items.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">データがありません</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={items} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis 
                        dataKey="label" 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={12} 
                        tickMargin={10}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis 
                        yAxisId="left" 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={12} 
                        tickFormatter={(val) => formatNumber(val)}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis 
                        yAxisId="right" 
                        orientation="right" 
                        stroke="hsl(var(--muted-foreground))" 
                        fontSize={12} 
                        tickFormatter={(val) => formatPercent(val)}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          borderColor: 'hsl(var(--border))',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                          color: 'hsl(var(--foreground))'
                        }}
                        itemStyle={{ color: 'hsl(var(--foreground))' }}
                        labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: '8px' }}
                        formatter={(value: number, name: string) => {
                          if (name === "配信数") return [formatNumber(value), name];
                          return [formatPercent(value), name];
                        }}
                      />
                      <Legend wrapperStyle={{ paddingTop: '20px' }} />
                      <Bar yAxisId="left" dataKey="deliveryCount" name="配信数" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={50} />
                      <Line yAxisId="right" type="monotone" dataKey="openRate" name="開封率" stroke="hsl(var(--chart-2))" strokeWidth={3} dot={{ r: 4, fill: 'hsl(var(--card))', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                      <Line yAxisId="right" type="monotone" dataKey="clickRate" name="クリック率" stroke="hsl(var(--chart-3))" strokeWidth={3} dot={{ r: 4, fill: 'hsl(var(--card))', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Data Table */}
            <Card className="border-border shadow-sm overflow-hidden bg-card" data-testid="card-table">
              <CardHeader className="pb-2 border-b border-border/50 bg-muted/20">
                <CardTitle className="text-base font-medium">詳細データ</CardTitle>
              </CardHeader>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border">
                      <TableHead className="font-semibold text-muted-foreground w-[200px]">ラベル</TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-right">配信数</TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-right">開封数 (率)</TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-right">クリック数 (率)</TableHead>
                      <TableHead className="font-semibold text-muted-foreground text-right">CV数 (CVR)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          データがありません
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map((item, i) => (
                        <TableRow key={`${item.label}-${i}`} className="border-border hover:bg-muted/30 transition-colors" data-testid={`table-row-${i}`}>
                          <TableCell className="font-medium">{item.label}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatNumber(item.deliveryCount)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            <span>{formatNumber(item.openCount)}</span>
                            <span className="text-muted-foreground ml-2 text-xs">({formatPercent(item.openRate)})</span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            <span>{formatNumber(item.clickCount)}</span>
                            <span className="text-muted-foreground ml-2 text-xs">({formatPercent(item.clickRate)})</span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            <span className="text-primary font-semibold">{formatNumber(item.cvCount)}</span>
                            <span className="text-muted-foreground ml-2 text-xs">({formatPercent(item.cvr)})</span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

// Internal KpiCard component
function KpiCard({ title, value, icon, testId }: { title: string; value: string; icon: React.ReactNode; testId: string }) {
  return (
    <Card className="bg-card border-border shadow-sm overflow-hidden" data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="text-2xl lg:text-3xl font-bold tracking-tight font-mono text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

// Simple custom eye icon for the Kpi card
function EyeIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
