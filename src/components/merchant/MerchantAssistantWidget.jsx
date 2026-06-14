import React, { useState, useRef, useEffect } from 'react';
import { X, Send } from 'lucide-react';
import { useTenant } from '@/components/tenant/TenantContext';

const SUPABASE_URL = 'https://gzktuteedbtnaxfdylyu.supabase.co';

const SUGGESTIONS = [
  "What's my revenue today? 💰",
  "Top selling products this month 🏆",
  "Any low stock items? 📦",
  "How many orders today? 📋",
];

const renderMarkdown = (text) => {
  if (!text) return null;
  return text.split(/(\*\*.*?\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  );
};

export default function MerchantAssistantWidget({ externalOpen, onExternalClose }) {
  const { tenantId } = useTenant();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [showBalloon, setShowBalloon] = useState(false);
  const messagesEndRef = useRef(null);
  const balloonShownRef = useRef(false);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Show balloon once after 30s, never again this session
  useEffect(() => {
    if (open || balloonShownRef.current) return;
    const timer = setTimeout(() => {
      if (!open && !balloonShownRef.current) {
        setShowBalloon(true);
        balloonShownRef.current = true;
        setTimeout(() => setShowBalloon(false), 6000);
      }
    }, 30000);
    return () => clearTimeout(timer);
  }, [open]);

  // External open trigger from Dashboard greeting
  useEffect(() => {
    if (externalOpen) {
      openChat();
      onExternalClose?.();
    }
  }, [externalOpen]);

  const openChat = () => {
    setOpen(true);
    setShowBalloon(false);
    if (messages.length === 0) {
      setMessages([{ role: 'assistant', content: "Hi! 👋 I'm your Sellio AI Assistant. Ask me about your sales, orders, inventory, or any business insights!" }]);
    }
  };

  const sendMessage = async (text) => {
    if (!text.trim() || loading || !tenantId) return;
    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    const updatedHistory = [...conversationHistory, userMsg];

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/merchantAssistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedHistory, tenantId }),
      });
      const data = await res.json();
      const aiText = data.text || "Sorry, I couldn't process that. Please try again.";
      setMessages(prev => [...prev, { role: 'assistant', content: aiText }]);
      setConversationHistory([...updatedHistory, { role: 'assistant', content: aiText }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I'm having trouble connecting. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  if (!tenantId) return null;

  return (
    <>
      <style>{`
        @keyframes maSlideUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes maBounce { 0%,60%,100% { transform:translateY(0); } 30% { transform:translateY(-6px); } }
      `}</style>



      {/* Chat panel */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom: isMobile ? 0 : 80,
          right: isMobile ? 0 : 16,
          width: isMobile ? '100%' : 360,
          height: isMobile ? '70vh' : 500,
          background: 'white',
          borderRadius: isMobile ? '20px 20px 0 0' : 16,
          boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
          zIndex: 201,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '14px 16px', background: 'linear-gradient(135deg, #fb923c, #e0449a, #8b2fc9)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="https://assets.apptelier.sg/sellio/Logo_AISellio_Assistant.png" alt="Sellio AI" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid rgba(255,255,255,0.3)' }} />
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'white' }}>Sellio AI Assistant</p>
              <p style={{ margin: '1px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.8)' }}>Your business insights partner</p>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'white', display: 'flex', alignItems: 'center' }}>
              <X size={20} color="rgba(255,255,255,0.8)" />
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.map((msg, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {msg.role === 'assistant' && (
                  <img src="https://assets.apptelier.sg/sellio/Logo_AISellio_Assistant.png" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, marginRight: 8, alignSelf: 'flex-end' }} />
                )}
                <div style={{
                  maxWidth: '80%', padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.role === 'user' ? 'linear-gradient(135deg, #fb923c, #e0449a)' : '#f1f5f9',
                  color: msg.role === 'user' ? 'white' : '#1e293b',
                  fontSize: 14, lineHeight: 1.6,
                }}>
                  {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <img src="https://assets.apptelier.sg/sellio/Logo_AISellio_Assistant.png" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 14px', background: '#f1f5f9', borderRadius: '16px 16px 16px 4px' }}>
                  {[0,1,2].map(i => <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#94a3b8', animation: 'maBounce 1.2s infinite', animationDelay: `${i*0.2}s`, display: 'inline-block' }} />)}
                </div>
              </div>
            )}

            {messages.length === 1 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                {SUGGESTIONS.map((s, idx) => (
                  <button key={idx} onClick={() => sendMessage(s)} style={{ padding: '7px 12px', borderRadius: 20, border: '1px solid #e0449a', background: 'white', color: '#e0449a', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: 12, borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8, background: 'white' }}>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !loading) sendMessage(input); }}
              placeholder="Ask about sales, orders, inventory..."
              disabled={loading}
              style={{ flex: 1, padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              style={{ width: 40, height: 40, borderRadius: 8, background: loading || !input.trim() ? '#cbd5e1' : 'linear-gradient(135deg, #fb923c, #e0449a)', border: 'none', cursor: loading || !input.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Send size={18} color="white" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}