export type DocumentType =
  | "invoice"
  | "sales_report"
  | "hourly_report"
  | "payroll"
  | "unknown";

export type ProcessingStatus = "received" | "processing" | "extracted" | "validated" | "error";

export interface DocumentRecord {
  id: string;
  fileName: string;
  sourcePath: string;
  documentType: DocumentType;
  status: ProcessingStatus;
  confidence: number;
  extractorVersion: string;
  errorMessage?: string | null;
  createdAt: string;
}

export interface SalesReport {
  id: string;
  businessDate: string;
  totalSales: number;
  orderCount: number;
  averageTicket: number;
  paymentMix: Record<string, number>;
}

export interface CashClosingRecord {
  id: string;
  zNumber: number | null;
  zLabel: string;
  openedAt: string;
  closedAt: string;
  totalCash: number;
  totalCard: number;
  totalSales: number;
  ticketCount: number;
  cashCount: number;
  cardCount: number;
  cancelledCount: number;
  totalRefunded: number;
  firstInvoice: string | null;
  lastInvoice: string | null;
  employeeName: string | null;
}

export interface PosOrderLineRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  invoiceNumber: string | null;
  status: "pending" | "preparing" | "ready" | "completed" | "cancelled" | string;
  paymentMethod: string;
  serviceType: "dine_in" | "takeaway";
  tableNumber: string | null;
  employeeName: string | null;
  businessDate: string;
  orderTime: string;
  createdAt: string;
  completedAt: string | null;
  productId: string;
  productName: string;
  categoryName: string | null;
  qty: number;
  unitPrice: number;
  vatRate: number;
  lineTotal: number;
  lineBase: number;
  lineVat: number;
  orderTotal: number;
  orderBase: number;
  orderVat: number;
  notes: string | null;
}

export interface CookiesTransactionRecord {
  id: string;
  orderNumber: string;
  invoiceNumber: string | null;
  status: string;
  businessDate: string;
  orderTime: string;
  createdAt: string;
  employeeName: string | null;
  total: number;
  totalBase: number;
  totalVat: number;
  itemCount: number;
  summary: string;
  items: {
    productName: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
    notes: string | null;
  }[];
}

export interface SupplierPaymentRecord {
  id: string;
  supplierName: string;
  amount: number;
  reason: string | null;
  status: string;
  businessDate: string;
  paymentTime: string;
  createdAt: string;
  dispensedAt: string | null;
  employeeName: string | null;
  errorMessage: string | null;
}

export interface ProductSaleRecord {
  id: string;
  salesReportId: string;
  businessDate: string;
  productCode: string;
  productName: string;
  units: number;
  amount: number;
}

export interface HourlySalesEntry {
  id: string;
  businessDate: string;
  hour: string;
  sales: number;
  orderCount: number;
}

export interface InvoiceRecord {
  id: string;
  supplierName: string;
  issueDate: string;
  dueDate?: string | null;
  totalAmount: number;
  taxAmount: number;
  category: string;
}

export interface InvoiceLineRecord {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  vatRate: number;
  vatAmount: number;
}

export interface PayrollRecord {
  id: string;
  employeeName: string;
  payPeriod: string;
  grossAmount: number;
  netAmount: number;
}

export interface AlertRecord {
  id: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  createdAt: string;
}

export interface TelegramUser {
  id: string;
  telegramUserId: string;
  username: string;
  displayName: string;
  isActive: boolean;
}

export interface TelegramMessage {
  id: string;
  telegramUserId: string;
  username: string;
  question: string;
  answer: string;
  createdAt: string;
}

export interface Employee {
  id: string;
  name: string;
  shiftStart: string;
  shiftEnd: string;
  workingDaysPerMonth: number;
  hourlyCost: number;
  weeklyHours: number;
  isActive: boolean;
  createdAt: string;
  role?: "admin" | "employee";
  canAccessCashlogy?: boolean;
  canAccessSupplierPayments?: boolean;
  canAccessProducts?: boolean;
  syncStatus?: "synced" | "pending";
  pendingAction?: CatalogChangeAction;
}

export interface EmployeeHourlyCostHistoryEntry {
  id: string;
  employeeId: string;
  employeeNameSnapshot: string;
  hourlyCost: number;
  validFrom: string;
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeShift {
  id: string;
  employeeId: string;
  employeeName: string;
  businessDate: string;
  shiftStart: string;
  shiftEnd: string;
}

export interface EmployeeScheduleShift {
  id: string;
  employeeId: string;
  employeeName: string;
  businessDate: string;
  shiftStart: string;
  shiftEnd: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeScheduleShare {
  employeeId: string;
  token: string;
  createdAt: string;
}

export interface EmployeeScheduleWeekPublication {
  weekStart: string;
  isVisible: boolean;
  publishedAt: string | null;
  updatedAt: string | null;
}

export interface PlannedLaborRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  businessDate: string;
  shiftStart: string;
  shiftEnd: string;
  hours: number;
  hourlyCost: number;
  totalCost: number;
  costMissing: boolean;
}

export interface TimeClockSessionRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  businessDate: string;
  clockInAt: string;
  clockOutAt: string | null;
  status: "open" | "closed" | string;
  source: string;
  deviceName: string | null;
  durationMinutes: number | null;
  createdAt: string;
  updatedAt: string;
}

export type AccountingAccountType = "asset" | "liability" | "equity" | "income" | "expense";
export type AccountingEntryStatus = "draft" | "validated" | "locked";
export type AccountingPeriodStatus = "open" | "closed";
export type BankTransactionStatus = "pending" | "matched" | "ignored";

export interface AccountingAccount {
  id: string;
  code: string;
  name: string;
  type: AccountingAccountType;
  isActive: boolean;
  createdAt: string;
}

export interface AccountingJournalLine {
  id: string;
  entryId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  memo: string | null;
}

export interface AccountingJournalEntry {
  id: string;
  entryDate: string;
  period: string;
  sourceType: string;
  sourceId: string;
  description: string;
  status: AccountingEntryStatus;
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  createdAt: string;
  updatedAt: string;
  lines: AccountingJournalLine[];
}

export interface AccountingPeriod {
  period: string;
  status: AccountingPeriodStatus;
  closedAt: string | null;
  closedBy: string | null;
}

export interface BankAccount {
  id: string;
  name: string;
  iban: string | null;
  currency: string;
  createdAt: string;
}

export interface BankTransaction {
  id: string;
  bankAccountId: string;
  transactionDate: string;
  valueDate: string | null;
  description: string;
  counterparty: string | null;
  amount: number;
  status: BankTransactionStatus;
  externalId: string;
  createdAt: string;
}

export interface BankReconciliationMatch {
  id: string;
  bankTransactionId: string;
  entryId: string | null;
  matchType: string;
  confidence: number;
  notes: string | null;
  createdAt: string;
}

export interface AccountingVatSummary {
  outputVat: number;
  inputVat: number;
  payableVat: number;
}

export interface AccountingWorkspace {
  accounts: AccountingAccount[];
  entries: AccountingJournalEntry[];
  bankAccounts: BankAccount[];
  bankTransactions: BankTransaction[];
  periods: AccountingPeriod[];
  vatSummary: AccountingVatSummary;
  totals: {
    draftEntries: number;
    validatedEntries: number;
    lockedEntries: number;
    unbalancedEntries: number;
    bankPending: number;
    debit: number;
    credit: number;
  };
}

export interface TimeClockAuditRecord {
  id: string;
  sessionId: string | null;
  employeeId: string | null;
  employeeName: string | null;
  action: string;
  previousData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  reason: string | null;
  changedBy: string | null;
  createdAt: string;
}

export interface HourlyProductSale {
  id: string;
  businessDate: string;
  hourLabel: string;
  productCode: string;
  productName: string;
  units: number;
  amount: number;
}

export interface ProductCost {
  id: string;
  productCode: string;
  productName: string;
  category: string;
  unitCost: number;
}

export interface ProductCostHistoryEntry {
  id: string;
  productCode: string;
  productName: string;
  unitCost: number;
  validFrom: string; // YYYY-MM-DD
  validUntil: string | null; // null = currently valid
  createdAt: string;
}

export type ProductCostReconcileStatus = "mapped" | "exact" | "review" | "conflict" | "missing";
export type ProductCostMatchType = "exact" | "same_name" | "fuzzy";

export interface ProductCostCandidate {
  legacyProductCode: string;
  legacyProductName: string;
  legacyCategory: string;
  unitCost: number;
  confidence: number;
  matchType: ProductCostMatchType;
  categoryCompatible: boolean;
}

export interface ProductCostReconcileRow {
  posProductId: string;
  posProductName: string;
  posCategory: string;
  price: number;
  vatRate: number;
  active: boolean;
  isTopping: boolean;
  unitCost: number | null;
  margin: number | null;
  marginPct: number | null;
  status: ProductCostReconcileStatus;
  currentCost: ProductCost | null;
  exactCandidate: ProductCostCandidate | null;
  candidates: ProductCostCandidate[];
  hasCodeConflict: boolean;
}

export interface ProductCostWorkspace {
  products: ProductCostReconcileRow[];
  categories: string[];
  firstPosSaleDate: string | null;
  stats: {
    total: number;
    active: number;
    mapped: number;
    exact: number;
    review: number;
    conflict: number;
    missing: number;
    toppings: number;
  };
}

export interface PosCategory {
  id: number;
  name: string;
  sortOrder: number;
  color: string;
}

export interface PosProduct {
  id: number;
  name: string;
  categoryId: number | null;
  categoryName: string;
  categoryColor: string;
  modifierGroupId: number | null;
  modifierIncludedCount: number;
  modifierExtraPrice: number;
  price: number;
  vatRate: number;
  imageUrl: string | null;
  active: boolean;
  sortOrder: number;
}

export interface PosModifierGroup {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
  categoryIds: number[];
  categoryNames: string[];
}

export type CatalogEntityType = "category" | "product" | "modifier_group" | "employee";
export type CatalogChangeAction = "create" | "update" | "deactivate";
export type CatalogChangeStatus = "pending" | "applied" | "error";

export interface CatalogChangeRecord {
  id: string;
  entityType: CatalogEntityType;
  action: CatalogChangeAction;
  entityId: number | null;
  payload: Record<string, unknown>;
  status: CatalogChangeStatus;
  requestedAt: string;
  appliedAt: string | null;
  appliedEntityId: number | null;
  errorMessage: string | null;
}

export interface CatalogDraftChange {
  entityType: CatalogEntityType;
  action: CatalogChangeAction;
  entityId?: number | null;
  payload: Record<string, unknown>;
}

export interface CatalogPublishRequest {
  changes: CatalogDraftChange[];
}

export interface CatalogSyncStatus {
  lastSyncedAt: string | null;
  ok: boolean | null;
  message: string | null;
}

export interface PosCatalog {
  categories: PosCategory[];
  products: PosProduct[];
  modifierGroups: PosModifierGroup[];
  pendingChanges: CatalogChangeRecord[];
  syncStatus: CatalogSyncStatus;
}

export interface KpiSnapshot {
  totalSales: number;
  totalExpenses: number;
  totalPayroll: number;
  averageTicket: number;
  bestHourLabel: string;
  bestHourSales: number;
  estimatedMargin: number;
  activeSuppliers: number;
  totalHoursWorked: number;
  productivityPerHour: number;
  plannedLaborHours: number;
  plannedLaborCost: number;
  laborCostRatio: number;
  salesPerPlannedHour: number;
  /** Share (0–1) of the period's sold € that has a positive product cost
   * registered. Below ~0.8 means the food cost KPI is unreliable. */
  productCostCoverage: number;
  totalProductCost: number;
  totalEmployeeCost: number;
  controlledMargin: number;
  controlledMarginPerPlannedHour: number;
  lowSalesLaborSlotCount: number;
}

export interface HourlyProfitabilityProduct {
  productCode: string;
  productName: string;
  units: number;
  amount: number;
  productCost: number;
  margin: number;
  missingCost: boolean;
}

export interface HourlyProfitabilitySlot {
  id: string;
  businessDate: string;
  slotLabel: string;
  sales: number;
  orderCount: number;
  productCost: number;
  laborCost: number;
  laborHours: number;
  employeeCount: number;
  margin: number;
  marginPct: number | null;
  productCostCoverage: number;
  hasSales: boolean;
  hasLabor: boolean;
  missingProductCost: boolean;
  products: HourlyProfitabilityProduct[];
}

export interface HourlyProfitabilitySummary {
  bestSlot: HourlyProfitabilitySlot | null;
  worstSlot: HourlyProfitabilitySlot | null;
  totalMargin: number;
  marginPerPlannedHour: number;
  profitableSlotCount: number;
  lossSlotCount: number;
  lowSalesLaborSlotCount: number;
}

export interface DashboardSnapshot {
  kpis: KpiSnapshot;
  alerts: AlertRecord[];
  documents: DocumentRecord[];
  hourlyPerformance: Array<{ hour: string; sales: number }>;
  hourlyProfitability: HourlyProfitabilitySlot[];
  hourlyProfitabilitySummary: HourlyProfitabilitySummary;
  telegramOverview: {
    authorizedUsers: number;
    lastMessages: TelegramMessage[];
  };
  documentOverview: {
    totalDocuments: number;
    validatedDocuments: number;
  };
  lastUpdatedAt: string;
}

export type DatePreset = "today" | "yesterday" | "7d" | "30d" | "90d" | "month" | "year" | "custom";

export interface DateFilter {
  preset: DatePreset;
  from: string;
  to: string;
}

export interface PeriodTotals {
  sales: number;
  orders: number;
  averageTicket: number;
  daysWithData: number;
}

export interface PeriodComparison {
  current: PeriodTotals;
  previous: PeriodTotals;
  lastYear: PeriodTotals;
  deltaPreviousPct: number;
  deltaYoYPct: number;
}

export interface HistoricalWeather {
  tempMax: number;
  tempMin: number;
  precipitationMm: number;
  weatherCode: number;
}

export interface DailyCalendarNote {
  /** Holiday or Easter-week label (e.g. "Divendres Sant", "Sant Jordi"). */
  label: string | null;
  /** Days from Easter Sunday (0 = Easter, -2 = Good Friday). */
  daysFromEaster: number;
  /** True if a public holiday. */
  isHoliday: boolean;
}

export interface DailyDigest {
  date: string;
  sales: number;
  orders: number;
  averageTicket: number;
  vsLastWeek: { sales: number; orders: number; averageTicket: number; deltaPct: number } | null;
  /** Decomposes today's delta vs last-week into volume (more/fewer
   * transactions) and price (higher/lower avg ticket). Helps answer "did we
   * drop because of fewer customers or because they spent less?". */
  driversVsLastWeek: {
    totalDeltaEur: number;
    volumeEffect: number;
    priceEffect: number;
    dominantDriver: "volume" | "price" | "balanced";
  } | null;
  /** Last 7 days of sales (oldest→newest) so the widget can draw a sparkline. */
  last7Days: Array<{ date: string; sales: number }>;
  /** True when the most recent sales report is >48h old — data is stale. */
  isStale: boolean;
  /** Today's actual weather (if available). */
  todayWeather: HistoricalWeather | null;
  /** Calendar / holiday context for today (e.g. Easter week, Sant Jordi). */
  todayCalendar: DailyCalendarNote | null;
  /** YoY aligned by day of the week (52 weeks back). Saturday → Saturday. */
  vsLastYearDow: {
    sales: number;
    date: string;
    deltaPct: number;
    weather: HistoricalWeather | null;
    calendar: DailyCalendarNote | null;
  } | null;
  /** YoY aligned by calendar date (1 year back). 18 April → 18 April. */
  vsLastYearDate: {
    sales: number;
    date: string;
    deltaPct: number;
    weather: HistoricalWeather | null;
    calendar: DailyCalendarNote | null;
  } | null;
  forecastTomorrow: {
    date: string;
    /** Forecasted sales after blending baselines and applying the
     * temperature factor + YoY growth factor. */
    sales: number;
    /** Final blended baseline before temperature factor (50% recent + 50%
     * YoY-adjusted, when YoY data is available). */
    baselineSales: number;
    /** Avg of last 4 same-DOW values (recent trend signal). */
    recentBaseline: number;
    /** Number of recent same-DOW samples used. */
    recentBasedOn: number;
    /** Avg of 4 same-DOW values around tomorrow-shifted-52w-back (seasonality
     * signal). null if not enough historical data. */
    yoyBaseline: number | null;
    /** Number of YoY samples used. */
    yoyBasedOn: number;
    /** YoY business growth multiplier (1.10 = +10% vs last year). Applied to
     * the YoY baseline so seasonality reflects the current scale of the
     * business, not last year's volume. */
    yoyGrowthFactor: number;
    /** Coefficient of variation of all samples used. High = unstable forecast. */
    sampleCoV: number;
    /** Confidence tier derived from sample count + CoV. */
    confidence: "low" | "medium" | "high";
    /** Temperature factor applied (1.0 = no adjustment, >1 hotter, <1 cooler). */
    tempFactor: number;
    /** Tomorrow's forecasted max temperature, if available. */
    tomorrowTempMax: number | null;
    /** Average max temp of the historical samples used as baseline. */
    avgHistoricalTempMax: number | null;
  } | null;
}

export interface FamilyMovement {
  family: string;
  color: string;
  currentSales: number;
  previousSales: number;
  deltaPct: number;
  deltaEur: number;
}

export interface FinancialWorkspace {
  filter: DateFilter;
  snapshot: DashboardSnapshot;
  salesReports: SalesReport[];
  hourlySales: HourlySalesEntry[];
  invoices: InvoiceRecord[];
  payrolls: PayrollRecord[];
  plannedLabor: PlannedLaborRecord[];
  totalsByCategory: Array<{ label: string; amount: number }>;
  productSales: ProductSaleRecord[];
  topProducts: Array<{ productName: string; units: number; amount: number }>;
  comparisons: PeriodComparison;
  dailyDigest: DailyDigest | null;
  familyMovements: FamilyMovement[];
}

export interface ExtractionResult {
  documentType: DocumentType;
  confidence: number;
  strategy: "native-text" | "claude-vision" | "ocr-fallback";
  summary: string;
  normalizedData:
    | SalesReport
    | InvoiceRecord
    | PayrollRecord
    | HourlySalesEntry[]
    | Record<string, unknown>;
  auxiliaryData?: {
    productSales?: ProductSaleRecord[];
    invoiceLines?: InvoiceLineRecord[];
    hourlyProductSales?: HourlyProductSale[];
  };
}

export interface ChatAnswer {
  answer: string;
  sources: string[];
}
