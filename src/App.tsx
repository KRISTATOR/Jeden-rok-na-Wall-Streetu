import React, { useState, useEffect, useMemo } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User 
} from 'firebase/auth';
import { 
  ref, 
  onValue, 
  set, 
  update, 
  get, 
  push,
  remove, 
  increment, 
  serverTimestamp, 
  query,
  orderByChild
} from 'firebase/database';
import { auth, db } from './lib/firebase';
import { 
  GameState, 
  UserPortfolio, 
  StockPrices,
  Room,
  CandleData,
  Trade
} from './types';
import { cn } from './lib/utils';
import { 
  TrendingUp, 
  TrendingDown, 
  LogOut, 
  LogIn, 
  ChevronRight, 
  ShieldAlert,
  Wallet,
  Briefcase,
  History,
  AlertCircle,
  Trophy,
  RefreshCw,
  Maximize2,
  Minimize2,
  Plus,
  Users,
  ArrowLeft,
  Info,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import { useRef } from 'react';

import { 
  PRICE_IMPACT, 
  MARKET_SCHEDULE, 
  MONTH_NAMES, 
  INITIAL_CAPITAL_MIN, 
  INITIAL_CAPITAL_MAX, 
  PASSIVE_FUND_RETURN, 
  TRADING_FEE,
  ADMINS
} from './constants';

function InfoTooltip({ content }: { content: string }) {
  const [isVisible, setIsVisible] = useState(false);
  
  return (
    <span className="relative inline-block ml-1 align-middle" onClick={(e) => e.stopPropagation()}>
      <span
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onClick={() => setIsVisible(!isVisible)}
        className="text-gray-500 hover:text-white transition-colors cursor-help inline-flex items-center"
      >
        <Info size={14} />
      </span>
      <AnimatePresence>
        {isVisible && (
            <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 p-2 bg-[#131722] border border-white/10 rounded shadow-2xl z-50 pointer-events-none"
          >
            <p className="text-[10px] text-gray-300 leading-tight font-sans whitespace-normal text-center">
              {content}
            </p>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-8 border-transparent border-b-[#131722]" />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

interface StockChartProps {
  ticker: keyof StockPrices;
  currentMonth: number;
  history: { [ticker: string]: CandleData[] };
  currentPrice: number;
  height?: string;
  isFocusMode?: boolean;
  trades?: Trade[];
  timeLeft?: number;
}

function StockChart({ ticker, currentMonth, history, currentPrice, height = "h-80", isFocusMode = false, trades = [], timeLeft }: StockChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);

  const data = useMemo(() => {
    const tickerHistory = [...(history[ticker] || [])].sort((a, b) => a.time - b.time);
    const tickerTrades = trades.filter(t => t.ticker === ticker);

    const baseData = [...tickerHistory];
    const lastHistoryCandle = baseData[baseData.length - 1];
    
    // Get trades since last history candle
    const liveTrades = tickerTrades
      .filter(t => t.time > (lastHistoryCandle?.time || 0))
      .sort((a, b) => a.time - b.time);

    const lastPrice = lastHistoryCandle ? lastHistoryCandle.close : (liveTrades.length > 0 ? liveTrades[0].price : currentPrice);

    // Aggregate all activity since last history candle into a single "live" candle
    const now = Date.now();
    const lastTime = lastHistoryCandle ? lastHistoryCandle.time : 0;
    const liveTime = Math.max(lastTime + 1000, now);
    
    const tradePrices = liveTrades.map(t => t.price);
    const allPrices = [lastPrice, currentPrice, ...tradePrices];
    
    baseData.push({
      time: liveTime,
      open: lastPrice,
      high: Math.max(...allPrices),
      low: Math.min(...allPrices),
      close: currentPrice
    });

    // Aggregate candles by second to prevent lightweight-charts errors
    const deduplicated: CandleData[] = [];
    const candlesBySecond = new Map<number, CandleData[]>();
    
    // Sort by time to ensure order
    baseData.sort((a, b) => a.time - b.time);

    // Group by second
    baseData.forEach(candle => {
      const second = Math.floor(candle.time / 1000);
      if (!candlesBySecond.has(second)) {
        candlesBySecond.set(second, []);
      }
      candlesBySecond.get(second)!.push(candle);
    });

    // Aggregate each second
    Array.from(candlesBySecond.entries()).sort(([a], [b]) => a - b).forEach(([second, candles]) => {
      if (candles.length === 1) {
        deduplicated.push(candles[0]);
      } else {
        const first = candles[0];
        const last = candles[candles.length - 1];
        const high = Math.max(...candles.map(c => c.high));
        const low = Math.min(...candles.map(c => c.low));
        deduplicated.push({
          time: last.time, // Use the latest time in that second
          open: first.open,
          high,
          low,
          close: last.close
        });
      }
    });

    if (deduplicated.length === 1) {
      const dummy: CandleData = {
        ...deduplicated[0],
        time: deduplicated[0].time - 60000,
      };
      deduplicated.unshift(dummy);
    }

    return deduplicated.map((c) => {
      // Find trades that happened within this candle's timeframe (3s window)
      const trade = tickerTrades.find(t => Math.abs(t.time - c.time) < 3000);
      return {
        ...c,
        open: Number(c.open.toFixed(2)),
        high: Number(c.high.toFixed(2)),
        low: Number(c.low.toFixed(2)),
        close: Number(c.close.toFixed(2)),
        trade: trade ? {
          type: trade.amount > 0 ? 'BUY' : 'SELL',
          amount: Math.abs(trade.amount),
          price: trade.price
        } : null
      };
    });
  }, [ticker, history, trades, currentPrice]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#050505' },
        textColor: '#d1d4dc',
        fontFamily: 'JetBrains Mono, monospace',
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.3)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.3)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          width: 1,
          color: 'rgba(224, 227, 235, 0.1)',
          style: 3, // Dashed
          labelBackgroundColor: '#131722',
        },
        horzLine: {
          width: 1,
          color: 'rgba(224, 227, 235, 0.1)',
          style: 3, // Dashed
          labelBackgroundColor: '#131722',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(197, 203, 206, 0.1)',
        visible: true,
        autoScale: true,
        alignLabels: true,
        scaleMargins: {
          top: 0.2,
          bottom: 0.2,
        },
      },
      timeScale: {
        borderColor: 'rgba(197, 203, 206, 0.1)',
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 12,
      },
      handleScroll: true,
      handleScale: true,
    });

    // Add Watermark
    (chart as any).applyOptions({
      watermark: {
        visible: true,
        fontSize: isFocusMode ? 48 : 24,
        horzAlign: 'center',
        vertAlign: 'center',
        color: 'rgba(255, 255, 255, 0.03)',
        text: ticker,
      },
    });

    let series: any;
    let volumeSeries: any;
    
    series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e', // Bright green
      downColor: '#ef4444', // Red
      borderVisible: true,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      priceLineVisible: true,
      priceLineWidth: 1,
      priceLineColor: '#d1d4dc',
      priceLineStyle: 3, // Dashed
      lastValueVisible: true,
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });
    
    volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume', // Use a separate scale ID for volume
    });
    
    // Configure the volume scale to be at the bottom
    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.8, // Volume at the bottom 20%
        bottom: 0,
      },
      visible: false, // Hide the volume scale axis
    });

    chartRef.current = chart;
    seriesRef.current = series;
    (chartRef.current as any).volumeSeries = volumeSeries;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        requestAnimationFrame(() => {
          if (chartContainerRef.current && chartRef.current) {
            chartRef.current.applyOptions({
              width: chartContainerRef.current.clientWidth,
              height: chartContainerRef.current.clientHeight,
            });
          }
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions({
        watermark: {
          text: ticker,
          fontSize: isFocusMode ? 48 : 24,
        },
      });
    }
  }, [ticker, isFocusMode]);

  useEffect(() => {
    if (!seriesRef.current || !data.length) return;

    const formattedData = data.map(d => ({
      time: (Math.floor(d.time / 1000)) as any,
      open: Number(d.open.toFixed(2)),
      high: Number(d.high.toFixed(2)),
      low: Number(d.low.toFixed(2)),
      close: Number(d.close.toFixed(2)),
    }));

    seriesRef.current.setData(formattedData);

    if ((chartRef.current as any).volumeSeries) {
      const volumeData = data.map(d => ({
        time: (Math.floor(d.time / 1000)) as any,
        value: Math.abs(d.close - d.open) * 1000 + Math.random() * 500,
        color: d.close >= d.open ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)',
      }));
      (chartRef.current as any).volumeSeries.setData(volumeData);
    }

    const markers = data
      .filter(d => d.trade)
      .map(d => ({
        time: (Math.floor(d.time / 1000)) as any,
        position: d.trade!.type === 'BUY' ? 'belowBar' : 'aboveBar',
        color: d.trade!.type === 'BUY' ? '#22c55e' : '#ef4444',
        shape: d.trade!.type === 'BUY' ? 'arrowUp' : 'arrowDown',
        text: d.trade!.type === 'BUY' ? 'BUY' : 'SELL',
        size: 1,
      }));

    if (seriesRef.current && typeof seriesRef.current.setMarkers === 'function') {
      seriesRef.current.setMarkers(markers);
    }
    
    // Only fit content on first load or ticker change to allow zooming
    if (chartRef.current && !chartRef.current._hasInitialFit) {
      chartRef.current.timeScale().fitContent();
      chartRef.current._hasInitialFit = ticker;
    } else if (chartRef.current && chartRef.current._hasInitialFit !== ticker) {
      chartRef.current.timeScale().fitContent();
      chartRef.current._hasInitialFit = ticker;
    }

    // If we are at the right edge, keep scrolling to the right
    if (chartRef.current) {
      const timeScale = chartRef.current.timeScale();
      const visibleRange = timeScale.getVisibleRange();
      if (visibleRange) {
        const lastDataTime = formattedData[formattedData.length - 1].time;
        if (visibleRange.to >= lastDataTime - 5) { // Within 5 bars of the end
          timeScale.scrollToPosition(0, true);
        }
      }
    }
  }, [data, ticker]);

  const lastIsUp = data[data.length - 1]?.close >= data[data.length - 1]?.open;

  // Simulated Technical Analysis based on last 5 candles
  const technicalAnalysis = useMemo(() => {
    if (data.length < 5) return 'NEUTRÁLNÍ';
    const last5 = data.slice(-5);
    const upCount = last5.filter(d => d.close > d.open).length;
    if (upCount >= 4) return 'SILNÝ NÁKUP';
    if (upCount >= 3) return 'NÁKUP';
    if (upCount <= 1) return 'SILNÝ PRODEJ';
    if (upCount <= 2) return 'PRODEJ';
    return 'NEUTRÁLNÍ';
  }, [data]);

  const analysisColor = useMemo(() => {
    if (technicalAnalysis.includes('NÁKUP')) return 'text-[#22c55e]';
    if (technicalAnalysis.includes('PRODEJ')) return 'text-[#ef4444]';
    return 'text-gray-400';
  }, [technicalAnalysis]);

  return (
    <div className={cn(height, "w-full bg-[#050505] rounded-none border border-[#1a1a1a] shadow-2xl relative overflow-hidden font-mono")}>
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="flex items-center gap-2 bg-[#131722] p-1 px-2 border border-white/10 rounded-sm">
            <div className={cn("w-2 h-2 rounded-full animate-pulse", lastIsUp ? "bg-[#22c55e]" : "bg-[#ef4444]")} />
            <span className="text-[10px] text-gray-300 uppercase tracking-[0.1em] font-bold">LIVE</span>
            <InfoTooltip content="Zobrazuje aktuální tržní data v reálném čase." />
          </div>
          <div className="text-[10px] text-white font-bold bg-[#131722] p-1 px-2 border border-white/10 rounded-sm uppercase tracking-wider flex items-center">
            {ticker} <span className="text-gray-500 ml-1">USD</span>
            <InfoTooltip content="Symbol akcie (např. AAPL pro Apple)." />
          </div>
          {isFocusMode && timeLeft !== undefined && (
            <div className="text-[10px] text-white font-bold bg-[#131722] p-1 px-2 border border-white/10 rounded-sm flex items-center gap-2">
              <span className="text-gray-500">DALŠÍ:</span>
              <span className={cn("tabular-nums", timeLeft <= 10 ? "text-yellow-500" : "text-[#22c55e]")}>
                {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
              </span>
            </div>
          )}
          <div className={cn("text-[10px] font-bold bg-[#131722] p-1 px-2 border border-white/10 rounded-sm uppercase tracking-wider flex items-center", analysisColor)}>
            {technicalAnalysis}
            <InfoTooltip content="Automatická analýza trendu na základě posledních 5 svíček." />
          </div>
        </div>
        
        {data.length > 0 && (
          <div className="flex items-center gap-3 bg-[#131722]/40 backdrop-blur-sm p-1 px-2 text-[10px] font-medium border border-white/5 rounded-sm pointer-events-auto">
            <div className="flex items-center gap-1">
              <span className="text-gray-500">O</span>
              <span className={lastIsUp ? "text-[#22c55e]" : "text-[#ef4444]"}>{data[data.length - 1].open.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-500">H</span>
              <span className={lastIsUp ? "text-[#22c55e]" : "text-[#ef4444]"}>{data[data.length - 1].high.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-500">L</span>
              <span className={lastIsUp ? "text-[#22c55e]" : "text-[#ef4444]"}>{data[data.length - 1].low.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-gray-500">C</span>
              <span className={lastIsUp ? "text-[#22c55e]" : "text-[#ef4444]"}>{data[data.length - 1].close.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-1 ml-2">
              <span className="text-gray-500">V</span>
              <span className="text-gray-300">
                {(Math.abs(data[data.length - 1].close - data[data.length - 1].open) * 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
            <InfoTooltip content="Open (Otevírací), High (Nejvyšší), Low (Nejnižší), Close (Zavírací) cena a Volume (Objem) pro aktuální období." />
          </div>
        )}
      </div>

      <div className="absolute top-4 right-4 z-10 text-right pointer-events-none flex flex-col items-end gap-1">
        <div className={cn("text-2xl font-black tracking-tighter bg-[#131722] p-1 px-3 border border-white/10 rounded-sm shadow-xl", lastIsUp ? "text-[#22c55e]" : "text-[#ef4444]")}>
          ${currentPrice.toFixed(2)}
        </div>
        {data.length > 1 && (
          <div className={cn("text-[10px] font-bold bg-[#131722] px-2 py-0.5 border border-white/10 rounded-sm", lastIsUp ? "text-[#22c55e]" : "text-[#ef4444]")}>
            {currentPrice >= data[data.length - 2].close ? '+' : ''}{((currentPrice - data[data.length - 2].close) / data[data.length - 2].close * 100).toFixed(2)}%
          </div>
        )}
      </div>
      
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [portfolio, setPortfolio] = useState<UserPortfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showGameOver, setShowGameOver] = useState(false);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [insufficientFundsMessage, setInsufficientFundsMessage] = useState<string | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [focusTicker, setFocusTicker] = useState<keyof StockPrices>('AAPL');
  const [newRoomName, setNewRoomName] = useState("");
  const [nickname, setNickname] = useState(localStorage.getItem('trader_nickname') || '');
  const [isLockingPassive, setIsLockingPassive] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [leaderboard, setLeaderboard] = useState<UserPortfolio[]>([]);
  const [allPortfolios, setAllPortfolios] = useState<Record<string, UserPortfolio>>({});

  const gameStateRef = useRef<GameState | null>(null);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    if (showGameOver && roomId && gameStateRef.current) {
      get(ref(db, `rooms/${roomId}/portfolios`)).then((snap) => {
        const data = snap.val();
        let ports = data ? (Object.values(data) as any[]).map(p => ({
          ...p,
          trades: p.trades ? Object.values(p.trades) : []
        })) as UserPortfolio[] : [];
        const room = rooms.find(r => r.id === roomId);
        if (room?.createdBy) {
          ports = ports.filter(p => p.uid !== room.createdBy);
        }
        const prices = gameStateRef.current!.prices;
        ports.sort((a, b) => {
          const aNet = a.cash + (a.shares.AAPL * prices.AAPL) + (a.shares.NVDA * prices.NVDA) + (a.shares.WMT * prices.WMT) + a.passiveFund;
          const bNet = b.cash + (b.shares.AAPL * prices.AAPL) + (b.shares.NVDA * prices.NVDA) + (b.shares.WMT * prices.WMT) + b.passiveFund;
          return bNet - aNet;
        });
        setLeaderboard(ports);
      }).catch(e => console.error(e));
    }
  }, [showGameOver, roomId, rooms]);

  const isAdmin = useMemo(() => {
    if (!user || !roomId) return false;
    const room = rooms.find(r => r.id === roomId);
    return room?.createdBy === user.uid;
  }, [user, roomId, rooms]);

  const isGlobalAdmin = useMemo(() => {
    if (!user) return false;
    return ADMINS.includes(user.email || '');
  }, [user]);

  // Reset locking state when room changes
  useEffect(() => {
    setIsLockingPassive(false);
  }, [roomId]);

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      console.log('Auth state changed:', u ? `User: ${u.email}` : 'No user');
      setUser(u);
      setLoading(false);
      if (u) {
        setError(null);
        if (!nickname && u.displayName) {
          setNickname(u.displayName);
          localStorage.setItem('trader_nickname', u.displayName);
        } else if (!nickname && u.email) {
          const name = u.email.split('@')[0];
          setNickname(name);
          localStorage.setItem('trader_nickname', name);
        }
      }
    });
  }, [nickname]);

  // Rooms List Listener
  useEffect(() => {
    if (!user) return;
    const q = query(ref(db, 'rooms'), orderByChild('createdAt'));
    return onValue(q, (snap) => {
      const data = snap.val();
      if (!data) {
        setRooms([]);
        return;
      }
      
      const now = Date.now();
      const EXPIRATION_TIME = 6 * 60 * 60 * 1000; // 6 hodin

      const r = Object.keys(data).filter(k => {
        const item = data[k];
        if (now - item.createdAt > EXPIRATION_TIME) {
          remove(ref(db, `rooms/${k}`)).catch(e => console.error("Auto-cleanup failed:", e));
          return false;
        }
        return true;
      }).map(k => {
        const item = data[k];
        if (item.gameState?.history) {
           for (const t of ['AAPL', 'NVDA', 'WMT']) {
             if (item.gameState.history[t]) {
               item.gameState.history[t] = Object.values(item.gameState.history[t]);
             }
           }
        }
        return { id: k, ...item } as Room;
      }).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
      setRooms(r);
    }, (err: any) => {
      console.error('Rooms Snapshot Error:', err);
      if (err?.message?.includes('permission_denied')) {
        setError('Google Cloud Infrastructure Block: Please wait or verify database rules.');
      }
    });
  }, [user]);

  // Game State Listener (Room Specific)
  useEffect(() => {
    if (!user || !roomId) {
      setGameState(null);
      return;
    }

    let isCreator = false;

    const unsub = onValue(ref(db, `rooms/${roomId}`), (snap) => {
      if (snap.exists()) {
        const data = snap.val() as Room;
        let processedGameState = data.gameState || null;
        if (processedGameState?.history) {
           for (const t of ['AAPL', 'NVDA', 'WMT']) {
             if (processedGameState.history[t as keyof StockPrices]) {
               processedGameState.history[t as keyof StockPrices] = Object.values(processedGameState.history[t as keyof StockPrices]);
             }
           }
        }
        setGameState(processedGameState);
        isCreator = data.createdBy === user.uid;
        if (processedGameState?.currentMonth === 11) {
          setShowGameOver(true);
        } else {
          setShowGameOver(false);
        }
      } else {
        // Room was deleted
        setRoomId(null);
        setError("Tato místnost již neexistuje (byla smazána správcem).");
      }
    }, (err: any) => {
      console.error('GameState Snapshot Error:', err);
      if (err?.message?.includes('permission_denied')) {
        setError('Market data access denied.');
      }
    });

    // Stop listening when leaving
    return () => {
      unsub();
    };
  }, [user, roomId]);

  // Portfolio Listener (Room Specific)
  useEffect(() => {
    if (!user || !roomId) {
      setPortfolio(null);
      return;
    }

    const unsub = onValue(ref(db, `rooms/${roomId}/portfolios/${user.uid}`), (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        if (data.trades) data.trades = Object.values(data.trades);
        setPortfolio(data as UserPortfolio);
      } else {
        // Initialize portfolio in this room
        const room = rooms.find(r => r.id === roomId);
        const isRoomCreator = room?.createdBy === user.uid;
        const randomCapital = isRoomCreator ? 0 : Math.floor(Math.random() * (INITIAL_CAPITAL_MAX - INITIAL_CAPITAL_MIN + 1)) + INITIAL_CAPITAL_MIN;
        const initialPortfolio: UserPortfolio = {
          uid: user.uid,
          roomId: roomId,
          email: user.email || '',
          nickname: localStorage.getItem('trader_nickname') || '',
          cash: randomCapital,
          startingCapital: randomCapital,
          shares: { AAPL: 0, NVDA: 0, WMT: 0 },
          passiveFund: 0,
          isPassiveLocked: false,
          trades: []
        };
        set(ref(db, `rooms/${roomId}/portfolios/${user.uid}`), initialPortfolio).catch((err: any) => {
           console.error(err);
        });
      }
    }, (err: any) => {
      console.error('Portfolio Snapshot Error:', err);
      if (err?.message?.includes('permission_denied')) {
        setError('Portfolio access denied.');
      }
    });
    const unsubAll = onValue(ref(db, `rooms/${roomId}/portfolios`), (snap) => {
      const ports: Record<string, UserPortfolio> = {};
      const data = snap.val();
      if (data) {
        Object.keys(data).forEach(k => {
          const p = data[k];
          if (p.trades) p.trades = Object.values(p.trades);
          ports[k] = p as UserPortfolio;
        });
      }
      setAllPortfolios(ports);
    }, (err: any) => {
      console.error('All Portfolios Snapshot Error:', err);
    });
    
    return () => {
      unsub();
      unsubAll();
    };
  }, [user, roomId]);

  // Dividend & Final Return Logic
  useEffect(() => {
    if (!portfolio || !gameState || !user || !roomId) return;

    // Monthly Dividend (WMT pays $2 every month)
    const month = gameState.currentMonth;
    if (!portfolio.isDividendPaid?.[month]) {
      const dividend = portfolio.shares.WMT * 2;
      const updatedDividends = { ...(portfolio.isDividendPaid || {}), [month]: true };
      
      if (dividend > 0) {
        update(ref(db, `rooms/${roomId}/portfolios/${user.uid}`), {
          cash: portfolio.cash + dividend,
          isDividendPaid: updatedDividends
        });
      } else {
        update(ref(db, `rooms/${roomId}/portfolios/${user.uid}`), { isDividendPaid: updatedDividends });
      }
    }

    // December Final Return
    if (gameState.currentMonth === 11 && !portfolio.isFinalPaid) {
      const finalReturn = portfolio.passiveFund * (1 + PASSIVE_FUND_RETURN);
      if (finalReturn > 0) {
        update(ref(db, `rooms/${roomId}/portfolios/${user.uid}`), {
          cash: portfolio.cash + finalReturn,
          passiveFund: 0,
          isFinalPaid: true
        });
      } else {
        update(ref(db, `rooms/${roomId}/portfolios/${user.uid}`), { isFinalPaid: true });
      }
    }
  }, [gameState?.currentMonth, portfolio?.uid, roomId]);

  // Timer Logic
  useEffect(() => {
    if (!gameState || gameState.isPaused || !gameState.nextTickAt) {
      if (gameState?.remainingTime) {
        setTimeLeft(gameState.remainingTime);
      } else {
        setTimeLeft(60);
      }
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((gameState.nextTickAt! - now) / 1000));
      setTimeLeft(remaining);

      if (remaining === 0 && isAdmin) {
        handleNextMonth();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState?.nextTickAt, gameState?.isPaused, isAdmin]);

  // Market Heartbeat (Admin only) - Updates prices slightly and records history
  useEffect(() => {
    if (!isAdmin || !roomId) return;

    const interval = setInterval(async () => {
      const currentGameState = gameStateRef.current;
      if (!currentGameState || currentGameState.isPaused) return;

      const updates: any = {};
      const now = Date.now();

      (['AAPL', 'NVDA', 'WMT'] as const).forEach(ticker => {
        const currentPrice = currentGameState.prices[ticker];
        const sentiment = currentGameState.sentiment;
        
        const tickerHistory = currentGameState.history?.[ticker] || [];
        const lastCandle = tickerHistory[tickerHistory.length - 1];
        const previousCandle = tickerHistory[tickerHistory.length - 2];

        // 1. Calculate momentum from recent history
        let momentum = 0;
        if (lastCandle && previousCandle) {
           const priceDiff = lastCandle.close - previousCandle.close;
           // If there was a big move recently (e.g. from a user trade), carry 15% of that momentum forward
           // This prevents the chart from smoothing out and simulates FOMO buying or Panic selling
           momentum = priceDiff * 0.15; 
        }

        // 2. Base Random walk based on sentiment
        // We drastically increase the bias and volatility compared to before for a rougher chart
        const bias = sentiment === 'Bull' ? 0.6 : sentiment === 'Bear' ? -0.6 : 0;
        
        // Dynamic volatility: higher priced stocks swing by larger dollar amounts (approx 1.5% max swing)
        const volatility = currentPrice * 0.015; 
        const randomSwing = (Math.random() - 0.5 + bias) * volatility;

        // 3. Apply changes
        // Cap momentum to prevent infinite loops, but allow very large swings to persist
        const cappedMomentum = Math.max(-volatility * 4, Math.min(volatility * 4, momentum));
        
        const change = randomSwing + cappedMomentum;
        const nextPrice = Math.max(1, Math.round((currentPrice + change) * 100) / 100);
        
        // Only add a new candle if enough time has passed (e.g., 5 seconds)
        // or if the price has moved significantly. 
        // For simplicity in this game, we'll add a candle every heartbeat (3s)
        const open = lastCandle ? lastCandle.close : currentPrice;
        
        // Widen the High/Low to make candles visually more pronounced and less smooth
        const candleWickWiden = Math.max(0.5, Math.abs(open - nextPrice) * 0.3);

        const newCandle: CandleData = {
          time: now,
          open,
          close: nextPrice,
          high: Math.round((Math.max(open, nextPrice) + (Math.random() * candleWickWiden)) * 100) / 100,
          low: Math.round((Math.min(open, nextPrice) - (Math.random() * candleWickWiden)) * 100) / 100
        };
        const candleId = Date.now().toString() + Math.random().toString().slice(2, 6);
        updates[`gameState/prices/${ticker}`] = nextPrice;
        updates[`gameState/history/${ticker}/${candleId}`] = newCandle;
      });

      try {
        await update(ref(db, `rooms/${roomId}`), updates);
      } catch (err) {
        console.error("Market heartbeat failed:", err);
      }
    }, 3000); // 3 seconds interval

    return () => clearInterval(interval);
  }, [isAdmin, roomId]);

  const handleCreateRoom = async () => {
    if (!user || !newRoomName.trim() || !nickname.trim()) return;
    
    setError(null);
    
    const initialState: GameState = {
      currentMonth: 0,
      isPaused: true,
      nextTickAt: null,
      sentiment: MARKET_SCHEDULE[0].state.sentiment,
      newsFlash: MARKET_SCHEDULE[0].state.newsFlash,
      prices: MARKET_SCHEDULE[0].prices,
      history: {
        AAPL: { [Date.now() + 'AAPL']: { time: Date.now(), open: Number(MARKET_SCHEDULE[0].prices.AAPL.toFixed(2)), high: Number(MARKET_SCHEDULE[0].prices.AAPL.toFixed(2)), low: Number(MARKET_SCHEDULE[0].prices.AAPL.toFixed(2)), close: Number(MARKET_SCHEDULE[0].prices.AAPL.toFixed(2)) } } as any,
        NVDA: { [Date.now() + 'NVDA']: { time: Date.now(), open: Number(MARKET_SCHEDULE[0].prices.NVDA.toFixed(2)), high: Number(MARKET_SCHEDULE[0].prices.NVDA.toFixed(2)), low: Number(MARKET_SCHEDULE[0].prices.NVDA.toFixed(2)), close: Number(MARKET_SCHEDULE[0].prices.NVDA.toFixed(2)) } } as any,
        WMT: { [Date.now() + 'WMT']: { time: Date.now(), open: Number(MARKET_SCHEDULE[0].prices.WMT.toFixed(2)), high: Number(MARKET_SCHEDULE[0].prices.WMT.toFixed(2)), low: Number(MARKET_SCHEDULE[0].prices.WMT.toFixed(2)), close: Number(MARKET_SCHEDULE[0].prices.WMT.toFixed(2)) } } as any
      }
    };

    const newRoomRef = push(ref(db, 'rooms'));
    await set(newRoomRef, {
      name: newRoomName,
      createdBy: user.uid,
      createdAt: Date.now(),
      gameState: initialState
    });

    if (newRoomRef.key) setRoomId(newRoomRef.key);
    setNewRoomName("");
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      if (result.user) {
        setUser(result.user);
      }
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.code === 'auth/unauthorized-domain') {
        setError('Tato doména není v Firebase konzoli povolena. Přidejte ji prosím do Authorized domains.');
      } else {
        setError(`Přihlášení se nezdařilo: ${err.message || 'Zkuste to prosím znovu.'}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setRoomId(null);
  };

  const handleNextMonth = async () => {
    const currentGameState = gameStateRef.current;
    if (!isAdmin || !currentGameState || !roomId) return;

    // Prevent double-triggering for the same month
    if (currentGameState.currentMonth >= 11) {
      await update(ref(db, `rooms/${roomId}`), {
        'gameState/isPaused': true,
        'gameState/nextTickAt': null
      });
      return;
    }

    const nextM = currentGameState.currentMonth + 1;
    const schedule = MARKET_SCHEDULE[nextM];
    const randomNews = schedule.newsPool[Math.floor(Math.random() * schedule.newsPool.length)];
    
    // Prepare updates for each ticker
    const updates: any = {
      'gameState/currentMonth': nextM,
      'gameState/sentiment': schedule.state.sentiment,
      'gameState/newsFlash': randomNews,
      'gameState/nextTickAt': Date.now() + 60000
    };

    (['AAPL', 'NVDA', 'WMT'] as const).forEach(ticker => {
      const tickerHistory = currentGameState.history?.[ticker] ? Object.values(currentGameState.history?.[ticker] as any) as CandleData[] : [];
      const lastCandle = tickerHistory[tickerHistory.length - 1];
      const currentPrice = currentGameState.prices[ticker] || (lastCandle ? lastCandle.close : 100);
      
      const prevSchedulePrice = MARKET_SCHEDULE[currentGameState.currentMonth].prices[ticker];
      const nextSchedulePrice = schedule.prices[ticker];
      const priceDiff = nextSchedulePrice - prevSchedulePrice;
      
      const close = Math.max(1, currentPrice + priceDiff);
      
      // Use a slightly more dramatic high/low for month transitions
      const volatility = Math.abs(close - currentPrice) * 0.2 + 2;
      
      const candleId = Date.now().toString() + Math.random().toString().slice(2, 6);
      const newCandle: CandleData = {
        time: Date.now() + Math.random() * 1000, // Ensure uniqueness and slight offset
        open: Number(currentPrice.toFixed(2)),
        close: Number(close.toFixed(2)),
        high: Number((Math.max(currentPrice, close) + (Math.random() * volatility)).toFixed(2)),
        low: Number((Math.min(currentPrice, close) - (Math.random() * volatility)).toFixed(2))
      };
      
      updates[`gameState/prices/${ticker}`] = close;
      updates[`gameState/history/${ticker}/${candleId}`] = newCandle;
    });

    try {
      await update(ref(db, `rooms/${roomId}`), updates);
    } catch (err) {
      console.error("Failed to advance month:", err);
    }
  };

  const handleTogglePause = async () => {
    if (!isAdmin || !gameState || !roomId) return;
    
    if (!gameState.isPaused) {
      // Pausing
      await update(ref(db, `rooms/${roomId}`), {
        'gameState/isPaused': true,
        'gameState/nextTickAt': null,
        'gameState/remainingTime': timeLeft
      });
    } else {
      // Resuming
      const rt = gameState.remainingTime || 60;
      await update(ref(db, `rooms/${roomId}`), {
        'gameState/isPaused': false,
        'gameState/nextTickAt': Date.now() + (rt * 1000)
      });
    }
  };

  const handleStartGame = async () => {
    if (!isAdmin || !gameState || !roomId) return;
    
    // If it was paused during a month, resume it instead of resetting
    if (gameState.remainingTime) {
      await handleTogglePause();
      return;
    }

    await update(ref(db, `rooms/${roomId}`), {
      'gameState/isPaused': false,
      'gameState/nextTickAt': Date.now() + 60000
    });
  };

  const handleResetGame = async () => {
    if (!isAdmin || !roomId) return;
    
    if (!window.confirm("Opravdu chcete vymazat celou herní historii a restartovat hru pro všechny hráče od začátku?")) {
      return;
    }
    
    const initialState: GameState = {
      currentMonth: 0,
      isPaused: true,
      nextTickAt: null,
      sentiment: MARKET_SCHEDULE[0].state.sentiment,
      newsFlash: MARKET_SCHEDULE[0].state.newsFlash,
      prices: MARKET_SCHEDULE[0].prices,
      history: {
        AAPL: { [Date.now() + 'AAPL']: { time: Date.now(), open: Number(MARKET_SCHEDULE[0].prices.AAPL.toFixed(2)), high: Number(MARKET_SCHEDULE[0].prices.AAPL.toFixed(2)), low: Number(MARKET_SCHEDULE[0].prices.AAPL.toFixed(2)), close: Number(MARKET_SCHEDULE[0].prices.AAPL.toFixed(2)) } } as any,
        NVDA: { [Date.now() + 'NVDA']: { time: Date.now(), open: Number(MARKET_SCHEDULE[0].prices.NVDA.toFixed(2)), high: Number(MARKET_SCHEDULE[0].prices.NVDA.toFixed(2)), low: Number(MARKET_SCHEDULE[0].prices.NVDA.toFixed(2)), close: Number(MARKET_SCHEDULE[0].prices.NVDA.toFixed(2)) } } as any,
        WMT: { [Date.now() + 'WMT']: { time: Date.now(), open: Number(MARKET_SCHEDULE[0].prices.WMT.toFixed(2)), high: Number(MARKET_SCHEDULE[0].prices.WMT.toFixed(2)), low: Number(MARKET_SCHEDULE[0].prices.WMT.toFixed(2)), close: Number(MARKET_SCHEDULE[0].prices.WMT.toFixed(2)) } } as any
      }
    };

    await update(ref(db, `rooms/${roomId}`), { gameState: initialState });
  };

  const handleTrade = async (ticker: keyof StockPrices, amount: number) => {
    if (!user || !portfolio || !gameState || !roomId) return;
    
    if (gameState.isPaused) {
      if (!gameState.nextTickAt && gameState.currentMonth === 0) {
        setError('Nemůžete obchodovat, dokud správce nespustí simulaci!');
      } else {
        setError('Hra je nyní pozastavena. Počkejte na obnovení simulace.');
      }
      return;
    }
    
    const currentPrice = gameState.prices[ticker] || 100;
    const tradeValue = currentPrice * Math.abs(amount);

    if (amount > 0) { // Buy
      const totalCost = tradeValue + TRADING_FEE;
      if (portfolio.cash < totalCost) {
        setInsufficientFundsMessage(`Potřebujete $${totalCost.toLocaleString()} (včetně poplatku $${TRADING_FEE}). Aktuálně máte pouze $${portfolio.cash.toLocaleString()}.`);
        return;
      }
      
      const newTrade: Trade = {
        ticker,
        amount,
        price: currentPrice,
        time: Date.now()
      };
      
      const tradeId = Date.now().toString() + Math.random().toString().slice(2, 6);
      
      await update(ref(db, `rooms/${roomId}/portfolios/${user.uid}`), {
        cash: portfolio.cash - totalCost,
        [`shares/${ticker}`]: portfolio.shares[ticker] + amount,
        [`trades/${tradeId}`]: newTrade
      });

      const priceChange = PRICE_IMPACT * amount;
      const newPrice = Math.max(1, Math.round((currentPrice + priceChange) * 100) / 100);
      
      const tradeCandle: CandleData = {
        time: Date.now(),
        open: currentPrice,
        close: newPrice,
        high: Math.max(currentPrice, newPrice),
        low: Math.min(currentPrice, newPrice)
      };
      
      // Update the price directly for immediate feedback
      const candleId = Date.now().toString() + Math.random().toString().slice(2, 6);
      await update(ref(db, `rooms/${roomId}`), {
        [`gameState/prices/${ticker}`]: newPrice,
        [`gameState/history/${ticker}/${candleId}`]: tradeCandle
      });
      
      // Pay the fee to the room creator
      const room = rooms.find(r => r.id === roomId);
      const roomCreatorId = room?.createdBy;
      if (roomCreatorId && roomCreatorId !== user.uid) {
        await update(ref(db, `rooms/${roomId}/portfolios/${roomCreatorId}`), {
          cash: increment(TRADING_FEE)
        }).catch(err => console.error("Failed to pay fee to creator:", err));
      }
    } else { // Sell
      if (portfolio.shares[ticker] < Math.abs(amount)) {
        setError('Nemáte dostatek akcií!');
        return;
      }

      const netProceeds = tradeValue - TRADING_FEE;
      
      const newTrade: Trade = {
        ticker,
        amount,
        price: currentPrice,
        time: Date.now()
      };

      const tradeId = Date.now().toString() + Math.random().toString().slice(2, 6);

      await update(ref(db, `rooms/${roomId}/portfolios/${user.uid}`), {
        cash: portfolio.cash + netProceeds,
        [`shares/${ticker}`]: portfolio.shares[ticker] + amount,
        [`trades/${tradeId}`]: newTrade
      });

      const priceChange = PRICE_IMPACT * amount; // amount is negative
      const newPrice = Math.max(1, Math.round((currentPrice + priceChange) * 100) / 100);

      const tradeCandle: CandleData = {
        time: Date.now(),
        open: currentPrice,
        close: newPrice,
        high: Math.max(currentPrice, newPrice),
        low: Math.min(currentPrice, newPrice)
      };

      // Update the price directly for immediate feedback
      const candleId = Date.now().toString() + Math.random().toString().slice(2, 6);
      await update(ref(db, `rooms/${roomId}`), {
        [`gameState/prices/${ticker}`]: newPrice,
        [`gameState/history/${ticker}/${candleId}`]: tradeCandle
      });
      
      // Pay the fee to the room creator
      const room = rooms.find(r => r.id === roomId);
      const roomCreatorId = room?.createdBy;
      if (roomCreatorId && roomCreatorId !== user.uid) {
        await update(ref(db, `rooms/${roomId}/portfolios/${roomCreatorId}`), {
          cash: increment(TRADING_FEE)
        }).catch(err => console.error("Failed to pay fee to creator:", err));
      }
    }
    setError(null);
  };

  const handleLockPassive = async (amount: number) => {
    if (!user || !portfolio || !gameState || !roomId || isLockingPassive) return;
    if (gameState.currentMonth > 0) {
      setError('Pasivní fond je k dispozici pouze v lednu.');
      return;
    }
    if (portfolio.isPassiveLocked) {
      setError('Do pasivního fondu můžete vložit prostředky pouze jednou.');
      return;
    }

    if (amount > 0) {
      if (portfolio.cash < amount) {
        setError('Nedostatek hotovosti!');
        return;
      }
      setIsLockingPassive(true);
      try {
        await update(ref(db, `rooms/${roomId}/portfolios/${user.uid}`), {
          cash: portfolio.cash - amount,
          passiveFund: portfolio.passiveFund + amount,
          isPassiveLocked: true
        });
        // We don't set isLockingPassive(false) here because we want the UI
        // to stay locked until the onSnapshot listener updates the portfolio state.
      } catch (err: any) {
        console.error("Lock passive error:", err);
        setError('Nepodařilo se uzamknout prostředky. Zkuste to prosím znovu.');
        setIsLockingPassive(false);
      }
    }
  };

  const handleTriggerEvent = async () => {
    if (!isAdmin || !gameState || !roomId) return;
    
    const schedule = MARKET_SCHEDULE[gameState.currentMonth];
    const randomNews = schedule.newsPool[Math.floor(Math.random() * schedule.newsPool.length)];
    
    await update(ref(db, `rooms/${roomId}`), { 
      'gameState/newsFlash': randomNews
    });
  };

  const renderASCIIChart = (ticker: keyof StockPrices) => {
    if (!gameState) return null;
    const history = Array.from({ length: gameState.currentMonth + 1 }, (_, i) => MARKET_SCHEDULE[i].prices[ticker]);
    const max = Math.max(...Object.values(MARKET_SCHEDULE).map(s => s.prices[ticker]));
    const min = Math.min(...Object.values(MARKET_SCHEDULE).map(s => s.prices[ticker]));
    
    const bars = history.map(p => {
      const height = Math.round(((p - min) / (max - min || 1)) * 5);
      const chars = [' ', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
      return chars[height] || ' ';
    }).join('');

    return `[ ${bars.padEnd(5, ' ')} ] $${MARKET_SCHEDULE[gameState.currentMonth].prices[ticker]}`;
  };

  const handleDeleteRoom = async (id: string | null, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!id || !user) return;
    
    // Zapněte UI potvrzení místo window.confirm (který v iframe často nefunguje)
    setDeletingRoomId(id);
  };

  const confirmDeleteRoom = async () => {
    if (!deletingRoomId || !user) return;
    const id = deletingRoomId;
    setDeletingRoomId(null);

    try {
      const isCurrentRoom = id === roomId;
      await remove(ref(db, `rooms/${id}`));
      
      if (isCurrentRoom) {
        setRoomId(null);
        setError(null);
      }
    } catch (err: any) {
      console.error("Failed to delete room:", err);
      setError(`Nepodařilo se smazat místnost: ${err.message || "Přesuňte se do lobby a zkuste to znovu."}`);
    }
  };

  const cancelDeleteRoom = () => {
    setDeletingRoomId(null);
  };

  if (loading) return <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0] flex items-center justify-center font-mono">Loading Simulation...</div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0] flex items-center justify-center p-4 font-mono">
        <div className="max-w-md w-full bg-[#1a1a1a] border-2 border-[#2a2b2e] p-8 shadow-[8px_8px_0px_0px_rgba(255,255,255,0.05)]">
          <h1 className="text-3xl font-bold mb-6 italic serif text-white">Jeden rok na Wall Street</h1>
          <p className="mb-8 text-gray-400">Přihlaste se do banky a začněte svou simulaci.</p>
          
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border-2 border-red-500 text-red-500 text-sm font-bold flex items-center gap-2">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          <button 
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="w-full flex items-center justify-center gap-2 bg-white text-black p-4 hover:bg-gray-200 transition-colors font-bold disabled:opacity-50"
          >
            {isLoggingIn ? (
              <RefreshCw size={20} className="animate-spin" />
            ) : (
              <LogIn size={20} />
            )}
            {isLoggingIn ? 'Přihlašování...' : 'Přihlásit se přes Google'}
          </button>
        </div>
      </div>
    );
  }

  if (!roomId) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0] flex items-center justify-center p-4 font-mono">
        <div className="max-w-4xl w-full space-y-8">
          <div className="flex justify-between items-center border-b-2 border-[#2a2b2e] pb-6">
            <h1 className="text-4xl font-black italic serif uppercase tracking-tighter text-white">Lobby</h1>
            <button onClick={handleLogout} className="flex items-center gap-2 hover:underline text-sm opacity-70 hover:opacity-100">
              <LogOut size={16} /> Odhlásit se
            </button>
          </div>

          <div className="bg-[#1a1a1a] border-2 border-[#2a2b2e] p-6 shadow-[8px_8px_0px_0px_rgba(255,255,255,0.05)]">
            <h2 className="text-lg font-bold mb-2 flex items-center gap-2 text-white">
              Tvůj Nickname
              <InfoTooltip content="Tento nickname se zobrazí všem ostatním hráčům na tabulce výsledků na konci hry." />
            </h2>
            <p className="text-xs text-gray-400 mb-4">Před připojením nebo vytvořením místnosti si musíš nastavit přezdívku.</p>
            <input 
              type="text" 
              placeholder="Zadej svou přezdívku..."
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value);
                localStorage.setItem('trader_nickname', e.target.value);
              }}
              className="w-full max-w-sm bg-[#0a0a0a] border-2 border-[#2a2b2e] p-3 text-white focus:border-white outline-none transition-colors"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Create Room */}
            <div className="bg-[#1a1a1a] border-2 border-[#2a2b2e] p-8 shadow-[8px_8px_0px_0px_rgba(255,255,255,0.05)]">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
                <Plus size={20} /> Vytvořit novou místnost
                <InfoTooltip content="Vytvořte novou herní místnost, kde budete správcem a můžete ovládat čas simulace." />
              </h2>
              <p className="text-sm text-gray-400 mb-6">Spusťte novou simulaci. Budete správcem této místnosti.</p>
              <div className="space-y-4">
                <input 
                  type="text" 
                  placeholder="Název místnosti (např. Wall Street 2026)"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className="w-full bg-[#0a0a0a] border-2 border-[#2a2b2e] p-4 text-white focus:border-white outline-none transition-colors"
                />
                <button 
                  onClick={handleCreateRoom}
                  disabled={!newRoomName.trim() || !nickname.trim()}
                  className="w-full bg-white text-black p-4 font-bold hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  {nickname.trim() ? 'VYTVOŘIT MÍSTNOST' : 'NASTAVTE NICKNAME'}
                </button>
              </div>
            </div>

            {/* Join Room */}
            <div className="bg-[#1a1a1a] border-2 border-[#2a2b2e] p-8 shadow-[8px_8px_0px_0px_rgba(255,255,255,0.05)]">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
                <Users size={20} /> Připojit se k místnosti
                <InfoTooltip content="Vstupte do již vytvořené místnosti a soutěžte s ostatními hráči v reálném čase." />
              </h2>
              <p className="text-sm text-gray-400 mb-6">Vstupte do existující simulace a soutěžte s ostatními.</p>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                {rooms.length === 0 ? (
                  <div className="text-center py-8 text-gray-600 italic">Nebyly nalezeny žádné aktivní místnosti.</div>
                ) : (
                  rooms.map(room => (
                    <div key={room.id} className="relative group">
                      <button 
                        onClick={() => setRoomId(room.id)}
                        disabled={!nickname.trim()}
                        className="w-full flex items-center justify-between bg-[#0a0a0a] border-2 border-[#2a2b2e] p-4 hover:border-white disabled:hover:border-[#2a2b2e] transition-all disabled:opacity-50"
                      >
                        <div className="text-left pr-10">
                          <div className="font-bold text-white group-hover:text-white disabled:group-hover:text-gray-400">{room.name}</div>
                          <div className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">
                            Vytvořeno {new Date(room.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <ChevronRight size={20} className="text-gray-500 group-hover:text-white disabled:group-hover:text-gray-500" />
                      </button>
                      
                      {user && isGlobalAdmin && (
                        <button 
                          onClick={(e) => handleDeleteRoom(room.id, e)}
                          title="Smazat místnost"
                          className="absolute right-12 top-1/2 -translate-y-1/2 p-2 text-red-500 hover:bg-red-500/10 transition-colors z-20 pointer-events-auto"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Modal for Lobby */}
        <AnimatePresence>
          {deletingRoomId && !roomId && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 border-[10px] border-[#0a0a0a]"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-[#1a1a1a] p-8 max-w-md w-full border-2 border-red-500 shadow-[8px_8px_0px_0px_rgba(239,68,68,0.2)]"
              >
                <div className="flex items-center gap-3 text-red-500 mb-4">
                  <AlertCircle size={24} />
                  <h2 className="text-xl font-black uppercase italic serif">Smazat místnost?</h2>
                </div>
                <p className="text-sm opacity-70 mb-6 leading-relaxed">
                  Opravdu chcete tuto místnost definitivně smazat? Všechna data her budou ztracena. Tato akce je nevratná.
                </p>
                <div className="flex gap-4">
                  <button 
                    onClick={confirmDeleteRoom}
                    className="flex-1 bg-red-500 text-white py-3 font-bold hover:bg-red-600 transition-colors"
                  >
                    SMAZAT
                  </button>
                  <button 
                    onClick={cancelDeleteRoom}
                    className="flex-1 border-2 border-white text-white py-3 font-bold hover:bg-white/10 transition-colors"
                  >
                    ZRUŠIT
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    );
  }

  const currentPrices = gameState?.prices || null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0] font-mono p-4 md:p-8 overflow-x-hidden">
      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b-2 border-[#2a2b2e] pb-6">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <button 
              onClick={() => setShowLeaveConfirm(true)}
              className="p-2 hover:bg-white/5 rounded-full transition-colors"
              title="Back to Lobby"
            >
              <ArrowLeft size={24} />
            </button>
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-black italic serif uppercase tracking-tighter text-white leading-none">
                {rooms.find(r => r.id === roomId)?.name || "Wall Street"}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="bg-white text-black px-2 py-0.5 text-[10px] sm:text-xs uppercase font-bold">Živá simulace</span>
                <span className="text-[10px] sm:text-xs opacity-50 truncate max-w-[150px]">{user.email}</span>
                {isAdmin && <span className="text-[9px] sm:text-[10px] bg-yellow-600 text-black px-1 font-bold">SPRÁVCE</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            {!isAdmin && (
              <button 
                onClick={() => setIsFocusMode(!isFocusMode)}
                className={cn(
                  "flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-3 md:py-2 text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-all border-2",
                  isFocusMode 
                    ? "bg-white text-black border-white" 
                    : "bg-transparent text-white border-[#2a2b2e] hover:border-white"
                )}
              >
                {isFocusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                <span className="hidden sm:inline">{isFocusMode ? "Zavřít detail" : "Detailní graf"}</span>
                <span className="sm:hidden">{isFocusMode ? "Zavřít" : "Graf"}</span>
              </button>
            )}
            {(isAdmin || isGlobalAdmin) && (
              <button 
                onClick={(e) => handleDeleteRoom(roomId, e)}
                className="flex items-center gap-2 text-red-500 hover:underline text-xs sm:text-sm opacity-70 hover:opacity-100 px-2 py-1"
              >
                <Trash2 size={16} /> <span className="hidden sm:inline">Smazat místnost</span>
              </button>
            )}
            <button onClick={handleLogout} className="flex items-center gap-2 hover:underline text-xs sm:text-sm opacity-70 hover:opacity-100 px-2 py-1">
              <LogOut size={16} /> <span className="hidden sm:inline">Odhlásit se</span>
            </button>
          </div>
        </header>

        {/* Market Status */}
        {!isFocusMode && (
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
            <div className="bg-[#1a1a1a] border md:border-2 border-[#2a2b2e] p-3 md:p-6 shadow-[2px_2px_0px_0px_rgba(255,255,255,0.02)] md:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)]">
              <h2 className="text-[9px] sm:text-[10px] md:text-xs uppercase opacity-50 mb-1 sm:mb-2 italic serif flex items-center">
                Aktuální měsíc
                <InfoTooltip content="Simulace probíhá po dobu 12 měsíců (leden až prosinec)." />
              </h2>
              <div className="text-xl sm:text-2xl md:text-4xl font-bold text-white uppercase tracking-tighter truncate">
                {MONTH_NAMES[gameState?.currentMonth ?? 0]}
              </div>
            </div>
            <div className="bg-[#1a1a1a] border md:border-2 border-[#2a2b2e] p-3 md:p-6 shadow-[2px_2px_0px_0px_rgba(255,255,255,0.02)] md:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)] flex flex-col justify-between">
              <h2 className="text-[9px] sm:text-[10px] md:text-xs uppercase opacity-50 mb-1 sm:mb-2 italic serif flex items-center">
                Další měsíc za
                <InfoTooltip content="Čas zbývající do konce aktuálního měsíce a přechodu na další." />
              </h2>
              <div className={cn(
                "text-2xl sm:text-3xl md:text-5xl font-black tabular-nums",
                timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-white"
              )}>
                {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
              </div>
              {isAdmin && (
                <div className="flex gap-2 mt-2 sm:mt-4">
                  {gameState?.nextTickAt ? (
                    <button 
                      onClick={handleTogglePause}
                      className="flex-1 bg-white text-black text-[8px] sm:text-[10px] font-bold py-1.5 sm:py-1 hover:bg-gray-200 uppercase flex items-center justify-center gap-1 leading-none"
                    >
                      {gameState.isPaused ? 'Další' : 'Pauza'}
                    </button>
                  ) : (
                    <button 
                      onClick={handleStartGame}
                      className="flex-1 bg-green-600 text-white text-[8px] sm:text-[10px] font-bold py-1.5 sm:py-1 hover:bg-green-500 uppercase flex items-center justify-center gap-1 leading-none"
                    >
                      Spustit
                    </button>
                  )}
                  <button 
                    onClick={handleResetGame}
                    className="flex-1 bg-red-900/20 border border-red-500 text-red-500 text-[8px] sm:text-[10px] font-bold py-1.5 sm:py-1 hover:bg-red-900/40 uppercase flex items-center justify-center gap-1 leading-none"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>
            <div className={cn(
              "border md:border-2 border-[#2a2b2e] p-3 md:p-6 shadow-[2px_2px_0px_0px_rgba(255,255,255,0.02)] md:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)]",
              gameState?.sentiment === 'Bull' ? "bg-green-900/20 border-green-500/50" : gameState?.sentiment === 'Bear' ? "bg-red-900/20 border-red-500/50" : "bg-[#1a1a1a]"
            )}>
              <h2 className="text-[9px] sm:text-[10px] md:text-xs uppercase opacity-50 mb-1 sm:mb-2 italic serif flex items-center">
                Nálada na trhu
                <InfoTooltip content="Býčí trh (Bull) znamená rostoucí ceny, Medvědí trh (Bear) znamená klesající ceny." />
              </h2>
              <div className="text-lg sm:text-2xl md:text-4xl font-bold flex items-center gap-2 text-white">
                {gameState?.sentiment === 'Bull' ? 'Býčí' : gameState?.sentiment === 'Bear' ? 'Medvědí' : 'Neutrální'}
                {gameState?.sentiment === 'Bull' && <TrendingUp size={20} className="text-green-500" />}
                {gameState?.sentiment === 'Bear' && <TrendingDown size={20} className="text-red-500" />}
              </div>
            </div>
            <div className="col-span-2 md:col-span-1 bg-[#1a1a1a] border md:border-2 border-white p-3 md:p-6 shadow-[2px_2px_0px_0px_rgba(255,255,255,0.05)] md:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)]">
              <h2 className="text-[9px] sm:text-[10px] md:text-xs uppercase opacity-50 mb-1 sm:mb-2 italic serif text-white/50 flex items-center">
                Blesková zpráva
                <InfoTooltip content="Aktuální událost, která může ovlivnit ceny akcií na trhu." />
              </h2>
              <p className="text-[11px] sm:text-xs md:text-sm leading-tight italic font-bold text-white">"{gameState?.newsFlash}"</p>
            </div>
          </section>
        )}

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-red-900/20 text-red-400 p-4 border-2 border-red-500/50 flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <AlertCircle size={20} />
                <span className="font-bold">{error}</span>
              </div>
              <button onClick={() => setError(null)} className="text-xs underline">Zavřít</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Dashboard */}
        <div className="max-w-7xl mx-auto px-4 py-8">
          {isFocusMode ? (
            <div className="fixed inset-0 z-40 bg-[#050505] flex flex-col">
              {/* Focus Mode Header */}
              <div className="bg-[#1a1a1a] border-b border-[#2a2b2e] p-2 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center justify-between w-full sm:w-auto gap-4 sm:gap-6">
                  <button 
                    onClick={() => setIsFocusMode(false)}
                    className="p-2 hover:bg-white/10 text-white transition-colors"
                  >
                    <ArrowLeft size={24} />
                  </button>
                  <div className="flex gap-1 sm:gap-2 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
                    {(['AAPL', 'NVDA', 'WMT'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setFocusTicker(t)}
                        className={cn(
                          "px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold transition-all whitespace-nowrap",
                          focusTicker === t 
                            ? "bg-white text-black" 
                            : "bg-[#2a2b2e] text-gray-400 hover:text-white"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:flex items-center gap-4 sm:gap-8 w-full sm:w-auto">
                  <div className="text-left sm:text-right">
                    <div className="text-[9px] sm:text-[10px] uppercase opacity-50 text-gray-400 flex items-center sm:justify-end">
                      Měsíc
                      <InfoTooltip content="Simulace probíhá po dobu 12 měsíců (leden až prosinec)." />
                    </div>
                    <div className="text-sm sm:text-xl font-bold text-white uppercase tracking-tighter">
                      {MONTH_NAMES[gameState?.currentMonth ?? 0]}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] sm:text-[10px] uppercase opacity-50 text-gray-400 flex items-center justify-end">
                      Další za
                      <InfoTooltip content="Čas zbývající do konce aktuálního měsíce a přechodu na další." />
                    </div>
                    <div className={cn(
                      "text-sm sm:text-xl font-bold tabular-nums",
                      timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-white"
                    )}>
                      {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-[9px] sm:text-[10px] uppercase opacity-50 text-gray-400 flex items-center sm:justify-end">
                      {isAdmin ? 'Vybrané poplatky' : 'Hotovost'}
                      <InfoTooltip content={isAdmin ? "Peníze vybrané z poplatků." : "Peníze, které můžete použít k nákupu akcií nebo vložení do pasivního fondu."} />
                    </div>
                    <div className="text-sm sm:text-xl font-bold text-white">${portfolio?.cash.toLocaleString()}</div>
                  </div>
                  {!isAdmin && (
                  <div className="text-right">
                    <div className="text-[9px] sm:text-[10px] uppercase opacity-50 text-gray-400 flex items-center justify-end">
                      Akcie {focusTicker}
                      <InfoTooltip content="Počet akcií této společnosti, které aktuálně vlastníte." />
                    </div>
                    <div className="text-sm sm:text-xl font-bold text-white">{portfolio?.shares[focusTicker] || 0}</div>
                  </div>
                  )}
                </div>
              </div>

              {/* Focus Mode Content */}
              <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                {/* Chart Area */}
                <div className="flex-1 relative min-h-[45vh] sm:min-h-[50vh] lg:min-h-0">
                  <StockChart 
                    ticker={focusTicker} 
                    currentMonth={gameState?.currentMonth ?? 0} 
                    history={gameState?.history || {}}
                    currentPrice={currentPrices?.[focusTicker] || 100}
                    height="h-full"
                    isFocusMode={true}
                    trades={portfolio?.trades}
                    timeLeft={timeLeft}
                  />
                </div>

                {/* Focus Mode Sidebar */}
                <div className="w-full lg:w-80 bg-[#1a1a1a] border-t lg:border-t-0 lg:border-l border-[#2a2b2e] flex flex-col h-full lg:h-auto">
                  {/* Scrollable Upper Content */}
                  <div className="flex-1 p-4 sm:p-6 flex flex-col gap-6 sm:gap-8 overflow-y-auto">
                    {!isAdmin && (
                      <div className="bg-[#0a0a0a] p-3 sm:p-4 border border-[#2a2b2e]">
                        <div className="text-[9px] sm:text-[10px] uppercase text-gray-500 mb-1 flex items-center">
                          Tržní cena
                          <InfoTooltip content="Aktuální cena za jednu akcii na trhu." />
                        </div>
                        <div className="text-2xl sm:text-3xl font-black text-white">${currentPrices?.[focusTicker].toFixed(2)}</div>
                      </div>
                    )}

                    {!isAdmin && (
                    <div className="flex-1">
                      <h3 className="text-[10px] sm:text-xs uppercase opacity-50 mb-3 sm:mb-4 italic serif flex items-center">
                        Podrobnosti o pozici
                        <InfoTooltip content="Informace o vašem aktuálním vlastnictví této akcie." />
                      </h3>
                      <div className="space-y-3 sm:space-y-4">
                        <div className="flex justify-between items-center border-b border-[#2a2b2e] pb-2">
                          <span className="text-[10px] sm:text-xs text-gray-400 flex items-center">
                            Celková hodnota
                            <InfoTooltip content="Aktuální tržní hodnota všech vašich akcií této společnosti." />
                          </span>
                          <span className="text-xs sm:text-sm font-bold text-white">
                            ${((portfolio?.shares[focusTicker] || 0) * (currentPrices?.[focusTicker] || 0)).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between items-center border-b border-[#2a2b2e] pb-2">
                          <span className="text-[10px] sm:text-xs text-gray-400 flex items-center">
                            Průměrná nákupní cena
                            <InfoTooltip content="Průměrná cena, za kterou jste tyto akcie nakoupili." />
                          </span>
                          <span className="text-xs sm:text-sm font-bold text-white">$100.00</span>
                        </div>
                      </div>
                    </div>
                    )}

                    <div className="bg-yellow-600/10 border border-yellow-600/50 p-3 sm:p-4">
                      <div className="text-[9px] sm:text-[10px] uppercase text-yellow-500 font-bold mb-1 flex items-center">
                        Nálada na trhu
                        <InfoTooltip content="Býčí trh (Bull) znamená rostoucí ceny, Medvědí trh (Bear) znamená klesající ceny." />
                      </div>
                      <div className="text-base sm:text-lg font-black text-white italic serif">
                        {gameState?.sentiment === 'Bull' ? 'Býčí' : gameState?.sentiment === 'Bear' ? 'Medvědí' : 'Neutrální'}
                      </div>
                    </div>
                  </div>

                  {/* Sticky Bottom Trading Panel (Only for Players) */}
                  {!isAdmin && gameState && gameState.currentMonth < 11 && (
                  <div className="bg-[#1a1a1a] sm:bg-[#0a0a0a] border-t border-[#2a2b2e] p-4 lg:p-6 sticky bottom-0 z-20 shadow-[0_-10px_20px_rgba(0,0,0,0.5)]">
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <button 
                        onClick={() => handleTrade(focusTicker, 1)}
                        className="bg-green-600 text-white py-3 sm:py-4 font-bold hover:bg-green-500 active:scale-95 transition-all uppercase text-[10px] sm:text-xs"
                      >
                        KOUPIT 1 ks
                      </button>
                      <button 
                        onClick={() => handleTrade(focusTicker, -1)}
                        className="bg-red-600 text-white py-3 sm:py-4 font-bold hover:bg-red-500 active:scale-95 transition-all uppercase text-[10px] sm:text-xs"
                      >
                        PRODAT 1 ks
                      </button>
                      <button 
                        onClick={() => handleTrade(focusTicker, 10)}
                        className="bg-green-600/40 border border-green-600 text-green-500 py-2 sm:py-3 font-bold hover:bg-green-600/50 active:scale-95 transition-all uppercase text-[9px] sm:text-[10px]"
                      >
                        KOUPIT 10 ks
                      </button>
                      <button 
                        onClick={() => handleTrade(focusTicker, -10)}
                        className="bg-red-600/40 border border-red-600 text-red-500 py-2 sm:py-3 font-bold hover:bg-red-600/50 active:scale-95 transition-all uppercase text-[9px] sm:text-[10px]"
                      >
                        PRODAT 10 ks
                      </button>
                    </div>
                    <div className="text-[9px] sm:text-[10px] text-gray-500 text-center flex items-center justify-center gap-1">
                      Poplatek: ${TRADING_FEE}
                      <InfoTooltip content="Poplatek za každou provedenou transakci (nákup i prodej)." />
                    </div>
                  </div>
                  )}

                </div>
              </div>
            </div>
          ) : isAdmin ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                
                {/* Admin Controls Area */}
                <div className="bg-[#1a1a1a] border-2 border-yellow-600/50 p-6 flex flex-col gap-6 shadow-[8px_8px_0px_0px_rgba(255,255,255,0.05)]">
                  <div>
                    <div className="flex items-center gap-3 text-yellow-500 mb-2">
                      <ShieldAlert size={28} />
                      <h2 className="text-xl font-black uppercase italic serif">Řídící Panel</h2>
                    </div>
                    <p className="text-xs text-yellow-500/70">Máte plnou kontrolu nad časem a tržními událostmi.</p>
                  </div>
                  
                  <div className="flex flex-col gap-4">
                    {(!gameState?.nextTickAt && gameState?.currentMonth === 0 && !gameState?.remainingTime) ? (
                      <button 
                        onClick={handleStartGame}
                        className="w-full bg-green-600 text-white py-4 font-bold flex items-center justify-center gap-2 hover:bg-green-500 active:scale-95 transition-all text-sm uppercase tracking-widest"
                      >
                        SPUSTIT SIMULACI
                      </button>
                    ) : (
                      <button 
                        onClick={handleTogglePause}
                        className="w-full bg-yellow-600 text-black py-4 font-bold flex items-center justify-center gap-2 hover:bg-yellow-500 active:scale-95 transition-all text-sm uppercase tracking-widest"
                      >
                        {gameState?.isPaused ? 'POKRAČOVAT V SIMULACI' : 'POZASTAVIT SIMULACI'}
                      </button>
                    )}
                    
                    <div className="grid grid-cols-2 gap-4">
                      <button 
                        onClick={handleTriggerEvent}
                        className="border-2 border-yellow-600 text-yellow-500 py-3 font-bold flex flex-col items-center justify-center hover:bg-yellow-600/10 active:scale-95 transition-all text-xs gap-1"
                      >
                        <span>NÁHODNÁ</span>
                        <span>UDÁLOST</span>
                      </button>
                      <button 
                        onClick={handleResetGame}
                        className={cn(
                          "py-3 font-bold flex flex-col items-center justify-center active:scale-95 transition-all text-xs gap-1",
                          gameState?.currentMonth === 11 
                            ? "bg-white text-black hover:bg-gray-200" 
                            : "border-2 border-red-500 text-red-500 hover:bg-red-500/10"
                        )}
                      >
                        <RefreshCw size={14} />
                        <span>{gameState?.currentMonth === 11 ? 'NOVÁ HRA' : 'RESTART HRY'}</span>
                      </button>
                    </div>
                  </div>
                  
                  <div className="mt-auto pt-4">
                    <p className="text-[10px] text-yellow-500/70 text-center">Pouze administrátor může ovládat trh.</p>
                  </div>
                </div>

                {/* Players List (Span 2) */}
                <div className="xl:col-span-2 bg-[#1a1a1a] border-2 border-[#2a2b2e] p-6 shadow-[8px_8px_0px_0px_rgba(255,255,255,0.05)] flex flex-col">
                  <h2 className="text-xl font-bold mb-6 text-white uppercase flex items-center justify-between">
                    <span>Přehled hráčů ({Object.keys(allPortfolios).length})</span>
                    <Users size={24} className="text-gray-500" />
                  </h2>
                  <div className="flex-1 overflow-y-auto space-y-4 max-h-[400px] pr-2 custom-scrollbar">
                    {(Object.values(allPortfolios) as UserPortfolio[])
                      .filter(p => !rooms.find(r => r.id === roomId)?.createdBy || p.uid !== rooms.find(r => r.id === roomId)?.createdBy)
                      .map(p => ({
                        ...p,
                        netWorth: p.cash + p.passiveFund + Object.entries(p.shares as Record<string, number>).reduce((acc, [t, q]) => acc + q * (currentPrices?.[t as keyof StockPrices] || 0), 0)
                      }))
                      .sort((a, b) => b.netWorth - a.netWorth)
                      .map((p, i) => (
                        <div key={p.uid} className="bg-[#0a0a0a] border border-[#2a2b2e] p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                          <div className="flex items-center gap-4 w-full sm:w-auto">
                            <span className="text-xl font-black text-gray-500 w-6 text-center">{i + 1}.</span>
                            <div>
                               <div className="font-bold text-lg text-white">{p.nickname || 'Anonym'}</div>
                               <div className="text-xs text-gray-400">Akcie: ${(p.shares.AAPL * (currentPrices?.AAPL || 0) + p.shares.NVDA * (currentPrices?.NVDA || 0) + p.shares.WMT * (currentPrices?.WMT || 0)).toLocaleString(undefined, {maximumFractionDigits: 0})} • Pasivní fond: ${p.passiveFund.toLocaleString()}</div>
                            </div>
                          </div>
                          <div className="text-left sm:text-right w-full sm:w-auto mt-2 sm:mt-0 flex flex-row sm:flex-col justify-between sm:justify-center items-center sm:items-end">
                            <div className="text-[10px] uppercase text-gray-500 mb-1 sm:mb-0">CELKOVÁ HODNOTA</div>
                            <div className={cn(
                              "font-black text-xl tabular-nums",
                              p.netWorth >= p.startingCapital ? "text-green-500" : "text-red-500"
                            )}>
                               ${p.netWorth.toLocaleString(undefined, {maximumFractionDigits: 0})}
                            </div>
                          </div>
                        </div>
                      ))}
                    {Object.keys(allPortfolios).length === 0 && (
                      <div className="text-center py-12 text-gray-500 italic">Zatím žádní hráči...</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Market Snapshots */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {(['AAPL', 'NVDA', 'WMT'] as const).map(ticker => {
                   const price = currentPrices?.[ticker] ?? 100;
                   const prevPrice = gameState && gameState.currentMonth > 0 
                     ? MARKET_SCHEDULE[gameState.currentMonth - 1].prices[ticker] 
                     : 100;
                   const diff = price - prevPrice;
                   return (
                     <div key={ticker} className="bg-[#1a1a1a] border-2 border-[#2a2b2e] p-4 flex items-center justify-between shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)]">
                        <div className="flex items-center gap-3">
                           <div className="w-10 h-10 bg-white text-black flex items-center justify-center font-bold text-lg">
                             {ticker[0]}
                           </div>
                           <div className="font-bold text-white text-lg">{ticker}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-white text-xl">${price.toFixed(2)}</div>
                          <div className={cn(
                            "text-xs font-bold flex items-center justify-end gap-1",
                            diff > 0 ? "text-green-500" : diff < 0 ? "text-red-500" : "text-gray-500"
                          )}>
                            {diff > 0 ? '+' : ''}{diff.toFixed(2)} {diff !== 0 && (diff > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />)}
                          </div>
                        </div>
                     </div>
                   );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-6">
              
              {/* === LEFT COLUMN ON DESKTOP, TOP COLUMN ON MOBILE (Overview) === */}
              <div className="w-full lg:w-[350px] xl:w-[400px] flex flex-col gap-6 order-1 lg:order-2">
                {/* OVERVIEW WINDOW */}
                <div className="bg-[#1a1a1a] border-2 border-[#2a2b2e] shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)] sm:shadow-[8px_8px_0px_0px_rgba(255,255,255,0.05)] p-5 sm:p-6 flex flex-col">
                  <h2 className="text-lg font-bold mb-4 flex items-center justify-between text-white uppercase tracking-wider">
                    <span>Váš Přehled</span>
                    <Wallet size={20} className="text-gray-500" />
                  </h2>

                  <div className="flex-1 flex flex-col justify-center space-y-6">
                      <div>
                        <div className="text-[10px] uppercase text-gray-500 mb-1 flex items-center">
                          Celková hodnota (Net Worth)
                          <InfoTooltip content="Součet vaší hotovosti, hodnoty držených akcií a prostředků v pasivním fondu." />
                        </div>
                        <div className="flex items-baseline gap-3">
                          <div className="text-3xl sm:text-4xl font-black text-white">
                            ${((portfolio?.cash || 0) + (portfolio?.passiveFund || 0) + Object.entries((portfolio?.shares as Record<string, number>) || {}).reduce((acc, [t, q]) => acc + q * (currentPrices?.[t as keyof StockPrices] || 0), 0)).toLocaleString(undefined, {maximumFractionDigits: 0})}
                          </div>
                          {portfolio && (
                            <div className={cn(
                              "text-sm font-bold bg-[#0a0a0a] px-2 py-1 border border-[#2a2b2e]", 
                              (((portfolio.cash || 0) + (portfolio.passiveFund || 0) + Object.entries((portfolio.shares as Record<string, number>) || {}).reduce((acc, [t, q]) => acc + q * (currentPrices?.[t as keyof StockPrices] || 0), 0)) - portfolio.startingCapital) >= 0 ? "text-green-500" : "text-red-500"
                            )}>
                              {(((portfolio.cash || 0) + (portfolio.passiveFund || 0) + Object.entries((portfolio.shares as Record<string, number>) || {}).reduce((acc, [t, q]) => acc + q * (currentPrices?.[t as keyof StockPrices] || 0), 0)) - portfolio.startingCapital) >= 0 ? '+' : ''}
                              {(((portfolio.cash || 0) + (portfolio.passiveFund || 0) + Object.entries((portfolio.shares as Record<string, number>) || {}).reduce((acc, [t, q]) => acc + q * (currentPrices?.[t as keyof StockPrices] || 0), 0)) - portfolio.startingCapital).toLocaleString(undefined, {maximumFractionDigits: 0})}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-[#0a0a0a] border border-[#2a2b2e] flex flex-col justify-center">
                          <div className="text-[9px] uppercase text-gray-500 mb-1 leading-tight">{isAdmin ? "Vybrané poplatky" : "Dostupná hotovost"}</div>
                          <div className="text-lg sm:text-xl font-bold text-white">${portfolio?.cash.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                        </div>
                        {!isAdmin && (
                        <div className="p-3 bg-[#0a0a0a] border border-[#2a2b2e] flex flex-col justify-center">
                           <div className="text-[9px] uppercase text-gray-500 mb-1 leading-tight">Pasivní fond (+8%)</div>
                           <div className="text-lg sm:text-xl font-bold text-blue-400">${portfolio?.passiveFund.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                        </div>
                        )}
                      </div>
                      {!isAdmin && (
                      <div className="pt-4 border-t-2 border-[#2a2b2e] border-dashed">
                        <div className="text-[10px] uppercase text-gray-500 mb-3">Rozvržení aktiv</div>
                        <div className="space-y-2">
                          {(['AAPL', 'NVDA', 'WMT'] as const).map(ticker => (
                            <div key={ticker} className="flex justify-between items-center text-xs">
                              <span className="font-bold text-gray-300">{ticker}</span>
                              <span className="text-white bg-[#2a2b2e] px-2 py-1 rounded-sm">{portfolio?.shares[ticker] || 0} ks</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      )}
                    </div>
                </div>

                {/* Passive Fund Window */}
                {!isAdmin && gameState && gameState.currentMonth === 0 ? (
                  <div className="bg-blue-900/10 border-2 border-blue-500/30 p-4 sm:p-6 shadow-[4px_4px_0px_0px_rgba(59,130,246,0.05)] flex flex-col justify-center">
                    <h3 className="text-[10px] sm:text-xs uppercase text-blue-400 mb-2 italic serif flex items-center">
                      Termínovaný Pasivní fond
                      <InfoTooltip content="Garantovaný výnos 8 % na konci roku. Prostředky jsou však uzamčeny a nelze je vybrat dříve." />
                    </h3>
                    <p className="text-[11px] sm:text-xs text-blue-200/50 mb-4">Uzamkněte kapitál pro garantovaný výnos 8 % na konci Q4. Lze investovat pouze nyní (V lednu).</p>
                    
                    {!portfolio?.isPassiveLocked ? (
                      <div className="space-y-3">
                        <button 
                          onClick={() => handleLockPassive(Math.floor((portfolio?.startingCapital || 10000) * 0.25))}
                          disabled={isLockingPassive || (portfolio && portfolio.cash < (portfolio.startingCapital * 0.25))}
                          className="w-full bg-blue-600 text-white py-3 sm:py-4 text-[10px] sm:text-xs font-bold hover:bg-blue-500 active:scale-95 transition-all disabled:opacity-50"
                        >
                          UZAMKNOUT 25% (${Math.floor((portfolio?.startingCapital || 10000) * 0.25).toLocaleString()})
                        </button>
                        <button 
                          onClick={() => handleLockPassive(Math.floor((portfolio?.startingCapital || 10000) * 0.5))}
                          disabled={isLockingPassive || (portfolio && portfolio.cash < (portfolio.startingCapital * 0.5))}
                          className="w-full bg-blue-600 text-white py-3 sm:py-4 text-[10px] sm:text-xs font-bold hover:bg-blue-500 active:scale-95 transition-all disabled:opacity-50"
                        >
                          UZAMKNOUT 50% (${Math.floor((portfolio?.startingCapital || 10000) * 0.5).toLocaleString()})
                        </button>
                      </div>
                    ) : (
                      <div className="p-4 bg-blue-900/40 border border-blue-500/50 text-center font-bold text-blue-300">
                        Investováno ${portfolio?.passiveFund.toLocaleString()}
                      </div>
                    )}
                  </div>
                ) : !isAdmin && gameState && gameState.currentMonth > 0 ? (
                  <div className="bg-[#1a1a1a] border-2 border-[#2a2b2e] opacity-50 p-4 sm:p-6 flex flex-col items-center justify-center text-center">
                    <ShieldAlert size={24} className="mb-2 text-gray-600" />
                    <h3 className="text-[10px] sm:text-xs uppercase text-gray-500 font-bold mb-1">Pasivní Fond Uzavřen</h3>
                    <p className="text-[9px] sm:text-[10px] text-gray-600">Investice byla možná pouze v lednu.</p>
                  </div>
                ) : null}
              </div>

              {/* === RIGHT COLUMN ON DESKTOP, BOTTOM COLUMN ON MOBILE (Charts & Trading) === */}
              <div className="flex-1 flex flex-col gap-6 order-2 lg:order-1">
                {(['AAPL', 'NVDA', 'WMT'] as const).map((ticker) => {
                  const price = currentPrices?.[ticker] ?? 100;
                  const prevPrice = gameState && gameState.currentMonth > 0 
                    ? MARKET_SCHEDULE[gameState.currentMonth - 1].prices[ticker] 
                    : 100;
                  const diff = price - prevPrice;

                  return (
                    <div 
                      key={ticker} 
                      className="bg-[#1a1a1a] border-2 border-[#2a2b2e] shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)] flex flex-col group hover:border-gray-500 transition-colors cursor-pointer active:scale-[0.99]"
                      onClick={() => { setFocusTicker(ticker); setIsFocusMode(true); }}
                    >
                      <div className="p-4 flex items-center justify-between border-b border-[#2a2b2e]">
                        <div className="flex items-center gap-3 md:gap-4">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white text-black flex items-center justify-center font-bold text-lg sm:text-xl">
                            {ticker[0]}
                          </div>
                          <div>
                            <div className="font-bold text-white md:text-xl flex items-center">
                              {ticker}
                              {ticker === 'WMT' && (
                                <InfoTooltip content="WMT vyplácí dividendu $2 každý měsíc za každou drženou akcii." />
                              )}
                            </div>
                            <div className="text-[9px] sm:text-[10px] text-gray-500 uppercase tracking-widest px-1.5 py-0.5 bg-[#2a2b2e]/50 inline-block mt-0.5 rounded-sm">
                              {portfolio?.shares[ticker] || 0} Ks
                            </div>
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end">
                          <div className="text-xl sm:text-2xl font-bold text-white">${price.toFixed(2)}</div>
                          <div className={cn(
                            "text-[10px] sm:text-xs font-bold flex items-center justify-end gap-1 px-2 py-0.5 mt-1 relative overflow-hidden",
                            diff > 0 ? "text-green-400 bg-green-500/10" : diff < 0 ? "text-red-400 bg-red-500/10" : "text-gray-400 bg-gray-500/10"
                          )}>
                            {diff > 0 ? '+' : ''}{diff.toFixed(2)} {diff !== 0 && (diff > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />)}
                          </div>
                        </div>
                      </div>
                      <div className="w-full h-32 sm:h-48 p-2 sm:p-4 pointer-events-none">
                        <StockChart 
                          ticker={ticker} 
                          currentMonth={gameState?.currentMonth ?? 0} 
                          history={gameState?.history || {}}
                          currentPrice={currentPrices?.[ticker] || 100}
                          height="h-full"
                          trades={portfolio?.trades}
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Stock Trading Floor */}
                {!isAdmin && gameState && gameState.currentMonth < 11 && (
                  <div className="bg-[#1a1a1a] border-2 border-[#2a2b2e] p-4 sm:p-6 shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)] mt-4">
                    <h3 className="text-[10px] sm:text-xs uppercase opacity-50 mb-3 sm:mb-4 italic serif flex items-center">
                      Obchodní parket (Akcie)
                      <InfoTooltip content="Zde můžete nakupovat nebo prodávat akcie. Každý obchod stojí malý poplatek." />
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {(['AAPL', 'NVDA', 'WMT'] as const).map((ticker) => (
                        <div key={ticker} className="space-y-2 p-3 bg-[#0a0a0a] border border-[#2a2b2e]">
                          <div className="text-center font-bold text-white mb-2">{ticker}</div>
                          <div className="grid grid-cols-2 gap-2">
                            <button 
                              onClick={() => handleTrade(ticker, 1)}
                              className="w-full bg-white text-black py-2.5 sm:py-2 text-[10px] sm:text-[11px] font-bold hover:bg-gray-200 active:scale-95 transition-all"
                            >
                              Kup 1
                            </button>
                            <button 
                              onClick={() => handleTrade(ticker, -1)}
                              className="w-full border border-white text-white py-2.5 sm:py-2 text-[10px] sm:text-[11px] font-bold hover:bg-white/10 active:scale-95 transition-all"
                            >
                              Prod 1
                            </button>
                            <button 
                              onClick={() => handleTrade(ticker, 10)}
                              className="w-full bg-white/80 text-black py-2.5 sm:py-2 text-[10px] sm:text-[11px] font-bold hover:bg-gray-200 active:scale-95 transition-all"
                            >
                              Kup 10
                            </button>
                            <button 
                              onClick={() => handleTrade(ticker, -10)}
                              className="w-full border border-gray-400 text-gray-300 py-2.5 sm:py-2 text-[10px] sm:text-[11px] font-bold hover:bg-white/10 active:scale-95 transition-all"
                            >
                              Prod 10
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 text-[9px] sm:text-[10px] text-gray-500 text-center">
                      Poplatek za obchod (nákup/prodej): ${TRADING_FEE}
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>

      {/* Game Over Summary */}
        <AnimatePresence>
          {showGameOver && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
            >
              <div className="max-w-2xl w-full bg-[#1a1a1a] border-4 border-white p-8 shadow-[16px_16px_0px_0px_rgba(255,255,255,0.1)] relative">
                <div className="absolute -top-6 -right-6 bg-yellow-500 border-4 border-white p-4 rotate-12">
                  <Trophy size={48} className="text-black" />
                </div>
                <h2 className="text-5xl font-black italic serif uppercase mb-4 text-white">Výroční zpráva</h2>
                <p className="text-xl mb-8 border-l-4 border-white pl-4 italic text-gray-300">
                  "Trh se uzavřel. Přežili jste jeden rok na Wall Street. Podívejme se na váš konečný výsledek."
                </p>
                
                <div className="grid grid-cols-2 gap-8 mb-8">
                  <div className="space-y-2">
                    <div className="text-xs uppercase opacity-50 text-gray-400 flex items-center">
                      {isAdmin ? 'Celkem vybráno poplatků' : 'Celkové jmění'}
                      <InfoTooltip content={isAdmin ? "Vydělali jste na trading poplatcích." : "Konečná hodnota vašeho portfolia (hotovost + akcie) na konci roku."} />
                    </div>
                    <div className="text-4xl font-bold text-white">
                      ${(
                        (portfolio?.cash || 0) + 
                        (isAdmin ? 0 : (Object.entries(portfolio?.shares || {}).reduce((acc: number, [t, q]) => acc + (q as number) * (gameState?.prices?.[t as keyof StockPrices] || 0), 0)))
                      ).toLocaleString()}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs uppercase opacity-50 text-gray-400 flex items-center">
                      {isAdmin ? 'Počet provedených obchodů' : 'Zisk/Ztráta'}
                      <InfoTooltip content={isAdmin ? "Za každý obchod jste jako broker vybral fixní poplatek." : "Rozdíl mezi vaším počátečním kapitálem a konečným jměním."} />
                    </div>
                    <div className={cn(
                      "text-4xl font-bold",
                      isAdmin ? "text-blue-400" : (
                        ((portfolio?.cash || 0) + (Object.entries(portfolio?.shares || {}).reduce((acc: number, [t, q]) => acc + (q as number) * (gameState?.prices?.[t as keyof StockPrices] || 0), 0))) >= (portfolio?.startingCapital || 0) ? "text-green-500" : "text-red-500"
                      )
                    )}>
                      {isAdmin ? '' : (
                        ((portfolio?.cash || 0) + (Object.entries(portfolio?.shares || {}).reduce((acc: number, [t, q]) => acc + (q as number) * (gameState?.prices?.[t as keyof StockPrices] || 0), 0))) >= (portfolio?.startingCapital || 0) ? '+' : ''
                      )}
                      {isAdmin 
                        ? Math.floor((portfolio?.cash || 0) / TRADING_FEE)
                        : (((portfolio?.cash || 0) + (Object.entries(portfolio?.shares || {}).reduce((acc: number, [t, q]) => acc + (q as number) * (gameState?.prices?.[t as keyof StockPrices] || 0), 0))) - (portfolio?.startingCapital || 0)).toLocaleString()
                      }
                    </div>
                  </div>
                </div>

                {!isAdmin && (
                <div className="bg-[#0a0a0a] p-4 border-2 border-[#2a2b2e] mb-8">
                  <h3 className="font-bold uppercase text-xs mb-2 text-gray-500">Konečné složení portfolia</h3>
                  <div className="flex gap-4">
                    {(['AAPL', 'NVDA', 'WMT'] as const).map(t => (
                      <div key={t} className="flex-1 text-center border-r border-[#2a2b2e] last:border-none">
                        <div className="text-lg font-bold text-white">{portfolio?.shares[t] || 0}</div>
                        <div className="text-[10px] uppercase opacity-50">{t}</div>
                      </div>
                    ))}
                  </div>
                </div>
                )}

                <div className="bg-[#0a0a0a] p-4 border-2 border-[#2a2b2e] mb-8 max-h-[250px] overflow-y-auto">
                  <h3 className="font-bold uppercase text-xs mb-2 flex items-center justify-between text-yellow-500">
                    SÍŇ SLÁVY (LEADERBOARD)
                    <Trophy size={14} className="text-yellow-500" />
                  </h3>
                  <div className="space-y-2">
                    {leaderboard.length === 0 ? (
                      <div className="text-[10px] text-gray-500 italic text-center py-2">Načítání výsledků...</div>
                    ) : (
                      leaderboard.map((p, index) => {
                        const netWorth = p.cash + (p.shares.AAPL * (gameState?.prices?.AAPL || 0)) + (p.shares.NVDA * (gameState?.prices?.NVDA || 0)) + (p.shares.WMT * (gameState?.prices?.WMT || 0)) + p.passiveFund;
                        const isMe = p.uid === user?.uid;
                        return (
                          <div key={p.uid} className={cn("flex justify-between items-center p-2 text-sm border-b border-[#2a2b2e] last:border-0", isMe ? "bg-white/10 font-bold" : "")}>
                            <div className="flex items-center gap-3">
                              <span className={cn("text-xs w-4", index === 0 ? "text-yellow-500 font-black" : index === 1 ? "text-gray-300" : index === 2 ? "text-orange-400" : "text-gray-600")}>
                                #{index + 1}
                              </span>
                              <span className={cn(isMe ? "text-white" : "text-gray-300")}>{p.nickname || p.email.split('@')[0]}</span>
                            </div>
                            <div className={cn("tabular-nums", netWorth >= p.startingCapital ? "text-[#22c55e]" : "text-[#ef4444]")}>
                              ${netWorth.toLocaleString()}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <button 
                  onClick={() => setShowGameOver(false)}
                  className="w-full bg-white text-black py-4 font-bold hover:bg-gray-200 transition-colors uppercase tracking-widest"
                >
                  Zpět na přehled
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer / Educational */}
        <footer className="text-center text-[10px] uppercase opacity-30 pt-12">
          Jeden rok na Wall Street © 2026 • Volatilita je váš přítel • Býčí trhy vytvářejí bohatství, medvědí trhy vytvářejí příležitosti.
        </footer>
        {/* Leave Confirmation Modal */}
        <AnimatePresence>
          {showLeaveConfirm && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="max-w-md w-full bg-[#1a1a1a] border-2 border-white p-8 shadow-[12px_12px_0px_0px_rgba(255,255,255,0.1)]"
              >
                <div className="flex items-center gap-3 text-yellow-500 mb-4">
                  <AlertCircle size={24} />
                  <h2 className="text-xl font-black uppercase italic serif">Opustit hru?</h2>
                </div>
                <p className="text-sm opacity-70 mb-6 leading-relaxed">
                  Opravdu chcete tuto místnost opustit? Místnost bude dále běžet a můžete se do ní kdykoliv vrátit.
                </p>
                <div className="flex gap-4">
                  <button 
                    onClick={() => {
                      setRoomId(null);
                      setShowLeaveConfirm(false);
                    }}
                    className="flex-1 bg-white text-black py-3 font-bold hover:bg-gray-200 transition-colors"
                  >
                    ODEJÍT
                  </button>
                  <button 
                    onClick={() => setShowLeaveConfirm(false)}
                    className="flex-1 border-2 border-white text-white py-3 font-bold hover:bg-white/10 transition-colors"
                  >
                    ZRUŠIT
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Delete Confirmation Modal for Inside Room */}
        <AnimatePresence>
          {deletingRoomId && roomId && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 border-[10px] border-[#0a0a0a]"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-[#1a1a1a] p-8 max-w-md w-full border-2 border-red-500 shadow-[8px_8px_0px_0px_rgba(239,68,68,0.2)]"
              >
                <div className="flex items-center gap-3 text-red-500 mb-4">
                  <AlertCircle size={24} />
                  <h2 className="text-xl font-black uppercase italic serif">Smazat místnost?</h2>
                </div>
                <p className="text-sm opacity-70 mb-6 leading-relaxed">
                  Opravdu chcete tuto místnost definitivně smazat? Všechna data her budou ztracena pro všechny hráče. Tato akce je nevratná.
                </p>
                <div className="flex gap-4">
                  <button 
                    onClick={confirmDeleteRoom}
                    className="flex-1 bg-red-500 text-white py-3 font-bold hover:bg-red-600 transition-colors"
                  >
                    SMAZAT
                  </button>
                  <button 
                    onClick={cancelDeleteRoom}
                    className="flex-1 border-2 border-white text-white py-3 font-bold hover:bg-white/10 transition-colors"
                  >
                    ZRUŠIT
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Insufficient Funds Modal */}
        <AnimatePresence>
          {insufficientFundsMessage && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 border-[10px] border-[#0a0a0a]"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="max-w-md w-full bg-[#1a1a1a] border-2 border-red-500 p-8 shadow-[12px_12px_0px_0px_rgba(239,68,68,0.2)] text-center"
              >
                <div className="flex justify-center mb-4">
                  <div className="bg-red-500/20 p-4 rounded-full">
                    <Wallet size={32} className="text-red-500" />
                  </div>
                </div>
                <h2 className="text-2xl font-black uppercase italic serif text-white mb-2">Nedostatek prostředků</h2>
                <p className="text-sm text-gray-400 mb-8 leading-relaxed">
                  {insufficientFundsMessage}
                </p>
                <button 
                  onClick={() => setInsufficientFundsMessage(null)}
                  className="w-full bg-white text-black py-4 font-bold hover:bg-gray-200 transition-colors uppercase tracking-widest text-sm"
                >
                  ROZUMÍM
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
