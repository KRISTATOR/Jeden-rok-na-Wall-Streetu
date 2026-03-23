import { useState, useEffect, useMemo } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User 
} from 'firebase/auth';
import { 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  getDocs,
  collection,
  increment,
  query,
  where,
  orderBy,
  limit,
  addDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { 
  GameState, 
  UserPortfolio, 
  StockPrices,
  Room,
  CandleData
} from './types';
import { 
  MARKET_SCHEDULE, 
  INITIAL_CAPITAL_MIN,
  INITIAL_CAPITAL_MAX,
  PASSIVE_FUND_RETURN,
  TRADING_FEE
} from './constants';
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
  ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ComposedChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  ReferenceLine
} from 'recharts';

const PRICE_IMPACT = 2.5; // Increased from 0.5 for more noticeable effect

const CandlestickShape = (props: any) => {
  const { x, y, width, height, low, high, open, close, isUp } = props;
  const color = isUp ? "#22c55e" : "#ef4444";
  
  // Ensure a minimum thickness for the body
  const minHeight = 4;
  const displayHeight = Math.max(height, minHeight);
  const displayY = y - (displayHeight - height) / 2;

  const bodyTop = y;
  const bodyBottom = y + height;
  
  // Fallback pixelsPerUnit if height is 0 (flat candle)
  // We try to estimate it from the props if possible, otherwise use a small default
  const priceRange = Math.abs(open - close) || 0.01;
  const pixelsPerUnit = height / priceRange;
  
  const highPx = isUp 
    ? bodyTop - (high - close) * pixelsPerUnit 
    : bodyTop - (high - open) * pixelsPerUnit;
    
  const lowPx = isUp
    ? bodyBottom + (open - low) * pixelsPerUnit
    : bodyBottom + (close - low) * pixelsPerUnit;

  return (
    <g>
      <line
        x1={x + width / 2}
        y1={isNaN(highPx) ? displayY : highPx}
        x2={x + width / 2}
        y2={isNaN(lowPx) ? displayY + displayHeight : lowPx}
        stroke={color}
        strokeWidth={1}
      />
      <rect
        x={x}
        y={displayY}
        width={width}
        height={displayHeight}
        fill={color}
      />
    </g>
  );
};

interface StockChartProps {
  ticker: keyof StockPrices;
  currentQuarter: number;
  history: { [ticker: string]: CandleData[] };
  currentPrice: number;
  height?: string;
  isFocusMode?: boolean;
}

function StockChart({ ticker, currentQuarter, history, currentPrice, height = "h-80", isFocusMode = false }: StockChartProps) {
  const data = useMemo(() => {
    const tickerHistory = history[ticker] || [];
    
    const lastCandle = tickerHistory[tickerHistory.length - 1];
    const liveCandle: CandleData = {
      time: Date.now(),
      open: lastCandle ? lastCandle.close : 100,
      close: currentPrice,
      high: Math.max(lastCandle ? lastCandle.close : 100, currentPrice, lastCandle ? lastCandle.high : currentPrice),
      low: Math.min(lastCandle ? lastCandle.close : 100, currentPrice, lastCandle ? lastCandle.low : currentPrice)
    };

    const allData = [...tickerHistory, liveCandle].map((c, idx) => {
      const isUp = c.close >= c.open;
      return {
        ...c,
        name: `T${idx}`,
        isUp,
        bodyRange: [Math.min(c.open, c.close), Math.max(c.open, c.close)]
      };
    });

    return allData;
  }, [ticker, history, currentPrice]);

  const lastIsUp = data[data.length - 1]?.isUp;

  return (
    <div className={cn(height, "w-full bg-[#050505] rounded-none p-4 border border-[#1a1a1a] shadow-2xl relative overflow-hidden font-mono")}>
      <div className="absolute inset-0 pointer-events-none opacity-5" 
           style={{ 
             backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)', 
             backgroundSize: '40px 40px' 
           }} />
      
      <div className="absolute top-4 left-4 z-10 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full animate-pulse", lastIsUp ? "bg-[#22c55e]" : "bg-[#ef4444]")} />
          <span className="text-[10px] text-gray-500 uppercase tracking-[0.2em] font-bold">Live Terminal</span>
        </div>
        <div className="text-[10px] text-gray-400 border-l border-white/10 pl-4 uppercase tracking-widest">
          {ticker} / USD
        </div>
      </div>

      <div className="absolute top-4 right-4 z-10 text-right">
        <div className={cn("text-2xl font-black tracking-tighter", lastIsUp ? "text-[#22c55e]" : "text-[#ef4444]")}>
          ${currentPrice.toFixed(2)}
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart 
          data={data} 
          margin={{ top: 40, right: 0, left: -20, bottom: 0 }}
          barCategoryGap={1}
        >
          <CartesianGrid strokeDasharray="0" stroke="#111" vertical={true} horizontal={true} />
          <XAxis dataKey="name" hide={true} />
          <YAxis 
            yAxisId="price"
            stroke="#333" 
            fontSize={9}
            tickLine={false}
            axisLine={false}
            domain={[(dataMin: number) => dataMin * 0.98, (dataMax: number) => dataMax * 1.02]}
            orientation="right"
            tickFormatter={(val) => `$${val}`}
          />
          <Tooltip 
            cursor={{ stroke: '#333', strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const d = payload[0].payload;
                return (
                  <div className="bg-[#0a0a0a] border border-[#2a2b2e] p-3 shadow-2xl backdrop-blur-md bg-opacity-95 z-50">
                    <p className="text-[9px] text-gray-500 mb-2 font-bold uppercase tracking-widest">OHLC Data</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                      <span className="text-gray-500 text-[9px]">O</span>
                      <span className="text-white text-[9px] text-right">${d.open.toFixed(2)}</span>
                      <span className="text-gray-500 text-[9px]">H</span>
                      <span className="text-[#22c55e] text-[9px] text-right">${d.high.toFixed(2)}</span>
                      <span className="text-gray-500 text-[9px]">L</span>
                      <span className="text-[#ef4444] text-[9px] text-right">${d.low.toFixed(2)}</span>
                      <span className="text-gray-500 text-[9px]">C</span>
                      <span className="text-white text-[9px] text-right font-bold">${d.close.toFixed(2)}</span>
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
          
          <ReferenceLine 
            yAxisId="price"
            y={currentPrice} 
            stroke={lastIsUp ? "#22c55e" : "#ef4444"} 
            strokeDasharray="3 3" 
            strokeOpacity={0.5}
            label={{ 
              position: 'right', 
              value: `$${currentPrice.toFixed(2)}`, 
              fill: lastIsUp ? "#22c55e" : "#ef4444", 
              fontSize: 10,
              fontWeight: 'bold'
            }} 
          />

          <Bar 
            yAxisId="price"
            dataKey="bodyRange" 
            shape={<CandlestickShape />}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
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
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [focusTicker, setFocusTicker] = useState<keyof StockPrices>('AAPL');
  const [newRoomName, setNewRoomName] = useState("");

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  // Rooms List Listener
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'rooms'), orderBy('createdAt', 'desc'), limit(10));
    return onSnapshot(q, (snap) => {
      const r = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Room));
      setRooms(r);
    });
  }, [user]);

  // Game State Listener (Room Specific)
  useEffect(() => {
    if (!user || !roomId) {
      setGameState(null);
      return;
    }

    let isCreator = false;

    const unsub = onSnapshot(doc(db, 'rooms', roomId), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Room;
        setGameState(data.gameState);
        isCreator = data.createdBy === user.uid;
        if (data.gameState.currentQuarter === 4) {
          setShowGameOver(true);
        } else {
          setShowGameOver(false);
        }
      }
    }, (err) => {
      console.error('GameState Snapshot Error:', err);
      if (err.code === 'permission-denied') {
        setError('Market data access denied.');
      }
    });

    // Auto-delete room when admin leaves
    return () => {
      unsub();
      if (isCreator && roomId) {
        // We use a separate async call to delete, but we don't await it in the cleanup
        deleteDoc(doc(db, 'rooms', roomId)).catch(e => console.error("Failed to auto-delete room:", e));
      }
    };
  }, [user, roomId]);

  // Portfolio Listener (Room Specific)
  useEffect(() => {
    if (!user || !roomId) {
      setPortfolio(null);
      return;
    }

    const unsub = onSnapshot(doc(db, 'rooms', roomId, 'portfolios', user.uid), (snap) => {
      if (snap.exists()) {
        setPortfolio(snap.data() as UserPortfolio);
      } else {
        // Initialize portfolio in this room
        const randomCapital = Math.floor(Math.random() * (INITIAL_CAPITAL_MAX - INITIAL_CAPITAL_MIN + 1)) + INITIAL_CAPITAL_MIN;
        const initialPortfolio: UserPortfolio = {
          uid: user.uid,
          roomId: roomId,
          email: user.email || '',
          cash: randomCapital,
          startingCapital: randomCapital,
          shares: { AAPL: 0, NVDA: 0, WMT: 0 },
          passiveFund: 0,
          isPassiveLocked: false
        };
        setDoc(doc(db, 'rooms', roomId, 'portfolios', user.uid), initialPortfolio);
      }
    }, (err) => {
      console.error('Portfolio Snapshot Error:', err);
      if (err.code === 'permission-denied') {
        setError('Portfolio access denied.');
      }
    });
    return unsub;
  }, [user, roomId]);

  // Dividend & Final Return Logic
  useEffect(() => {
    if (!portfolio || !gameState || !user || !roomId) return;

    // Q3 Dividend
    if (gameState.currentQuarter === 3 && !portfolio.isQ3DividendPaid) {
      const dividend = portfolio.shares.WMT * 10;
      if (dividend > 0) {
        updateDoc(doc(db, 'rooms', roomId, 'portfolios', user.uid), {
          cash: portfolio.cash + dividend,
          isQ3DividendPaid: true
        });
      } else {
        updateDoc(doc(db, 'rooms', roomId, 'portfolios', user.uid), { isQ3DividendPaid: true });
      }
    }

    // Q4 Final Return
    if (gameState.currentQuarter === 4 && !portfolio.isQ4FinalPaid) {
      const finalReturn = portfolio.passiveFund * (1 + PASSIVE_FUND_RETURN);
      if (finalReturn > 0) {
        updateDoc(doc(db, 'rooms', roomId, 'portfolios', user.uid), {
          cash: portfolio.cash + finalReturn,
          passiveFund: 0,
          isQ4FinalPaid: true
        });
      } else {
        updateDoc(doc(db, 'rooms', roomId, 'portfolios', user.uid), { isQ4FinalPaid: true });
      }
    }
  }, [gameState?.currentQuarter, portfolio?.uid, roomId]);

  const handleCreateRoom = async () => {
    if (!user || !newRoomName.trim()) return;
    
    const initialState: GameState = {
      ...MARKET_SCHEDULE[0].state,
      prices: MARKET_SCHEDULE[0].prices,
      history: { 0: MARKET_SCHEDULE[0].prices }
    };

    const roomRef = await addDoc(collection(db, 'rooms'), {
      name: newRoomName,
      createdBy: user.uid,
      createdAt: Date.now(),
      gameState: initialState
    });

    setRoomId(roomRef.id);
    setNewRoomName("");
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      setError('Login failed. Please try again.');
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setRoomId(null);
  };

  const isAdmin = useMemo(() => {
    if (!user || !roomId) return false;
    const room = rooms.find(r => r.id === roomId);
    return room?.createdBy === user.uid;
  }, [user, roomId, rooms]);

  const handleNextQuarter = async () => {
    if (!isAdmin) {
      setError('Only the Room Admin can move the market time.');
      return;
    }
    if (!gameState || !roomId) return;

    if (gameState.currentQuarter >= 4) {
      setError('The year has ended.');
      return;
    }

    const nextQ = gameState.currentQuarter + 1;
    const schedule = MARKET_SCHEDULE[nextQ];
    const randomNews = schedule.newsPool[Math.floor(Math.random() * schedule.newsPool.length)];
    
    const nextPrices = { ...schedule.prices };
    
    // Record the transition as a candle for each ticker
    const nextHistory = { ...gameState.history };
    (['AAPL', 'NVDA', 'WMT'] as const).forEach(ticker => {
      const tickerHistory = nextHistory[ticker] || [];
      const lastCandle = tickerHistory[tickerHistory.length - 1];
      const open = lastCandle ? lastCandle.close : 100;
      const close = nextPrices[ticker];
      
      const newCandle: CandleData = {
        time: Date.now(),
        open,
        close,
        high: Math.max(open, close) + (Math.random() * 10),
        low: Math.min(open, close) - (Math.random() * 10)
      };
      nextHistory[ticker] = [...tickerHistory, newCandle];
    });

    await updateDoc(doc(db, 'rooms', roomId), { 
      'gameState.currentQuarter': nextQ,
      'gameState.sentiment': schedule.state.sentiment,
      'gameState.prices': nextPrices,
      'gameState.history': nextHistory,
      'gameState.newsFlash': randomNews
    });
  };

  const handleResetGame = async () => {
    if (!isAdmin || !roomId) return;
    
    const initialState: GameState = {
      ...MARKET_SCHEDULE[0].state,
      prices: MARKET_SCHEDULE[0].prices,
      history: {
        AAPL: [{ time: Date.now(), open: 100, high: 100, low: 100, close: 100 }],
        NVDA: [{ time: Date.now(), open: 100, high: 100, low: 100, close: 100 }],
        WMT: [{ time: Date.now(), open: 100, high: 100, low: 100, close: 100 }]
      }
    };

    await updateDoc(doc(db, 'rooms', roomId), { gameState: initialState });
  };

  const handleTrade = async (ticker: keyof StockPrices, amount: number) => {
    if (!user || !portfolio || !gameState || !roomId) return;
    
    const currentPrice = gameState.prices[ticker];
    const tradeValue = currentPrice * Math.abs(amount);

    if (amount > 0) { // Buy
      const totalCost = tradeValue + TRADING_FEE;
      if (portfolio.cash < totalCost) {
        setError(`Insufficient funds! Need $${totalCost.toLocaleString()} (incl. $${TRADING_FEE} fee)`);
        return;
      }
      
      await updateDoc(doc(db, 'rooms', roomId, 'portfolios', user.uid), {
        cash: portfolio.cash - totalCost,
        [`shares.${ticker}`]: portfolio.shares[ticker] + amount
      });

      const priceChange = PRICE_IMPACT * amount;
      const nextPrice = currentPrice + priceChange;

      // Record trade as a candle
      const tickerHistory = gameState.history[ticker] || [];
      const newCandle: CandleData = {
        time: Date.now(),
        open: currentPrice,
        close: nextPrice,
        high: Math.max(currentPrice, nextPrice) + (Math.random() * 2),
        low: Math.min(currentPrice, nextPrice) - (Math.random() * 2)
      };

      await updateDoc(doc(db, 'rooms', roomId), {
        [`gameState.prices.${ticker}`]: nextPrice,
        [`gameState.history.${ticker}`]: [...tickerHistory, newCandle]
      });

    } else { // Sell
      if (portfolio.shares[ticker] < Math.abs(amount)) {
        setError('Not enough shares!');
        return;
      }

      const netProceeds = tradeValue - TRADING_FEE;
      
      await updateDoc(doc(db, 'rooms', roomId, 'portfolios', user.uid), {
        cash: portfolio.cash + netProceeds,
        [`shares.${ticker}`]: portfolio.shares[ticker] + amount
      });

      const priceChange = PRICE_IMPACT * amount; // amount is negative
      const nextPrice = currentPrice + priceChange;

      // Record trade as a candle
      const tickerHistory = gameState.history[ticker] || [];
      const newCandle: CandleData = {
        time: Date.now(),
        open: currentPrice,
        close: nextPrice,
        high: Math.max(currentPrice, nextPrice) + (Math.random() * 2),
        low: Math.min(currentPrice, nextPrice) - (Math.random() * 2)
      };

      await updateDoc(doc(db, 'rooms', roomId), {
        [`gameState.prices.${ticker}`]: nextPrice,
        [`gameState.history.${ticker}`]: [...tickerHistory, newCandle]
      });
    }
    setError(null);
  };

  const handleLockPassive = async (amount: number) => {
    if (!user || !portfolio || !gameState || !roomId) return;
    if (gameState.currentQuarter > 0) {
      setError('Passive Fund is only available in Q0.');
      return;
    }

    if (amount > 0) {
      if (portfolio.cash < amount) {
        setError('Insufficient funds!');
        return;
      }
      await updateDoc(doc(db, 'rooms', roomId, 'portfolios', user.uid), {
        cash: portfolio.cash - amount,
        passiveFund: portfolio.passiveFund + amount
      });
    }
  };

  const handleTriggerEvent = async () => {
    if (!isAdmin || !gameState || !roomId) return;
    
    const schedule = MARKET_SCHEDULE[gameState.currentQuarter];
    const randomNews = schedule.newsPool[Math.floor(Math.random() * schedule.newsPool.length)];
    
    await updateDoc(doc(db, 'rooms', roomId), { 
      'gameState.newsFlash': randomNews
    });
  };

  const renderASCIIChart = (ticker: keyof StockPrices) => {
    if (!gameState) return null;
    const history = Array.from({ length: gameState.currentQuarter + 1 }, (_, i) => MARKET_SCHEDULE[i].prices[ticker]);
    const max = Math.max(...Object.values(MARKET_SCHEDULE).map(s => s.prices[ticker]));
    const min = Math.min(...Object.values(MARKET_SCHEDULE).map(s => s.prices[ticker]));
    
    const bars = history.map(p => {
      const height = Math.round(((p - min) / (max - min || 1)) * 5);
      const chars = [' ', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
      return chars[height] || ' ';
    }).join('');

    return `[ ${bars.padEnd(5, ' ')} ] $${MARKET_SCHEDULE[gameState.currentQuarter].prices[ticker]}`;
  };

  if (loading) return <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0] flex items-center justify-center font-mono">Loading Simulation...</div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0] flex items-center justify-center p-4 font-mono">
        <div className="max-w-md w-full bg-[#1a1a1a] border-2 border-[#2a2b2e] p-8 shadow-[8px_8px_0px_0px_rgba(255,255,255,0.05)]">
          <h1 className="text-3xl font-bold mb-6 italic serif text-white">One Year on Wall Street</h1>
          <p className="mb-8 text-gray-400">Identify yourself to the Bank to begin your simulation.</p>
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-2 bg-white text-black p-4 hover:bg-gray-200 transition-colors font-bold"
          >
            <LogIn size={20} />
            Login with Google
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
            <h1 className="text-4xl font-black italic serif uppercase tracking-tighter text-white">Market Lobby</h1>
            <button onClick={handleLogout} className="flex items-center gap-2 hover:underline text-sm opacity-70 hover:opacity-100">
              <LogOut size={16} /> Logout
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Create Room */}
            <div className="bg-[#1a1a1a] border-2 border-[#2a2b2e] p-8 shadow-[8px_8px_0px_0px_rgba(255,255,255,0.05)]">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
                <Plus size={20} /> Create New Room
              </h2>
              <p className="text-sm text-gray-400 mb-6">Start a new simulation. You will be the admin of this room.</p>
              <div className="space-y-4">
                <input 
                  type="text" 
                  placeholder="Room Name (e.g. Wall Street 2026)"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className="w-full bg-[#0a0a0a] border-2 border-[#2a2b2e] p-4 text-white focus:border-white outline-none transition-colors"
                />
                <button 
                  onClick={handleCreateRoom}
                  disabled={!newRoomName.trim()}
                  className="w-full bg-white text-black p-4 font-bold hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  INITIALIZE ROOM
                </button>
              </div>
            </div>

            {/* Join Room */}
            <div className="bg-[#1a1a1a] border-2 border-[#2a2b2e] p-8 shadow-[8px_8px_0px_0px_rgba(255,255,255,0.05)]">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
                <Users size={20} /> Join Active Room
              </h2>
              <p className="text-sm text-gray-400 mb-6">Enter an existing simulation and compete with others.</p>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                {rooms.length === 0 ? (
                  <div className="text-center py-8 text-gray-600 italic">No active rooms found.</div>
                ) : (
                  rooms.map(room => (
                    <button 
                      key={room.id}
                      onClick={() => setRoomId(room.id)}
                      className="w-full flex items-center justify-between bg-[#0a0a0a] border-2 border-[#2a2b2e] p-4 hover:border-white transition-all group"
                    >
                      <div className="text-left">
                        <div className="font-bold text-white group-hover:text-white">{room.name}</div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">
                          Created {new Date(room.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <ChevronRight size={20} className="text-gray-500 group-hover:text-white" />
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentPrices = gameState?.prices || null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0] font-mono p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b-2 border-[#2a2b2e] pb-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowLeaveConfirm(true)}
              className="p-2 hover:bg-white/5 rounded-full transition-colors"
              title="Back to Lobby"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-4xl font-black italic serif uppercase tracking-tighter text-white">
                {rooms.find(r => r.id === roomId)?.name || "One Year on Wall Street"}
              </h1>
              <div className="flex items-center gap-2 mt-2">
                <span className="bg-white text-black px-2 py-0.5 text-xs uppercase font-bold">Live Simulation</span>
                <span className="text-xs opacity-50">{user.email}</span>
                {isAdmin && <span className="text-[10px] bg-yellow-600 text-black px-1 font-bold">ADMIN</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsFocusMode(!isFocusMode)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all border-2",
                isFocusMode 
                  ? "bg-white text-black border-white" 
                  : "bg-transparent text-white border-[#2a2b2e] hover:border-white"
              )}
            >
              {isFocusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              {isFocusMode ? "Exit Focus" : "Focus Mode"}
            </button>
            <button onClick={handleLogout} className="flex items-center gap-2 hover:underline text-sm opacity-70 hover:opacity-100">
              <LogOut size={16} /> Logout
            </button>
          </div>
        </header>

        {/* Market Status */}
        {!isFocusMode && (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[#1a1a1a] border-2 border-[#2a2b2e] p-6 shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)]">
              <h2 className="text-xs uppercase opacity-50 mb-2 italic serif">Current Quarter</h2>
              <div className="text-4xl font-bold text-white">Q{gameState?.currentQuarter ?? 0}</div>
            </div>
            <div className={cn(
              "border-2 border-[#2a2b2e] p-6 shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)]",
              gameState?.sentiment === 'Bull' ? "bg-green-900/20 border-green-500/50" : gameState?.sentiment === 'Bear' ? "bg-red-900/20 border-red-500/50" : "bg-[#1a1a1a]"
            )}>
              <h2 className="text-xs uppercase opacity-50 mb-2 italic serif">Market Sentiment</h2>
              <div className="text-4xl font-bold flex items-center gap-2 text-white">
                {gameState?.sentiment}
                {gameState?.sentiment === 'Bull' && <TrendingUp size={32} className="text-green-500" />}
                {gameState?.sentiment === 'Bear' && <TrendingDown size={32} className="text-red-500" />}
              </div>
            </div>
            <div className="bg-[#1a1a1a] border-2 border-white p-6 shadow-[4px_4px_0px_0px_rgba(255,255,255,0.05)]">
              <h2 className="text-xs uppercase opacity-50 mb-2 italic serif text-white/50">News Flash</h2>
              <p className="text-sm leading-tight italic font-bold text-white">"{gameState?.newsFlash}"</p>
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
              <button onClick={() => setError(null)} className="text-xs underline">Dismiss</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Dashboard */}
        <div className="max-w-7xl mx-auto px-4 py-8">
          {isFocusMode ? (
            <div className="fixed inset-0 z-40 bg-[#050505] flex flex-col">
              {/* Focus Mode Header */}
              <div className="bg-[#1a1a1a] border-b border-[#2a2b2e] p-4 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <button 
                    onClick={() => setIsFocusMode(false)}
                    className="p-2 hover:bg-white/10 text-white transition-colors"
                  >
                    <ArrowLeft size={24} />
                  </button>
                  <div className="flex gap-2">
                    {(['AAPL', 'NVDA', 'WMT'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setFocusTicker(t)}
                        className={cn(
                          "px-4 py-2 text-xs font-bold transition-all",
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
                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <div className="text-[10px] uppercase opacity-50 text-gray-400">Available Cash</div>
                    <div className="text-xl font-bold text-white">${portfolio?.cash.toLocaleString()}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase opacity-50 text-gray-400">{focusTicker} Shares</div>
                    <div className="text-xl font-bold text-white">{portfolio?.shares[focusTicker] || 0}</div>
                  </div>
                </div>
              </div>

              {/* Focus Mode Content */}
              <div className="flex-1 flex overflow-hidden">
                {/* Chart Area */}
                <div className="flex-1 relative">
                  <StockChart 
                    ticker={focusTicker} 
                    currentQuarter={gameState?.currentQuarter ?? 0} 
                    history={gameState?.history || {}}
                    currentPrice={currentPrices?.[focusTicker] || 100}
                    height="h-full"
                    isFocusMode={true}
                  />
                </div>

                {/* Focus Mode Sidebar */}
                <div className="w-80 bg-[#1a1a1a] border-l border-[#2a2b2e] p-6 flex flex-col gap-8">
                  <div>
                    <h3 className="text-xs uppercase opacity-50 mb-4 italic serif">Execution Panel</h3>
                    <div className="space-y-4">
                      <div className="bg-[#0a0a0a] p-4 border border-[#2a2b2e]">
                        <div className="text-[10px] uppercase text-gray-500 mb-1">Market Price</div>
                        <div className="text-3xl font-black text-white">${currentPrices?.[focusTicker].toFixed(2)}</div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <button 
                          onClick={() => handleTrade(focusTicker, 1)}
                          className="bg-green-600 text-white py-4 font-bold hover:bg-green-500 transition-colors uppercase text-xs"
                        >
                          BUY 1
                        </button>
                        <button 
                          onClick={() => handleTrade(focusTicker, -1)}
                          className="bg-red-600 text-white py-4 font-bold hover:bg-red-500 transition-colors uppercase text-xs"
                        >
                          SELL 1
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button 
                          onClick={() => handleTrade(focusTicker, 10)}
                          className="bg-green-600/20 border border-green-600 text-green-500 py-3 font-bold hover:bg-green-600/30 transition-colors uppercase text-[10px]"
                        >
                          BUY 10
                        </button>
                        <button 
                          onClick={() => handleTrade(focusTicker, -10)}
                          className="bg-red-600/20 border border-red-600 text-red-500 py-3 font-bold hover:bg-red-600/30 transition-colors uppercase text-[10px]"
                        >
                          SELL 10
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1">
                    <h3 className="text-xs uppercase opacity-50 mb-4 italic serif">Position Details</h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-[#2a2b2e] pb-2">
                        <span className="text-xs text-gray-400">Total Value</span>
                        <span className="text-sm font-bold text-white">
                          ${((portfolio?.shares[focusTicker] || 0) * (currentPrices?.[focusTicker] || 0)).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between items-center border-b border-[#2a2b2e] pb-2">
                        <span className="text-xs text-gray-400">Avg Cost</span>
                        <span className="text-sm font-bold text-white">$100.00</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-yellow-600/10 border border-yellow-600/50 p-4">
                    <div className="text-[10px] uppercase text-yellow-500 font-bold mb-1">Market Sentiment</div>
                    <div className="text-lg font-black text-white italic serif">{gameState?.sentiment}</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className={cn(
              "grid gap-8",
              isFocusMode ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"
            )}>
          {/* Market Data */}
          <div className="space-y-6">
            <div className="bg-[#1a1a1a] border-2 border-[#2a2b2e] overflow-hidden shadow-[8px_8px_0px_0px_rgba(255,255,255,0.05)]">
              <div className="bg-[#2a2b2e] text-white px-4 py-2 text-xs uppercase font-bold flex justify-between items-center">
                <span>{isFocusMode ? "Market Overview (Focus Mode)" : "Market Prices"}</span>
                <span className="flex items-center gap-1 opacity-50"><History size={12} /> Real-time Feed</span>
              </div>
              <div className={cn(
                "divide-y-2 divide-[#2a2b2e]",
                isFocusMode ? "grid grid-cols-1 md:grid-cols-3 divide-y-0 divide-x-2" : ""
              )}>
                {(['AAPL', 'NVDA', 'WMT'] as const).map((ticker) => {
                  const price = currentPrices?.[ticker] ?? 100;
                  const prevPrice = gameState && gameState.currentQuarter > 0 
                    ? MARKET_SCHEDULE[gameState.currentQuarter - 1].prices[ticker] 
                    : 100;
                  const diff = price - prevPrice;

                  return (
                    <div key={ticker} className={cn(
                      "p-4 flex flex-col group hover:bg-white/5 transition-colors",
                      isFocusMode ? "p-8" : "flex-row items-center justify-between"
                    )}>
                      <div className={cn(
                        "flex items-center gap-4",
                        isFocusMode ? "flex-col items-start mb-4" : ""
                      )}>
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-white text-black flex items-center justify-center font-bold">
                            {ticker[0]}
                          </div>
                          <div>
                            <div className="font-bold text-xl text-white">{ticker}</div>
                            <div className="text-2xl font-bold text-white">${price}</div>
                            <div className={cn(
                              "text-xs font-bold flex items-center gap-1",
                              diff > 0 ? "text-green-500" : diff < 0 ? "text-red-500" : "text-gray-500"
                            )}>
                              {diff > 0 ? '+' : ''}{diff} {diff !== 0 && (diff > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />)}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="w-full">
                        <StockChart 
                          ticker={ticker} 
                          currentQuarter={gameState?.currentQuarter ?? 0} 
                          history={gameState?.history || {}}
                          currentPrice={currentPrices?.[ticker] || 100}
                          height={isFocusMode ? "h-96" : "h-64"}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Trading Controls */}
            {!isFocusMode && gameState && gameState.currentQuarter < 4 && (
              <div className="bg-[#1a1a1a] border-2 border-[#2a2b2e] p-6 shadow-[8px_8px_0px_0px_rgba(255,255,255,0.05)]">
                <h3 className="text-xs uppercase opacity-50 mb-4 italic serif">Trading Floor</h3>
                <div className="grid grid-cols-3 gap-4">
                  {(['AAPL', 'NVDA', 'WMT'] as const).map((ticker) => (
                    <div key={ticker} className="space-y-2">
                      <div className="text-center font-bold text-white">{ticker}</div>
                      <button 
                        onClick={() => handleTrade(ticker, 1)}
                        className="w-full bg-white text-black py-2 text-xs font-bold hover:bg-gray-200 transition-colors"
                      >
                        BUY 1
                      </button>
                      <button 
                        onClick={() => handleTrade(ticker, -1)}
                        className="w-full border-2 border-[#2a2b2e] py-2 text-xs font-bold hover:bg-white/10 transition-colors"
                      >
                        SELL 1
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Passive Fund (Q0 only) */}
            {gameState?.currentQuarter === 0 && (
              <div className="bg-blue-900/20 border-2 border-blue-500/50 p-6 shadow-[8px_8px_0px_0px_rgba(255,255,255,0.05)]">
                <h3 className="text-xs uppercase text-blue-400 opacity-50 mb-2 italic serif">Passive Fund Opportunity</h3>
                <p className="text-sm mb-4 text-blue-100/70">Lock in your capital for a guaranteed 8% return at the end of Q4. High stability, zero volatility.</p>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleLockPassive(Math.floor((portfolio?.startingCapital || 10000) * 0.25))}
                    disabled={portfolio && portfolio.cash < (portfolio.startingCapital * 0.25)}
                    className="flex-1 bg-blue-600 text-white py-2 text-xs font-bold hover:bg-blue-500 transition-colors disabled:opacity-50"
                  >
                    LOCK 25% (${Math.floor((portfolio?.startingCapital || 10000) * 0.25).toLocaleString()})
                  </button>
                  <button 
                    onClick={() => handleLockPassive(Math.floor((portfolio?.startingCapital || 10000) * 0.5))}
                    disabled={portfolio && portfolio.cash < (portfolio.startingCapital * 0.5)}
                    className="flex-1 bg-blue-600 text-white py-2 text-xs font-bold hover:bg-blue-500 transition-colors disabled:opacity-50"
                  >
                    LOCK 50% (${Math.floor((portfolio?.startingCapital || 10000) * 0.5).toLocaleString()})
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Portfolio & Admin */}
          {!isFocusMode && (
            <div className="space-y-6">
              <div className="bg-[#1a1a1a] border-2 border-[#2a2b2e] p-8 shadow-[8px_8px_0px_0px_rgba(255,255,255,0.05)] relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-[#2a2b2e] text-white px-3 py-1 text-[10px] uppercase font-bold tracking-widest">Portfolio</div>
                <div className="space-y-8">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-[#0a0a0a] border-2 border-[#2a2b2e] text-white">
                      <Wallet size={24} />
                    </div>
                    <div>
                      <div className="text-xs uppercase opacity-50 italic serif">Available Cash</div>
                      <div className="text-4xl font-bold text-white">${portfolio?.cash.toLocaleString()}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-xs uppercase opacity-50 italic serif">
                        <Briefcase size={14} /> Holdings
                      </div>
                      <div className="space-y-2">
                        {(['AAPL', 'NVDA', 'WMT'] as const).map(ticker => (
                          <div key={ticker} className="flex justify-between items-center border-b border-[#2a2b2e] border-dashed pb-1">
                            <span className="font-bold">{ticker}</span>
                            <span className="text-white">{portfolio?.shares[ticker] || 0} shares</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-xs uppercase opacity-50 italic serif">
                        <ShieldAlert size={14} /> Passive Fund
                      </div>
                      <div className="text-2xl font-bold text-white">${portfolio?.passiveFund.toLocaleString()}</div>
                      <div className="text-[10px] opacity-50">Locked until Q4 (+8%)</div>
                    </div>
                  </div>

                  <div className="pt-6 border-t-2 border-[#2a2b2e] border-dashed">
                    <div className="text-xs uppercase opacity-50 italic serif mb-1">Total Estimated Value</div>
                    <div className="text-3xl font-black text-white">
                      ${(
                        (portfolio?.cash || 0) + 
                        (portfolio?.passiveFund || 0) + 
                        (Object.entries(portfolio?.shares || {}).reduce((acc: number, [t, q]) => acc + (q as number) * (currentPrices?.[t as keyof StockPrices] || 0), 0))
                      ).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Admin Controls */}
              {isAdmin && (
                <div className="bg-[#1a1a1a] border-2 border-yellow-600/50 p-6 shadow-[8px_8px_0px_0px_rgba(255,255,255,0.05)]">
                  <div className="flex items-center gap-2 text-yellow-500 mb-4">
                    <ShieldAlert size={20} />
                    <h3 className="text-xs uppercase font-bold italic serif">Bank Controls (Admin)</h3>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <button 
                        onClick={handleNextQuarter}
                        disabled={gameState?.currentQuarter === 4}
                        className="flex-[2] bg-yellow-600 text-black py-4 font-bold flex items-center justify-center gap-2 hover:bg-yellow-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        NEXT QUARTER <ChevronRight size={20} />
                      </button>
                      <button 
                        onClick={handleTriggerEvent}
                        className="flex-1 border-2 border-yellow-600 text-yellow-500 py-4 font-bold flex items-center justify-center gap-2 hover:bg-yellow-600/10 transition-colors"
                      >
                        TRIGGER EVENT
                      </button>
                    </div>
                    <button 
                      onClick={handleResetGame}
                      className={cn(
                        "w-full py-3 font-bold flex items-center justify-center gap-2 transition-colors",
                        gameState?.currentQuarter === 4 
                          ? "bg-white text-black hover:bg-gray-200" 
                          : "border-2 border-white text-white hover:bg-white/10"
                      )}
                    >
                      <RefreshCw size={18} /> {gameState?.currentQuarter === 4 ? 'RESET SIMULATION' : 'FORCE RESET'}
                    </button>
                  </div>
                  <p className="text-[10px] text-yellow-500 mt-2 opacity-70">Only Kristian can move the market time. Current Quarter: Q{gameState?.currentQuarter}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
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
                <h2 className="text-5xl font-black italic serif uppercase mb-4 text-white">Year End Report</h2>
                <p className="text-xl mb-8 border-l-4 border-white pl-4 italic text-gray-300">
                  "The market has closed. You've survived one year on Wall Street. Let's see your final standing."
                </p>
                
                <div className="grid grid-cols-2 gap-8 mb-8">
                  <div className="space-y-2">
                    <div className="text-xs uppercase opacity-50 text-gray-400">Final Capital</div>
                    <div className="text-4xl font-bold text-white">
                      ${(
                        (portfolio?.cash || 0) + 
                        (Object.entries(portfolio?.shares || {}).reduce((acc: number, [t, q]) => acc + (q as number) * (gameState?.prices?.[t as keyof StockPrices] || 0), 0))
                      ).toLocaleString()}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs uppercase opacity-50 text-gray-400">Profit/Loss</div>
                    <div className={cn(
                      "text-4xl font-bold",
                      ((portfolio?.cash || 0) + (Object.entries(portfolio?.shares || {}).reduce((acc: number, [t, q]) => acc + (q as number) * (gameState?.prices?.[t as keyof StockPrices] || 0), 0))) >= (portfolio?.startingCapital || 0) ? "text-green-500" : "text-red-500"
                    )}>
                      {((portfolio?.cash || 0) + (Object.entries(portfolio?.shares || {}).reduce((acc: number, [t, q]) => acc + (q as number) * (gameState?.prices?.[t as keyof StockPrices] || 0), 0))) >= (portfolio?.startingCapital || 0) ? '+' : ''}
                      {(((portfolio?.cash || 0) + (Object.entries(portfolio?.shares || {}).reduce((acc: number, [t, q]) => acc + (q as number) * (gameState?.prices?.[t as keyof StockPrices] || 0), 0))) - (portfolio?.startingCapital || 0)).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="bg-[#0a0a0a] p-4 border-2 border-[#2a2b2e] mb-8">
                  <h3 className="font-bold uppercase text-xs mb-2 text-gray-500">Final Portfolio Mix</h3>
                  <div className="flex gap-4">
                    {(['AAPL', 'NVDA', 'WMT'] as const).map(t => (
                      <div key={t} className="flex-1 text-center border-r border-[#2a2b2e] last:border-none">
                        <div className="text-lg font-bold text-white">{portfolio?.shares[t] || 0}</div>
                        <div className="text-[10px] uppercase opacity-50">{t}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <button 
                  onClick={() => setShowGameOver(false)}
                  className="w-full bg-white text-black py-4 font-bold hover:bg-gray-200 transition-colors uppercase tracking-widest"
                >
                  Return to Dashboard
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer / Educational */}
        <footer className="text-center text-[10px] uppercase opacity-30 pt-12">
          One Year on Wall Street © 2026 • Volatility is your friend • Bull Markets create wealth, Bear Markets create opportunity.
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
                  <h2 className="text-xl font-black uppercase italic serif">Abandon Floor?</h2>
                </div>
                <p className="text-sm opacity-70 mb-6 leading-relaxed">
                  Are you sure you want to leave this session? 
                  {isAdmin && (
                    <span className="block mt-2 text-red-400 font-bold">
                      Warning: As the Admin, leaving will permanently delete this room for everyone.
                    </span>
                  )}
                </p>
                <div className="flex gap-4">
                  <button 
                    onClick={() => {
                      setRoomId(null);
                      setShowLeaveConfirm(false);
                    }}
                    className="flex-1 bg-white text-black py-3 font-bold hover:bg-gray-200 transition-colors"
                  >
                    LEAVE
                  </button>
                  <button 
                    onClick={() => setShowLeaveConfirm(false)}
                    className="flex-1 border-2 border-white text-white py-3 font-bold hover:bg-white/10 transition-colors"
                  >
                    CANCEL
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
