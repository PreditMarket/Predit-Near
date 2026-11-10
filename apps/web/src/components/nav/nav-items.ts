import { Compass, PieChart, TrendingUp } from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconUrl?: string;
  requiresAuth: boolean;
  hideIcon?: boolean;
  children?: NavItem[];
}

export const buildNavItems = (): NavItem[] => [
  { id: 'home', label: 'Feed', icon: Compass, requiresAuth: false },
  { id: 'markets', label: 'Markets', icon: TrendingUp, requiresAuth: false },
  { id: 'portfolio', label: 'Portfolio', icon: PieChart, requiresAuth: true },
];
