import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const IDLE_MESSAGES = [
  "👋 Hi! What can I get you?",
  "🌟 Ask me about today's specials!",
  "🛒 I can order for you!",
];

export default function MenuAssistantWidget({ products, tenant, onProductSelect, storefront, externalOpen, onExternalClose, addToCart, tableId }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [showBalloon, setShowBalloon] = useState(false);
  const [balloonIndex, setBalloonIndex] = useState(0);
  const messagesEndRef = useRef(null);
  const idleTimerRef = useRef(null);
  const balloonCycleRef = useRef(null);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const currency = tenant?.currency || '$';
  const primaryColor = storefront?.banner_bg_color || tenant?.primary_color || '#6366f1';

  // ── Idle balloon logic ───────────────────────────────────────────────────
  const startIdleTimer = useCallback(() => {
    clearTimeout(idleTimerRef.current);
    if (open) return;
    idleTimerRef.current = setTimeout(() => {
      setShowBalloon(true);
    }, 4000);
  }, [open]);

  useEffect(() => {
    startIdleTimer();
    const reset = () => { setShowBalloon(false); startIdleTimer(); };
    window.addEventListener('mousemove', reset);
    window.addEventListener('touchstart', reset);
    window.addEventListener('keydown', reset);
    return () => {
      clearTimeout(idleTimerRef.current);
      window.removeEventListener('mousemove', reset);
      window.removeEventListener('touchstart', reset);
      window.removeEventListener('keydown', reset);
    };
  }, [startIdleTimer]);

  // Cycle balloon messages every 4s
  useEffect(() => {
    if (!showBalloon) { clearInterval(balloonCycleRef.current); return; }
    balloonCycleRef.current = setInterval(() => {
      setBalloonIndex(i => (i + 1) % IDLE_MESSAGES.length);
    }, 4000);
    return () => clearInterval(balloonCycleRef.current);
  }, [showBalloon]);

  // Hide balloon when chat opens
  useEffect(() => {
    if (open) { setShowBalloon(false); clearTimeout(idleTimerRef.current); }
  }, [open]);

  // ── Scroll ───────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── External open trigger ────────────────────────────────────────────────
  useEffect(() => {
    if (externalOpen) {
      openChat();
      onExternalClose?.();
    }
  }, [externalOpen]);

  const openChat = () => {
    setOpen(true);
    setMessages(prev => prev.length === 0
      ? [{ role: 'assistant', content: "Hi! 👋 I'm your menu assistant. Ask me what's good, what's featured, or what you're in the mood for!" }]
      : prev
    );
  };

  // ── Markdown renderer ────────────────────────────────────────────────────
  const renderMarkdown = (text) => {
    if (!text) return null;
    return text.split(/(\*\*.*?\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={i}>{part.slice(2, -2)}</strong>
        : <span key={i}>{part}</span>
    );
  };

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = async (text) => {
    if (!text.trim() || loading) return;

    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const updatedHistory = [...conversationHistory, userMsg];

    const cur = tenant?.settings?.currency || currency;
    const menuText = products
      .filter(p => p.is_active)
      .map(p => `- ${p.name} (${cur} ${Number(p.price).toFixed(2)})${p.description ? ': ' + p.description : ''}`)
      .join('\n');

    const systemPrompt = `You are the Sellio Assistant for ${tenant?.name}. You are a friendly menu assistant.

CURRENT MENU:
${menuText}

When a customer wants to ORDER, end your reply with this exact block:
<order_action>
{"action":"add_to_cart","items":[{"product_id":"ID","product_name":"NAME","price":PRICE,"quantity":QTY}]}
</order_action>

Rules: only add active items, confirm what you're adding, be warm and concise.`;

    try {
      const aiRes = await base44.integrations.Core.InvokeLLM({
        prompt: updatedHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n'),
        system_prompt: systemPrompt,
      });

      const rawText = typeof aiRes === 'string' ? aiRes : (aiRes?.result || aiRes?.text || aiRes?.content || '');
      const orderMatch = rawText.match(/<order_action>([\s\S]*?)<\/order_action>/);
      let orderAction = null;
      if (orderMatch) {
        try { orderAction = JSON.parse(orderMatch[1].trim()); } catch { orderAction = null; }
      }
      const cleanText = rawText.replace(/<order_action>[\s\S]*?<\/order_action>/, '').trim();

      setMessages(prev => [...prev, { role: 'assistant', content: cleanText || "Sorry, I couldn't understand that.", orderAction: orderAction || null }]);
      setConversationHistory([...updatedHistory, { role: 'assistant', content: cleanText }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Sorry, I'm having trouble right now. Please ask our staff!",
      }]);
    } finally {
      setLoading(false);
    }
  };

  // ── Order action handlers ─────────────────────────────────────────────────
  const handleConfirmOrder = (msgIndex, items) => {
    items.forEach(item => {
      const product = products.find(p => p.id === item.product_id) || {
        id: item.product_id,
        name: item.product_name,
        price: item.price,
        image_url: null,
      };
      for (let i = 0; i < (item.quantity || 1); i++) {
        addToCart?.(product);
      }
    });
    setMessages(prev => prev.map((m, i) =>
      i === msgIndex ? { ...m, orderAction: null, orderConfirmed: true } : m
    ));
    setMessages(prev => [...prev, { role: 'assistant', content: '✅ Added to your cart!' }]);
  };

  const handleCancelOrder = (msgIndex) => {
    setMessages(prev => prev.map((m, i) =>
      i === msgIndex ? { ...m, orderAction: null } : m
    ));
    setMessages(prev => [...prev, { role: 'assistant', content: "No problem! Let me know if you'd like something else." }]);
  };

  const suggestions = [
    "What's featured today? ⭐",
    "What's on sale? 🏷️",
    "Surprise me! 🎲",
  ];

  return (
    <>
      <style>{`
        @keyframes balloonFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }
      `}</style>

      {/* Idle Balloon */}
      {showBalloon && !open && (
        <div
          onClick={openChat}
          style={{
            position: 'fixed',
            bottom: '100px',
            right: '16px',
            zIndex: 51,
            cursor: 'pointer',
            animation: 'balloonFadeIn 0.25s ease',
          }}
        >
          <div style={{
            background: 'white',
            borderRadius: 20,
            padding: '10px 14px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
            fontSize: 13,
            color: '#374151',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            maxWidth: 220,
            position: 'relative',
          }}>
            {IDLE_MESSAGES[balloonIndex]}
            {/* Triangle pointing down */}
            <div style={{
              position: 'absolute',
              bottom: -8,
              right: 24,
              width: 0,
              height: 0,
              borderLeft: '8px solid transparent',
              borderRight: '8px solid transparent',
              borderTop: '8px solid white',
              filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.06))',
            }} />
          </div>
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={openChat}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '16px',
          width: '64px',
          height: '64px',
          padding: 0,
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          zIndex: 50,
          filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.20))',
        }}
      >
        <img
          src="https://assets.apptelier.sg/sellio/Logo_AISellio_Assistant.png"
          alt="Sellio Assistant"
          style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover' }}
        />
      </button>

      {/* Chat Panel */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom: isMobile ? 0 : '104px',
          right: isMobile ? 0 : '16px',
          width: isMobile ? '100%' : 360,
          height: isMobile ? '65vh' : 480,
          background: 'white',
          borderRadius: isMobile ? '20px 20px 0 0' : 16,
          boxShadow: isMobile ? 'none' : '0 20px 25px -5px rgba(0,0,0,0.15)',
          zIndex: 101,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12 }}>
            <img
              src="https://assets.apptelier.sg/sellio/Logo_AISellio_Assistant.png"
              alt="Sellio Assistant"
              style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1e293b' }}>Menu Assistant</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Ask me anything</p>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
              <X size={20} color="#64748b" />
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.map((msg, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: msg.role === 'user' ? '80%' : '90%',
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? 16 : 12,
                  background: msg.role === 'user' ? primaryColor : '#f1f5f9',
                  color: msg.role === 'user' ? 'white' : '#1e293b',
                  fontSize: 14,
                  lineHeight: 1.5,
                  wordWrap: 'break-word',
                }}>
                  <p style={{ margin: 0 }}>{msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}</p>

                  {/* Order Confirmation Card */}
                  {msg.orderAction && msg.orderAction.items?.length > 0 && (
                    <div style={{ marginTop: 10, background: 'white', borderRadius: 10, padding: '10px 12px', border: '1px solid #e2e8f0' }}>
                      <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: '#374151' }}>Items to add:</p>
                      {msg.orderAction.items.map((item, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#374151', marginBottom: 4 }}>
                          <span>{item.product_name} × {item.quantity || 1}</span>
                          <span style={{ fontWeight: 600, color: primaryColor }}>{currency} {((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button
                          onClick={() => handleConfirmOrder(idx, msg.orderAction.items)}
                          style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', background: primaryColor, color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                        >
                          ✓ Add to Cart
                        </button>
                        <button
                          onClick={() => handleCancelOrder(idx)}
                          style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', color: '#6b7280', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                        >
                          ✗ Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 14px', background: '#f1f5f9', borderRadius: '18px 18px 18px 4px', width: 'fit-content' }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#94a3b8', animation: 'bounce 1.2s infinite', animationDelay: `${i * 0.2}s`, display: 'inline-block' }} />
                ))}
              </div>
            )}

            {messages.length === 1 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {suggestions.map((s, idx) => (
                  <button key={idx} onClick={() => sendMessage(s)} style={{
                    padding: '8px 12px', borderRadius: 20, border: `1px solid ${primaryColor}`,
                    background: 'white', color: primaryColor, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  }}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '12px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8, background: 'white' }}>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={e => { if (e.key === 'Enter' && !loading) sendMessage(input); }}
              placeholder="Ask about our menu..."
              disabled={loading}
              style={{ flex: 1, padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              style={{
                width: 40, height: 40, borderRadius: 8,
                background: loading || !input.trim() ? '#cbd5e1' : primaryColor,
                border: 'none', cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Send size={18} color="white" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}