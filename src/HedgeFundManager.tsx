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

interface FundClient {
  id: string;
  name: string;
  funds: number;
  type: 'Konzervativní' | 'Vyvážený' | 'Agresivní' | 'Velryba';
  happiness: number; // 0-100
  monthsWithFund: number;
}

const FIRST_NAMES = ['James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas'];

const generateClient = (): FundClient => {
  const typeRand = Math.random();
  let type: FundClient['type'] = 'Vyvážený';
  let funds = 100000 + Math.random() * 900000; // 100k - 1M
  
  if (typeRand > 0.9) {
    type = 'Velryba';
    funds = 5000000 + Math.random() * 15000000; // 5M - 20M
  } else if (typeRand > 0.6) {
    type = 'Agresivní';
  } else if (typeRand > 0.3) {
    type = 'Konzervativní';
  }

  return {
    id: Math.random().toString(36).substring(2, 9),
    name: `${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]}`,
    funds,
    type,
    happiness: 50 + Math.random() * 30, // 50 - 80
    monthsWithFund: 0
  };
};

const generateInitialClients = (targetTotal: number): FundClient[] => {
  const clients: FundClient[] = [];
  let currentTotal = 0;
  while (currentTotal < targetTotal) {
    const c = generateClient();
    clients.push(c);
    currentTotal += c.funds;
  }
  return clients;
};

const INITIAL_FUNDS = 10000000; // 10 million your money
const INITIAL_CLIENT_FUNDS = 40000000; // 40 million client money
const TOTAL_MONTHS = 36; // 3 years

const ALL_AVAILABLE_ASSETS: Omit<Asset, 'history' | 'candles'>[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', price: 150, volatility: 0.08, trend: 1.02 },
  { symbol: 'NVDA', name: 'Nvidia Corp.', price: 120, volatility: 0.15, trend: 1.05 },
  { symbol: 'MSFT', name: 'Microsoft Corp.', price: 250, volatility: 0.07, trend: 1.02 },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 130, volatility: 0.09, trend: 1.02 },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', price: 100, volatility: 0.10, trend: 1.01 },
  { symbol: 'TSLA', name: 'Tesla Inc.', price: 200, volatility: 0.18, trend: 1.03 },
  { symbol: 'META', name: 'Meta Platforms Inc.', price: 180, volatility: 0.12, trend: 1.01 },
  { symbol: 'WMT', name: 'Walmart Inc.', price: 60, volatility: 0.04, trend: 1.00 },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', price: 140, volatility: 0.05, trend: 1.00 },
  { symbol: 'V', name: 'Visa Inc.', price: 200, volatility: 0.06, trend: 1.01 },
  { symbol: 'PG', name: 'Procter & Gamble Co.', price: 150, volatility: 0.04, trend: 1.00 },
  { symbol: 'JNJ', name: 'Johnson & Johnson', price: 160, volatility: 0.03, trend: 1.00 },
  { symbol: 'XOM', name: 'Exxon Mobil Corp.', price: 110, volatility: 0.08, trend: 1.01 },
  { symbol: 'BAC', name: 'Bank of America Corp.', price: 30, volatility: 0.06, trend: 1.00 },
  { symbol: 'MA', name: 'Mastercard Inc.', price: 350, volatility: 0.06, trend: 1.01 },
  { symbol: 'HD', name: 'The Home Depot Inc.', price: 300, volatility: 0.07, trend: 1.01 },
  { symbol: 'CVX', name: 'Chevron Corp.', price: 150, volatility: 0.08, trend: 1.01 },
  { symbol: 'ABBV', name: 'AbbVie Inc.', price: 140, volatility: 0.06, trend: 1.00 },
  { symbol: 'LLY', name: 'Eli Lilly and Co.', price: 300, volatility: 0.09, trend: 1.02 },
  { symbol: 'PEP', name: 'PepsiCo Inc.', price: 180, volatility: 0.04, trend: 1.00 },
];

const INITIAL_ASSETS: Asset[] = [];


export default function HedgeFundManager({ onBack, userId }: { onBack: () => void, userId: string }) {
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [portfolio, setPortfolio] = useState<Record<string, { shares: number }>>({});
  const [cash, setCash] = useState(INITIAL_FUNDS + INITIAL_CLIENT_FUNDS);
  
  const [rating, setRating] = useState(3); // 1 to 5 stars
  const [clients, setClients] = useState<FundClient[]>([]);
  const [myFunds, setMyFunds] = useState(INITIAL_FUNDS);
  
  const clientFunds = clients.reduce((acc, c) => acc + c.funds, 0);
  
  const [selectedAsset, setSelectedAsset] = useState<string>('AAPL');
  const [tradeAmount, setTradeAmount] = useState<number>(0);
  const [monthlyReport, setMonthlyReport] = useState<{ profit: number; clientChange: number; ratingChange: number; totalAUM: number } | null>(null);

  const [showAssetSelector, setShowAssetSelector] = useState(false);
  const [showClientsMenu, setShowClientsMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const handleAddAsset = (tmpl: Omit<Asset, 'history' | 'candles'>) => {
    if (assets.length >= 10) return;
    if (assets.some(a => a.symbol === tmpl.symbol)) return;

    let newAsset: Asset = { ...tmpl, history: [], candles: [] };
    let currentPrice = newAsset.price * 0.8;
    const now = new Date();
    // Use `month` offset if not starting from month 1, but approximate history is OK
    now.setMonth(now.getMonth() - 12);
    
    for (let i = 0; i < 12; i++) {
        const trend = newAsset.trend;
        const change = (Math.random() - 0.5) * newAsset.volatility * 2 + (trend - 1);
        const open = currentPrice;
        const close = Math.max(1, open * (1 + change));
        const high = Math.max(open, close) * (1 + Math.random() * newAsset.volatility);
        const low = Math.min(open, close) * (1 - Math.random() * newAsset.volatility);
        
        now.setMonth(now.getMonth() + 1);
        const timeStr = now.toISOString().split('T')[0];
        
        newAsset.candles.push({ time: timeStr, open, high, low, close });
        currentPrice = close;
    }
    newAsset.price = currentPrice;

    setAssets([...assets, newAsset]);
    setSelectedAsset(newAsset.symbol);
    setShowAssetSelector(false);
    setSearchQuery('');
  };

  // Initialize game
  useEffect(() => {
    const loadGame = async () => {
      try {
        const snap = await get(ref(db, `users/${userId}/hfm_state`));
        if (snap.exists()) {
          const data = snap.val();
          setMonth(data.month);
          setGameOver(data.gameOver);
          setAssets(data.assets || []);
          setPortfolio(data.portfolio || {});
          setCash(data.cash);
          setRating(data.rating);
          setClients(data.clients || generateInitialClients(INITIAL_CLIENT_FUNDS));
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
      setClients(generateInitialClients(INITIAL_CLIENT_FUNDS));
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
      clients,
      myFunds,
      monthlyReport
    };
    
    set(ref(db, `users/${userId}/hfm_state`), stateObj).catch(e => console.error("Failed to save state", e));
  }, [month, gameOver, assets, portfolio, cash, rating, clients, myFunds, monthlyReport, userId, loading]);

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
    // Apply to individual clients
    
    let totalManagementFee = 0;
    
    let activeClients = clients.map(c => {
      const cRatio = c.funds / prevAUM;
      const cProfitRaw = profit * cRatio;
      
      const mgmtFee = c.funds * 0.0016; // monthly management fee
      const perfFee = cProfitRaw > 0 ? cProfitRaw * 0.20 : 0;
      const totalFees = mgmtFee + perfFee;
      
      totalManagementFee += totalFees;
      
      const actualProfit = cProfitRaw - totalFees;
      
      // Update happiness based on return %
      const returnPct = cProfitRaw / c.funds;
      let targetHappiness = c.happiness;
      
      if (c.type === 'Konzervativní') {
          if (returnPct > 0.02) targetHappiness += 5;
          else if (returnPct > 0) targetHappiness += 2;
          else if (returnPct < -0.02) targetHappiness -= 15; // Hate losses
          else if (returnPct < 0) targetHappiness -= 5;
      } else if (c.type === 'Agresivní' || c.type === 'Velryba') {
          if (returnPct > 0.10) targetHappiness += 15;
          else if (returnPct > 0.05) targetHappiness += 5;
          else if (returnPct < -0.10) targetHappiness -= 5; // More tolerant to big losses
          else if (returnPct < 0) targetHappiness -= 2;
          else targetHappiness -= 5; // Unhappy if profit is small!
      } else { // Vyvážený
          if (returnPct > 0.05) targetHappiness += 10;
          else if (returnPct > 0) targetHappiness += 2;
          else if (returnPct < -0.05) targetHappiness -= 15;
          else if (returnPct < 0) targetHappiness -= 5;
      }
      
      return {
        ...c,
        funds: c.funds + actualProfit,
        monthsWithFund: c.monthsWithFund + 1,
        happiness: Math.max(0, Math.min(100, targetHappiness))
      };
    });

    // Rating changes based on ROI
    let newRating = rating;
    if (roi > 0.05) newRating = Math.min(5, Number((rating + 0.5).toFixed(1)));
    else if (roi > 0.01) newRating = Math.min(5, Number((rating + 0.2).toFixed(1)));
    else if (roi < -0.05) newRating = Math.max(1, Number((rating - 0.5).toFixed(1)));
    else if (roi < -0.01) newRating = Math.max(1, Number((rating - 0.2).toFixed(1)));

    // Clients joining/leaving based on happiness and rating
    let clientFlow = 0;
    
    // Unhappy clients leave
    const remainingClients = activeClients.filter(c => {
       if (c.happiness < 20 && Math.random() < 0.7) {
           clientFlow -= c.funds; // money leaves
           return false;
       }
       return true;
    });
    
    // New clients join based on rating
    if (newRating >= 4 && Math.random() < 0.6) {
       const joins = Math.floor(Math.random() * 2) + 1;
       for (let i = 0; i < joins; i++) {
           const newC = generateClient();
           remainingClients.push(newC);
           clientFlow += newC.funds;
       }
    } else if (newRating >= 3 && Math.random() < 0.3) {
       const newC = generateClient();
       remainingClients.push(newC);
       clientFlow += newC.funds;
    }

    // My funds
    const myRatio = myFunds / prevAUM;
    const myProfitRaw = profit * myRatio;
    let nextMyFunds = myFunds + myProfitRaw + totalManagementFee;
    
    let nextCash = cash + clientFlow;
    let liquidationWarning = false;
    // (In a fuller version, forced liquidation should happen. Here we just allow negative cash momentarily and warn)

    setMyFunds(nextMyFunds);
    setClients(remainingClients);
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
    setClients(generateInitialClients(INITIAL_CLIENT_FUNDS));
    setCash(INITIAL_FUNDS + INITIAL_CLIENT_FUNDS);
    setRating(3);
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
          <div className="text-center font-black font-serif italic text-2xl uppercase tracking-tighter text-white flex justify-center items-center gap-3">
            <Briefcase size={20} className="inline -mt-1 text-white"/> 
            Hedge Fund Manager
            <span className="bg-yellow-500 text-black text-[10px] font-black px-2 py-1 rounded-sm not-italic tracking-widest relative -top-2">BETA</span>
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

          <div className="bg-[#1a1a1a] border-2 border-[#2a2b2e] p-6 shadow-[8px_8px_0px_0px_rgba(255,255,255,0.05)] flex justify-between items-center cursor-pointer hover:border-white transition-colors" onClick={() => setShowClientsMenu(true)}>
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
               <div className="text-xl font-bold flex items-center justify-end gap-2"><Users size={16}/> {clients.length}</div>
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
          <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar border-b-2 border-[#1a1a1a]">
            {assets.map(a => (
              <button
                key={a.symbol}
                onClick={() => setSelectedAsset(a.symbol)}
                className={`px-6 py-3 border-2 ${selectedAsset === a.symbol ? 'border-white bg-[#1a1a1a] text-white shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)]' : 'border-[#2a2b2e] bg-[#0a0a0a] text-gray-500 hover:border-gray-500'} flex flex-col items-center min-w-[120px] transition-all font-mono shrink-0`}
              >
                <div className="font-black text-lg uppercase tracking-wider">{a.symbol}</div>
                <div className="text-xs font-bold opacity-80">${a.price.toFixed(2)}</div>
              </button>
            ))}
            {assets.length < 10 && (
              <button 
                onClick={() => setShowAssetSelector(true)}
                className="px-6 py-3 border-2 border-dashed border-[#2a2b2e] bg-transparent text-gray-500 hover:text-white hover:border-white flex flex-col items-center justify-center min-w-[120px] transition-all font-mono shrink-0"
              >
                <span className="font-black text-2xl leading-none">+</span>
                <span className="text-[10px] uppercase tracking-widest font-bold mt-1">Přidat Akcii</span>
              </button>
            )}
          </div>
          
          {showAssetSelector && (
            <div className="bg-[#1a1a1a] border-2 border-[#2a2b2e] p-6 shadow-[8px_8px_0px_0px_rgba(255,255,255,0.05)] mb-6 animate-in slide-in-from-top-4 fade-in">
              <div className="flex justify-between items-center mb-4">
                 <h3 className="text-lg font-black uppercase tracking-widest text-white">Přidat aktivum do portfolia ({assets.length}/10)</h3>
                 <button onClick={() => setShowAssetSelector(false)} className="text-gray-500 hover:text-white text-sm font-bold uppercase tracking-widest">
                   Zavřít
                 </button>
              </div>
              <input 
                type="text" 
                placeholder="Hledat akciový symbol (např. TSLA, MSFT)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-[#0a0a0a] border-2 border-[#2a2b2e] p-4 text-white font-bold tracking-wider outline-none focus:border-white mb-4 placeholder-gray-700"
              />
              <div className="max-h-60 overflow-y-auto custom-scrollbar flex flex-col gap-2">
                {ALL_AVAILABLE_ASSETS.filter(a => !assets.some(existing => existing.symbol === a.symbol) && (a.symbol.toLowerCase().includes(searchQuery.toLowerCase()) || a.name.toLowerCase().includes(searchQuery.toLowerCase()))).slice(0, 10).map(asset => (
                  <button 
                    key={asset.symbol}
                    onClick={() => handleAddAsset(asset)}
                    className="flex justify-between items-center p-3 border-2 border-[#2a2b2e] hover:border-white bg-[#0a0a0a] text-left transition-colors"
                  >
                     <div>
                       <div className="font-black text-lg text-white">{asset.symbol}</div>
                       <div className="text-xs text-gray-500 font-bold">{asset.name}</div>
                     </div>
                     <div className="text-right">
                       <span className="text-sm font-bold opacity-80">${asset.price.toFixed(2)}</span>
                       <div className="text-[10px] uppercase font-bold text-gray-600 mt-1">Přidat +</div>
                     </div>
                  </button>
                ))}
                {searchQuery && !ALL_AVAILABLE_ASSETS.some(a => a.symbol.toLowerCase() === searchQuery.toLowerCase()) && (
                  <button 
                    onClick={() => handleAddAsset({ symbol: searchQuery.toUpperCase().substring(0, 5), name: `${searchQuery.toUpperCase()} Corp`, price: 10 + Math.random() * 200, volatility: 0.1, trend: 1.01 })}
                    className="flex justify-between items-center p-3 border-2 border-dashed border-[#2a2b2e] hover:border-white bg-[#0a0a0a] text-left transition-colors"
                  >
                     <div>
                       <div className="font-black text-lg text-white">{searchQuery.toUpperCase().substring(0, 5)}</div>
                       <div className="text-xs text-gray-500 font-bold">Mock Asset / Neznámý ticker</div>
                     </div>
                     <div className="text-right">
                       <div className="text-[10px] uppercase font-bold text-gray-600 mt-1">Simulovat +</div>
                     </div>
                  </button>
                )}
              </div>
            </div>
          )}

          {currentAsset ? (
            <div className="bg-[#1a1a1a] border-2 border-[#2a2b2e] p-6 h-[400px] shadow-[8px_8px_0px_0px_rgba(255,255,255,0.05)] flex flex-col">
               {/* Chart container */}
               <div className="flex justify-between items-start mb-4">
                 <div>
                   <h2 className="font-black text-xl">{currentAsset.name} <span className="opacity-50">({currentAsset.symbol})</span></h2>
                   <div className="text-[10px] text-gray-500 tracking-widest uppercase mt-1 font-bold">TradingView API live charts</div>
                 </div>
                 {(!portfolio[currentAsset.symbol] || portfolio[currentAsset.symbol].shares === 0) && (
                   <button 
                     onClick={() => {
                       const newAssets = assets.filter(a => a.symbol !== currentAsset.symbol);
                       setAssets(newAssets);
                       if (newAssets.length > 0) {
                         setSelectedAsset(newAssets[0].symbol);
                       } else {
                         setSelectedAsset('');
                       }
                     }}
                     className="text-xs text-red-500 hover:text-red-400 font-bold uppercase tracking-widest transition-colors border border-red-900 bg-red-950/30 px-3 py-1 rounded-sm"
                   >
                     Odstranit
                   </button>
                 )}
               </div>
               <div ref={chartContainerRef} className="w-full flex-1" />
            </div>
          ) : (
            <div className="bg-[#1a1a1a] border-2 border-[#2a2b2e] p-6 h-[400px] shadow-[8px_8px_0px_0px_rgba(255,255,255,0.05)] flex flex-col items-center justify-center text-center">
              <Activity size={48} className="text-[#2a2b2e] mb-4" />
              <h2 className="font-black text-xl text-gray-500">Žádná aktiva ke zobrazení</h2>
              <p className="text-sm font-bold opacity-50 max-w-sm mt-2">Přidejte akciové tituly pro sledování grafů a obchodování.</p>
            </div>
          )}

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

      {showClientsMenu && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#1a1a1a] border-2 border-[#2a2b2e] w-full max-w-4xl max-h-[85vh] flex flex-col shadow-[16px_16px_0px_0px_rgba(255,255,255,0.05)]">
            <div className="flex justify-between items-center p-6 border-b-2 border-[#2a2b2e]">
              <div>
                <h2 className="text-2xl font-black italic serif uppercase tracking-tighter text-white">Správa Klientů</h2>
                <div className="text-xs uppercase font-bold tracking-widest opacity-70 mt-1">
                  Celkem: {clients.length} / Spravovaný kapitál: ${(clientFunds / 1000000).toFixed(2)}M
                </div>
              </div>
              <button onClick={() => setShowClientsMenu(false)} className="text-gray-500 hover:text-white font-bold uppercase tracking-widest text-sm transition-colors border-2 border-transparent hover:border-white p-2">
                Zavřít
              </button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
              <div className="mb-6 p-4 border-2 border-[#2a2b2e] bg-[#0a0a0a] text-sm opacity-80 leading-relaxed font-bold">
                * Konvezrativní klienti nesnáší ztráty, ale nepotřebují velké zisky.<br/>
                * Agresivní klienti a Velryby naopat vyžadují vysoké měsíční zhodnocení, jinak je ani malý zisk nepotěší, ale jsou tolerantnější k propadům.
              </div>
              {clients.length === 0 ? (
                <div className="text-center py-12 opacity-50">
                  <Users size={48} className="mx-auto mb-4" />
                  <p className="font-bold tracking-widest uppercase">Žádní klienti</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {clients.map(c => (
                    <div key={c.id} className="border-2 border-[#2a2b2e] bg-[#0a0a0a] p-4 flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-black text-lg text-white">{c.name}</div>
                          <div className="text-[10px] font-bold uppercase tracking-widest opacity-70 text-yellow-500">{c.type}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-green-400">${(c.funds / 1000000).toFixed(2)}M</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest opacity-80 pt-2 border-t border-[#2a2b2e]">
                        <div className="flex-1">
                          <div className="mb-1">Spokojenost: {Math.round(c.happiness)}%</div>
                          <div className="w-full h-1 bg-[#2a2b2e]">
                            <div className={`h-full ${c.happiness > 70 ? 'bg-green-500' : c.happiness > 30 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${c.happiness}%` }}></div>
                          </div>
                        </div>
                        <div>
                          Měsíců: {c.monthsWithFund}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
