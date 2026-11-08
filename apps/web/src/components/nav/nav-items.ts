import {
  ArrowLeftRight,
  CandlestickChart,
  Compass,
  Crown,
  Gem,
  Medal,
  MoreHorizontal,
  Settings,
  Sparkles,
  TrendingUp,
  Trophy,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconUrl?: string;
  requiresAuth: boolean;
  hideIcon?: boolean;
  children?: NavItem[];
}

export const buildNavItems = (
  isAdmin: boolean,
  canManageMarkets: boolean,
  darkMode: boolean,
): NavItem[] => {
  return [
    // Home (`/`) — `hrefFor('home')` resolves to the root.
    {
      id: 'home',
      label: 'Discovery',
      icon: Compass,
      requiresAuth: false,
    },
    {
      id: 'markets',
      label: 'Predictions',
      icon: TrendingUp,
      requiresAuth: false,
    },
    // Spot swap — was inside a "Trading" submenu; user asked for top-level.
    {
      id: 'swap',
      label: 'Spot',
      icon: ArrowLeftRight,
      requiresAuth: false,
    },
    {
      id: 'perps',
      label: 'Perps',
      icon: CandlestickChart,
      requiresAuth: false,
    },
    {
      id: 'leaderboard',
      label: 'Leaderboard',
      icon: Crown,
      requiresAuth: false,
    },
    {
      id: 'subscription',
      label: 'Pricing Plan',
      icon: Sparkles,
      requiresAuth: false,
    },
    {
      id: 'campaigns',
      label: 'Competition',
      icon: Medal,
      requiresAuth: false,
    },
    {
      id: 'more',
      label: 'More',
      icon: MoreHorizontal,
      // The label + ChevronDown already read as "menu with more" — the
      // three-dot glyph felt redundant next to real nav items with icons.
      hideIcon: true,
      requiresAuth: false,
      children: [
        { id: 'earn', label: 'Earn', icon: Trophy, requiresAuth: true },
        {
          id: 'rewards/fiat',
          label: 'Rewards',
          icon: Gem,
          requiresAuth: false,
        },
        ...(isAdmin
          ? [
              {
                id: 'admin',
                label: 'Admin',
                icon: Settings,
                requiresAuth: true,
              },
            ]
          : []),
      ],
    },
  ];
};
