import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, TrendingUp, TrendingDown, Users, Star, DollarSign, Activity, Play, Briefcase, RefreshCw } from 'lucide-react';
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickSeries } from 'lightweight-charts';
import { db } from './lib/firebase';
import { ref, get, set } from 'firebase/database';

interface Asset {
  symbol: string;
  name: string;
  price: number;
  history: { time: string; value: number }[];
  candles: { time: string; open: number; high: number; low: number; close: number }[];
  volatility: number;
  trend: number;
}

interface PortfolioItem {
  shares: number;
  avgPrice: number;
}

const INITIAL_FUNDS = 10000000; // 10 million your money
const INITIAL_CLIENT_FUNDS = 40000000; // 40 million client money
const TOTAL_MONTHS = 36; // 3 years

const INITIAL_ASSETS: Asset[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', price: 150, history: [], candles: [], volatility: 0.08, trend: 1.02 },
  { symbol: 'NVDA', name: 'Nvidia Corp.', price: 120, history: [], candles: [], volatility: 0.15, trend: 1.05 },
  { symbol: 'WMT', name: 'Walmart Inc.', price: 60, history: [], candles: [], volatility: 0.04, trend: 1.00 },
];

export default function HedgeFundManager({ onBack, userId }: { onBack: () => void, userId: string }) {
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [portfolio, setPortfolio] = useState<Record<string, { shares: number }>>({});
  const [cash, setCash] = useState(INITIAL_FUNDS + INITIAL_CLIENT_FUNDS);
  
  const [rating, setRating] = useState(3); // 1 to 5 stars
  const [clientCount, setClientCount] = useState(10);
  const [clientFunds, setClientFunds] = useState(INITIAL_CLIENT_FUNDS);
  const [myFunds, setMyFunds] = useState(INITIAL_FUNDS);
  
  const [selectedAsset, setSelectedAsset] = useState<string>('AAPL');
  const [tradeAmount, setTradeAmount] = useState<number>(0);
  const [monthlyReport, setMonthlyReport] = useState<{ profit: number; clientChange: number; ratingChange: number; totalAUM: number } | null>(null);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  // Initialize game
  useEffect(() => {
    const loadGame = async () => {
      try {
        const snap = await get(ref(db, `users/${userId}/hfm_state`));
        if (snap.exists()) {
          const data = snap.val();
          setMonth(data.month);
          setGameOver(data.gameOver);
          setAssets(data.assets);
          setPortfolio(data.portfolio || {});
          setCash(data.cash);
          setRating(data.rating);
          setClientCount(data.clientCount);
          setClientFunds(data.clientFunds);
          setMyFunds(data.myFunds);
          setMonthlyReport(data.monthlyReport || null);
          setLoading(false);
          return;
        }
      } catch (e) {
        console.error("Failed to load HFM state", e);
      }
      
      // If no data, or error, generate initial state
      let initialAssets = JSON.parse(JSON.stringify(INITIAL_ASSETS));
      
      // Generate 12 months of back-history
      for (let a of initialAssets) {
        let currentPrice = a.price * 0.8; // start lower 1 year ago
        a.candles = [];
        const now = new Date();
        now.setMonth(now.getMonth() - 12);
        
        for (let i = 0; i < 12; i++) {
          const trend = a.trend;
          const change = (Math.random() - 0.5) * a.volatility * 2 + (trend - 1);
          const open = currentPrice;
          const close = Math.max(1, open * (1 + change));
          const high = Math.max(open, close) * (1 + Math.random() * a.volatility);
          const low = Math.min(open, close) * (1 - Math.random() * a.volatility);
          
          now.setMonth(now.getMonth() + 1);
          const timeStr = now.toISOString().split('T')[0];
          
          a.candles.push({ time: timeStr, open, high, low, close });
          currentPrice = close;
        }
        a.price = currentPrice;
      }
      setAssets(initialAssets);
      setLoading(false);
    };
    
    loadGame();
  }, [userId]);

  // Auto-save game
  useEffect(() => {
    if (loading) return;
    
    const stateObj = {
      month,
      gameOver,
      assets,
      portfolio,
      cash,
      rating,
      clientCount,
      clientFunds,
      myFunds,
      monthlyReport
    };
    
    set(ref(db, `users/${userId}/hfm_state`), stateObj).catch(e => console.error("Failed to save state", e));
  }, [month, gameOver, assets, portfolio, cash, rating, clientCount, clientFunds, myFunds, monthlyReport, userId, loading]);

  // Update chart when asset is selected or changes
  useEffect(() => {
    if (!chartContainerRef.current || assets.length === 0) return;
    
    const asset = assets.find(a => a.symbol === selectedAsset);
    if (!asset) return;

    if (!chartRef.current) {
      const chart = createChart(chartContainerRef.current, {
        layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#d1d5db' },
        grid: { vertLines: { color: '#2a2b2e' }, horzLines: { color: '#2a2b2e' } },
        width: chartContainerRef.current.clientWidth,
        height: 300,
      });
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#22c55e', downColor: '#ef4444', borderVisible: false,
        wickUpColor: '#22c55e', wickDownColor: '#ef4444'
      });
      chartRef.current = chart;
      seriesRef.current = candleSeries as any;
    }

    seriesRef.current?.setData(asset.candles as any);
    chartRef.current.timeScale().fitContent();

  }, [selectedAsset, assets, month]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const totalPortfolioValue = Object.entries(portfolio).reduce((acc, [sym, data]) => {
    const asset = assets.find(a => a.symbol === sym);
    return acc + (data as PortfolioItem).shares * (asset?.price || 0);
  }, 0);

  const totalAUM = cash + totalPortfolioValue;

  const handleNextMonth = () => {
    if (month >= TOTAL_MONTHS) {
      setGameOver(true);
      return;
    }

    const prevAUM = totalAUM;
    
    // Evolve prices
    const newAssets = assets.map(a => {
      const change = (Math.random() - 0.5) * a.volatility * 2 + (a.trend - 1);
      const open = a.price;
      const close = Math.max(1, open * (1 + change));
      const high = Math.max(open, close) * (1 + Math.random() * a.volatility);
      const low = Math.min(open, close) * (1 - Math.random() * a.volatility);
      
      const lastDate = new Date(a.candles[a.candles.length - 1].time);
      lastDate.setMonth(lastDate.getMonth() + 1);
      const timeStr = lastDate.toISOString().split('T')[0];

      return {
        ...a,
        price: close,
        candles: [...a.candles, { time: timeStr, open, high, low, close }]
      };
    });

    setAssets(newAssets);
    
    // Calculate new total value with new prices
    const newPortfolioValue = Object.entries(portfolio).reduce((acc, [sym, data]) => {
      const asset = newAssets.find(a => a.symbol === sym);
      return acc + (data as PortfolioItem).shares * (asset?.price || 0);
    }, 0);
    
    const newAUM = cash + newPortfolioValue;
    const profit = newAUM - prevAUM;
    const roi = profit / prevAUM;

    // Hedge fund logic:
    // Take 2% management fee annually (0.16% monthly) + 20% of profit if positive
    const mgmtFee = newAUM * 0.0016;
    const perfFee = profit > 0 ? profit * 0.20 : 0;
    
    const myProfit = mgmtFee + perfFee;
    const clientProfit = profit - myProfit;

    let nextMyFunds = myFunds + myProfit;
    let nextClientFunds = clientFunds + clientProfit;

    // Rating changes based on ROI
    let newRating = rating;
    if (roi > 0.05) newRating = Math.min(5, Number((rating + 0.5).toFixed(1)));
    else if (roi > 0.01) newRating = Math.min(5, Number((rating + 0.2).toFixed(1)));
    else if (roi < -0.05) newRating = Math.max(1, Number((rating - 0.5).toFixed(1)));
    else if (roi < -0.01) newRating = Math.max(1, Number((rating - 0.2).toFixed(1)));

    // Clients joining/leaving based on rating & performance
    let clientFlow = 0;
    let newClientCount = clientCount;
    if (newRating >= 4) {
      const joins = Math.floor(Math.random() * 3) + 1;
      newClientCount += joins;
      clientFlow = joins * 5000000; // each brings 5M
    } else if (newRating <= 2) {
      const leaves = Math.floor(Math.random() * 2) + 1;
      const actualLeaves = Math.min(newClientCount, leaves);
      newClientCount -= actualLeaves;
      clientFlow = -(actualLeaves * (nextClientFunds / Math.max(1, clientCount))); // they take their share
    }

    nextClientFunds += clientFlow;
    
    // To handle cash flow, we need to add/remove cash. If we don't have enough cash, we might be forced to liquidate!
    // But for simplicity, we just adjust cash. If cash goes negative, warning.
    let nextCash = cash + clientFlow;
    let liquidationWarning = false;
    // (In a fuller version, forced liquidation should happen. Here we just allow negative cash momentarily and warn)

    setMyFunds(nextMyFunds);
    setClientFunds(nextClientFunds);
    setClientCount(newClientCount);
    setRating(newRating);
    setCash(nextCash);
    
    setMonthlyReport({
      profit,
      clientChange: clientFlow,
      ratingChange: newRating - rating,
      totalAUM: newAUM + clientFlow,
    });

    setMonth(m => m + 1);
  };

  const currentAsset = assets.find(a => a.symbol === selectedAsset);
  
  const handleBuy = () => {
    if (!currentAsset || tradeAmount <= 0) return;
    const cost = tradeAmount * currentAsset.price;
    if (cost > cash) return; // not enough cash
    
    setCash(c => c - cost);
    setPortfolio(p => ({
      ...p,
      [currentAsset.symbol]: { shares: (p[currentAsset.symbol]?.shares || 0) + tradeAmount }
    }));
    setTradeAmount(0);
  };

  const handleSell = () => {
    if (!currentAsset || tradeAmount <= 0) return;
    const currentShares = portfolio[currentAsset.symbol]?.shares || 0;
    if (tradeAmount > currentShares) return; // not enough shares
    
    const revenue = tradeAmount * currentAsset.price;
    setCash(c => c + revenue);
    setPortfolio(p => ({
      ...p,
      [currentAsset.symbol]: { shares: currentShares - tradeAmount }
    }));
    setTradeAmount(0);
  };

  const handleReset = async () => {
    setLoading(true);
    await set(ref(db, `users/${userId}/hfm_state`), null);
    
    let initialAssets = JSON.parse(JSON.stringify(INITIAL_ASSETS));
    for (let a of initialAssets) {
      let currentPrice = a.price * 0.8; 
      a.candles = [];
      const now = new Date();
      now.setMonth(now.getMonth() - 12);
      
      for (let i = 0; i < 12; i++) {
        const trend = a.trend;
        const change = (Math.random() - 0.5) * a.volatility * 2 + (trend - 1);
        const open = currentPrice;
        const close = Math.max(1, open * (1 + change));
        const high = Math.max(open, close) * (1 + Math.random() * a.volatility);
        const low = Math.min(open, close) * (1 - Math.random() * a.volatility);
        
        now.setMonth(now.getMonth() + 1);
        const timeStr = now.toISOString().split('T')[0];
        
        a.candles.push({ time: timeStr, open, high, low, close });
        currentPrice = close;
      }
      a.price = currentPrice;
    }
    
    setMonth(1);
    setGameOver(false);
    setAssets(initialAssets);
    setPortfolio({});
    setCash(INITIAL_FUNDS + INITIAL_CLIENT_FUNDS);
    setRating(3);
    setClientCount(10);
    setClientFunds(INITIAL_CLIENT_FUNDS);
    setMyFunds(INITIAL_FUNDS);
    setMonthlyReport(null);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0] flex items-center justify-center font-mono">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw size={32} className="animate-spin text-white opacity-80" />
          <p className="tracking-widest uppercase opacity-70">Načítání kampaně...</p>
        </div>
      </div>
    );
  }

  if (gameOver) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0] p-8 font-mono flex items-center justify-center">
        <div className="max-w-2xl w-full bg-[#1a1a1a] border-2 border-[#2a2b2e] p-8 text-center shadow-[12px_12px_0px_0px_rgba(255,255,255,0.05)]">
          <h1 className="text-4xl font-black italic serif uppercase mb-4 text-white hover:text-white transition-colors tracking-tighter">Konec Simulace</h1>
          <p className="text-xl mb-8 opacity-70">Zhodnocení vašeho fondu po {TOTAL_MONTHS} měsících</p>
          
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="p-4 bg-[#0a0a0a] border-2 border-[#2a2b2e]">
              <div className="text-sm opacity-50 uppercase tracking-widest font-bold">Konečné AUM</div>
              <div className="text-3xl font-black text-white">${(totalAUM / 1000000).toFixed(2)}M</div>
            </div>
            <div className="p-4 bg-[#0a0a0a] border-2 border-[#2a2b2e]">
              <div className="text-sm opacity-50 uppercase tracking-widest font-bold">Váš osobní majetek</div>
              <div className="text-3xl items-center flex justify-center text-green-400 font-black">${(myFunds / 1000000).toFixed(2)}M</div>
            </div>
          </div>
          
          <div className="flex flex-col gap-4">
            <button 
              onClick={handleReset}
              className="w-full py-4 text-black bg-white uppercase font-black tracking-widest hover:bg-gray-200 transition-all border-2 border-white hover:border-gray-200"
            >
              Resetovat kampaň
            </button>
            <button 
              onClick={onBack}
              className="w-full py-4 text-gray-400 uppercase font-black tracking-widest hover:text-white transition-all border-2 border-[#2a2b2e] hover:border-white"
            >
              Zpět do menu
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0] p-4 md:p-8 font-mono">
      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center border-b-2 border-[#2a2b2e] pb-6">
          <button onClick={onBack} className="text-gray-400 hover:text-white flex items-center gap-2 uppercase tracking-widest text-sm font-bold transition-colors">
            <ArrowLeft size={16} /> Odejít do menu
          </button>
          <div className="text-center font-black font-serif italic text-2xl uppercase tracking-tighter text-white">
            <Briefcase size={20} className="inline mr-2 -mt-1 text-white"/> 
            Hedge Fund Manager
          </div>
          <div className="text-right">
            <div className="text-[10px] opacity-70 uppercase font-bold tracking-widest text-gray-400">Měsíc</div>
            <div className="text-xl font-black">{month} <span className="opacity-50 font-normal">/ {TOTAL_MONTHS}</span></div>
          </div>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Left sidebar: Stats */}
        <div className="space-y-4">
          <div className="bg-[#1a1a1a] border-2 border-[#2a2b2e] p-6 shadow-[8px_8px_0px_0px_rgba(255,255,255,0.05)] relative overflow-hidden">
             <h3 className="text-[10px] uppercase opacity-70 mb-2 font-bold tracking-widest text-gray-400">Total AUM</h3>
             <div className="text-3xl font-black">${(totalAUM / 1000000).toFixed(2)}M</div>
             <div className="mt-2 text-xs font-bold opacity-70">Cash: ${(cash / 1000000).toFixed(2)}M</div>
          </div>

          <div className="bg-[#1a1a1a] border-2 border-[#2a2b2e] p-6 shadow-[8px_8px_0px_0px_rgba(255,255,255,0.05)] flex justify-between items-center">
             <div>
               <h3 className="text-[10px] uppercase opacity-70 mb-1 font-bold tracking-widest text-gray-400">Reputace fondu</h3>
               <div className="flex items-center gap-1 text-yellow-500">
                 {Array.from({length: 5}).map((_, i) => (
                   <Star key={i} size={16} fill={i < Math.floor(rating) ? "currentColor" : "transparent"} />
                 ))}
                 <span className="text-white ml-2 text-sm">{rating.toFixed(1)}</span>
               </div>
             </div>
             <div className="text-right">
               <h3 className="text-[10px] uppercase opacity-50 mb-1">Klienti</h3>
               <div className="text-xl font-bold flex items-center justify-end gap-2"><Users size={16}/> {clientCount}</div>
             </div>
          </div>

          {monthlyReport && (
            <div className={`p-6 border-2 ${monthlyReport.profit >= 0 ? 'border-green-900 bg-green-900/10 shadow-[8px_8px_0px_0px_rgba(34,197,94,0.1)]' : 'border-red-900 bg-red-900/10 shadow-[8px_8px_0px_0px_rgba(239,68,68,0.1)]'}`}>
              <h3 className="text-[10px] uppercase tracking-widest font-bold opacity-70 mb-2">Výsledky minulého měsíce</h3>
              <div className={`text-xl font-black ${monthlyReport.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {monthlyReport.profit >= 0 ? '+' : ''}${(monthlyReport.profit / 1000).toFixed(1)}k
              </div>
              {monthlyReport.clientChange !== 0 && (
                <div className="text-xs mt-2 font-bold opacity-70">
                  Přítok/Odtok: {(monthlyReport.clientChange / 1000000).toFixed(1)}M
                </div>
              )}
            </div>
          )}

          <div className="bg-[#1a1a1a] border-2 border-[#2a2b2e] p-6 shadow-[8px_8px_0px_0px_rgba(255,255,255,0.05)]">
             <h3 className="text-[10px] uppercase opacity-70 tracking-widest font-bold mb-4">Portfolio</h3>
             <div className="space-y-2">
               {Object.entries(portfolio).map(([sym, data]) => {
                 const pData = data as PortfolioItem;
                 if (pData.shares === 0) return null;
                 const asset = assets.find(a => a.symbol === sym);
                 const val = pData.shares * (asset?.price || 0);
                 return (
                   <div key={sym} className="flex justify-between items-center text-sm border-b border-[#2a2b2e] pb-1">
                     <span>{sym} <span className="opacity-50 text-xs">x{pData.shares}</span></span>
                     <span>${(val / 1000).toFixed(1)}k</span>
                   </div>
                 )
               })}
             </div>
          </div>
          
          <div className="flex flex-col gap-2">
            <button 
              onClick={handleNextMonth}
              className="w-full bg-white text-black font-black uppercase tracking-widest py-4 border-2 border-white hover:bg-gray-200 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <Play size={16}/> Další Měsíc
            </button>
            <button 
              onClick={() => {
                if(window.confirm('Opravdu chcete zrušit progres a začít znovu?')) {
                  handleReset();
                }
              }}
              className="w-full text-xs text-gray-500 hover:text-red-400 font-bold uppercase tracking-widest py-2 transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw size={12}/> Reset Kampaň
            </button>
          </div>
        </div>

        {/* Main Content: Trading */}
        <div className="lg:col-span-3 space-y-6">
          <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
            {assets.map(a => (
              <button
                key={a.symbol}
                onClick={() => setSelectedAsset(a.symbol)}
                className={`px-6 py-3 border-2 ${selectedAsset === a.symbol ? 'border-white bg-[#1a1a1a] text-white shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)]' : 'border-[#2a2b2e] bg-[#0a0a0a] text-gray-500 hover:border-gray-500'} flex flex-col items-center min-w-[120px] transition-all font-mono`}
              >
                <div className="font-black text-lg uppercase tracking-wider">{a.symbol}</div>
                <div className="text-xs font-bold opacity-80">${a.price.toFixed(2)}</div>
              </button>
            ))}
          </div>

          <div className="bg-[#1a1a1a] border-2 border-[#2a2b2e] p-6 h-[400px] shadow-[8px_8px_0px_0px_rgba(255,255,255,0.05)] flex flex-col">
             {/* Chart container */}
             <div className="flex justify-between items-center mb-4">
               <div>
                 <h2 className="font-black text-xl">{currentAsset?.name} <span className="opacity-50">({currentAsset?.symbol})</span></h2>
                 <div className="text-[10px] text-gray-500 tracking-widest uppercase mt-1 font-bold">TradingView API live charts</div>
               </div>
             </div>
             <div ref={chartContainerRef} className="w-full flex-1" />
          </div>

          {currentAsset && (
            <div className="bg-[#1a1a1a] border-2 border-[#2a2b2e] p-6 flex flex-col sm:flex-row items-end gap-6 shadow-[8px_8px_0px_0px_rgba(255,255,255,0.05)]">
              <div className="flex-1 w-full space-y-2">
                <label className="text-[10px] uppercase font-bold tracking-widest opacity-70">Objem pro obchod</label>
                <div className="flex bg-[#0a0a0a] border-2 border-[#2a2b2e] focus-within:border-white transition-colors items-center">
                  <span className="px-4 border-r-2 border-[#2a2b2e] text-gray-500 font-bold uppercase tracking-widest text-[10px]">Množství</span>
                  <input 
                    type="number" 
                    value={tradeAmount === 0 ? '' : tradeAmount}
                    onChange={(e) => setTradeAmount(parseInt(e.target.value) || 0)}
                    className="w-full bg-transparent p-4 text-white font-black tracking-wider outline-none text-right placeholder-gray-800"
                    placeholder="0"
                  />
                </div>
                <div className="text-xs font-bold opacity-70 flex justify-between uppercase tracking-widest">
                  <span>Hodnota obchodu:</span>
                  <span className="text-white">${(tradeAmount * currentAsset.price).toFixed(2)}</span>
                </div>
              </div>
              <div className="flex gap-4 w-full sm:w-auto">
                <button 
                  onClick={handleBuy}
                  disabled={tradeAmount <= 0 || tradeAmount * currentAsset.price > cash}
                  className="flex-1 sm:w-40 bg-green-900 border-2 border-green-500 py-4 font-black uppercase tracking-widest text-green-100 disabled:opacity-50 hover:bg-green-800 transition-colors active:scale-95 text-lg"
                >
                  Nakoupit
                </button>
                <button 
                  onClick={handleSell}
                  disabled={tradeAmount <= 0 || tradeAmount > ((portfolio[currentAsset.symbol] as PortfolioItem)?.shares || 0)}
                  className="flex-1 sm:w-40 bg-red-900 border-2 border-red-500 py-4 font-black uppercase tracking-widest text-red-100 disabled:opacity-50 hover:bg-red-800 transition-colors active:scale-95 text-lg"
                >
                  Prodat
                </button>
              </div>
            </div>
          )}

        </div>

      </div>
      </div>
    </div>
  )
}
