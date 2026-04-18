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
  isActive: boolean;
  createdAt: string;
}

export interface EmployeeShift {
  id: string;
  employeeId: string;
  employeeName: string;
  businessDate: string;
  shiftStart: string;
  shiftEnd: string;
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
  totalProductCost: number;
  totalEmployeeCost: number;
}

export interface DashboardSnapshot {
  kpis: KpiSnapshot;
  alerts: AlertRecord[];
  documents: DocumentRecord[];
  hourlyPerformance: Array<{ hour: string; sales: number }>;
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

export interface DailyDigest {
  date: string;
  sales: number;
  orders: number;
  averageTicket: number;
  vsLastWeek: { sales: number; deltaPct: number } | null;
  /** YoY aligned by day of the week (52 weeks back). Saturday → Saturday. */
  vsLastYearDow: { sales: number; date: string; deltaPct: number } | null;
  /** YoY aligned by calendar date (1 year back). 18 April → 18 April. */
  vsLastYearDate: { sales: number; date: string; deltaPct: number } | null;
  forecastTomorrow: {
    date: string;
    /** Forecasted sales after applying the temperature factor. */
    sales: number;
    /** Baseline (avg of N last same-DOW values, no weather). */
    baselineSales: number;
    /** Number of historical same-DOW samples averaged. */
    basedOn: number;
    /** Temperature factor applied (1.0 = no adjustment, >1 hotter, <1 cooler). */
    tempFactor: number;
    /** Tomorrow's forecasted max temperature, if available. */
    tomorrowTempMax: number | null;
    /** Average max temp of the same-DOW history used as baseline. */
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
