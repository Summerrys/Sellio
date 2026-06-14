import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, ShoppingCart } from 'lucide-react';
import { getSupabase } from '@/lib/supabaseClient';

export default function MenuAssistantWidget({ products, tenant, onProductSelect, onAddToCart, storefront, externalOpen, onExternalClose, isStoreOpen = true, isPreview = false }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [cartFeedback, setCartFeedback] = useState(null);
  const messagesEndRef = useRef(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const currency = tenant?.currency || '$';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Sync external open trigger from quick links
  useEffect(() => {
    if (externalOpen) {
      setOpen(true);
      setMessages(prev => prev.length === 0
        ? [{ role: 'assistant', content: "Hi! 👋 I'm your menu assistant. Tell me what you'd like to order, or ask me what's good today!" }]
        : prev
      );
      onExternalClose?.();
    }
  }, [externalOpen]);

  const renderMarkdown = (text) => {
    if (!text) return null;
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  const executeCartActions = (cartActions, allProducts) => {
    if (!cartActions || cartActions.length === 0 || !onAddToCart) return { addedCount: 0, addedNames: [] };
    if (!isPreview && !isStoreOpen) return { addedCount: 0, addedNames: [] };
    let addedCount = 0;
    const addedNames = [];
    for (const action of cartActions) {
      const product = allProducts.find(p => p.id === action.productId);
      if (!product) continue;
      const qty = Math.max(1, Math.floor(action.quantity || 1));
      for (let i = 0; i < qty; i++) { onAddToCart(product, null); }
      addedCount += qty;
      addedNames.push(`${qty}x ${product.name}`);
    }
    return { addedCount, addedNames };
  };

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return;

    const newMessage = { role: 'user', content: text };
    const newMessages = [...messages, newMessage];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    // Add user message to conversation history BEFORE invoking function
    const updatedHistory = [...conversationHistory, newMessage];

    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase.functions.invoke('menuAssistant', {
        body: {
          messages: updatedHistory,
          products: products,
          tenant: tenant,
          isStoreOpen: isPreview ? true : isStoreOpen,
        }
      });

      if (error) {
        console.error('menuAssistant error:', error);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: "Sorry, I'm having trouble right now. Please ask our staff!"
        }]);
        return;
      }

      const { text: aiText, recommendedProductIds, cartActions } = data;

      if (cartActions && cartActions.length > 0) {
        const result = executeCartActions(cartActions, products);
        if (result.addedCount > 0) {
          setCartFeedback(result);
          setTimeout(() => setCartFeedback(null), 4000);
        }
      }
      const recommendedProducts = (recommendedProductIds || [])
        .map((id) => products.find((p) => p.id === id))
        .filter(Boolean);

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: aiText,
        products: recommendedProducts,
        hasCartAction: cartActions && cartActions.length > 0,
      }]);

      // Add AI response to conversation history AFTER receiving response
      setConversationHistory(prev => [...prev.slice(-9), newMessage, { role: 'assistant', content: aiText }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Sorry, I'm having trouble right now. Please ask our staff!"
      }]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = [
    "What's featured today? ⭐",
    "What's on sale? 🏷️",
    "Surprise me! 🎲"
  ];

  const primaryColor = storefront?.banner_bg_color || tenant?.primary_color || '#6366f1';
  const buttonBackground = primaryColor.startsWith('#') || primaryColor.startsWith('rgb')
    ? primaryColor
    : 'linear-gradient(135deg, #f97316, #ec4899, #8b5cf6)';

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => {
          setOpen(true);
          if (messages.length === 0) {
            setMessages([{
              role: 'assistant',
              content: "Hi! 👋 I'm your menu assistant. Tell me what you'd like to order, or ask me what's good today!"
            }]);
          }
        }}
        style={{
          position: 'fixed',
          bottom: '80px',
          right: '16px',
          zIndex: 100,
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.20))',
        }}
      >
        {!open && (
          <div style={{
            position: 'absolute',
            top: 2,
            right: 2,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: '#10b981',
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            zIndex: 1,
          }}>
            <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }`}</style>
          </div>
        )}
        <img
          src="https://assets.apptelier.sg/sellio/Logo_AISellio_Assistant.png"
          alt="Sellio Assistant"
          style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
        />
      </button>

      {cartFeedback && (
        <div style={{
          position: 'fixed', bottom: isMobile ? 'calc(65vh + 12px)' : '576px',
          right: 16, zIndex: 102, background: '#10b981', color: 'white',
          padding: '10px 16px', borderRadius: 12, fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          animation: 'slideUp 0.3s ease', maxWidth: 280,
        }}>
          <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }`}</style>
          <ShoppingCart size={16} color="white" />
          Added {cartFeedback.addedNames.join(', ')} to cart!
        </div>
      )}

      {/* Chat Panel */}
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: isMobile ? 0 : '80px',
            right: isMobile ? 0 : '16px',
            width: isMobile ? '100%' : 360,
            height: isMobile ? '65vh' : 480,
            background: 'white',
            borderRadius: isMobile ? '20px 20px 0 0' : 16,
            boxShadow: isMobile ? 'none' : '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            zIndex: 101,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <div style={{
            padding: '16px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12
          }}>
            <img
              src="https://assets.apptelier.sg/sellio/Logo_AISellio_Assistant.png"
              alt="Sellio Assistant"
              style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1e293b' }}>Menu Assistant</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: (!isPreview && !isStoreOpen) ? '#ef4444' : '#64748b' }}>
                {(!isPreview && !isStoreOpen) ? '🔒 Store is currently closed' : 'Ask me or just tell me what you want'}
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={20} color="#64748b" />
            </button>
          </div>

          {/* Messages Area */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            {messages.map((msg, idx) => (
              <div key={idx} style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
              }}>
                <div style={{
                  maxWidth: msg.role === 'user' ? '80%' : '90%',
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? 16 : 12,
                  background: msg.role === 'user' ? primaryColor : '#f1f5f9',
                  color: msg.role === 'user' ? 'white' : '#1e293b',
                  fontSize: 14,
                  lineHeight: 1.5,
                  wordWrap: 'break-word'
                }}>
                  <p style={{ margin: 0 }}>{msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}</p>
                  {msg.hasCartAction && (
                    <div style={{
                      marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5,
                      background: '#d1fae5', color: '#065f46', fontSize: 11, fontWeight: 600,
                      padding: '4px 10px', borderRadius: 20,
                    }}>
                      <ShoppingCart size={12} />
                      Added to cart
                    </div>
                  )}
                  {msg.products && msg.products.length > 0 && (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      marginTop: 8
                    }}>
                      {msg.products.map(product => (
                        <div
                          key={product.id}
                          onClick={() => {
                            onProductSelect(product);
                            setOpen(false);
                          }}
                          style={{
                            display: 'flex',
                            gap: 10,
                            padding: '8px 10px',
                            background: 'white',
                            borderRadius: 12,
                            border: '1px solid #f1f5f9',
                            cursor: 'pointer',
                            alignItems: 'center',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)'}
                          onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'}
                        >
                          {product.image_url && (
                            <img
                              src={product.image_url}
                              alt={product.name}
                              style={{
                                width: 52,
                                height: 52,
                                borderRadius: 8,
                                objectFit: 'cover',
                                flexShrink: 0
                              }}
                            />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: '#1e293b',
                              margin: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              {product.name}
                            </p>
                            {product.description && (
                              <p style={{
                                fontSize: 11,
                                color: '#94a3b8',
                                margin: '1px 0 2px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {product.description}
                              </p>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              {product.compare_at_price > product.price && (
                                <span style={{ fontSize: 11, color: '#94a3b8', textDecoration: 'line-through' }}>
                                  {currency} {parseFloat(product.compare_at_price).toFixed(2)}
                                </span>
                              )}
                              <span style={{ fontSize: 12, color: primaryColor, fontWeight: 700 }}>
                                {currency} {parseFloat(product.price).toFixed(2)}
                              </span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            {onAddToCart && (isPreview || isStoreOpen) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAddToCart(product, null);
                                  setCartFeedback({ addedCount: 1, addedNames: [`1x ${product.name}`] });
                                  setTimeout(() => setCartFeedback(null), 4000);
                                }}
                                style={{
                                  width: 28, height: 28, borderRadius: '50%', background: primaryColor,
                                  border: 'none', color: 'white', fontSize: 18, cursor: 'pointer',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  lineHeight: 1,
                                }}
                              >+</button>
                            )}
                            {(!isPreview && !isStoreOpen) && (
                              <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🔒</div>
                            )}
                            <span style={{ fontSize: 10, color: '#cbd5e1' }}>tap for details</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 14px', background: '#f1f5f9', borderRadius: '18px 18px 18px 4px', width: 'fit-content', marginBottom: 8 }}>
                <style>{`@keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }`}</style>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#94a3b8', animation: 'bounce 1.2s infinite', animationDelay: `${i * 0.2}s`, display: 'inline-block' }} />
                ))}
              </div>
            )}

            {messages.length === 1 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {suggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => sendMessage(suggestion)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 20,
                      border: `1px solid ${primaryColor}`,
                      background: 'white',
                      color: primaryColor,
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => {
                      e.target.style.background = primaryColor;
                      e.target.style.color = 'white';
                    }}
                    onMouseLeave={e => {
                      e.target.style.background = 'white';
                      e.target.style.color = primaryColor;
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          {(!isPreview && !isStoreOpen) ? (
            <div style={{ padding: '14px 16px', borderTop: '1px solid #f1f5f9', background: '#fef2f2', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#dc2626', fontWeight: 600 }}>🔒 Ordering is unavailable outside business hours</p>
            </div>
          ) : (
          <div style={{
            padding: '12px',
            borderTop: '1px solid #f1f5f9',
            display: 'flex',
            gap: 8,
            background: 'white'
          }}>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={e => {
                if (e.key === 'Enter' && !loading) {
                  sendMessage(input);
                }
              }}
              placeholder="Order or ask about our menu..."
              disabled={loading}
              style={{
                flex: 1,
                padding: '10px 14px',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                fontSize: 14,
                outline: 'none',
                fontFamily: 'inherit'
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: loading || !input.trim() ? '#cbd5e1' : primaryColor,
                border: 'none',
                cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
            >
              <Send size={18} color="white" />
            </button>
          </div>
          )}
        </div>
      )}
    </>
  );
}