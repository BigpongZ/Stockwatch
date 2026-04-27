import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "stock_watchlist_v1";

const MARKET_EXAMPLES = {
  TH: ["PTT", "KBANK", "AOT", "CPALL", "SCB", "GULF", "ADVANC", "TRUE", "IVL", "SCC"],
  US: ["AAPL", "NVDA", "TSLA", "AMZN", "MSFT", "META", "GOOGL", "AMD", "PLTR", "SMCI"],
};

function useWatchlist() {
  const [list, setList] = useState(() => {
    try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; }
    catch { return []; }
  });
  const save = useCallback((newList) => {
    setList(newList);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newList)); } catch {}
  }, []);
  const add = (item) => save([...list, { ...item, id: Date.now(), addedAt: new Date().toLocaleDateString("th-TH") }]);
  const remove = (id) => save(list.filter(i => i.id !== id));
  const update = (id, patch) => save(list.map(i => i.id === id ? { ...i, ...patch } : i));
  return { list, add, remove, update };
}

async function fetchQuote(symbol, market) {
  const ticker = market === "TH" ? `${symbol}.BK` : symbol;
  try {
    const res = await fetch(`/.netlify/functions/quote?symbol=${ticker}`);
    if (!res.ok) throw new Error("fetch failed");
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return { ...data, symbol, market };
  } catch { return null; }
}

async function analyzeWithClaude(stockInfo, analysisType) {
  const portfolioContext = stockInfo.shares && stockInfo.avgCost
    ? `The investor holds ${stockInfo.shares} shares at average cost ${stockInfo.avgCost} ${stockInfo.currency}. Current P&L: ${((stockInfo.price - stockInfo.avgCost) * stockInfo.shares).toFixed(2)} ${stockInfo.currency} (${(((stockInfo.price - stockInfo.avgCost) / stockInfo.avgCost) * 100).toFixed(2)}%). Consider whether they should hold or take profit/cut loss.`
    : "";
  const prompts = {
    technical: `Analyze this stock technically. Stock: ${stockInfo.symbol} (${stockInfo.market}), Price: ${stockInfo.price} ${stockInfo.currency}, Prev: ${stockInfo.prev}. ${portfolioContext} Discuss momentum, trend, key levels in 3-4 sentences. End with BUY / HOLD / SELL.`,
    fundamental: `Brief fundamental analysis of ${stockInfo.symbol} on ${stockInfo.market === "TH" ? "SET" : "US market"}. Price: ${stockInfo.price} ${stockInfo.currency}. ${portfolioContext} Valuation, growth, competitive position in 3-4 sentences. End with BUY / HOLD / SELL.`,
    news: `Recent news & sentiment for ${stockInfo.symbol} (${stockInfo.market === "TH" ? "Thai" : "US"} stock). ${portfolioContext} Key catalysts or risks in 3-4 sentences. End with BUY / HOLD / SELL.`,
  };
  try {
    const res = await fetch("/.netlify/functions/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: prompts[analysisType] }),
    });
    const data = await res.json();
    return data.result || "Analysis unavailable.";
  } catch { return "Analysis unavailable."; }
}

function extractSignal(text) {
  const upper = text.toUpperCase();
  if (/\bBUY\b/.test(upper)) return { label: "BUY", color: "#00d4aa" };
  if (/\bSELL\b/.test(upper)) return { label: "SELL", color: "#ff4d6d" };
  return { label: "HOLD", color: "#f0a500" };
}

function PriceChange({ price, prev }) {
  if (!price || !prev) return null;
  const diff = price - prev;
  const pct = ((diff / prev) * 100).toFixed(2);
  const up = diff >= 0;
  return <span style={{ color: up ? "#00d4aa" : "#ff4d6d", fontFamily: "monospace", fontSize: "0.85rem" }}>{up ? "▲" : "▼"} {Math.abs(diff).toFixed(2)} ({up ? "+" : ""}{pct}%)</span>;
}

function PnL({ shares, avgCost, currentPrice, currency }) {
  if (!shares || !avgCost || !currentPrice) return null;
  const pnl = (currentPrice - avgCost) * shares;
  const pct = ((currentPrice - avgCost) / avgCost * 100).toFixed(2);
  const up = pnl >= 0;
  return (
    <div style={{ marginTop: "0.4rem", background: up ? "#00d4aa11" : "#ff4d6d11", border: `1px solid ${up ? "#00d4aa33" : "#ff4d6d33"}`, borderRadius: "8px", padding: "0.5rem 0.75rem" }}>
      <div style={{ fontSize: "0.7rem", color: "#8b949e", marginBottom: "0.2rem" }}>P&L ({shares} หุ้น @ {avgCost})</div>
      <div style={{ fontFamily: "monospace", fontWeight: 700, color: up ? "#00d4aa" : "#ff4d6d", fontSize: "0.95rem" }}>
        {up ? "+" : ""}{pnl.toFixed(2)} {currency}
        <span style={{ fontSize: "0.75rem", marginLeft: "0.5rem" }}>({up ? "+" : ""}{pct}%)</span>
      </div>
    </div>
  );
}

function AnalysisPanel({ stock, onClose }) {
  const [tab, setTab] = useState("technical");
  const [result, setResult] = useState({});
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState(null);

  useEffect(() => { fetchQuote(stock.symbol, stock.market).then(setQuote); }, [stock]);

  const analyze = async (type) => {
    setTab(type);
    if (result[type]) return;
    setLoading(true);
    const info = quote || { symbol: stock.symbol, market: stock.market, price: stock.price || 0, prev: stock.price, currency: stock.market === "TH" ? "THB" : "USD" };
    const text = await analyzeWithClaude({ ...info, shares: stock.shares, avgCost: stock.avgCost }, type);
    setResult(r => ({ ...r, [type]: text }));
    setLoading(false);
  };

  useEffect(() => { if (quote !== null) analyze("technical"); }, [quote]);
  const signal = result[tab] ? extractSignal(result[tab]) : null;
  const price = quote?.price || stock.price;
  const currency = quote?.currency || (stock.market === "TH" ? "THB" : "USD");

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
      <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: "16px", width: "100%", maxWidth: "600px", maxHeight: "90vh", overflow: "auto", boxShadow: "0 0 60px rgba(0,212,170,0.15)" }}>
        <div style={{ padding: "1.5rem 1.5rem 1rem", borderBottom: "1px solid #21262d" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontSize: "1.5rem", fontWeight: 700, color: "#e6edf3", fontFamily: "monospace" }}>{stock.symbol}</span>
                <span style={{ background: stock.market === "TH" ? "#1a3a2a" : "#1a2a3a", color: stock.market === "TH" ? "#00d4aa" : "#58a6ff", padding: "2px 8px", borderRadius: "4px", fontSize: "0.7rem", fontWeight: 600 }}>{stock.market}</span>
                {signal && <span style={{ background: signal.color + "22", color: signal.color, padding: "3px 10px", borderRadius: "20px", fontSize: "0.75rem", fontWeight: 700, border: `1px solid ${signal.color}44` }}>{signal.label}</span>}
              </div>
              {quote && <div style={{ marginTop: "0.35rem", fontSize: "1.1rem", color: "#e6edf3", fontFamily: "monospace" }}>{quote.price?.toFixed(2)} <span style={{ color: "#8b949e", fontSize: "0.8rem" }}>{quote.currency}</span> <PriceChange price={quote.price} prev={quote.prev} /></div>}
              {stock.shares && stock.avgCost && <PnL shares={stock.shares} avgCost={stock.avgCost} currentPrice={price} currency={currency} />}
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#8b949e", cursor: "pointer", fontSize: "1.3rem" }}>✕</button>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
            {[["technical", "📈 Technical"], ["fundamental", "🏦 Fundamental"], ["news", "📰 News"]].map(([key, label]) => (
              <button key={key} onClick={() => analyze(key)} style={{ padding: "6px 14px", borderRadius: "8px", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", border: tab === key ? "1px solid #00d4aa" : "1px solid #30363d", background: tab === key ? "#00d4aa18" : "transparent", color: tab === key ? "#00d4aa" : "#8b949e" }}>{label}</button>
            ))}
          </div>
        </div>
        <div style={{ padding: "1.5rem" }}>
          {loading
            ? <div style={{ textAlign: "center", padding: "2rem", color: "#8b949e" }}><div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>⟳</div><div style={{ fontSize: "0.85rem" }}>AI กำลังวิเคราะห์...</div></div>
            : result[tab] ? <div style={{ color: "#c9d1d9", lineHeight: 1.8, fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>{result[tab]}</div>
            : null}
        </div>
      </div>
    </div>
  );
}

function AddStockModal({ onAdd, onClose }) {
  const [market, setMarket] = useState("US");
  const [symbol, setSymbol] = useState("");
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [shares, setShares] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");

  const search = async () => {
    if (!symbol.trim()) return;
    setLoading(true); setError(""); setQuote(null);
    const q = await fetchQuote(symbol.trim().toUpperCase(), market);
    if (q) setQuote(q); else setError("ไม่พบหุ้นนี้ ลองเช็ค symbol อีกครั้ง");
    setLoading(false);
  };

  const handleAdd = () => {
    if (!quote) return;
    onAdd({ symbol: quote.symbol, market, name: quote.name, price: quote.price, currency: quote.currency, target: target ? parseFloat(target) : null, note, shares: shares ? parseFloat(shares) : null, avgCost: avgCost ? parseFloat(avgCost) : null });
    onClose();
  };

  const pnlPreview = shares && avgCost && quote ? ((quote.price - parseFloat(avgCost)) * parseFloat(shares)) : null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
      <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: "16px", width: "100%", maxWidth: "440px", padding: "1.5rem", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <span style={{ color: "#e6edf3", fontWeight: 700 }}>เพิ่มหุ้นใน Watchlist</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#8b949e", cursor: "pointer", fontSize: "1.2rem" }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          {["TH", "US"].map(m => (
            <button key={m} onClick={() => { setMarket(m); setQuote(null); setError(""); }} style={{ flex: 1, padding: "8px", borderRadius: "8px", fontWeight: 600, cursor: "pointer", border: market === m ? "1px solid #00d4aa" : "1px solid #30363d", background: market === m ? "#00d4aa18" : "transparent", color: market === m ? "#00d4aa" : "#8b949e" }}>
              {m === "TH" ? "🇹🇭 ไทย (SET)" : "🇺🇸 US"}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <input placeholder={market === "TH" ? "เช่น PTT, KBANK" : "เช่น AAPL, NVDA"} value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && search()} style={{ flex: 1, background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", borderRadius: "8px", padding: "8px 12px", fontSize: "0.9rem", fontFamily: "monospace" }} />
          <button onClick={search} style={{ background: "#00d4aa", color: "#000", border: "none", borderRadius: "8px", padding: "8px 16px", fontWeight: 700, cursor: "pointer" }}>{loading ? "..." : "ค้นหา"}</button>
        </div>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          {MARKET_EXAMPLES[market].slice(0, 6).map(s => (
            <button key={s} onClick={() => setSymbol(s)} style={{ background: "#21262d", border: "1px solid #30363d", color: "#8b949e", borderRadius: "4px", padding: "2px 8px", fontSize: "0.7rem", cursor: "pointer" }}>{s}</button>
          ))}
        </div>
        {error && <div style={{ color: "#ff4d6d", fontSize: "0.8rem", marginBottom: "0.75rem" }}>{error}</div>}
        {quote && (
          <div style={{ background: "#161b22", borderRadius: "10px", padding: "0.85rem", marginBottom: "1rem", border: "1px solid #00d4aa44" }}>
            <div style={{ color: "#e6edf3", fontWeight: 600 }}>{quote.name}</div>
            <div style={{ color: "#00d4aa", fontFamily: "monospace", fontSize: "1.1rem", marginTop: "0.25rem" }}>{quote.price?.toFixed(2)} <span style={{ color: "#8b949e", fontSize: "0.8rem" }}>{quote.currency}</span> <PriceChange price={quote.price} prev={quote.prev} /></div>
          </div>
        )}
        {quote && (
          <>
            <div style={{ color: "#8b949e", fontSize: "0.75rem", marginBottom: "0.4rem" }}>📊 Portfolio (ไม่บังคับ)</div>
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <input placeholder="จำนวนหุ้น" value={shares} onChange={e => setShares(e.target.value)} type="number" style={{ flex: 1, background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", borderRadius: "8px", padding: "8px 12px", fontSize: "0.88rem", boxSizing: "border-box" }} />
              <input placeholder="ราคาที่ซื้อเฉลี่ย" value={avgCost} onChange={e => setAvgCost(e.target.value)} type="number" style={{ flex: 1, background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", borderRadius: "8px", padding: "8px 12px", fontSize: "0.88rem", boxSizing: "border-box" }} />
            </div>
            {pnlPreview !== null && (
              <div style={{ background: pnlPreview >= 0 ? "#00d4aa11" : "#ff4d6d11", border: `1px solid ${pnlPreview >= 0 ? "#00d4aa33" : "#ff4d6d33"}`, borderRadius: "8px", padding: "0.5rem 0.75rem", marginBottom: "0.5rem" }}>
                <div style={{ fontSize: "0.7rem", color: "#8b949e" }}>P&L ตอนนี้</div>
                <div style={{ fontFamily: "monospace", fontWeight: 700, color: pnlPreview >= 0 ? "#00d4aa" : "#ff4d6d" }}>{pnlPreview >= 0 ? "+" : ""}{pnlPreview.toFixed(2)} {quote.currency} ({(((quote.price - parseFloat(avgCost)) / parseFloat(avgCost)) * 100).toFixed(2)}%)</div>
              </div>
            )}
            <input placeholder="Target Price (ไม่บังคับ)" value={target} onChange={e => setTarget(e.target.value)} type="number" style={{ width: "100%", background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", borderRadius: "8px", padding: "8px 12px", fontSize: "0.88rem", marginBottom: "0.5rem", boxSizing: "border-box" }} />
            <textarea placeholder="Note / เหตุผลที่ดูหุ้นนี้..." value={note} onChange={e => setNote(e.target.value)} rows={2} style={{ width: "100%", background: "#161b22", border: "1px solid #30363d", color: "#e6edf3", borderRadius: "8px", padding: "8px 12px", fontSize: "0.88rem", resize: "none", marginBottom: "1rem", boxSizing: "border-box" }} />
            <button onClick={handleAdd} style={{ width: "100%", background: "#00d4aa", color: "#000", border: "none", borderRadius: "8px", padding: "10px", fontWeight: 700, cursor: "pointer" }}>+ เพิ่มใน Watchlist</button>
          </>
        )}
      </div>
    </div>
  );
}

function StockCard({ item, onRemove, onAnalyze, onUpdate }) {
  const [quote, setQuote] = useState(null);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(item.note || "");
  const [target, setTarget] = useState(item.target || "");
  const [shares, setShares] = useState(item.shares || "");
  const [avgCost, setAvgCost] = useState(item.avgCost || "");

  useEffect(() => { fetchQuote(item.symbol, item.market).then(setQuote); }, [item.symbol, item.market]);

  const price = quote?.price || item.price;
  const currency = quote?.currency || item.currency || (item.market === "TH" ? "THB" : "USD");
  const upside = item.target && price ? (((item.target - price) / price) * 100).toFixed(1) : null;
  const upsideUp = upside > 0;

  const saveEdit = () => {
    onUpdate(item.id, { note, target: target ? parseFloat(target) : null, shares: shares ? parseFloat(shares) : null, avgCost: avgCost ? parseFloat(avgCost) : null });
    setEditing(false);
  };

  return (
    <div style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: "14px", padding: "1.1rem", transition: "border-color 0.2s" }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "#30363d"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "#21262d"}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: "1rem", color: "#e6edf3" }}>{item.symbol}</span>
            <span style={{ background: item.market === "TH" ? "#1a3a2a" : "#1a2a3a", color​​​​​​​​​​​​​​​​
