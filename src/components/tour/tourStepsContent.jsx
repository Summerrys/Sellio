import React from 'react';
import { appT } from '@/lib/appText';

const BRAND_GRADIENT = 'linear-gradient(135deg, #fb923c, #e0449a, #8b5cf6)';

function BrandWord({ children }) {
  return (
    <span style={{ backgroundImage: BRAND_GRADIENT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontWeight: 800 }}>
      {children}
    </span>
  );
}

// Step definitions for all 4 tour stages, matching the script agreed with the
// merchant. Each function takes light context (plan tier, whether real data
// exists) since a couple of steps adapt or disappear based on that.

export function getDashboardSteps({ hasTakeOrders, hasAiAssistant, hasDesignStore, isDesktop = false, listings = false }) {
  const itemsPage = listings ? appT('Manage listings') : appT('Products');
  const steps = [
    {
      target: 'body',
      placement: 'center',
      title: <>{appT('Welcome to')}{' '}<BrandWord>Sellio</BrandWord>! 👋</>,
      content: appT('Let\'s take a 60-second look around before you start selling.'),
    },
    {
      target: isDesktop ? '[data-tour="desktop-nav"]' : '[data-tour="avatar-menu-btn"]',
      content: isDesktop
        ? appT('Use the sidebar for your workspace pages, storefront link, and account settings.')
        : appT('Tap your logo anytime to open the full menu — your pages, storefront link, and account settings all live there.'),
    },
  ];
  if (hasAiAssistant) {
    steps.push({
      target: '[data-tour="ai-assistant-btn"]',
      content: appT('Tap the Sellio AI avatar anytime you have a question about your business — sales trends, what\'s running low, anything you\'d normally have to dig for.'),
    });
  }
  if (hasDesignStore) {
    steps.push({
      target: '[data-tour="design-store-btn"]',
      content: appT('Preview and customize your public storefront here — banner colors, layout — with a live preview, plus a shortcut to open your actual live store.'),
    });
  }
  steps.push({
    target: '[data-tour="dashboard-stats"]',
    content: appT('This is your daily pulse — revenue, orders, stock health, and active staff, updated live.'),
  });
  if (hasTakeOrders) {
    steps.push({
      target: isDesktop ? '[data-tour="take-orders-btn"]' : '[data-tour="counter-shortcut"]',
      placement: isDesktop ? 'bottom' : 'top',
      content: isDesktop
        ? appT('Take Orders opens the Counter. Choose a table or Takeaway, add items, then send the order.')
        : appT('Tap Counter in the center of the bottom navigation to take an order. Choose a table or Takeaway, add items, then send.'),
    });
  }
  steps.push(
    {
      target: '[data-tour="quick-access"]',
      content: appT('One-tap shortcuts to the pages you\'ll use most.'),
    },
    {
      target: isDesktop ? '[data-tour="desktop-nav"]' : '[data-tour="bottom-nav"]',
      placement: isDesktop ? 'right' : 'top',
      spotlightClicks: true,
      content: listings && !isDesktop ? (
        <>
          {appT('Tap {sell} to add an item. {listings} shows everything you sell, with {orders} at the top, and {me} has your {settings}.', {
            sell: <strong>{appT('Sell')}</strong>, listings: <strong>{appT('Listings')}</strong>, orders: <strong>{appT('Orders')}</strong>,
            me: <strong>{appT('Me')}</strong>, settings: <strong>{appT('Settings')}</strong>,
          })}
        </>
      ) : (
        <>
          {isDesktop
            ? appT('Open {itemsPage} and use {add} to create an item. Next, explore {orders} and {settings} in the sidebar.', {
              itemsPage: <strong>{itemsPage}</strong>, add: <strong>{appT('Add')}</strong>, orders: <strong>{appT('Orders')}</strong>, settings: <strong>{appT('Settings')}</strong>,
            })
            : appT('Open {itemsPage} and use {add} to create an item. Next, explore {orders} in the bottom navigation, and {settings} under {me}.', {
              itemsPage: <strong>{itemsPage}</strong>, add: <strong>{appT('Add')}</strong>, orders: <strong>{appT('Orders')}</strong>,
              settings: <strong>{appT('Settings')}</strong>, me: <strong>{appT('Me')}</strong>,
            })}
        </>
      ),
    },
    {
      target: 'body',
      placement: 'center',
      title: appT('That\'s the Dashboard!'),
      content: isDesktop ? appT('Open {itemsPage} in the sidebar to continue.', { itemsPage })
        : listings ? appT('Tap Sell in the bottom navigation to add your first listing.')
          : appT('Tap {itemsPage} in the bottom navigation to continue.', { itemsPage }),
    },
  );
  return steps;
}

export function getProductsSteps({ tier, listings = false }) {
  const item = listings ? 'listing' : 'product';
  const steps = [
    {
      target: '[data-tour="products-header"]',
      content: listings ? appT('These are your listings — everything you sell lives here.') : appT('This is your menu — every item your customers can order lives here.'),
    },
    {
      target: '[data-tour="add-product-btn"]',
      content: appT('Add items one at a time here.'),
    },
    // Menu scan isn't on a free personal shop's plan.
    ...(listings ? [] : [{
      target: '[data-tour="scan-menu-btn"]',
      content: appT('Got a printed menu? Snap a photo and our AI builds your product list for you.'),
    }]),
    {
      target: '[data-tour="product-card"]',
      content: appT('Tap any {item} to edit its name, price, photo, or stock.', { item }),
    },
    {
      target: '[data-tour="product-card"]',
      content: appT('Press and hold a {item} to select several and delete them together.', { item }),
    },
  ];
  if (tier === 'starter') {
    steps.push({
      target: 'body',
      placement: 'center',
      content: appT('Your Starter plan includes up to 10 products. Upgrade to Growth or Professional for more room.'),
    });
  } else if (tier === 'growth') {
    steps.push({
      target: 'body',
      placement: 'center',
      content: appT('Your Growth plan includes up to 50 products. Need more? Professional gives you unlimited.'),
    });
  }
  steps.push({
    target: 'body',
    placement: 'center',
    title: appT('Nice work!'),
    content: listings ? appT('Next, tap Orders at the top to see how orders come in.') : appT('Tap Orders below to see how orders come in.'),
  });
  return steps;
}

export function getOrdersSteps({ tier, listings = false, isDesktop = false }) {
  const steps = [
    {
      target: '[data-tour="order-status-cards"]',
      content: appT('Orders move through these stages automatically as you update them.'),
    },
    {
      target: '[data-tour="order-tabs"]',
      content: appT('Filter the list by stage, or check Done for completed orders.'),
    },
    {
      target: '[data-tour="kitchen-display-btn"]',
      content: appT('Open a dedicated, always-on screen for your kitchen — perfect for a second device.'),
    },
    {
      target: '[data-tour="sound-alerts-toggle"]',
      content: appT('Turn this on to get an audible ping whenever a new order comes in.'),
    },
    {
      target: '[data-tour="order-status-btn"]',
      content: appT('Tap here to move an order to its next stage.'),
    },
    {
      target: '[data-tour="order-card"]',
      content: appT('Need to change an item, add a note, or cancel the order? Tap anywhere on the card to open it.'),
    },
  ];
  if (tier === 'starter') {
    steps.push({
      target: 'body',
      placement: 'center',
      content: appT('Just so you know: your plan includes up to 100 orders/month.'),
    });
  } else if (tier === 'growth') {
    steps.push({
      target: 'body',
      placement: 'center',
      content: appT('Just so you know: your plan includes up to 1,000 orders/month.'),
    });
  }
  steps.push({
    target: 'body',
    placement: 'center',
    title: appT('You\'ve got Orders covered.'),
    content: isDesktop && !listings ? appT('Last stop — open Settings in the sidebar.') : appT('Last stop — tap Me below, then Settings.'),
  });
  return steps;
}

export function getSettingsSteps() {
  return [
    {
      target: '[data-tour="settings-business-tab"]',
      content: appT('Your business name, hours, tax rate, and receipt details all live here.'),
    },
    {
      target: '[data-tour="settings-payment-tab"]',
      content: appT('Upload your payment QR so customers can pay you directly.'),
    },
    {
      target: '[data-tour="settings-theme-tab"]',
      content: appT('Pick a color theme that matches your brand — it updates your storefront instantly.'),
    },
    {
      target: '[data-tour="settings-users-tab"]',
      content: appT('Invite staff and assign them roles from here — each role controls exactly what they can see and do.'),
    },
    {
      target: 'body',
      placement: 'center',
      title: appT('That\'s everything! 🎉'),
      content: appT('You can replay this tour anytime from here in Settings.'),
    },
  ];
}
