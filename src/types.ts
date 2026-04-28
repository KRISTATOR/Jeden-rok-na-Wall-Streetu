export interface StockPrices {
  AAPL: number;
  NVDA: number;
  WMT: number;
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface GameState {
  currentMonth: number; // 0 (Jan) to 11 (Dec)
  isPaused: boolean;
  isGameOver?: boolean;
  nextTickAt: number | null; // Timestamp when the next month should start
  remainingTime?: number; // Time remaining when paused
  sentiment: 'Bull' | 'Bear' | 'Neutral';
  newsFlash: string;
  prices: StockPrices;
  history: { [ticker: string]: CandleData[] };
}

export interface Room {
  id: string;
  name: string;
  createdBy: string;
  createdAt: number;
  gameState: GameState;
}

export interface Trade {
  ticker: keyof StockPrices;
  amount: number;
  price: number;
  time: number;
}

export interface UserPortfolio {
  uid: string;
  roomId: string;
  email: string;
  nickname?: string;
  cash: number;
  startingCapital: number;
  shares: {
    AAPL: number;
    NVDA: number;
    WMT: number;
  };
  passiveFund: number;
  isPassiveLocked: boolean;
  isDividendPaid?: { [month: number]: boolean };
  isFinalPaid?: boolean;
  trades?: Trade[];
}
