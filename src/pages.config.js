/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Dashboard from './pages/Dashboard';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import SuperAdminTenants from './pages/SuperAdminTenants';
import SuperAdminAnalytics from './pages/SuperAdminAnalytics';
import Products from './pages/Products';
import Orders from './pages/Orders';
import Categories from './pages/Categories';
import Tables from './pages/Tables';
import Inventory from './pages/Inventory';
import Staff from './pages/Staff';
import TenantSettings from './pages/TenantSettings';
import CustomerMenu from './pages/CustomerMenu';
import RoleManagement from './pages/RoleManagement';
import ThemeSettings from './pages/ThemeSettings';
import Onboarding from './pages/Onboarding';
import CustomerOrder from './pages/CustomerOrder';
import KitchenDisplay from './pages/KitchenDisplay';
import OrderTracking from './pages/OrderTracking';
import Reports from './pages/Reports';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Dashboard": Dashboard,
    "SuperAdminDashboard": SuperAdminDashboard,
    "SuperAdminTenants": SuperAdminTenants,
    "SuperAdminAnalytics": SuperAdminAnalytics,
    "Products": Products,
    "Orders": Orders,
    "Categories": Categories,
    "Tables": Tables,
    "Inventory": Inventory,
    "Staff": Staff,
    "TenantSettings": TenantSettings,
    "CustomerMenu": CustomerMenu,
    "RoleManagement": RoleManagement,
    "ThemeSettings": ThemeSettings,
    "Onboarding": Onboarding,
    "CustomerOrder": CustomerOrder,
    "KitchenDisplay": KitchenDisplay,
    "OrderTracking": OrderTracking,
    "Reports": Reports,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};