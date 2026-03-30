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

export const MARKET_SCHEDULE: Record<number, { prices: StockPrices; state: any; newsPool: string[] }> = {
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
