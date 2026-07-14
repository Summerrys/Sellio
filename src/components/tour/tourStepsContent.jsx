import React from 'react';

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

export function getDashboardSteps({ hasTakeOrders, hasAiAssistant, hasDesignStore }) {
  const steps = [
    {
      target: 'body',
      placement: 'center',
      title: <>Welcome to <BrandWord>Sellio</BrandWord>! 👋</>,
      content: "Let's take a 60-second look around before you start selling.",
    },
  ];
  if (hasAiAssistant) {
    steps.push({
      target: '[data-tour="ai-assistant-btn"]',
      content: "Tap the Sellio AI avatar anytime you have a question about your business — sales trends, what's running low, anything you'd normally have to dig for.",
    });
  }
  if (hasDesignStore) {
    steps.push({
      target: '[data-tour="design-store-btn"]',
      content: "Preview and customize your public storefront here — banner colors, layout — with a live preview, plus a shortcut to open your actual live store.",
    });
  }
  steps.push({
    target: '[data-tour="dashboard-stats"]',
    content: "This is your daily pulse — revenue, orders, stock health, and active staff, updated live.",
  });
  if (hasTakeOrders) {
    steps.push({
      target: '[data-tour="take-orders-btn"]',
      content: "Taking an order for a walk-in or phone customer? Tap here — pick Dine-in or Takeaway, then order just like your customers would.",
    });
  }
  steps.push(
    {
      target: '[data-tour="quick-access"]',
      content: "One-tap shortcuts to the pages you'll use most.",
    },
    {
      target: '[data-tour="sell-fab"]',
      placement: 'top',
      content: "This is your fastest way to add a new product, from anywhere in the app.",
    },
    {
      target: '[data-tour="bottom-nav"]',
      placement: 'top',
      spotlightClicks: true,
      content: (
        <>
          Let's walk through <strong>Products</strong>, <strong>Orders</strong>, and <strong>Settings</strong> next — tap any of them below whenever you're ready, we'll go deeper the moment you open each one.
        </>
      ),
    },
    {
      target: 'body',
      placement: 'center',
      title: "That's the Dashboard!",
      content: 'Tap Products below whenever you\u2019re ready to continue.',
    },
  );
  return steps;
}

export function getProductsSteps({ tier }) {
  const steps = [
    {
      target: '[data-tour="products-header"]',
      content: "This is your menu — every item your customers can order lives here.",
    },
    {
      target: '[data-tour="add-product-btn"]',
      content: "Add items one at a time here.",
    },
    {
      target: '[data-tour="scan-menu-btn"]',
      content: "Got a printed menu? Snap a photo and our AI builds your product list for you.",
    },
    {
      target: '[data-tour="product-card"]',
      content: "Tap any product to edit its name, price, photo, or stock.",
    },
    {
      target: '[data-tour="product-card"]',
      content: "Press and hold a product to select several and delete them together.",
    },
  ];
  if (tier === 'starter') {
    steps.push({
      target: 'body',
      placement: 'center',
      content: "Your Starter plan includes up to 10 products. Upgrade to Growth or Professional for more room.",
    });
  } else if (tier === 'growth') {
    steps.push({
      target: 'body',
      placement: 'center',
      content: "Your Growth plan includes up to 50 products. Need more? Professional gives you unlimited.",
    });
  }
  steps.push({
    target: 'body',
    placement: 'center',
    title: 'Nice work!',
    content: 'Tap Orders below to see how orders come in.',
  });
  return steps;
}

export function getOrdersSteps({ tier }) {
  const steps = [
    {
      target: '[data-tour="order-status-cards"]',
      content: "Orders move through these stages automatically as you update them.",
    },
    {
      target: '[data-tour="order-tabs"]',
      content: "Filter the list by stage, or check Done for completed orders.",
    },
    {
      target: '[data-tour="kitchen-display-btn"]',
      content: "Open a dedicated, always-on screen for your kitchen — perfect for a second device.",
    },
    {
      target: '[data-tour="sound-alerts-toggle"]',
      content: "Turn this on to get an audible ping whenever a new order comes in.",
    },
    {
      target: '[data-tour="order-status-btn"]',
      content: "Tap here to move an order to its next stage.",
    },
    {
      target: '[data-tour="order-card"]',
      content: "Need to change an item, add a note, or cancel the order? Tap anywhere on the card to open it.",
    },
  ];
  if (tier === 'starter') {
    steps.push({
      target: 'body',
      placement: 'center',
      content: "Just so you know: your plan includes up to 100 orders/month.",
    });
  } else if (tier === 'growth') {
    steps.push({
      target: 'body',
      placement: 'center',
      content: "Just so you know: your plan includes up to 1,000 orders/month.",
    });
  }
  steps.push({
    target: 'body',
    placement: 'center',
    title: "You've got Orders covered.",
    content: 'Last stop — tap Settings below.',
  });
  return steps;
}

export function getSettingsSteps() {
  return [
    {
      target: '[data-tour="settings-business-tab"]',
      content: "Your business name, hours, tax rate, and receipt details all live here.",
    },
    {
      target: '[data-tour="settings-payment-tab"]',
      content: "Upload your PayNow/DuitNow QR so customers can pay you directly.",
    },
    {
      target: '[data-tour="settings-theme-tab"]',
      content: "Pick a color theme that matches your brand — it updates your storefront instantly.",
    },
    {
      target: '[data-tour="settings-users-tab"]',
      content: "Invite staff and assign them roles from here — each role controls exactly what they can see and do.",
    },
    {
      target: 'body',
      placement: 'center',
      title: "That's everything! 🎉",
      content: 'You can replay this tour anytime from here in Settings.',
    },
  ];
}
