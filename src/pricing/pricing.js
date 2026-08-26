import calendar from './calendar.json';
import { calcStayWithRates, rules } from './calcStay';

export const RANGE_START = calendar._meta.rangeStart;
export const RANGE_END = calendar._meta.rangeEnd;
export const PRICING_RULES = rules;
export const calcStay = (options) => calcStayWithRates(calendar.rates, options);
