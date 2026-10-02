'use client';

import * as React from 'react';
import Link from 'next/link';
import { NavMain } from '@/components/nav-main';
import { NavSecondary } from '@/components/nav-secondary';
import { NavUser } from '@/components/nav-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
  LayoutDashboardIcon,
  ArrowLeftRightIcon,
  ChartAreaIcon,
  UploadIcon,
  TriangleAlertIcon,
  SettingsIcon,
  LifeBuoyIcon,
  GitCompareIcon,
  BellIcon,
  SparklesIcon,
  GaugeIcon,
  FileTextIcon,
  ShieldIcon,
} from 'lucide-react';

const data = {
  navDaily: [
    { title: 'Overview', url: '/dashboard', icon: <LayoutDashboardIcon /> },
    { title: 'Data Sources', url: '/data-sources', icon: <UploadIcon /> },
    { title: 'Matches', url: '/transactions', icon: <ArrowLeftRightIcon /> },
    { title: 'Exceptions', url: '/cards', icon: <TriangleAlertIcon /> },
    { title: 'Reports', url: '/reports', icon: <FileTextIcon /> },
  ],
  navInsights: [
    { title: 'Analytics', url: '/analytics', icon: <ChartAreaIcon /> },
    { title: 'AI Assistant', url: '/ai-assistant', icon: <SparklesIcon /> },
    { title: 'AI Usage', url: '/ai-usage', icon: <GaugeIcon /> },
  ],
  navSecondary: [
    { title: 'Notifications', url: '/notifications', icon: <BellIcon /> },
    { title: 'Settings', url: '/settings', icon: <SettingsIcon /> },
    { title: 'Help & Support', url: '/support', icon: <LifeBuoyIcon /> },
    // Not gated by hiding it — gated for real, server-side (see
    // src/lib/admin/dal.ts). Anyone can see this link; only a signed-in
    // admin account can get past /admin/login.
    { title: 'Admin', url: '/admin', icon: <ShieldIcon /> },
  ],
};

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { email: string; displayName: string | null };
}) {
  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/dashboard" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-brand-gradient text-white">
                <GitCompareIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">
                  Netting Reconciliation
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  Liquid Intelligent Technologies
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navDaily} label="Reconciliation" />
        <NavMain items={data.navInsights} label="Insights" />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
        <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
          <img
            src="/logos/cassava-mark.png"
            alt="Cassava AI"
            className="size-3.5 shrink-0 opacity-80"
          />
          <span className="truncate">Built by Cassava AI</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
