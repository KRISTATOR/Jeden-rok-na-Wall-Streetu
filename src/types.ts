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
  currentQuarter: number;
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

export interface UserPortfolio {
  uid: string;
  roomId: string;
  email: string;
  cash: number;
  startingCapital: number;
  shares: {
    AAPL: number;
    NVDA: number;
    WMT: number;
  };
  passiveFund: number;
  isPassiveLocked: boolean;
  isQ3DividendPaid?: boolean;
  isQ4FinalPaid?: boolean;
}

export const ADMINS = [
  'kristian.paca@montetrida.cz',
  'paca.kristian@gmail.com',
  'kristianai2011@gmail.com'
];
