/**
 * 佣金 / 薪酬测算服务 —— 移植自 Codex lib/commission.ts
 * AE / SA 双站点提成预测 + 薪酬到手规划。
 */
export const DEFAULT_COMMISSION_PARAMS = {
  commissionRate: 0.03,
  aeTaxRate: 0.05,
  saTaxRate: 0.15,
  baseSalary: 10000,
  socialInsurance: 639.58,
};

export const DEFAULT_SALARY_EXPENSES = {
  fixedRepayment: 1700,
  dailyExpense: 3500,
  rent: 1358,
  investment: 2000,
  savings: 0,
  reserve: 0,
};

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function currentMonth(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function availableCommissionMonths(now = new Date(), count = 24) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    return currentMonth(date);
  });
}

export function commissionPeriod(month, now = new Date()) {
  const [year, monthNumber] = month.split('-').map(Number);
  const totalDays = new Date(year, monthNumber, 0).getDate();
  const selectedIndex = year * 12 + monthNumber;
  const currentIndex = now.getFullYear() * 12 + now.getMonth() + 1;
  if (selectedIndex > currentIndex) throw new Error('不能选择未来月份');
  const isCurrent = selectedIndex === currentIndex;
  const elapsedDays = isCurrent ? Math.max(0, now.getDate() - 1) : totalDays;
  const cutoffDay = isCurrent ? elapsedDays : totalDays;
  return {
    month,
    elapsedDays,
    totalDays,
    cutoffDate: cutoffDay ? `${month}-${String(cutoffDay).padStart(2, '0')}` : null,
    isCurrent,
  };
}

function calculateSite(input, elapsedDays, totalDays, taxRate, commissionRate) {
  if (elapsedDays <= 0) return { projectedSales: 0, projectedProfit: 0, vat: 0, commissionableProfit: 0, commission: 0 };
  const factor = totalDays / elapsedDays;
  const projectedSales = input.currentSales * factor;
  const projectedProfit = input.currentProfit * factor;
  const vat = projectedSales * taxRate / (1 + taxRate);
  const commissionableProfit = Math.max(projectedProfit - vat, 0);
  return {
    projectedSales: round2(projectedSales),
    projectedProfit: round2(projectedProfit),
    vat: round2(vat),
    commissionableProfit: round2(commissionableProfit),
    commission: round2(commissionableProfit * commissionRate),
  };
}

export function calculateCommission(input) {
  const ae = calculateSite(input.ae, input.elapsedDays, input.totalDays, input.aeTaxRate, input.commissionRate);
  const sa = calculateSite(input.sa, input.elapsedDays, input.totalDays, input.saTaxRate, input.commissionRate);
  return { ae, sa, totalCommission: round2(ae.commission + sa.commission) };
}

export function calculateSalaryPlan(input) {
  const expectedTakeHome = round2(input.baseSalary - input.socialInsurance + input.expectedCommission);
  const actualTakeHome = input.actualCommission == null ? null : round2(input.baseSalary - input.socialInsurance + input.actualCommission);
  const commissionDifference = input.actualCommission == null ? null : round2(input.actualCommission - input.expectedCommission);
  const plannedExpenses = round2(Object.values(input.expenses).reduce((sum, value) => sum + value, 0));
  const availableBalance = round2(expectedTakeHome + input.openingBank + input.openingWechat - plannedExpenses);
  return { expectedTakeHome, actualTakeHome, commissionDifference, plannedExpenses, availableBalance };
}

export function createCommissionWorkspace(now = new Date()) {
  return {
    draft: {
      month: currentMonth(now),
      ae: { currentSales: 0, currentProfit: 0 },
      sa: { currentSales: 0, currentProfit: 0 },
      actualCommission: null,
      params: { ...DEFAULT_COMMISSION_PARAMS },
      openingBank: 0,
      openingWechat: 0,
      expenses: { ...DEFAULT_SALARY_EXPENSES },
    },
    records: [],
  };
}
