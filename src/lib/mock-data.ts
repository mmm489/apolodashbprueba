import type {
  AlertRecord,
  DocumentRecord,
  Employee,
  HourlySalesEntry,
  InvoiceRecord,
  PayrollRecord,
  ProductSaleRecord,
  SalesReport,
  TelegramMessage,
  TelegramUser,
} from "@/lib/types";

export const mockDocuments: DocumentRecord[] = [
  {
    id: "doc_1",
    fileName: "ventas-2026-03-22.pdf",
    sourcePath: "OneDrive/ventas/ventas-2026-03-22.pdf",
    documentType: "sales_report",
    status: "validated",
    confidence: 0.96,
    extractorVersion: "v1",
    createdAt: "2026-03-22T22:15:00.000Z",
  },
  {
    id: "doc_2",
    fileName: "ventas-hora-2026-03-22.pdf",
    sourcePath: "OneDrive/ventas/ventas-hora-2026-03-22.pdf",
    documentType: "hourly_report",
    status: "validated",
    confidence: 0.95,
    extractorVersion: "v1",
    createdAt: "2026-03-22T22:16:00.000Z",
  },
  {
    id: "doc_3",
    fileName: "factura-lacteos-marzo.pdf",
    sourcePath: "OneDrive/facturas/factura-lacteos-marzo.pdf",
    documentType: "invoice",
    status: "validated",
    confidence: 0.92,
    extractorVersion: "v1",
    createdAt: "2026-03-23T06:30:00.000Z",
  },
];

export const mockSalesReports: SalesReport[] = [
  {
    id: "sale_1",
    businessDate: "2026-03-20",
    totalSales: 1280.5,
    orderCount: 164,
    averageTicket: 7.81,
    paymentMix: { cash: 320.2, card: 960.3 },
  },
  {
    id: "sale_2",
    businessDate: "2026-03-21",
    totalSales: 1442.1,
    orderCount: 181,
    averageTicket: 7.97,
    paymentMix: { cash: 301.1, card: 1141 },
  },
  {
    id: "sale_3",
    businessDate: "2026-03-22",
    totalSales: 1574.4,
    orderCount: 193,
    averageTicket: 8.15,
    paymentMix: { cash: 346.4, card: 1228 },
  },
];

export const mockHourlySales: HourlySalesEntry[] = [
  { id: "hour_1", businessDate: "2026-03-22", hour: "12:00", sales: 122, orderCount: 14 },
  { id: "hour_2", businessDate: "2026-03-22", hour: "13:00", sales: 188, orderCount: 21 },
  { id: "hour_3", businessDate: "2026-03-22", hour: "14:00", sales: 242, orderCount: 28 },
  { id: "hour_4", businessDate: "2026-03-22", hour: "17:00", sales: 286, orderCount: 32 },
  { id: "hour_5", businessDate: "2026-03-22", hour: "18:00", sales: 334, orderCount: 39 },
  { id: "hour_6", businessDate: "2026-03-22", hour: "19:00", sales: 301, orderCount: 36 },
];

export const mockInvoices: InvoiceRecord[] = [
  {
    id: "inv_1",
    supplierName: "Lacteos Costa",
    issueDate: "2026-03-18",
    dueDate: "2026-04-18",
    totalAmount: 410.7,
    taxAmount: 35.7,
    category: "materia_prima",
  },
  {
    id: "inv_2",
    supplierName: "Envases Baleares",
    issueDate: "2026-03-19",
    dueDate: "2026-04-19",
    totalAmount: 182.6,
    taxAmount: 15.8,
    category: "envases",
  },
];

export const mockPayrolls: PayrollRecord[] = [
  {
    id: "pay_1",
    employeeName: "Ana",
    payPeriod: "2026-03",
    grossAmount: 1420,
    netAmount: 1260,
  },
  {
    id: "pay_2",
    employeeName: "Marc",
    payPeriod: "2026-03",
    grossAmount: 1375,
    netAmount: 1220,
  },
];

export const mockProductSales: ProductSaleRecord[] = [
  { id: "prod_1", salesReportId: "sale_1", businessDate: "2026-03-20", productCode: "99", productName: "POT M", units: 7, amount: 30.86 },
  { id: "prod_2", salesReportId: "sale_1", businessDate: "2026-03-20", productCode: "100", productName: "POT S", units: 7, amount: 25.13 },
  { id: "prod_3", salesReportId: "sale_2", businessDate: "2026-03-21", productCode: "154", productName: "XOCOLATA & XURROS", units: 5, amount: 26.81 },
  { id: "prod_4", salesReportId: "sale_2", businessDate: "2026-03-21", productCode: "152", productName: "PACK 3 XURROS SUCRE", units: 6, amount: 18 },
  { id: "prod_5", salesReportId: "sale_3", businessDate: "2026-03-22", productCode: "46", productName: "CAFE AMB LLET", units: 7, amount: 14.31 },
  { id: "prod_6", salesReportId: "sale_3", businessDate: "2026-03-22", productCode: "97", productName: "CUCURUTXO S", units: 4, amount: 14.36 },
];

export const mockAlerts: AlertRecord[] = [
  {
    id: "alert_1",
    title: "Pico de ventas entre las 18:00 y 19:00",
    description: "La franja de tarde sigue siendo la de mayor rendimiento y conviene reforzar personal y stock.",
    severity: "low",
    createdAt: "2026-03-23T08:10:00.000Z",
  },
];

export const mockTelegramUsers: TelegramUser[] = [
  {
    id: "tg_1",
    telegramUserId: "111111111",
    username: "montane",
    displayName: "Montane",
    isActive: true,
  },
  {
    id: "tg_2",
    telegramUserId: "222222222",
    username: "padre",
    displayName: "Padre",
    isActive: true,
  },
  {
    id: "tg_3",
    telegramUserId: "333333333",
    username: "socio",
    displayName: "Socio",
    isActive: true,
  },
];

export const mockEmployees: Employee[] = [
  {
    id: "emp_1",
    name: "Ana",
    shiftStart: "09:00",
    shiftEnd: "13:00",
    workingDaysPerMonth: 22,
    hourlyCost: 8.5,
    weeklyHours: 20,
    isActive: true,
    createdAt: "2026-01-15T10:00:00.000Z",
  },
  {
    id: "emp_2",
    name: "Carlos",
    shiftStart: "16:00",
    shiftEnd: "21:00",
    workingDaysPerMonth: 20,
    hourlyCost: 9.0,
    weeklyHours: 25,
    isActive: true,
    createdAt: "2026-02-01T10:00:00.000Z",
  },
  {
    id: "emp_3",
    name: "Maria",
    shiftStart: "10:00",
    shiftEnd: "14:00",
    workingDaysPerMonth: 18,
    hourlyCost: 8.5,
    weeklyHours: 18,
    isActive: true,
    createdAt: "2026-02-10T10:00:00.000Z",
  },
];

export const mockTelegramMessages: TelegramMessage[] = [
  {
    id: "msg_1",
    telegramUserId: "111111111",
    username: "montane",
    question: "Cuanto vendimos esta semana?",
    answer: "Esta semana llevais 4.297,00 EUR en ventas acumuladas.",
    createdAt: "2026-03-23T08:30:00.000Z",
  },
  {
    id: "msg_2",
    telegramUserId: "222222222",
    username: "padre",
    question: "Que hora fue la mejor ayer?",
    answer: "Ayer la mejor hora fue a las 18:00 con 334,00 EUR.",
    createdAt: "2026-03-23T09:00:00.000Z",
  },
];
