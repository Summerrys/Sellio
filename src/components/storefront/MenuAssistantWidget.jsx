import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function MenuAssistantWidget({ products, tenant, onProductSelect, storefront }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const messagesEndRef = useRef(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const currency = tenant?.currency || '$';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (text) => {
    if (!text.trim()) return;

    const newMessage = { role: 'user', content: text };
    const newMessages = [...messages, newMessage];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const response = await base44.functions.invoke('chatWithMenuAssistant', {
        message: text,
        conversationHistory: conversationHistory,
        products: products,
        tenant: tenant
      });

      const { text: aiText, recommendedProducts, newMessage: aiMsg } = response.data;

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: aiText,
        products: recommendedProducts
      }]);

      setConversationHistory(prev => [...prev.slice(-9), newMessage, aiMsg]);
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '❌ Sorry, I encountered an error. Please try again.'
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

  const primaryColor = storefront?.banner_bg_color || 'rgb(var(--sf-primary, 51, 65, 85))';

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => {
          setOpen(true);
          if (messages.length === 0) {
            setMessages([{
              role: 'assistant',
              content: "Hi! 👋 I'm your menu assistant. Ask me what's good, what's featured, or what you're in the mood for!"
            }]);
          }
        }}
        style={{
          position: 'fixed',
          bottom: '80px',
          right: '16px',
          zIndex: 100,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: primaryColor,
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          transition: 'transform 0.2s'
        }}
        onMouseEnter={e => e.target.style.transform = 'scale(1.1)'}
        onMouseLeave={e => e.target.style.transform = 'scale(1)'}
      >
        {!open && (
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: '#10b981',
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
          }}>
            <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }`}</style>
          </div>
        )}
        {!open ? (
          <Sparkles size={24} color="white" />
        ) : (
          <X size={24} color="white" />
        )}
      </button>

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
            <div style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: primaryColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <span style={{ fontSize: 20 }}>✦</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1e293b' }}>Menu Assistant</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Ask me anything</p>
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
                  <p style={{ margin: 0 }}>{msg.content}</p>
                  
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
                                width: 44,
                                height: 44,
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
                            <p style={{
                              fontSize: 12,
                              color: primaryColor,
                              fontWeight: 600,
                              margin: '2px 0 0'
                            }}>
                              {currency} {product.price.toFixed(2)}
                            </p>
                          </div>
                          <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>Tap →</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

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
              placeholder="Ask about our menu..."
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
        </div>
      )}
    </>
  );
}