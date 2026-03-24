import { StockPrices, GameState } from './types';

export const MARKET_SCHEDULE: Record<number, { prices: StockPrices; state: any; newsPool: string[] }> = {
  0: {
    prices: { AAPL: 100, NVDA: 100, WMT: 100 },
    state: {
      currentQuarter: 0,
      sentiment: 'Neutral',
      newsFlash: 'Vstup na burzu (IPO)! Všechny akcie začínají na 100 $. Pasivní fond nabízí 8% výnos.'
    },
    newsPool: [
      'Vstup na burzu (IPO)! Všechny akcie začínají na 100 $. Pasivní fond nabízí 8% výnos.',
      'Wall Street vítá nové technologické giganty. Očekává se nízká volatilita.',
      'Investoři se scházejí na největší burzovní premiéru roku.'
    ]
  },
  1: {
    prices: { AAPL: 130, NVDA: 150, WMT: 100 },
    state: {
      currentQuarter: 1,
      sentiment: 'Bull',
      newsFlash: 'Euforie! Technologické akcie rostou. Býčí trh začíná!'
    },
    newsPool: [
      'Euforie! Technologické akcie rostou. Býčí trh začíná!',
      'NVDA láme historická maxima, poptávka po AI exploduje.',
      'AAPL oznamuje revoluční nový produkt. Investoři jsou nadšeni.'
    ]
  },
  2: {
    prices: { AAPL: 80, NVDA: 40, WMT: 105 },
    state: {
      currentQuarter: 2,
      sentiment: 'Bear',
      newsFlash: 'Velká krize! NVDA se hroutí. Panika na trzích! Pamatujte na pravidlo přežití.'
    },
    newsPool: [
      'Velká krize! NVDA se hroutí. Panika na trzích! Pamatujte na pravidlo přežití.',
      'Kolaps globálního dodavatelského řetězce! Technologický sektor ve volném pádu.',
      'Medvědí trh potvrzen. Volatilita stoupá na rekordní úrovně.'
    ]
  },
  3: {
    prices: { AAPL: 70, NVDA: 30, WMT: 90 },
    state: {
      currentQuarter: 3,
      sentiment: 'Bear',
      newsFlash: 'Dividendy! WMT vyplácí 10 $/akcii věrným držitelům. Ceny se stabilizují.'
    },
    newsPool: [
      'Dividendy! WMT vyplácí 10 $/akcii věrným držitelům. Ceny se stabilizují.',
      'Trh našel dno. Investoři hledají výnos u WMT.',
      'Stabilita se vrací, firemní zisky překonávají nízká očekávání.'
    ]
  },
  4: {
    prices: { AAPL: 140, NVDA: 110, WMT: 115 },
    state: {
      currentQuarter: 4,
      sentiment: 'Bull',
      newsFlash: 'Zotavení! Trh se odráží ode dna. Konečné výpočty jsou hotovy.'
    },
    newsPool: [
      'Zotavení! Trh se odráží ode dna. Konečné výpočty jsou hotovy.',
      'Silný závěr roku! Akcie rostou navzdory dřívější volatilitě.',
      'Ekonomika se ukazuje jako odolná. Začíná nová éra pro Wall Street.'
    ]
  }
};

export const INITIAL_CAPITAL_MIN = 7500;
export const INITIAL_CAPITAL_MAX = 10000;
export const PASSIVE_FUND_RETURN = 0.08;
export const TRADING_FEE = 15;

export const CandlestickShape = (props: any) => {
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
