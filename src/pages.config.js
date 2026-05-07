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
import { lazy } from 'react';

const Auth = lazy(() => import('./pages/Auth'));
const Categories = lazy(() => import('./pages/Categories'));
const CustomerMenu = lazy(() => import('./pages/CustomerMenu'));
const CustomerOrder = lazy(() => import('./pages/CustomerOrder'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Inventory = lazy(() => import('./pages/Inventory'));
const KitchenDisplay = lazy(() => import('./pages/KitchenDisplay'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const OrderTracking = lazy(() => import('./pages/OrderTracking'));
const Orders = lazy(() => import('./pages/Orders'));
const Products = lazy(() => import('./pages/Products'));
const Reports = lazy(() => import('./pages/Reports'));
const RoleManagement = lazy(() => import('./pages/RoleManagement'));
const Staff = lazy(() => import('./pages/Staff'));
const Tables = lazy(() => import('./pages/Tables'));
const TenantSettings = lazy(() => import('./pages/TenantSettings'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
import __Layout from './Layout.jsx';


export const PAGES = {
    "Auth": Auth,
    "Categories": Categories,
    "CustomerMenu": CustomerMenu,
    "CustomerOrder": CustomerOrder,
    "Dashboard": Dashboard,
    "Inventory": Inventory,
    "KitchenDisplay": KitchenDisplay,
    "Notifications": Notifications,
    "Onboarding": Onboarding,
    "OrderTracking": OrderTracking,
    "Orders": Orders,
    "Products": Products,
    "Reports": Reports,
    "RoleManagement": RoleManagement,
    "Staff": Staff,
    "Tables": Tables,
    "TenantSettings": TenantSettings,
    "UserManagement": UserManagement,
}

export const pagesConfig = {
    mainPage: "Auth",
    Pages: PAGES,
    Layout: __Layout,
};