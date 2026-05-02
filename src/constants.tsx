import { StockPrices } from './types';

export const PRICE_IMPACT = 1.0;
export const INITIAL_CAPITAL_MIN = 7500;
export const INITIAL_CAPITAL_MAX = 10000;
export const PASSIVE_FUND_RETURN = 0.08;
export const TRADING_FEE = 15;

export const MONTH_NAMES = [
  'Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 
  'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'
];

export const ADMINS = [
  'kristian.paca@montetrida.cz',
  'paca.kristian@gmail.com',
  'kristianai2011@gmail.com'
];

export const BASE_MARKET_SCHEDULE: Record<number, { prices: StockPrices; state: any; newsPool: string[] }> = {
  0: { 
    prices: { AAPL: 100, NVDA: 100, WMT: 100 }, 
    state: { sentiment: 'Neutral', newsFlash: 'Leden: Start nového roku! Trh je stabilní a plný očekávání.' }, 
    newsPool: ['Leden: Start nového roku! Trh je stabilní a plný očekávání.', 'Investoři plánují své strategie na nadcházejících 12 měsíců.'] 
  },
  1: { 
    prices: { AAPL: 105, NVDA: 110, WMT: 102 }, 
    state: { sentiment: 'Bull', newsFlash: 'Únor: Technologické firmy hlásí silné zisky za minulý rok.' }, 
    newsPool: ['Únor: Technologické firmy hlásí silné zisky za minulý rok.', 'Poptávka po AI čipech NVDA roste rychleji, než se čekalo.'] 
  },
  2: { 
    prices: { AAPL: 115, NVDA: 130, WMT: 105 }, 
    state: { sentiment: 'Bull', newsFlash: 'Březen: Jarní optimismus na Wall Street. Indexy rostou.' }, 
    newsPool: ['Březen: Jarní optimismus na Wall Street. Indexy rostou.', 'AAPL oznamuje novou generaci čipů.'] 
  },
  3: { 
    prices: { AAPL: 110, NVDA: 120, WMT: 108 }, 
    state: { sentiment: 'Neutral', newsFlash: 'Duben: Trh si dává pauzu. Probíhá mírná korekce.' }, 
    newsPool: ['Duben: Trh si dává pauzu. Probíhá mírná korekce.', 'Inflační data jsou v souladu s očekáváním.'] 
  },
  4: { 
    prices: { AAPL: 100, NVDA: 90, WMT: 110 }, 
    state: { sentiment: 'Bear', newsFlash: 'Květen: "Sell in May and go away?" Obavy z recese rostou.' }, 
    newsPool: ['Květen: "Sell in May and go away?" Obavy z recese rostou.', 'Geopolitické napětí zneklidňuje investory.'] 
  },
  5: { 
    prices: { AAPL: 85, NVDA: 60, WMT: 115 }, 
    state: { sentiment: 'Bear', newsFlash: 'Červen: Velký výprodej v tech sektoru. NVDA pod tlakem.' }, 
    newsPool: ['Červen: Velký výprodej v tech sektoru. NVDA pod tlakem.', 'Regulátoři se zaměřují na AI monopol.'] 
  },
  6: { 
    prices: { AAPL: 75, NVDA: 45, WMT: 120 }, 
    state: { sentiment: 'Bear', newsFlash: 'Červenec: Letní bouře na trzích. WMT se drží jako bezpečný přístav.' }, 
    newsPool: ['Červenec: Letní bouře na trzích. WMT se drží jako bezpečný přístav.', 'Spotřebitelé šetří, diskontní prodejci jako WMT profitují.'] 
  },
  7: { 
    prices: { AAPL: 80, NVDA: 55, WMT: 118 }, 
    state: { sentiment: 'Neutral', newsFlash: 'Srpen: Trh hledá dno. Objevují se první nákupní příležitosti.' }, 
    newsPool: ['Srpen: Trh hledá dno. Objevují se první nákupní příležitosti.', 'Objemy obchodů jsou během dovolených nízké.'] 
  },
  8: { 
    prices: { AAPL: 95, NVDA: 75, WMT: 110 }, 
    state: { sentiment: 'Bull', newsFlash: 'Září: Návrat k růstu. Technologický sektor se zotavuje.' }, 
    newsPool: ['Září: Návrat k růstu. Technologický sektor se zotavuje.', 'Nové zakázky pro NVDA z datových center.'] 
  },
  9: { 
    prices: { AAPL: 110, NVDA: 95, WMT: 105 }, 
    state: { sentiment: 'Bull', newsFlash: 'Říjen: Výsledková sezóna překonává očekávání.' }, 
    newsPool: ['Říjen: Výsledková sezóna překonává očekávání.', 'AAPL hlásí rekordní prodeje v Číně.'] 
  },
  10: { 
    prices: { AAPL: 130, NVDA: 120, WMT: 100 }, 
    state: { sentiment: 'Bull', newsFlash: 'Listopad: Předvánoční rallye začíná. Optimismus vrcholí.' }, 
    newsPool: ['Listopad: Předvánoční rallye začíná. Optimismus vrcholí.', 'Očekávání silné nákupní sezóny pomáhá všem sektorům.'] 
  },
  11: { 
    prices: { AAPL: 150, NVDA: 140, WMT: 110 }, 
    state: { sentiment: 'Bull', newsFlash: 'Prosinec: Santa Claus rallye! Rok končí na maximech.' }, 
    newsPool: ['Prosinec: Santa Claus rallye! Rok končí na maximech.', 'Závěrečné zúčtování roku. Gratulujeme vítězům!'] 
  }
};

export const MARKET_SCHEDULE: Record<number, { prices: StockPrices; state: any; newsPool: string[] }> = { ...BASE_MARKET_SCHEDULE };

let lastPrices = { ...BASE_MARKET_SCHEDULE[11].prices };

const YEAR_ARCHETYPES = [
  // 0: Bull year
  { 
    aapl: [1.05, 1.03, 1.08, 0.98, 1.02, 1.05, 1.09, 0.95, 1.06, 1.04, 1.07, 1.05],
    nvda: [1.10, 1.05, 1.12, 0.95, 1.04, 1.08, 1.15, 0.90, 1.10, 1.05, 1.12, 1.08],
    wmt:  [1.01, 1.02, 1.00, 1.01, 1.03, 1.01, 0.99, 1.02, 1.00, 1.01, 1.02, 1.03]
  },
  // 1: Tech crash
  {
    aapl: [0.95, 0.90, 0.85, 0.98, 0.92, 0.88, 0.95, 1.02, 0.90, 0.85, 0.95, 1.05],
    nvda: [0.90, 0.80, 0.70, 0.95, 0.85, 0.75, 0.95, 1.05, 0.80, 0.70, 0.90, 1.10],
    wmt:  [1.03, 1.05, 1.08, 1.02, 1.04, 1.06, 1.01, 0.98, 1.05, 1.08, 1.02, 0.95]
  },
  // 2: Recovery
  {
    aapl: [1.02, 1.05, 1.08, 1.05, 1.02, 1.08, 1.12, 1.05, 1.08, 1.10, 1.15, 1.08],
    nvda: [1.05, 1.10, 1.15, 1.08, 1.05, 1.12, 1.20, 1.10, 1.15, 1.20, 1.25, 1.15],
    wmt:  [0.98, 0.99, 1.01, 1.00, 0.98, 0.99, 1.02, 1.01, 0.98, 0.99, 1.00, 1.02]
  },
  // 3: Rollercoaster (like year 1)
  {
    aapl: [1.05, 1.10, 0.95, 0.90, 0.85, 0.90, 1.05, 1.15, 1.10, 1.15, 1.10, 1.05],
    nvda: [1.10, 1.20, 0.90, 0.80, 0.70, 0.80, 1.15, 1.30, 1.20, 1.30, 1.20, 1.10],
    wmt:  [1.02, 1.03, 1.03, 1.05, 1.08, 1.05, 0.98, 0.95, 0.98, 0.95, 1.02, 1.05]
  }
];

const NEWS_BULL = ['Další růst na obzoru.', 'Investoři věří v silný rok.', 'Ekonomika šlape beze strachu z recese.'];
const NEWS_BEAR = ['Výprodeje pokračují.', 'Strach z inflace a úrokových sazeb sráží trhy.', 'Investoři hledají bezpečné přístavy jako WMT.'];
const NEWS_VOLATILE = ['Trhy jsou jako na horské dráze.', 'Nejistota vládne Wall Street.', 'Analytici se neshodnou na dalším vývoji.'];

for (let i = 12; i < 120; i++) {
  const monthIndex = i % 12;
  const year = Math.floor(i / 12) + 1;
  const pseudoRand = (seed: number) => {
    const x = Math.sin(seed + 1) * 10000;
    return x - Math.floor(x);
  };
  
  // select archetype based on year
  const archIndex = Math.floor(pseudoRand(year * 10) * YEAR_ARCHETYPES.length);
  const arch = YEAR_ARCHETYPES[archIndex];
  
  // add a bit of randomness to the archetype multipliers
  const rAAPL = arch.aapl[monthIndex] + (pseudoRand(i * 1) - 0.5) * 0.08;
  const rNVDA = arch.nvda[monthIndex] + (pseudoRand(i * 2) - 0.5) * 0.15;
  const rWMT = arch.wmt[monthIndex] + (pseudoRand(i * 3) - 0.5) * 0.04;

  lastPrices = {
    AAPL: Math.max(5, lastPrices.AAPL * rAAPL),
    NVDA: Math.max(5, lastPrices.NVDA * rNVDA),
    WMT: Math.max(5, lastPrices.WMT * rWMT),
  };

  let sentiment = 'Neutral';
  let newsSource = NEWS_VOLATILE;
  if (rAAPL > 1.02 && rNVDA > 1.05) { sentiment = 'Bull'; newsSource = NEWS_BULL; }
  else if (rAAPL < 0.98 && rNVDA < 0.95) { sentiment = 'Bear'; newsSource = NEWS_BEAR; }

  const newsMsg = newsSource[Math.floor(pseudoRand(i * 4) * newsSource.length)];

  MARKET_SCHEDULE[i] = {
    prices: {
      AAPL: Number(lastPrices.AAPL.toFixed(2)),
      NVDA: Number(lastPrices.NVDA.toFixed(2)),
      WMT: Number(lastPrices.WMT.toFixed(2))
    },
    state: { sentiment, newsFlash: `${MONTH_NAMES[monthIndex]} ('${year}): ${newsMsg}` },
    newsPool: [
      `${MONTH_NAMES[monthIndex]} ('${year}): ${newsMsg}`,
      `Trhy reagují na aktuální události roku ${year}.`,
    ]
  };
}
