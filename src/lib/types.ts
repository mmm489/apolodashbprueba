export type DocumentType =
  | "invoice"
  | "sales_report"
  | "hourly_report"
  | "payroll"
  | "bank_statement"
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

export interface PayrollRecord {
  id: string;
  employeeName: string;
  payPeriod: string;
  grossAmount: number;
  netAmount: number;
}

export interface BankTransaction {
  id: string;
  bookedAt: string;
  concept: string;
  amount: number;
  direction: "in" | "out";
  category: string;
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

export interface KpiSnapshot {
  totalSales: number;
  totalExpenses: number;
  totalPayroll: number;
  averageTicket: number;
  bestHourLabel: string;
  bestHourSales: number;
  bankGap: number;
  estimatedMargin: number;
  activeSuppliers: number;
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

export type DatePreset = "7d" | "30d" | "90d" | "month" | "year" | "custom";

export interface DateFilter {
  preset: DatePreset;
  from: string;
  to: string;
}

export interface FinancialWorkspace {
  filter: DateFilter;
  snapshot: DashboardSnapshot;
  salesReports: SalesReport[];
  hourlySales: HourlySalesEntry[];
  invoices: InvoiceRecord[];
  payrolls: PayrollRecord[];
  bankTransactions: BankTransaction[];
  totalsByCategory: Array<{ label: string; amount: number }>;
  cashFlowSummary: {
    inflows: number;
    outflows: number;
    net: number;
  };
  productSales: ProductSaleRecord[];
  topProducts: Array<{ productName: string; units: number; amount: number }>;
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
    | BankTransaction[]
    | HourlySalesEntry[]
    | Record<string, unknown>;
  auxiliaryData?: {
    productSales?: ProductSaleRecord[];
  };
}

export interface ChatAnswer {
  answer: string;
  sources: string[];
}
