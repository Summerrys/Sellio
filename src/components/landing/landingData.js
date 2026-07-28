import {
  BarChart3,
  BellRing,
  Bot,
  Boxes,
  Building2,
  CircleDollarSign,
  GraduationCap,
  HeartPulse,
  Hotel,
  Info,
  Landmark,
  PackageSearch,
  Plane,
  QrCode,
  School,
  Ship,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
  Users,
  UtensilsCrossed,
  WandSparkles,
  Warehouse,
} from 'lucide-react';

export const SELLIO_COLORS = {
  orange: '#fb923c',
  pink: '#e0449a',
  purple: '#8b2fc9',
  ink: '#24123a',
  cream: '#fffaf7',
};

export const FEATURES = [
  {
    title: 'Beautiful online storefront',
    description: 'Launch a branded, mobile-first storefront your customers can order from immediately.',
    Icon: Store,
    tone: 'orange',
  },
  {
    title: 'QR and table ordering',
    description: 'Let dine-in guests browse, order and call for service directly from their table.',
    Icon: QrCode,
    tone: 'pink',
  },
  {
    title: 'Orders and kitchen display',
    description: 'Keep incoming orders, preparation and fulfilment moving through one clear workflow.',
    Icon: BellRing,
    tone: 'purple',
  },
  {
    title: 'Products and inventory',
    description: 'Manage variants, stock levels, imports, stocktakes and low-stock alerts.',
    Icon: Boxes,
    tone: 'orange',
  },
  {
    title: 'Business insights',
    description: 'Understand revenue, product performance, customers and inventory from practical reports.',
    Icon: BarChart3,
    tone: 'pink',
  },
  {
    title: 'Staff roles and permissions',
    description: 'Give owners, managers and staff the right access without sharing one account.',
    Icon: Users,
    tone: 'purple',
  },
  {
    title: 'Sellio AI assistance',
    description: 'Get help creating products and understanding sales, orders and inventory.',
    Icon: Bot,
    tone: 'orange',
  },
  {
    title: 'Designed for daily operations',
    description: 'Use Sellio as an installable app with notifications, printer support and custom themes.',
    Icon: WandSparkles,
    tone: 'pink',
  },
];

export const WORLD_DISTRICTS = [
  {
    key: 'airport',
    name: 'Airport',
    category: 'Airline / Hotel',
    status: 'future',
    Icon: Plane,
    color: '#38bdf8',
  },
  {
    key: 'port',
    name: 'Port',
    category: 'Transport / Shipping',
    status: 'future',
    Icon: Ship,
    color: '#14b8a6',
  },
  {
    key: 'mall',
    name: 'Mall',
    category: 'Retail / Interior Design',
    status: 'soon',
    Icon: ShoppingBag,
    color: '#a78bfa',
  },
  {
    key: 'restaurant',
    name: 'Restaurant',
    category: 'F&B',
    status: 'live',
    Icon: UtensilsCrossed,
    color: '#fb923c',
  },
  {
    key: 'school',
    name: 'School',
    category: 'Education / Courses',
    status: 'future',
    Icon: GraduationCap,
    color: '#facc15',
  },
  {
    key: 'clubhouse',
    name: 'Clubhouse',
    category: 'Wellness / Social',
    status: 'future',
    Icon: Sparkles,
    color: '#e0449a',
  },
  {
    key: 'hospital',
    name: 'Hospital',
    category: 'Clinic / Pharmacy',
    status: 'future',
    Icon: HeartPulse,
    color: '#f87171',
  },
  {
    key: 'bank',
    name: 'Bank',
    category: 'Banking / Investment',
    status: 'future',
    Icon: Landmark,
    color: '#60a5fa',
  },
  {
    key: 'info',
    name: 'Info',
    category: 'Helpdesk by Apptélier',
    status: 'info',
    Icon: Info,
    color: '#22d3ee',
  },
];

export const PRODUCT_VIEWS = [
  {
    key: 'storefront',
    label: 'Storefront',
    title: 'A storefront that feels like your brand',
    description: 'Customers can browse categories, choose variants and place orders from any device.',
    Icon: Store,
  },
  {
    key: 'orders',
    label: 'Orders',
    title: 'Every order, clearly organised',
    description: 'See what is new, preparing and ready without losing track during a busy service.',
    Icon: BellRing,
  },
  {
    key: 'inventory',
    label: 'Inventory',
    title: 'Know what is running low',
    description: 'Track stock, make adjustments and review inventory activity from one workspace.',
    Icon: Warehouse,
  },
  {
    key: 'insights',
    label: 'Insights',
    title: 'Make decisions with useful data',
    description: 'Review revenue, products and customer activity without building spreadsheets.',
    Icon: BarChart3,
  },
  {
    key: 'assistant',
    label: 'Sellio AI',
    title: 'A helpful assistant inside your business',
    description: 'Ask questions about sales and inventory or get help preparing product content.',
    Icon: Bot,
  },
];

export const PLANS = [
  {
    key: 'starter',
    name: 'Starter',
    monthly: 79,
    yearly: 790,
    description: 'For small businesses getting online.',
    badge: null,
    accent: '#3b82f6',
    features: [
      '10 products',
      'Up to 100 orders/month',
      '3 staff accounts',
      '5 tables and QR codes',
      '1 branch',
      'Basic reports',
      'Custom theme',
    ],
    links: {
      monthly: 'https://buy.stripe.com/00wdRbdyV1kn8qfebK7bW02',
      annual: 'https://buy.stripe.com/fZu5kF1Qd8MP0XN3x67bW03',
    },
  },
  {
    key: 'growth',
    name: 'Growth',
    monthly: 139,
    yearly: 1390,
    description: 'For growing teams and busier operations.',
    badge: 'Most popular',
    accent: '#8b2fc9',
    features: [
      '50 products',
      'Up to 1,000 orders/month',
      '5 staff accounts',
      'Up to 3 branches',
      'Advanced reports',
      'Custom editable roles',
      'Email and chat support',
    ],
    links: {
      monthly: 'https://buy.stripe.com/6oUaEZ52pbZ135V7Nm7bW04',
      annual: 'https://buy.stripe.com/8x23cxcuR9QTgWL7Nm7bW05',
    },
  },
  {
    key: 'pro',
    name: 'Professional',
    monthly: 199,
    yearly: 1990,
    description: 'For businesses that need maximum scale.',
    badge: null,
    accent: '#e0449a',
    features: [
      'Unlimited products and orders',
      'Unlimited staff accounts',
      'Unlimited tables and QR codes',
      'Up to 10 branches',
      'Custom real-time reports',
      'Unlimited custom roles',
      'Priority support',
    ],
    links: {
      monthly: 'https://buy.stripe.com/5kQ5kFcuR8MP6i76Ji7bW06',
      annual: 'https://buy.stripe.com/eVq7sNcuR2or21R2t27bW07',
    },
  },
];

export const ROADMAP = [
  {
    title: 'Sellio Coins',
    description: 'Earn rewards through useful merchant activity and future marketplace participation.',
    Icon: CircleDollarSign,
  },
  {
    title: 'Seasonal storefronts',
    description: 'Decorate storefronts for Chinese New Year, Christmas and community events.',
    Icon: Sparkles,
  },
  {
    title: 'Merchant quests',
    description: 'Complete growth missions, unlock achievements and improve storefront visibility.',
    Icon: PackageSearch,
  },
  {
    title: 'Marketplace discovery',
    description: 'Help customers roam between districts, find merchants and support local businesses.',
    Icon: Building2,
  },
];

export const HOW_IT_WORKS = [
  { number: '01', title: 'Create your account', description: 'Choose a plan and begin your three-day trial.' },
  { number: '02', title: 'Set up your business', description: 'Add your brand, hours, products and team.' },
  { number: '03', title: 'Design your storefront', description: 'Apply your colours and organise the customer experience.' },
  { number: '04', title: 'Share and receive orders', description: 'Use your storefront link or table QR codes.' },
  { number: '05', title: 'Learn and grow', description: 'Track performance with reports and Sellio AI.' },
];

export const SUPPORTING_ICONS = {
  Hotel,
  School,
  Truck,
};
