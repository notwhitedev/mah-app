import { useState, useEffect, useRef } from 'react'
import './App.css'
import html2pdf from 'html2pdf.js'
import { API_BASE_URL } from './api'

const API_URL = API_BASE_URL.replace(/\/api$/, '')

interface Transaction {
  id: string
  customerId?: string
  customerName?: string
  currency: string
  senderCurrency: string
  receiverCurrency: string
  senderRate: number
  receiverRate: number
  date: string
  sender: string
  amount: string
  receiver: string
  deliveryAmount: string
  profitLoss: number
  description: string
  status: 'pending' | 'completed' | 'cancelled'
  note?: string
  isIrade?: boolean
  iradeId?: string
  [key: string]: any
}

interface Customer {
  id: string
  name: string
  phone: string
  email: string
  locatedCountry: string
  originCountry: string
  totalTransactions: number
  profit: number
  loss: number
  transactions: Transaction[]
}

interface CurrencyRate {
  currency: string
  rate: number // X currency = 1 USD (örn: 130 TRY = 1 USD ise rate = 130)
}

interface EmployeePermissionSet {
  canAddCustomers: boolean
  canEditCustomers: boolean
  canDeleteCustomers: boolean
  canAddTransactions: boolean
  canEditTransactions: boolean
  canDeleteTransactions: boolean
  canViewCustomers: boolean
  canViewTransactions: boolean
  canManageEmployees: boolean
  canExportPdf: boolean
}

interface UserAccount {
  id: string
  username: string
  password: string
  name: string
  country: string
  createdAt: string
  role?: 'owner' | 'employee' | 'developer'
  ownerId?: string
  permissions?: EmployeePermissionSet
}

interface EmployeeActivityLog {
  id: string
  employeeId: string
  action: string
  timestamp: string
}

interface Irade {
  id: string
  amount: number
  fromCustomerId: string
  fromCustomerName: string
  toCustomerId: string
  toCustomerName: string
  date: string
  note: string
}

function App() {
  const [currentPage, setCurrentPage] = useState(() => {
    if (typeof window === 'undefined') return 'login'
    const savedPage = localStorage.getItem('muhasebe_current_page')
    const validPages = ['home', 'customers', 'transactions', 'settings', 'developer-panel', 'currency-settings', 'employees', 'login']
    if (savedPage && validPages.includes(savedPage)) return savedPage
    const savedUser = localStorage.getItem('muhasebe_current_user')
    return savedUser ? 'home' : 'login'
  })
  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [toast, setToast] = useState<{ message: string; kind: 'success' | 'error' } | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [editingRowId, setEditingRowId] = useState<string | null>(null)

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [contextMenu, setContextMenu] = useState<{ visible: boolean, x: number, y: number, type: string, id?: number | string }>({ visible: false, x: 0, y: 0, type: '', id: undefined })
  const [showAddColumnModal, setShowAddColumnModal] = useState(false)
  const [customColumns, setCustomColumns] = useState<any[]>([])
  const [currencyRates, setCurrencyRates] = useState<CurrencyRate[]>([
    { currency: 'USD', rate: 1 },
    { currency: 'EUR', rate: 0.93 },
    { currency: 'GBP', rate: 0.79 }
  ])
  const [editingCurrencyRate, setEditingCurrencyRate] = useState<{ idx: number; value: string } | null>(null)
  const [showTransactionModal, setShowTransactionModal] = useState(false)
  const [selectedTransactionForModal, setSelectedTransactionForModal] = useState<Transaction | null>(null)
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    const savedDarkMode = localStorage.getItem('darkMode')
    return savedDarkMode ? JSON.parse(savedDarkMode) : false
  })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showEmployeeModal, setShowEmployeeModal] = useState(false)
  const [expandedPermissionEmployeeId, setExpandedPermissionEmployeeId] = useState<string | null>(null)
  const [activityEmployee, setActivityEmployee] = useState<UserAccount | null>(null)
  const [activityDateRange, setActivityDateRange] = useState<'1d' | '30d' | '365d' | 'custom'>('30d')
  const [activityCustomDays, setActivityCustomDays] = useState('30')
  const [language, setLanguage] = useState<'tr' | 'en' | 'ar'>(() => {
    if (typeof window === 'undefined') return 'ar'
    const savedLanguage = localStorage.getItem('language') as 'tr' | 'en' | 'ar' | null
    return savedLanguage && ['tr', 'en', 'ar'].includes(savedLanguage) ? savedLanguage : 'ar'
  })
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportStartDate, setExportStartDate] = useState('')
  const [exportEndDate, setExportEndDate] = useState('')
  const [dateRangeStartDate, setDateRangeStartDate] = useState('')
  const [dateRangeEndDate, setDateRangeEndDate] = useState('')
  const [fontSize, setFontSize] = useState(() => {
    if (typeof window === 'undefined') return 16
    const savedFontSize = localStorage.getItem('app_font_size')
    return savedFontSize ? parseInt(savedFontSize) : 16
  })
  const [showIradeModal, setShowIradeModal] = useState(false)
  const [iradeAmount, setIradeAmount] = useState('')
  const [iradeToCustomer, setIradeToCustomer] = useState('')
  const [irades, setIrades] = useState<Irade[]>([])

  // İlk yüklemede tarih aralığını ayarla
  useEffect(() => {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    setDateRangeStartDate(todayStr)
    setDateRangeEndDate(todayStr)
  }, [])
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null)
  const [allUsers, setAllUsers] = useState<UserAccount[]>([])
  const [employeeActivities, setEmployeeActivities] = useState<Record<string, EmployeeActivityLog[]>>({})
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const transactionSaveTimers = useRef<Record<string, number>>({})
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [developerForm, setDeveloperForm] = useState({ username: '', password: '', country: '', name: '' })
  const toastTimer = useRef<number | null>(null)
  const [showAllUsers, setShowAllUsers] = useState(false)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [editingUserForm, setEditingUserForm] = useState({ username: '', password: '' })
  const [employeeForm, setEmployeeForm] = useState({
    username: '',
    password: '',
    name: '',
    country: '',
    permissions: {
      canAddCustomers: true,
      canEditCustomers: true,
      canDeleteCustomers: false,
      canAddTransactions: true,
      canEditTransactions: true,
      canDeleteTransactions: false,
      canViewCustomers: true,
      canViewTransactions: true,
      canManageEmployees: false,
      canExportPdf: true
    }
  })

  const DEV_USERNAME = '985782980'
  const DEV_PASSWORD = '5316255719'

  // Dil çevirileri
  const translations = {
    tr: {
      appTitle: 'Flash',
      appSubtitle: 'İşlem ve müşteri takip paneli',
      statistics: 'İstatistikler',
      addCustomer: 'Müşteri Ekle',
      viewCustomers: 'Müşterileri Görüntüle',
      currencies: 'Para Birimleri',
      totalProfit: 'Toplam Kazanç',
      darkMode: 'Karanlık Mod',
      lightMode: 'Aydınlık Mod',
      addEmployee: 'İşçi Ekle',
      employees: 'İşçiler',
      employeesPage: 'Çalışanlar',
      employeeUsername: 'Çalışan kullanıcı adı',
      employeePassword: 'Çalışan şifresi',
      employeeName: 'Çalışan adı',
      employeeCountry: 'Ülke',
      permissions: 'İzinler',
      managePermissions: 'İzinleri Yönet',
      totalTransactions: 'Toplam İşlem',
      activeCustomers: 'Aktif Müşteri',
      totalLoss: 'İradeler',
      iradeLabel: 'İradeler',
      thisMonthActivity: 'Bu Ay Hareket',
      activeAccounts: 'Aktif Hesaplar',
      transactions: 'İşlemler',
      deleteCustomer: 'Müşteriyi Sil',
      sender: 'Gönderen',
      amount: 'Tutar',
      receiver: 'Alıcı',
      deliveryAmount: 'Teslim Tutar',
      profitLoss: 'Kazanç/Zarar',
      currencySettings: 'Para Birimi Ayarları',
      position: 'Pozisyon',
      salary: 'Maaş',
      language: 'Dil',
      settingsPage: 'Ayarlar',
      appearance: 'Görünüm',
      selectLanguage: 'Dil Seç',
      logout: 'Çıkış Yap',
      customerPhone: 'Telefon numarası',
      customerEmail: 'E-posta adresi',
      locatedCountry: 'Bulunduğu Ülke',
      originCountry: 'Hangi Ülkeden',
      newCurrency: 'Yeni para birimi (örn: JPY)',
      usdRate: 'USD kuru (örn: 130)',
      addCurrency: '+ Ekle',
      delete: 'Sil',
      currencyInfo: 'Para birimlerinin USD karşılık değerlerini buradan belirleyebilirsiniz.',
      currencyInfo2: 'Örnek: 130 TRY = 1 USD ise kuru 130 olarak ayarlayın.',
      currencyInfo3: 'İstatistikler USD bazında hesaplanır.',
      currency: 'Para Birimi',
      rate: 'Kur',
      addColumn: 'Yeni Bölme Ekle',
      columnName: 'Bölme Adı',
      columnType: 'Bölme Tipi',
      text: 'Metin',
      number: 'Sayı',
      cancel: 'İptal',
      totalTransactionsLabel: 'Toplam İşlem',
      profitLabel: 'Kazanç',
      lossLabel: 'Zarar',
      status: 'Durum',
      pending: 'Beklemede',
      completed: 'Tamamlandı',
      cancelled: 'İptal',
      customers: 'Müşteriler',
      id: 'ID',
      customer: 'Müşteri',
      date: 'Tarih',
      noTransactions: 'Henüz işlem yok',
      newTransaction: 'Yeni İşlem Ekle',
      deleteColumn: 'Bölme Sil',
      selectCurrency: 'Para Birimi Seç',
      turkish: 'Türkçe',
      english: 'English',
      arabic: 'العربية',
      exportPDF: 'PDF İndir',
      exportRange: 'Aralık Seç',
      startDate: 'Başlangı Tarihi',
      endDate: 'Bitiş Tarihi',
      selectRange: 'Tarih Aralığı Seç',
      exportSelected: 'Seçilenleri İndir',
      exportAll: 'Tümünü İndir',
      noDateRange: 'Tarih aralığı seçilmedi',
      unnamedCustomer: 'İsimsiz Müşteri',
      customerAlreadyExists: 'isminde bir müşteri zaten mevcut.',
      customerAlreadyExistsWithDifferentInfo: 'isminde bir müşteri zaten mevcut. Lütfen ismi değiştirin.',
      confirmDeleteCustomer: 'Bu müşteriyi silmek istediğinizden emin misiniz?',
      confirmDeleteTransaction: 'Bu işlemi silmek istediğinizden emin misiniz?',
      confirmDeleteColumn: 'Bu sütunu silmek istediğinizden emin misiniz?',
      confirmDeleteUser: 'Bu kullanıcıyı silmek istediğinizden emin misiniz?',
      deleteUser: 'Kullanıcı Sil',
      noCustomerAdded: 'Henüz müşteri eklenmedi',
      noSearchResults: 'Arama sonucu bulunamadı',
      phoneLabel: 'Telefon:',
      emailLabel: 'E-posta:',
      edit: 'Düzenle',
      addRow: '+ Satır Ekle',
      transactionId: 'İşlem ID',
      editButton: 'Düzenle',
      saveButton: 'Kaydet',
      deleteButton: 'Sil',
      deleteRowButton: 'Sil',
      cancelButton: 'İptal',
      addButton: 'Ekle',
      pleaseEnterColumnName: 'Lütfen bir bölme adı girin',
      exampleColumnPlaceholder: 'Örn: Not, Referans vb.',
      pleaseEnterValidCurrency: 'Lütfen geçerli bir para birimi adı ve kuru girin',
      atLeastOneCurrency: 'En az bir para birimi bulunmalıdır.',
      customColumns: 'Özel Bölmeler',
      currenciesHeader: 'Para Birimleri',
      transactionDetails: 'İşlemler',
      noTransactionAdded: 'Henüz işlem eklenmedi. "+ Satır Ekle" butonuna tıklayın.',
      senderCurrency: 'Gönderici Para Birimi',
      receiverCurrency: 'Alıcı Para Birimi',
      usd: 'USD',
      currencyRateDisplay: '1 USD = {rate} {currency}',
      back: 'Geri',
      customerName: 'Müşteri Adı',
      phone: 'Telefon',
      email: 'E-posta',
      submit: 'Ekle',
      search: 'Müşteri ara (isim, ID, telefon, e-posta)',
      allowAddCustomers: 'Müşteri ekleyebilir',
      allowEditCustomers: 'Müşterileri düzenleyebilir',
      allowDeleteCustomers: 'Müşterileri silebilir',
      allowAddTransactions: 'İşlem ekleyebilir',
      allowEditTransactions: 'İşlemleri düzenleyebilir',
      allowDeleteTransactions: 'İşlemleri silebilir',
      allowManageEmployees: 'Çalışanları yönetebilir',
      allowExportPdf: 'PDF dışa aktarabilir',
      settings: 'Ayarlar',
      saveRate: 'Kaydet',
      deleteRow: 'Satır Sil',
      selectCustomer: 'Müşteri Seç',
      addNote: 'Not Ekle',
      note: 'Not',
      transactionManagement: 'İşlem Yönetimi',
      todayTransactions: 'Günlük',
      noTodayTransactions: 'Bugün henüz satır eklenmedi',
      searchCustomer: 'Müşteri Ara',
      dateRange: 'Tarih Aralığı',
      exportDateRangePDF: 'Tarih Aralığı PDF İndir',
      noDateRangeTransactions: 'Bu tarih aralığında işlem yok',
      fontSize: 'Yazı Boyutu',
      small: 'Küçük',
      medium: 'Orta',
      large: 'Büyük',
      irade: 'İrade',
      addIrade: 'İrade Ekle',
      iradeAmount: 'İrade Tutarı',
      iradeNote: 'Gönderici {sender} alıcı {receiver} hesabına {amount} irade yatırdı',
      totalIrade: 'Toplam İrade',
      selectReceiver: 'Alıcı Seç',
      statsPeriod: 'İstatistik Dönemi',
      day: 'Gün',
      week: 'Hafta',
      month: 'Ay',
      year: 'Yıl',
      custom: 'Özel',
      exportStatsPDF: 'İstatistik PDF İndir',
      noStatsData: 'Bu dönemde veri yok'
    },
    en: {
      appTitle: 'Flash',
      appSubtitle: 'Transaction and customer tracking panel',
      statistics: 'Statistics',
      addCustomer: 'Add Customer',
      viewCustomers: 'View Customers',
      currencies: 'Currencies',
      darkMode: 'Dark Mode',
      lightMode: 'Light Mode',
      addEmployee: 'Add Employee',
      employees: 'Employees',
      employeesPage: 'Employees',
      employeeUsername: 'Employee username',
      employeePassword: 'Employee password',
      employeeName: 'Employee name',
      employeeCountry: 'Country',
      permissions: 'Permissions',
      managePermissions: 'Manage Permissions',
      allowAddCustomers: 'Can add customers',
      allowEditCustomers: 'Can edit customers',
      allowDeleteCustomers: 'Can delete customers',
      allowAddTransactions: 'Can add transactions',
      allowEditTransactions: 'Can edit transactions',
      allowDeleteTransactions: 'Can delete transactions',
      allowManageEmployees: 'Can manage employees',
      allowExportPdf: 'Can export PDF',
      settings: 'Settings',
      back: 'Back',
      customerName: 'Full Name',
      phone: 'Phone',
      email: 'Email',
      submit: 'Add',
      search: 'Search customer (name, ID, phone, email)',
      totalProfit: 'Total Profit',
      totalTransactions: 'Total Transactions',
      activeCustomers: 'Active Customers',
      totalLoss: 'Commissions',
      iradeLabel: 'Commissions',
      thisMonthActivity: 'This Month Activity',
      activeAccounts: 'Active Accounts',
      noDateRangeTransactions: 'No transactions in this date range',
      transactions: 'Transactions',
      deleteCustomer: 'Delete Customer',
      sender: 'Sender',
      amount: 'Amount',
      receiver: 'Receiver',
      deliveryAmount: 'Delivery Amount',
      profitLoss: 'Profit/Loss',
      currencySettings: 'Currency Settings',
      position: 'Position',
      salary: 'Salary',
      language: 'Language',
      settingsPage: 'Settings',
      appearance: 'Appearance',
      selectLanguage: 'Select Language',
      logout: 'Log Out',
      customerPhone: 'Phone number',
      customerEmail: 'Email address',
      locatedCountry: 'Country of Residence',
      originCountry: 'Country of Origin',
      newCurrency: 'New currency (e.g. JPY)',
      usdRate: 'USD rate (e.g. 130)',
      addCurrency: '+ Add',
      delete: 'Delete',
      currencyInfo: 'You can set USD equivalent values for currencies here.',
      currencyInfo2: 'Example: If 130 TRY = 1 USD, set the rate to 130.',
      currencyInfo3: 'Statistics are calculated in USD.',
      currency: 'Currency',
      rate: 'Rate',
      addColumn: 'Add New Column',
      columnName: 'Column Name',
      columnType: 'Column Type',
      text: 'Text',
      number: 'Number',
      cancel: 'Cancel',
      totalTransactionsLabel: 'Total Transactions',
      profitLabel: 'Profit',
      lossLabel: 'Loss',
      status: 'Status',
      pending: 'Pending',
      completed: 'Completed',
      cancelled: 'Cancelled',
      customers: 'Customers',
      id: 'ID',
      customer: 'Customer',
      date: 'Date',
      noTransactions: 'No transactions yet',
      newTransaction: 'Add New Transaction',
      deleteColumn: 'Delete Column',
      selectCurrency: 'Select Currency',
      turkish: 'Türkçe',
      english: 'English',
      arabic: 'العربية',
      exportPDF: 'PDF Export',
      exportRange: 'Export Range',
      startDate: 'Start Date',
      endDate: 'End Date',
      selectRange: 'Select Date Range',
      exportSelected: 'Export Selected',
      exportAll: 'Export All',
      noDateRange: 'No date range selected',
      unnamedCustomer: 'Unnamed Customer',
      customerAlreadyExists: 'A customer with this name already exists.',
      customerAlreadyExistsWithDifferentInfo: 'A customer with this name already exists. Please change the name.',
      confirmDeleteCustomer: 'Are you sure you want to delete this customer?',
      confirmDeleteTransaction: 'Are you sure you want to delete this transaction?',
      confirmDeleteColumn: 'Are you sure you want to delete this column?',
      confirmDeleteUser: 'Are you sure you want to delete this user?',
      deleteUser: 'Delete User',
      noCustomerAdded: 'No customers added yet',
      noSearchResults: 'No search results found',
      phoneLabel: 'Phone:',
      emailLabel: 'Email:',
      edit: 'Edit',
      addRow: '+ Add Row',
      transactionId: 'Transaction ID',
      editButton: 'Edit',
      saveButton: 'Save',
      deleteButton: 'Delete',
      deleteRowButton: 'Delete',
      cancelButton: 'Cancel',
      addButton: 'Add',
      pleaseEnterColumnName: 'Please enter a column name',
      exampleColumnPlaceholder: 'E.g. Note, Reference, etc.',
      pleaseEnterValidCurrency: 'Please enter a valid currency name and rate',
      atLeastOneCurrency: 'At least one currency must exist.',
      customColumns: 'Custom Columns',
      currenciesHeader: 'Currencies',
      transactionDetails: 'Transactions',
      noTransactionAdded: 'No transactions added yet. Click "+ Add Row" button.',
      senderCurrency: 'Sender Currency',
      receiverCurrency: 'Receiver Currency',
      usd: 'USD',
      currencyRateDisplay: '1 USD = {rate} {currency}',
      saveRate: 'Save',
      deleteRow: 'Delete Row',
      selectCustomer: 'Select Customer',
      addNote: 'Add Note',
      note: 'Note',
      transactionManagement: 'Transaction Management',
      todayTransactions: 'Daily',
      noTodayTransactions: 'No rows added today',
      searchCustomer: 'Search Customer',
      dateRange: 'Date Range',
      exportDateRangePDF: 'Export Date Range PDF',
      fontSize: 'Font Size',
      small: 'Small',
      medium: 'Medium',
      large: 'Large',
      irade: 'Commission',
      addIrade: 'Add Commission',
      iradeAmount: 'Commission Amount',
      iradeNote: 'Sender {sender} deposited {amount} commission to receiver {receiver} account',
      totalIrade: 'Total Commission',
      selectReceiver: 'Select Receiver',
      statsPeriod: 'Statistics Period',
      day: 'Day',
      week: 'Week',
      month: 'Month',
      year: 'Year',
      custom: 'Custom',
      exportStatsPDF: 'Export Statistics PDF',
      noStatsData: 'No data for this period'
    },
    ar: {
      appTitle: 'فلاش',
      appSubtitle: 'لوحة تتبع المعاملات والعملاء',
      statistics: 'الإحصائيات',
      addCustomer: 'إضافة عميل',
      viewCustomers: 'عرض العملاء',
      currencies: 'العملات',
      darkMode: 'الوضع الداكن',
      lightMode: 'الوضع الفاتح',
      addEmployee: 'إضافة موظف',
      employees: 'الموظفين',
      employeesPage: 'الموظفون',
      employeeUsername: 'اسم مستخدم الموظف',
      employeePassword: 'كلمة مرور الموظف',
      employeeName: 'اسم الموظف',
      employeeCountry: 'الدولة',
      permissions: 'الأذونات',
      managePermissions: 'إدارة الصلاحيات',
      allowAddCustomers: 'يمكنه إضافة العملاء',
      allowEditCustomers: 'يمكنه تعديل العملاء',
      allowDeleteCustomers: 'يمكنه حذف العملاء',
      allowAddTransactions: 'يمكنه إضافة المعاملات',
      allowEditTransactions: 'يمكنه تعديل المعاملات',
      allowDeleteTransactions: 'يمكنه حذف المعاملات',
      allowManageEmployees: 'يمكنه إدارة الموظفين',
      allowExportPdf: 'يمكنه تصدير PDF',
      settings: 'الإعدادات',
      back: 'رجوع',
      customerName: 'الاسم الكامل',
      phone: 'الهاتف',
      email: 'البريد الإلكتروني',
      submit: 'إضافة',
      search: 'البحث عن عميل (الاسم، المعرف، الهاتف، البريد)',
      totalProfit: 'إجمالي الربح',
      totalTransactions: 'إجمالي المعاملات',
      activeCustomers: 'العملاء النشطين',
      totalLoss: 'العمولات',
      iradeLabel: 'الإرادات',
      thisMonthActivity: 'نشاط هذا الشهر',
      activeAccounts: 'الحسابات النشطة',
      transactions: 'المعاملات',
      deleteCustomer: 'حذف العميل',
      sender: 'المرسل',
      amount: 'المبلغ',
      receiver: 'المستلم',
      deliveryAmount: 'مبلغ التسليم',
      profitLoss: 'الربح/الخسارة',
      senderCurrency: 'عملة المرسل',
      receiverCurrency: 'عملة المستلم',
      currencySettings: 'إعدادات العملة',
      position: 'الموقع',
      salary: 'الراتب',
      language: 'اللغة',
      settingsPage: 'الإعدادات',
      appearance: 'المظهر',
      selectLanguage: 'اختر اللغة',
      logout: 'تسجيل الخروج',
      customerPhone: 'رقم الهاتف',
      customerEmail: 'عنوان البريد الإلكتروني',
      locatedCountry: 'الدولة الحالية',
      originCountry: 'الدولة الأصل',
      newCurrency: 'عملة جديدة (مثال: JPY)',
      usdRate: 'سعر USD (مثال: 130)',
      addCurrency: '+ إضافة',
      delete: 'حذف',
      currencyInfo: 'يمكنك تعيين القيم المكافئة لـ USD للعملات هنا.',
      currencyInfo2: 'مثال: إذا كان 130 TRY = 1 USD، اضبط السعر على 130.',
      currencyInfo3: 'يتم حساب الإحصائيات بالدولار الأمريكي.',
      currency: 'العملة',
      rate: 'السعر',
      addColumn: 'إضافة عمود جديد',
      columnName: 'اسم العمود',
      columnType: 'نوع العمود',
      text: 'نص',
      number: 'رقم',
      cancel: 'إلغاء',
      totalTransactionsLabel: 'إجمالي المعاملات',
      profitLabel: 'الربح',
      lossLabel: 'الخسارة',
      status: 'الحالة',
      pending: 'قيد الانتظار',
      completed: 'مكتمل',
      cancelled: 'ملغي',
      customers: 'العملاء',
      id: 'المعرف',
      customer: 'العميل',
      date: 'التاريخ',
      noTransactions: 'لا توجد معاملات بعد',
      newTransaction: 'إضافة معاملة جديدة',
      deleteColumn: 'حذف العمود',
      selectCurrency: 'اختر العملة',
      turkish: 'Türkçe',
      english: 'English',
      arabic: 'العربية',
      exportPDF: 'تصدير PDF',
      exportRange: 'اختيار النطاق',
      startDate: 'تاريخ البدء',
      endDate: 'تاريخ الانتهاء',
      selectRange: 'اختر النطاق الزمني',
      exportSelected: 'تصدير المحدد',
      exportAll: 'تصدير الكل',
      noDateRange: 'لم يتم تحديد نطاق زمني',
      unnamedCustomer: 'عميل بدون اسم',
      customerAlreadyExists: 'يوجد عميل بهذا الاسم بالفعل.',
      customerAlreadyExistsWithDifferentInfo: 'يوجد عميل بهذا الاسم بالفعل. يرجى تغيير الاسم.',
      confirmDeleteCustomer: 'هل أنت متأكد من أنك تريد حذف هذا العميل؟',
      confirmDeleteTransaction: 'هل أنت متأكد من أنك تريد حذف هذه المعاملة؟',
      confirmDeleteColumn: 'هل أنت متأكد من أنك تريد حذف هذا العمود؟',
      confirmDeleteUser: 'هل أنت متأكد من أنك تريد حذف هذا المستخدم؟',
      deleteUser: 'حذف المستخدم',
      noCustomerAdded: 'لم يتم إضافة عملاء بعد',
      noSearchResults: 'لم يتم العثور على نتائج البحث',
      phoneLabel: 'الهاتف:',
      emailLabel: 'البريد الإلكتروني:',
      edit: 'تعديل',
      addRow: '+ إضافة صف',
      transactionId: 'معرف المعاملة',
      editButton: 'تعديل',
      saveButton: 'حفظ',
      deleteButton: 'حذف',
      deleteRowButton: 'حذف',
      cancelButton: 'إلغاء',
      addButton: 'إضافة',
      pleaseEnterColumnName: 'يرجى إدخال اسم العمود',
      exampleColumnPlaceholder: 'مثال: ملاحظة، مرجع، إلخ.',
      pleaseEnterValidCurrency: 'يرجى إدخال اسم العملة والسعر الصحيحين',
      atLeastOneCurrency: 'يجب أن توجد عملة واحدة على الأقل.',
      customColumns: 'الأعمدة المخصصة',
      currenciesHeader: 'العملات',
      transactionDetails: 'المعاملات',
      noTransactionAdded: 'لم يتم إضافة معاملات بعد. انقر على زر "+ إضافة صف".',
      usd: 'دولار أمريكي',
      currencyRateDisplay: '1 USD = {rate} {currency}',
      saveRate: 'حفظ',
      deleteRow: 'حذف الصف',
      selectCustomer: 'اختر العميل',
      addNote: 'إضافة ملاحظة',
      note: 'ملاحظة',
      transactionManagement: 'إدارة المعاملات',
      todayTransactions: 'يومي',
      noTodayTransactions: 'لم يتم إضافة صفوف اليوم',
      searchCustomer: 'بحث عن العميل',
      dateRange: 'نطاق التاريخ',
      exportDateRangePDF: 'تصدير PDF نطاق التاريخ',
      noDateRangeTransactions: 'لا توجد معاملات في هذا النطاق الزمني',
      fontSize: 'حجم الخط',
      small: 'صغير',
      medium: 'متوسط',
      large: 'كبير',
      irade: 'الإرادات',
      addIrade: 'إضافة إرادات',
      iradeAmount: 'مبلغ الإرادات',
      iradeNote: 'أودع المرسل {sender} مبلغ {amount} إرادات في حساب المستلم {receiver}',
      totalIrade: 'إجمالي الإرادات',
      selectReceiver: 'اختر المستلم',
      statsPeriod: 'فترة الإحصائيات',
      day: 'يوم',
      week: 'أسبوع',
      month: 'شهر',
      year: 'سنة',
      custom: 'مخصص',
      exportStatsPDF: 'تصدير PDF الإحصائيات',
      noStatsData: 'لا توجد بيانات لهذه الفترة'
    }
  }

  const t = translations[language]

  const defaultOwnerPermissions: EmployeePermissionSet = {
    canAddCustomers: true,
    canEditCustomers: true,
    canDeleteCustomers: true,
    canAddTransactions: true,
    canEditTransactions: true,
    canDeleteTransactions: true,
    canViewCustomers: true,
    canViewTransactions: true,
    canManageEmployees: true,
    canExportPdf: true
  }

  const defaultEmployeePermissions: EmployeePermissionSet = {
    canAddCustomers: true,
    canEditCustomers: true,
    canDeleteCustomers: false,
    canAddTransactions: true,
    canEditTransactions: true,
    canDeleteTransactions: false,
    canViewCustomers: true,
    canViewTransactions: true,
    canManageEmployees: false,
    canExportPdf: true
  }

  const getOwnerStorageId = (user: UserAccount | null) => {
    if (!user) return null
    if (user.role === 'employee' && user.ownerId) return user.ownerId
    return user.id
  }

  const getManagedOwnerId = (user: UserAccount | null) => {
    if (!user) return null
    if (user.role === 'employee') return user.ownerId || user.id
    return user.id
  }

  const getCurrentPermissions = () => {
    if (!currentUser) return defaultOwnerPermissions
    if (currentUser.role === 'developer') return defaultOwnerPermissions
    if (currentUser.role === 'employee') return currentUser.permissions || defaultEmployeePermissions
    return defaultOwnerPermissions
  }

  const can = (permission: keyof EmployeePermissionSet) => getCurrentPermissions()[permission]

  const showToast = (message: string, kind: 'success' | 'error') => {
    if (!message) return
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    setToast({ message, kind })
    toastTimer.current = window.setTimeout(() => setToast(null), 3000)
  }

  const setErrorMessage = (message: string) => {
    if (message) showToast(message, 'error')
  }

  const setDeveloperMessage = (message: string) => {
    if (!message) return
    const lowered = message.toLocaleLowerCase()
    const isError = ['hata', 'başarısız', 'eklenemedi', 'kaydedilemedi', 'zaten', 'boş', 'failed', 'already', 'could not', 'تعذر', 'موجود'].some((word) => lowered.includes(word))
    showToast(message, isError ? 'error' : 'success')
  }

  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault()

    if (loginForm.username === DEV_USERNAME && loginForm.password === DEV_PASSWORD) {
      const developerUser: UserAccount = {
        id: 'developer',
        username: DEV_USERNAME,
        password: DEV_PASSWORD,
        name: 'Developer',
        country: 'Developer',
        createdAt: new Date().toISOString()
      }
      setCurrentUser(developerUser)
      setCurrentPage('developer-panel')
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      })

      if (response.ok) {
        const data = await response.json()
        setCurrentUser(data.user)
        setCurrentPage('home')
        return
      } else {
        const message = language === 'tr' ? 'Kullanıcı adı veya şifre hatalı.' : language === 'en' ? 'Incorrect username or password.' : 'اسم المستخدم أو كلمة المرور غير صحيحة.'
        showToast(message, 'error')
        return
      }
    } catch (err) {
      const message = language === 'tr' ? 'Sunucuya bağlanılamadı.' : language === 'en' ? 'Could not connect to server.' : 'لم يتمكن من الاتصال بالخادم.'
      showToast(message, 'error')
    }
  }

  const handleLogout = () => {
    setCurrentUser(null)
    setCurrentPage('login')
    setLoginForm({ username: '', password: '' })
    // Kullanıcı kayıtları silinmez; sadece geçerli oturum kapanır.
  }

  const handleDeleteUser = async (userId: string) => {
    if (userId === 'developer') {
      return
    }

    if (!window.confirm(t.confirmDeleteUser)) {
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/users/${userId}`, { method: 'DELETE' })
      if (!response.ok) {
        throw new Error('Delete failed')
      }

      const updatedUsers = allUsers.filter((user) => user.id !== userId)
      setAllUsers(updatedUsers)
      if (currentUser) {
        const deletedUser = allUsers.find((user) => user.id === userId)
        const deletedName = deletedUser?.name || deletedUser?.username || userId
        const text = language === 'tr'
          ? `${currentUser.name || 'Kullanıcı'} "${deletedName}" kullanıcısını sildi.`
          : language === 'en'
            ? `${currentUser.name || 'User'} deleted user "${deletedName}".`
            : `${currentUser.name || 'المستخدم'} حذف المستخدم "${deletedName}".`
        addEmployeeActivity(currentUser.id, text)
      }
      showToast(language === 'tr' ? 'Kullanıcı silindi.' : language === 'en' ? 'User deleted.' : 'تم حذف المستخدم.', 'success')
    } catch {
      showToast(language === 'tr' ? 'Kullanıcı silinemedi.' : language === 'en' ? 'User could not be deleted.' : 'تعذر حذف المستخدم.', 'error')
    }
  }

  const getOwnerNameForUser = (user: UserAccount) => {
    if (user.role !== 'employee' || !user.ownerId) return null
    return allUsers.find((owner) => owner.id === user.ownerId)?.name || null
  }

  const getEmployeeActivityLogs = (employeeId: string): EmployeeActivityLog[] => {
    return (employeeActivities[employeeId] || []).slice(0, 30).map((log) => ({
      ...log,
      action: localizeEmployeeActivityText(log.action)
    }))
  }

  const getActivityFilterDays = () => {
    if (activityDateRange === '1d') return 1
    if (activityDateRange === '30d') return 30
    if (activityDateRange === '365d') return 365

    const parsedDays = Number(activityCustomDays)
    return Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : 30
  }

  const getFilteredActivityLogs = (employeeId: string) => {
    const logs = getEmployeeActivityLogs(employeeId)
    const days = getActivityFilterDays()
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000

    return logs.filter((log) => new Date(log.timestamp).getTime() >= cutoff)
  }

  const formatActivityTimestamp = (timestamp: string) => {
    const locale = language === 'ar' ? 'ar-EG' : language === 'en' ? 'en-US' : 'tr-TR'
    return new Date(timestamp).toLocaleString(locale)
  }

  const localizeEmployeeActivityText = (action: string) => {
    if (!action) return action
    if (language === 'tr') return action

    const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()

    const patterns: Array<{ match: RegExp; transform: (...groups: string[]) => string }> = [
      {
        match: /.*?"([^"]+)" müşterisini ekledi\./,
        transform: (customerName: string) => language === 'en'
          ? `User added customer "${customerName}".`
          : `المستخدم أضاف العميل "${customerName}".`
      },
      {
        match: /.*?"([^"]+)" müşterisini sildi\./,
        transform: (customerName: string) => language === 'en'
          ? `User deleted customer "${customerName}".`
          : `المستخدم حذف العميل "${customerName}".`
      },
      {
        match: /.*?"([^\"]+)" kullanıcısını sildi\./,
        transform: (userName: string) => language === 'en'
          ? `User deleted account "${userName}".`
          : `المستخدم حذف الحساب "${userName}".`
      },
      {
        match: /.*?"([^"]+)" müşterisinin hesabına yeni satır ekledi\./,
        transform: (customerName: string) => language === 'en'
          ? `User added a new row to customer "${customerName}" account.`
          : `المستخدم أضاف سطرًا جديدًا إلى حساب العميل "${customerName}".`
      },
      {
        match: /.*?"([^"]+)" müşterisinin hesabını düzenledi\./,
        transform: (customerName: string) => language === 'en'
          ? `User updated customer "${customerName}" account.`
          : `المستخدم عدّل حساب العميل "${customerName}".`
      },
      {
        match: /.*?"([^"]+)" müşterisinin satırını sildi\./,
        transform: (customerName: string) => language === 'en'
          ? `User deleted a row from customer "${customerName}" account.`
          : `المستخدم حذف سطرًا من حساب العميل "${customerName}".`
      },
      {
        match: /.*?([A-Z0-9]+) kurunu ([0-9.]+) → ([0-9.]+) olarak güncelledi\./,
        transform: (currency: string, previousRate: string, newRate: string) => language === 'en'
          ? `User updated ${currency} rate from ${previousRate} to ${newRate}.`
          : `المستخدم حدّث سعر ${currency} من ${previousRate} إلى ${newRate}.`
      },
      {
        match: /.*?([A-Z0-9]+) para birimini sildi\./,
        transform: (currency: string) => language === 'en'
          ? `User deleted currency ${currency}.`
          : `المستخدم حذف العملة ${currency}.`
      },
      {
        match: /.*?([A-Z0-9]+) para birimini ([0-9.]+) kuruyla ekledi\./,
        transform: (currency: string, rate: string) => language === 'en'
          ? `User added currency ${currency} with rate ${rate}.`
          : `المستخدم أضاف العملة ${currency} بسعر ${rate}.`
      }
    ]

    for (const pattern of patterns) {
      const match = normalize(action).match(pattern.match)
      if (match) {
        return pattern.transform(...match.slice(1))
      }
    }

    return action
  }

  const addEmployeeActivity = (employeeId: string | undefined, action: string) => {
    if (!employeeId) return

    const nextEntry: EmployeeActivityLog = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      employeeId,
      action,
      timestamp: new Date().toISOString()
    }
    setEmployeeActivities((previous) => ({
      ...previous,
      [employeeId]: [nextEntry, ...(previous[employeeId] || [])].slice(0, 30)
    }))
  }

  const handleStartEditOwner = (user: UserAccount) => {
    if (user.role !== 'owner') return
    setEditingUserId(user.id)
    setEditingUserForm({ username: user.username, password: user.password })
  }

  const handleSaveOwnerEdit = async () => {
    if (!editingUserId) return

    const targetUser = allUsers.find((user) => user.id === editingUserId)
    if (!targetUser || targetUser.role !== 'owner') return

    const username = editingUserForm.username.trim()
    const password = editingUserForm.password.trim()

    if (!username || !password) {
      setDeveloperMessage(language === 'tr' ? 'Kullanıcı adı ve şifre boş olamaz.' : language === 'en' ? 'Username and password cannot be empty.' : 'لا يمكن أن يكون اسم المستخدم وكلمة المرور فارغين.')
      return
    }

    const duplicateUsername = allUsers.some((user) => user.id !== editingUserId && user.username.trim().toLowerCase() === username.toLowerCase())
    if (duplicateUsername) {
      setDeveloperMessage(language === 'tr' ? 'Bu kullanıcı adı zaten kayıtlı.' : language === 'en' ? 'This username is already registered.' : 'اسم المستخدم هذا مسجل بالفعل.')
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/users/${editingUserId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...targetUser, username, password })
      })

      if (!response.ok) {
        throw new Error('Update failed')
      }

      const data = await response.json()
      const updatedUsers = allUsers.map((user) => user.id === editingUserId ? data.user : user)
      setAllUsers(updatedUsers)
      setDeveloperMessage(language === 'tr' ? 'Hesap bilgileri güncellendi.' : language === 'en' ? 'Account details updated.' : 'تم تحديث بيانات الحساب.')
      setEditingUserId(null)
      setEditingUserForm({ username: '', password: '' })
    } catch {
      setDeveloperMessage(language === 'tr' ? 'Sunucu güncellemesi başarısız.' : language === 'en' ? 'Server update failed.' : 'فشل تحديث الخادم.')
    }
  }

  const handlePermissionToggle = async (employeeId: string, permissionKey: keyof EmployeePermissionSet) => {
    const targetUser = allUsers.find((user) => user.id === employeeId && user.role === 'employee')
    if (!targetUser) return

    const nextPermissions = { ...(targetUser.permissions || defaultEmployeePermissions) }
    nextPermissions[permissionKey] = !nextPermissions[permissionKey]

    try {
      const response = await fetch(`${API_URL}/api/users/${employeeId}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextPermissions)
      })

      if (!response.ok) {
        throw new Error('Permission update failed')
      }

      const data = await response.json()
      const updatedUsers = allUsers.map((user) => user.id === employeeId ? data.user : user)
      setAllUsers(updatedUsers)
    } catch {
      console.error('Failed to update permission')
    }
  }

  const isDuplicateCredentials = (username: string, password: string) => {
    const normalizedUsername = username.trim().toLowerCase()
    const normalizedPassword = password.trim()

    return allUsers.some((user) => {
      const userUsername = user.username.trim().toLowerCase()
      const userPassword = user.password.trim()
      return userUsername === normalizedUsername && userPassword === normalizedPassword
    })
  }

  const isDuplicateUsername = (username: string) => {
    const normalizedUsername = username.trim().toLowerCase()
    return allUsers.some((user) => user.username.trim().toLowerCase() === normalizedUsername)
  }

  const handleCreateEmployee = async () => {
    const canManageEmployeesForThisUser = currentUser?.role === 'owner' || currentUser?.permissions?.canManageEmployees
    if (!currentUser || !canManageEmployeesForThisUser) return

    const ownerId = getManagedOwnerId(currentUser) || currentUser.id

    const username = employeeForm.username.trim()
    const password = employeeForm.password.trim()
    const name = employeeForm.name.trim()
    const country = employeeForm.country.trim()

    if (!username || !password || !name || !country) {
      setDeveloperMessage(language === 'tr' ? 'Çalışan için tüm alanları doldurun.' : language === 'en' ? 'Please fill in all employee fields.' : 'يرجى ملء جميع حقول الموظف.')
      return
    }

    if (isDuplicateCredentials(username, password)) {
      setDeveloperMessage(language === 'tr' ? 'Geçersiz: aynı kullanıcı adı ve şifre başka hesaba ait.' : language === 'en' ? 'Invalid: this username/password combination is already in use.' : 'غير صالح: اسم المستخدم وكلمة المرور هذا مستخدمان بالفعل في حساب آخر.')
      return
    }

    if (isDuplicateUsername(username)) {
      setDeveloperMessage(language === 'tr' ? 'Bu kullanıcı adı zaten kayıtlı.' : language === 'en' ? 'This username is already registered.' : 'اسم المستخدم هذا مسجل بالفعل.')
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          name,
          country,
          role: 'employee',
          ownerId,
          permissions: employeeForm.permissions
        })
      })

      if (!response.ok) {
        throw new Error('Create employee failed')
      }

      const data = await response.json()
      setAllUsers([...allUsers, data.user])
      setEmployeeForm({
        username: '',
        password: '',
        name: '',
        country: '',
        permissions: {
          canAddCustomers: true,
          canEditCustomers: true,
          canDeleteCustomers: false,
          canAddTransactions: true,
          canEditTransactions: true,
          canDeleteTransactions: false,
          canViewCustomers: true,
          canViewTransactions: true,
          canManageEmployees: false,
          canExportPdf: true
        }
      })
      setDeveloperMessage(language === 'tr' ? 'Çalışan başarıyla eklendi.' : language === 'en' ? 'Employee added successfully.' : 'تمت إضافة الموظف بنجاح.')
      setShowEmployeeModal(false)
    } catch {
      setDeveloperMessage(language === 'tr' ? 'Çalışan eklenemedi.' : language === 'en' ? 'Employee could not be created.' : 'تعذر إضافة الموظف.')
    }
  }

  const handleCreateDeveloperUser = async () => {
    if (!developerForm.username.trim() || !developerForm.password.trim() || !developerForm.country.trim() || !developerForm.name.trim()) {
      setDeveloperMessage(language === 'tr' ? 'Lütfen tüm alanları doldurun.' : language === 'en' ? 'Please fill in all fields.' : 'يرجى ملء جميع الحقول.')
      return
    }

    const username = developerForm.username.trim()
    const password = developerForm.password.trim()

    if (isDuplicateCredentials(username, password)) {
      setDeveloperMessage(language === 'tr' ? 'Geçersiz: aynı kullanıcı adı ve şifre başka hesaba ait.' : language === 'en' ? 'Invalid: this username/password combination is already in use.' : 'غير صالح: اسم المستخدم وكلمة المرور هذا مستخدمان بالفعل في حساب آخر.')
      return
    }

    if (isDuplicateUsername(username)) {
      setDeveloperMessage(language === 'tr' ? 'Bu kullanıcı adı zaten kayıtlı.' : language === 'en' ? 'This username is already registered.' : 'اسم المستخدم هذا مسجل بالفعل.')
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          country: developerForm.country.trim(),
          name: developerForm.name.trim(),
          role: 'owner',
          permissions: defaultOwnerPermissions
        })
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      const data = await response.json()
      setAllUsers([...allUsers, data.user])
      setDeveloperForm({ username: '', password: '', country: '', name: '' })
      setDeveloperMessage(language === 'tr' ? 'Kullanıcı başarıyla eklendi.' : language === 'en' ? 'User added successfully.' : 'تمت إضافة المستخدم بنجاح.')
    } catch {
      setDeveloperMessage(language === 'tr' ? 'Kullanıcı eklenemedi.' : language === 'en' ? 'User creation failed.' : 'تعذر إنشاء المستخدم.')
    }
  }

  // localStorage'dan sadece lokal ayarları yükle; kullanıcı verisi backend'den gelir
  useEffect(() => {
    const savedCurrentPage = localStorage.getItem('muhasebe_current_page')
    const savedCurrentUser = localStorage.getItem('muhasebe_current_user')
    if (savedCurrentUser) {
      const parsedUser = JSON.parse(savedCurrentUser)
      setCurrentUser(parsedUser)
      setCurrentPage(savedCurrentPage && ['home', 'customers', 'transactions', 'settings', 'developer-panel', 'currency-settings', 'employees'].includes(savedCurrentPage) ? savedCurrentPage : 'home')
    } else {
      setCurrentPage(savedCurrentPage && ['login', 'home', 'customers', 'transactions', 'settings', 'developer-panel', 'currency-settings', 'employees'].includes(savedCurrentPage) ? savedCurrentPage : 'login')
    }

    const savedDarkMode = localStorage.getItem('darkMode')
    if (savedDarkMode) {
      const isDark = JSON.parse(savedDarkMode)
      setDarkMode(isDark)
      if (isDark) {
        document.body.classList.add('dark-mode')
      }
    }

    const savedSidebarCollapsed = localStorage.getItem('sidebarCollapsed')
    if (savedSidebarCollapsed) {
      setSidebarCollapsed(JSON.parse(savedSidebarCollapsed))
    }

    const savedFontSize = localStorage.getItem('app_font_size')
    if (savedFontSize) {
      setFontSize(parseInt(savedFontSize))
    }

    const savedLanguage = localStorage.getItem('language') as 'tr' | 'en' | 'ar' | null
    if (savedLanguage && ['tr', 'en', 'ar'].includes(savedLanguage)) {
      setLanguage(savedLanguage)
    }

    const loadUsers = async () => {
      try {
        const response = await fetch(`${API_URL}/api/users`)
        if (response.ok) {
          const users = await response.json()
          setAllUsers(users)
        }
      } catch {
        console.error('Failed to load users from backend')
      }
    }

    loadUsers()
  }, [])

  // Font size değişince localStorage'a kaydet ve uygula
  useEffect(() => {
    localStorage.setItem('app_font_size', fontSize.toString())
    document.documentElement.style.setProperty('--app-font-size', `${fontSize}px`)
  }, [fontSize])

  useEffect(() => {
    if (!currentUser) {
      localStorage.removeItem('muhasebe_current_user')
      setCustomers([])
      setEmployeeActivities({})
      setSettingsLoaded(false)
      return
    }

    localStorage.setItem('muhasebe_current_user', JSON.stringify(currentUser))

    const storageOwnerId = getOwnerStorageId(currentUser)
    
    // API'dan müşterileri yükle
    const loadCustomers = async () => {
      try {
        const response = await fetch(`${API_URL}/api/customers?ownerId=${storageOwnerId}`)
        if (response.ok) {
          const apiCustomers = await response.json()
          const migratedCustomers = apiCustomers.map((customer: Customer) => {
            customer.locatedCountry = customer.locatedCountry || '-'
            customer.originCountry = customer.originCountry || '-'
            if (customer.transactions) {
              customer.transactions = customer.transactions.map((transaction: Transaction) => {
                if (!transaction.senderCurrency) {
                  transaction.senderCurrency = transaction.currency || 'USD'
                }
                if (!transaction.receiverCurrency) {
                  transaction.receiverCurrency = transaction.currency || 'USD'
                }
                if (!transaction.senderRate) {
                  const rate = currencyRates.find(r => r.currency === transaction.senderCurrency)?.rate || 1
                  transaction.senderRate = rate
                }
                if (!transaction.receiverRate) {
                  const rate = currencyRates.find(r => r.currency === transaction.receiverCurrency)?.rate || 1
                  transaction.receiverRate = rate
                }
                return transaction
              })
            }
            return customer
          })
          setCustomers(migratedCustomers)
          // localStorage'a da kaydet
          localStorage.setItem(`customers_${storageOwnerId}`, JSON.stringify(migratedCustomers))
        } else {
          // Backend başarısız olursa localStorage'dan yükle
          const savedCustomers = localStorage.getItem(`customers_${storageOwnerId}`)
          if (savedCustomers) {
            setCustomers(JSON.parse(savedCustomers))
          } else {
            setCustomers([])
          }
          setErrorMessage(language === 'tr' ? 'Bulut verileri yüklenemedi. Yerel veriler kullanılıyor.' : language === 'en' ? 'Cloud data could not be loaded. Using local data.' : 'تعذر تحميل البيانات السحابية. استخدام البيانات المحلية.')
        }
      } catch (err) {
        // Backend başarısız olursa localStorage'dan yükle
        const savedCustomers = localStorage.getItem(`customers_${storageOwnerId}`)
        if (savedCustomers) {
          setCustomers(JSON.parse(savedCustomers))
        } else {
          setCustomers([])
        }
        setErrorMessage(language === 'tr' ? 'Bulut verilerine bağlanılamadı. Yerel veriler kullanılıyor.' : language === 'en' ? 'Could not connect to cloud data. Using local data.' : 'تعذر الاتصال بالبيانات السحابية. استخدام البيانات المحلية.')
      }
    }

    loadCustomers()

    // İradeleri localStorage'dan yükle
    const loadIrades = () => {
      try {
        const savedIrades = localStorage.getItem('irades')
        if (savedIrades) {
          setIrades(JSON.parse(savedIrades))
        }
      } catch {
        console.error('Failed to load irades from localStorage')
      }
    }

    loadIrades()

    setSettingsLoaded(false)
    fetch(`${API_URL}/api/settings/${storageOwnerId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Settings could not be loaded')
        return response.json()
      })
      .then((settings) => {
        if (Array.isArray(settings.currencyRates) && settings.currencyRates.length > 0) {
          setCurrencyRates(settings.currencyRates)
        } else {
          setCurrencyRates([
            { currency: 'USD', rate: 1 },
            { currency: 'EUR', rate: 0.93 },
            { currency: 'GBP', rate: 0.79 }
          ])
        }
        if (Array.isArray(settings.customColumns)) setCustomColumns(settings.customColumns)
        if (settings.employeeActivities && typeof settings.employeeActivities === 'object') {
          setEmployeeActivities(settings.employeeActivities)
        }
        if (typeof settings.darkMode === 'boolean') setDarkMode(settings.darkMode)
        if (typeof settings.sidebarCollapsed === 'boolean') setSidebarCollapsed(settings.sidebarCollapsed)
        if (['tr', 'en', 'ar'].includes(settings.language)) setLanguage(settings.language)
        setSettingsLoaded(true)
      })
      .catch(() => {
        setSettingsLoaded(true)
      })
  }, [currentUser])

  // Verileri localStorage'a kaydet
  useEffect(() => {
    if (!currentUser || !settingsLoaded) return
    const storageOwnerId = getOwnerStorageId(currentUser)
    if (!storageOwnerId) return
    const settings = {
      currencyRates,
      customColumns,
      employeeActivities,
      darkMode,
      sidebarCollapsed,
      language
    }
    const saveTimer = window.setTimeout(() => {
      // Önce localStorage'a kaydet
      localStorage.setItem(`settings_${storageOwnerId}`, JSON.stringify(settings))

      // Sonra backend'e kaydet
      fetch(`${API_URL}/api/settings/${storageOwnerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      }).then((response) => {
        if (!response.ok) throw new Error('Settings save failed')
      }).catch(() => {
        // Backend başarısız olursa localStorage'da kalır
        console.log('Settings saved to localStorage only')
      })
    }, 400)

    return () => window.clearTimeout(saveTimer)
  }, [currencyRates, customColumns, employeeActivities, darkMode, sidebarCollapsed, language, currentUser, settingsLoaded])

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode))
    // Body elementine dark-mode class'ını ekle/çıkar
    if (darkMode) {
      document.body.classList.add('dark-mode')
    } else {
      document.body.classList.remove('dark-mode')
    }
  }, [darkMode])

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', JSON.stringify(sidebarCollapsed))
  }, [sidebarCollapsed])

  useEffect(() => {
    localStorage.setItem('muhasebe_current_page', currentPage)
  }, [currentPage])

  useEffect(() => {
    localStorage.setItem('language', language)
    document.documentElement.lang = language
  }, [language])

  const generateTransactionId = () => {
    return Math.floor(10000000000 + Math.random() * 900000000000).toString()
  }

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!can('canAddCustomers')) {
      setErrorMessage(language === 'tr' ? 'Bu işlem için yetkiniz yok.' : language === 'en' ? 'You do not have permission for this action.' : 'ليس لديك صلاحية لهذا الإجراء.')
      return
    }

    const form = e.target as HTMLFormElement
    const formData = new FormData(form)
    
    const name = formData.get('name') as string || t.unnamedCustomer
    const phone = formData.get('phone') as string || '-'
    const email = formData.get('email') as string || '-'
    const locatedCountry = (formData.get('locatedCountry') as string || '-').trim() || '-'
    const originCountry = (formData.get('originCountry') as string || '-').trim() || '-'

    const existingCustomer = customers.find(c => c.name.toLowerCase() === name.toLowerCase())

    if (existingCustomer) {
      if (existingCustomer.phone !== phone || existingCustomer.email !== email) {
        setErrorMessage(`"${name}" ${t.customerAlreadyExistsWithDifferentInfo}`)
        return
      } else {
        setErrorMessage(`"${name}" ${t.customerAlreadyExists}`)
        return
      }
    }

    setErrorMessage('')
    
    const storageOwnerId = getOwnerStorageId(currentUser)
    
    try {
      const response = await fetch(`${API_URL}/api/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone,
          email,
          locatedCountry,
          originCountry,
          ownerId: storageOwnerId,
          transactions: []
        })
      })

      if (response.ok) {
        const apiCustomer = await response.json()
        setCustomers([...customers, apiCustomer])
        
        if (currentUser) {
          const userName = currentUser.name || (language === 'tr' ? 'Kullanıcı' : language === 'en' ? 'User' : 'مستخدم')
          const text = language === 'tr'
            ? `${userName} "${name}" müşterisini ekledi.`
            : language === 'en'
              ? `${userName} added customer "${name}".`
              : `${userName} أضاف العميل "${name}".`
          addEmployeeActivity(currentUser.id, text)
        }
        setCurrentPage('home')
        form.reset()
      } else {
        setErrorMessage(language === 'tr' ? 'Müşteri eklenemedi.' : language === 'en' ? 'Failed to add customer.' : 'فشل إضافة العميل.')
      }
    } catch (err) {
      setErrorMessage(language === 'tr' ? 'Müşteri buluta kaydedilemedi. Bilgiler yerel olarak saklanmadı.' : language === 'en' ? 'Customer could not be saved to the cloud. It was not stored locally.' : 'تعذر حفظ العميل في السحابة. لم يتم تخزينه محليًا.')
    }
  }

  const handleDeleteCustomer = async (customerId: string) => {
    if (!can('canDeleteCustomers')) {
      setErrorMessage(language === 'tr' ? 'Müşteri silme yetkiniz yok.' : language === 'en' ? 'You do not have permission to delete customers.' : 'ليس لديك صلاحية لحذف العملاء.')
      return
    }

    if (window.confirm(t.confirmDeleteCustomer)) {
      const customerToDelete = customers.find((c: Customer) => c.id === customerId)
      
      try {
        const response = await fetch(`${API_URL}/api/customers/${customerId}`, {
          method: 'DELETE'
        })

        if (response.ok) {
          setCustomers(customers.filter((c: Customer) => c.id !== customerId))
          if (currentUser && customerToDelete) {
            const userName = currentUser.name || (language === 'tr' ? 'Kullanıcı' : language === 'en' ? 'User' : 'مستخدم')
            const text = language === 'tr'
              ? `${userName} "${customerToDelete.name}" müşterisini sildi.`
              : language === 'en'
                ? `${userName} deleted customer "${customerToDelete.name}".`
                : `${userName} حذف العميل "${customerToDelete.name}".`
            addEmployeeActivity(currentUser.id, text)
          }
        } else {
          setErrorMessage(language === 'tr' ? 'Müşteri silinemedi.' : language === 'en' ? 'Failed to delete customer.' : 'فشل حذف العميل.')
        }
      } catch (err) {
        setErrorMessage(language === 'tr' ? 'Sunucuya bağlanılamadı; müşteri silinmedi.' : language === 'en' ? 'Could not reach the server; customer was not deleted.' : 'تعذر الاتصال بالخادم؛ لم يتم حذف العميل.')
      }
    }
  }

  const handleAddTransaction = (customer: Customer) => {
    if (!can('canAddTransactions')) {
      setErrorMessage(language === 'tr' ? 'İşlem ekleme yetkiniz yok.' : language === 'en' ? 'You do not have permission to add transactions.' : 'ليس لديك صلاحية لإضافة المعاملات.')
      return
    }
    setSelectedCustomer(customer)
    // Migrate transactions to include senderCurrency, receiverCurrency, and rates
    const migratedTransactions = (customer.transactions || []).map((transaction: Transaction) => {
      if (!transaction.senderCurrency) {
        transaction.senderCurrency = transaction.currency || 'USD'
      }
      if (!transaction.receiverCurrency) {
        transaction.receiverCurrency = transaction.currency || 'USD'
      }
      if (!transaction.senderRate) {
        const rate = currencyRates.find(r => r.currency === transaction.senderCurrency)?.rate || 1
        transaction.senderRate = rate
      }
      if (!transaction.receiverRate) {
        const rate = currencyRates.find(r => r.currency === transaction.receiverCurrency)?.rate || 1
        transaction.receiverRate = rate
      }
      return transaction
    })
    setTransactions(migratedTransactions) // Müşterinin işlemlerini yükle
    setCurrentPage('transactions')
  }

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'pending':
        return t.pending
      case 'completed':
        return t.completed
      case 'cancelled':
        return t.cancelled
      default:
        return status || t.pending
    }
  }

  const handleExportPDFWithHTML = (customer: Customer, filteredTransactions?: Transaction[]) => {
    const transactionsToExport = filteredTransactions || (customer.transactions || [])

    const currencySummary = {
      lena: {} as Record<string, number>,
      lekum: {} as Record<string, number>
    }

    transactionsToExport.forEach((transaction) => {
      if (transaction.status === 'cancelled') return

      const senderCurrency = (transaction.senderCurrency || transaction.currency || 'USD').toUpperCase()
      const receiverCurrency = (transaction.receiverCurrency || transaction.currency || 'USD').toUpperCase()
      const sentAmount = Number(transaction.amount || 0)
      const receivedAmount = Number(transaction.deliveryAmount || 0)

      if (!Number.isNaN(sentAmount) && sentAmount > 0) {
        currencySummary.lekum[senderCurrency] = (currencySummary.lekum[senderCurrency] || 0) + sentAmount
      }

      if (!Number.isNaN(receivedAmount) && receivedAmount > 0) {
        currencySummary.lena[receiverCurrency] = (currencySummary.lena[receiverCurrency] || 0) + receivedAmount
      }
    })

    const summaryLabels = {
      tr: { title: 'Flash', date: 'Tarih', lena: 'Sizin', lekum: 'Bize', lenaText: 'Sizin', lekumText: 'Bize', currency: 'Para Birimi' },
      en: { title: 'Flash', date: 'Date', lena: 'To You', lekum: 'To Us', lenaText: 'To You', lekumText: 'To Us', currency: 'Currency' },
      ar: { title: 'Flash', date: 'التاريخ', lena: 'لكم', lekum: 'لنا', lenaText: 'لكم', lekumText: 'لنا', currency: 'العملة' }
    } as const

    const labels = summaryLabels[language]
    const pdfTitle = 'Flash'
    const pdfTitleHtml = `<span style="display:inline-block; text-align:center; font-family: Tahoma, Arial, sans-serif;">${pdfTitle}</span>`
    const pdfFooterHtml = language === 'ar'
      ? '<span dir="rtl" style="display:inline-block; direction:rtl; text-align:center; unicode-bidi:plaintext; font-family: Tahoma, Arial, sans-serif;">Flash</span>'
      : language === 'en'
        ? 'Flash'
        : 'Flash'
    const currentDate = new Date().toLocaleDateString(language === 'ar' ? 'ar-EG' : 'tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })

    const customColumnHeaders = customColumns.map(column => `
      <th style="padding: 8px 6px; border: 1px solid rgba(255,255,255,0.23); font-size: 9px;">${column.name}</th>
    `).join('')

    const customColumnCells = (transaction: Transaction) => customColumns.map((column) => {
      const value = transaction[column.id]
      const display = value === undefined || value === null || value === '' ? '-' : String(value)
      return `<td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #0f172a;">${display}</td>`
    }).join('')

    const allCurrencyKeys = Array.from(new Set([
      ...Object.keys(currencySummary.lena),
      ...Object.keys(currencySummary.lekum)
    ])).sort()

    const currencyRows = allCurrencyKeys.length > 0 ? allCurrencyKeys.map((currency) => {
      const total = currencySummary.lena[currency] || 0
      const delivered = currencySummary.lekum[currency] || 0
      return `
        <tr>
          <td style="padding: 7px 8px; border: 1px solid #e5e7eb; background: #f8fafc; font-weight: 700; color: #0f172a;">${currency}</td>
          <td style="padding: 7px 8px; border: 1px solid #e5e7eb; text-align: center; color: #16a34a; font-weight: 700;">${Number(total).toFixed(2)}</td>
          <td style="padding: 7px 8px; border: 1px solid #e5e7eb; text-align: center; color: #dc2626; font-weight: 700;">${Number(delivered).toFixed(2)}</td>
        </tr>
      `
    }).join('') : `
      <tr>
        <td colspan="3" style="padding: 8px; border: 1px solid #e5e7eb; text-align: center; color: #475569;">-</td>
      </tr>
    `

    const element = document.createElement('div')
    const arabicTextWeight = language === 'ar' ? 'font-weight: 700; font-size: 0.95em;' : ''
    element.innerHTML = `
      <div style="font-family: ${language === 'ar' ? "Tahoma, Arial, sans-serif" : "Arial, sans-serif"}; font-weight: 700; width: 100%; min-height: 100%; background: #ececec; padding: 20px; box-sizing: border-box; direction: ${language === 'ar' ? 'rtl' : 'ltr'}; color: #1f2937;">
        <div style="background: linear-gradient(90deg, #0ea5e9 0%, #0284c7 48%, #0369a1 100%); border-radius: 14px 14px 0 0; padding: 16px 18px; color: #ffffff; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 2px 10px rgba(14,165,233,0.14);">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
            <div style="display: flex; flex-direction: column; align-items: ${language === 'ar' ? 'flex-end' : 'flex-start'}; min-width: 180px;">
              <span style="font-size: 12px; color: rgba(255,255,255,0.9); margin-bottom: 2px; ${arabicTextWeight}">${labels.date}</span>
              <span style="font-size: 14px; font-weight: 700;">${currentDate}</span>
            </div>
            <div style="flex: 1; text-align: center; font-size: 18px; font-weight: 800; letter-spacing: 0.2px;">${pdfTitleHtml}</div>
            <div style="font-size: 20px; font-weight: 800; text-align: ${language === 'ar' ? 'left' : 'right'}; min-width: 180px; ${arabicTextWeight}">${customer.name}</div>
          </div>
        </div>

        <div style="background: #f5f5f5; border: 1px solid #d8d8d8; border-top: none; border-radius: 0 0 12px 12px; padding: 18px 14px 10px;">
          <div style="display: flex; justify-content: space-between; gap: 10px; margin-bottom: 12px; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 150px; background: #ffffff; border: 1px solid #dfe3ea; border-radius: 8px; padding: 10px 12px;">
              <div style="font-size: 10px; color: #6b7280; margin-bottom: 4px; ${arabicTextWeight}">${language === 'ar' ? 'البريد الإلكتروني' : t.emailLabel}</div>
              <div style="font-size: 12px; font-weight: 700; color: #1f2937;">${customer.email || '—'}</div>
            </div>
            <div style="flex: 1; min-width: 150px; background: #ffffff; border: 1px solid #dfe3ea; border-radius: 8px; padding: 10px 12px; text-align: center;">
              <div style="font-size: 10px; color: #6b7280; margin-bottom: 4px; ${arabicTextWeight}">${language === 'ar' ? 'الهاتف' : t.phoneLabel}</div>
              <div style="font-size: 12px; font-weight: 700; color: #1f2937;">${customer.phone || '—'}</div>
            </div>
            <div style="flex: 1; min-width: 150px; background: #ffffff; border: 1px solid #dfe3ea; border-radius: 8px; padding: 10px 12px; text-align: center;">
              <div style="font-size: 10px; color: #6b7280; margin-bottom: 4px; ${arabicTextWeight}">${language === 'ar' ? 'المعرف' : t.id}</div>
              <div style="font-size: 12px; font-weight: 700; color: #1f2937;">${customer.id}</div>
            </div>
            <div style="flex: 1; min-width: 150px; background: #ffffff; border: 1px solid #dfe3ea; border-radius: 8px; padding: 10px 12px; text-align: center;">
              <div style="font-size: 10px; color: #6b7280; margin-bottom: 4px; ${arabicTextWeight}">${language === 'ar' ? 'إجمالي المعاملات' : t.totalTransactions}</div>
              <div style="font-size: 12px; font-weight: 700; color: #1f2937;">${transactionsToExport.length}</div>
            </div>
          </div>

          <div style="margin: 0 0 14px; background: #ffffff; border: 1px solid #dfe3ea; border-radius: 10px; overflow: hidden;">
            <div style="padding: 8px 12px; background: linear-gradient(90deg, #f1f5f9, #e2e8f0); border-bottom: 1px solid #dfe3ea; font-size: 11px; font-weight: 700; color: #334155; ${arabicTextWeight}">${labels.lena} / ${labels.lekum}</div>
            <table style="width: 100%; border-collapse: collapse; font-size: 9px;">
              <thead>
                <tr style="background: #eef2ff; color: #1f2937;">
                  <th style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; ${arabicTextWeight}">${labels.currency}</th>
                  <th style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; ${arabicTextWeight}">${labels.lena}</th>
                  <th style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; ${arabicTextWeight}">${labels.lekum}</th>
                </tr>
              </thead>
              <tbody>
                ${currencyRows}
              </tbody>
            </table>
          </div>

          <div style="overflow: hidden; border-radius: 10px; border: 1px solid #dfe3ea; background: #ffffff;">
            <table style="width: 100%; border-collapse: collapse; font-size: 9px;">
              <thead>
                <tr style="background: linear-gradient(90deg, #4c57d8 0%, #5d4bbf 100%); color: #ffffff; text-align: center;">
                  <th style="padding: 8px 6px; border: 1px solid rgba(255,255,255,0.23); font-size: 9px; ${arabicTextWeight}">${language === 'ar' ? 'الحالة' : t.status}</th>
                  <th style="padding: 8px 6px; border: 1px solid rgba(255,255,255,0.23); font-size: 9px; ${arabicTextWeight}">${language === 'ar' ? 'المعرف' : t.transactionId}</th>
                  <th style="padding: 8px 6px; border: 1px solid rgba(255,255,255,0.23); font-size: 9px; ${arabicTextWeight}">${language === 'ar' ? 'التاريخ' : t.date}</th>
                  <th style="padding: 8px 6px; border: 1px solid rgba(255,255,255,0.23); font-size: 9px; ${arabicTextWeight}">${language === 'ar' ? 'المرسل' : t.sender}</th>
                  <th style="padding: 8px 6px; border: 1px solid rgba(255,255,255,0.23); font-size: 9px; ${arabicTextWeight}">${language === 'ar' ? 'عملة المرسل' : t.senderCurrency}</th>
                  <th style="padding: 8px 6px; border: 1px solid rgba(255,255,255,0.23); font-size: 9px; ${arabicTextWeight}">${language === 'ar' ? 'المبلغ المرسل' : t.amount}</th>
                  <th style="padding: 8px 6px; border: 1px solid rgba(255,255,255,0.23); font-size: 9px; ${arabicTextWeight}">${language === 'ar' ? 'المرسل إليه' : t.receiver}</th>
                  <th style="padding: 8px 6px; border: 1px solid rgba(255,255,255,0.23); font-size: 9px; ${arabicTextWeight}">${language === 'ar' ? 'عملة المستقبل' : t.receiverCurrency}</th>
                  <th style="padding: 8px 6px; border: 1px solid rgba(255,255,255,0.23); font-size: 9px; ${arabicTextWeight}">${language === 'ar' ? 'المبلغ المستلم' : t.deliveryAmount}</th>
                  <th style="padding: 8px 6px; border: 1px solid rgba(255,255,255,0.23); font-size: 9px; ${arabicTextWeight}">${language === 'ar' ? 'ملاحظة' : t.note}</th>
                  ${customColumnHeaders}
                </tr>
              </thead>
              <tbody>
                ${transactionsToExport.map((transaction, index) => {
                  const rawStatus = transaction.status || 'pending'
                  const statusText = getStatusLabel(rawStatus)
                  return `
                    <tr style="background: ${index % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                      <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #0f172a; font-weight: 700;">
                        <span style="display: inline-block; padding: 2px 8px; border-radius: 5px; background: ${rawStatus === 'pending' ? '#fef3c7' : rawStatus === 'completed' ? '#dcfce7' : '#fee2e2'}; color: ${rawStatus === 'pending' ? '#92400e' : rawStatus === 'completed' ? '#166534' : '#991b1b'}; ${arabicTextWeight}">${statusText}</span>
                      </td>
                      <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #0f172a; font-weight: 700; ${arabicTextWeight}">${transaction.id || '-'}</td>
                      <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #0f172a; ${arabicTextWeight}">${transaction.date || '-'}</td>
                      <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #0f172a; ${arabicTextWeight}">${transaction.sender || '-'}</td>
                      <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #0f172a; ${arabicTextWeight}">${transaction.senderCurrency || '-'}</td>
                      <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #0f172a; ${arabicTextWeight}">${transaction.amount || '-'}</td>
                      <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #0f172a; ${arabicTextWeight}">${transaction.receiver || '-'}</td>
                      <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #0f172a; ${arabicTextWeight}">${transaction.receiverCurrency || '-'}</td>
                      <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #0f172a; ${arabicTextWeight}">${transaction.deliveryAmount || '-'}</td>
                      <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #0f172a; ${arabicTextWeight}">${transaction.note || '-'}</td>
                      ${customColumnCells(transaction)}
                    </tr>
                  `
                }).join('')}
              </tbody>
            </table>
          </div>

          <div style="text-align: center; color: #6b7280; font-size: 9px; padding: 10px 0 0;">${pdfFooterHtml}</div>
        </div>
      </div>
    `

    document.body.appendChild(element)
    
    // HTML'den PDF oluştur
    const opt: any = {
      margin: 5,
      filename: `${customer.name}_${t.transactions}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
    }
    
    html2pdf().set(opt).from(element).save()
    
    document.body.removeChild(element)
  }

  const filterTransactionsByDate = (transactions: Transaction[], startDate: string, endDate: string): Transaction[] => {
    if (!startDate && !endDate) return transactions
    
    return transactions.filter(t => {
      const transactionDate = new Date(t.date)
      const start = startDate ? new Date(startDate) : new Date('1970-01-01')
      const end = endDate ? new Date(endDate) : new Date()
      
      return transactionDate >= start && transactionDate <= end
    })
  }

  const handleExportClick = (customer: Customer) => {
    if (!can('canExportPdf')) {
      setErrorMessage(language === 'tr' ? 'PDF indirme yetkiniz yok.' : language === 'en' ? 'You do not have permission to export PDF.' : 'ليس لديك صلاحية لتصدير PDF.')
      return
    }

    setSelectedCustomer(customer)
    setShowExportModal(true)
  }

  const handleExportWithRange = () => {
    if (!selectedCustomer) return
    if (!can('canExportPdf')) return
    
    const filteredTransactions = filterTransactionsByDate(
      selectedCustomer.transactions || [],
      exportStartDate,
      exportEndDate
    )
    
    handleExportPDFWithHTML(selectedCustomer, filteredTransactions)
    setShowExportModal(false)
    setExportStartDate('')
    setExportEndDate('')
  }

  const handleExportAll = () => {
    if (!selectedCustomer) return
    if (!can('canExportPdf')) return
    
    handleExportPDFWithHTML(selectedCustomer)
    setShowExportModal(false)
  }

  const exportDateRangePDF = () => {
    if (dateRangeTransactions.length === 0) return

    const currencySummary = {
      lena: {} as Record<string, number>,
      lekum: {} as Record<string, number>
    }

    dateRangeTransactions.forEach((transaction) => {
      if (transaction.status === 'cancelled') return

      const senderCurrency = (transaction.senderCurrency || transaction.currency || 'USD').toUpperCase()
      const receiverCurrency = (transaction.receiverCurrency || transaction.currency || 'USD').toUpperCase()
      const sentAmount = Number(transaction.amount || 0)
      const receivedAmount = Number(transaction.deliveryAmount || 0)

      if (!Number.isNaN(sentAmount) && sentAmount > 0) {
        currencySummary.lekum[senderCurrency] = (currencySummary.lekum[senderCurrency] || 0) + sentAmount
      }

      if (!Number.isNaN(receivedAmount) && receivedAmount > 0) {
        currencySummary.lena[receiverCurrency] = (currencySummary.lena[receiverCurrency] || 0) + receivedAmount
      }
    })

    const summaryLabels = {
      tr: { title: 'Flash', date: 'Tarih', lena: 'Sizin', lekum: 'Bize', lenaText: 'Sizin', lekumText: 'Bize', currency: 'Para Birimi' },
      en: { title: 'Flash', date: 'Date', lena: 'To You', lekum: 'To Us', lenaText: 'To You', lekumText: 'To Us', currency: 'Currency' },
      ar: { title: 'Flash', date: 'التاريخ', lena: 'لكم', lekum: 'لنا', lenaText: 'لكم', lekumText: 'لنا', currency: 'العملة' }
    } as const

    const labels = summaryLabels[language]
    const pdfTitle = `${t.dateRange} (${dateRangeStartDate} - ${dateRangeEndDate})`
    const arabicFontStyle = language === 'ar' ? 'font-weight: 700; font-size: 0.95em;' : ''
    const pdfTitleHtml = `<span style="display:inline-block; text-align:center; font-family: Tahoma, Arial, sans-serif; ${arabicFontStyle}">${pdfTitle}</span>`
    const pdfFooterHtml = language === 'ar'
      ? `<span dir="rtl" style="display:inline-block; direction:rtl; text-align:center; unicode-bidi:plaintext; font-family: Tahoma, Arial, sans-serif; font-weight: 700; font-size: 0.95em;">Flash</span>`
      : language === 'en'
        ? 'Flash'
        : 'Flash'
    const currentDate = new Date().toLocaleDateString(language === 'ar' ? 'ar-EG' : 'tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })

    const customColumnHeaders = customColumns.map(column => `
      <th style="padding: 8px 6px; border: 1px solid rgba(255,255,255,0.23); font-size: 9px;">${column.name}</th>
    `).join('')

    const customColumnCells = (transaction: Transaction) => customColumns.map((column) => {
      const value = transaction[column.id]
      const display = value === undefined || value === null || value === '' ? '-' : String(value)
      return `<td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #0f172a;">${display}</td>`
    }).join('')

    const allCurrencyKeys = Array.from(new Set([
      ...Object.keys(currencySummary.lena),
      ...Object.keys(currencySummary.lekum)
    ])).sort()

    const currencyRows = allCurrencyKeys.length > 0 ? allCurrencyKeys.map((currency) => {
      const total = currencySummary.lena[currency] || 0
      const delivered = currencySummary.lekum[currency] || 0
      return `
        <tr>
          <td style="padding: 7px 8px; border: 1px solid #e5e7eb; background: #f8fafc; font-weight: 700; color: #0f172a;">${currency}</td>
          <td style="padding: 7px 8px; border: 1px solid #e5e7eb; text-align: center; color: #16a34a; font-weight: 700;">${Number(total).toFixed(2)}</td>
          <td style="padding: 7px 8px; border: 1px solid #e5e7eb; text-align: center; color: #dc2626; font-weight: 700;">${Number(delivered).toFixed(2)}</td>
        </tr>
      `
    }).join('') : `
      <tr>
        <td colspan="3" style="padding: 8px; border: 1px solid #e5e7eb; text-align: center; color: #475569;">-</td>
      </tr>
    `

    const element = document.createElement('div')
    const arabicTextWeight = language === 'ar' ? 'font-weight: 700; font-size: 0.95em;' : ''
    element.innerHTML = `
      <div style="font-family: ${language === 'ar' ? "Tahoma, Arial, sans-serif" : "Arial, sans-serif"}; font-weight: 700; width: 100%; min-height: 100%; background: #ececec; padding: 20px; box-sizing: border-box; direction: ${language === 'ar' ? 'rtl' : 'ltr'}; color: #1f2937;">
        <div style="background: linear-gradient(90deg, #0ea5e9 0%, #0284c7 48%, #0369a1 100%); border-radius: 14px 14px 0 0; padding: 16px 18px; color: #ffffff; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 2px 10px rgba(14,165,233,0.14);">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
            <div style="display: flex; flex-direction: column; align-items: ${language === 'ar' ? 'flex-end' : 'flex-start'}; min-width: 180px;">
              <span style="font-size: 12px; color: rgba(255,255,255,0.9); margin-bottom: 2px; ${arabicTextWeight}">${labels.date}</span>
              <span style="font-size: 14px; font-weight: 700;">${currentDate}</span>
            </div>
            <div style="flex: 1; text-align: center; font-size: 18px; font-weight: 800; letter-spacing: 0.2px;">${pdfTitleHtml}</div>
            <div style="font-size: 20px; font-weight: 800; text-align: ${language === 'ar' ? 'left' : 'right'}; min-width: 180px; ${arabicTextWeight}">${t.dateRange}</div>
          </div>
        </div>

        <div style="background: #f5f5f5; border: 1px solid #d8d8d8; border-top: none; border-radius: 0 0 12px 12px; padding: 18px 14px 10px;">
          <div style="display: flex; justify-content: space-between; gap: 10px; margin-bottom: 12px; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 150px; background: #ffffff; border: 1px solid #dfe3ea; border-radius: 8px; padding: 10px 12px;">
              <div style="font-size: 10px; color: #6b7280; margin-bottom: 4px; ${arabicTextWeight}">${t.dateRange}</div>
              <div style="font-size: 12px; font-weight: 700; color: #1f2937;">${dateRangeStartDate} - ${dateRangeEndDate}</div>
            </div>
            <div style="flex: 1; min-width: 150px; background: #ffffff; border: 1px solid #dfe3ea; border-radius: 8px; padding: 10px 12px; text-align: center;">
              <div style="font-size: 10px; color: #6b7280; margin-bottom: 4px; ${arabicTextWeight}">${t.totalTransactionsLabel}</div>
              <div style="font-size: 12px; font-weight: 700; color: #1f2937;">${dateRangeTransactions.length}</div>
            </div>
          </div>

          <div style="background: #ffffff; border: 1px solid #d8d8d8; border-radius: 8px; margin-bottom: 12px; overflow: hidden;">
            <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
              <thead>
                <tr style="background: linear-gradient(90deg, #0ea5e9 0%, #0284c7 100%); color: #ffffff;">
                  <th style="padding: 8px 6px; border: 1px solid rgba(255,255,255,0.23); font-size: 9px; ${arabicTextWeight}">${t.id}</th>
                  <th style="padding: 8px 6px; border: 1px solid rgba(255,255,255,0.23); font-size: 9px; ${arabicTextWeight}">${t.date}</th>
                  <th style="padding: 8px 6px; border: 1px solid rgba(255,255,255,0.23); font-size: 9px; ${arabicTextWeight}">${t.sender}</th>
                  <th style="padding: 8px 6px; border: 1px solid rgba(255,255,255,0.23); font-size: 9px; ${arabicTextWeight}">${t.senderCurrency}</th>
                  <th style="padding: 8px 6px; border: 1px solid rgba(255,255,255,0.23); font-size: 9px; ${arabicTextWeight}">${t.amount}</th>
                  <th style="padding: 8px 6px; border: 1px solid rgba(255,255,255,0.23); font-size: 9px; ${arabicTextWeight}">${t.receiver}</th>
                  <th style="padding: 8px 6px; border: 1px solid rgba(255,255,255,0.23); font-size: 9px; ${arabicTextWeight}">${t.receiverCurrency}</th>
                  <th style="padding: 8px 6px; border: 1px solid rgba(255,255,255,0.23); font-size: 9px; ${arabicTextWeight}">${t.deliveryAmount}</th>
                  <th style="padding: 8px 6px; border: 1px solid rgba(255,255,255,0.23); font-size: 9px; ${arabicTextWeight}">${t.profitLoss}</th>
                  <th style="padding: 8px 6px; border: 1px solid rgba(255,255,255,0.23); font-size: 9px; ${arabicTextWeight}">${t.status}</th>
                  ${customColumnHeaders}
                </tr>
              </thead>
              <tbody>
                ${dateRangeTransactions.map((transaction) => `
                  <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #0f172a; ${arabicTextWeight}">${transaction.id}</td>
                    <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #0f172a; ${arabicTextWeight}">${transaction.date}</td>
                    <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #0f172a; ${arabicTextWeight}">${transaction.sender || '-'}</td>
                    <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #0f172a; ${arabicTextWeight}">${transaction.senderCurrency || '-'}</td>
                    <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #0f172a; ${arabicTextWeight}">${transaction.amount || '-'}</td>
                    <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #0f172a; ${arabicTextWeight}">${transaction.receiver || '-'}</td>
                    <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #0f172a; ${arabicTextWeight}">${transaction.receiverCurrency || '-'}</td>
                    <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #0f172a; ${arabicTextWeight}">${transaction.deliveryAmount || '-'}</td>
                    <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: ${transaction.profitLoss > 0 ? '#16a34a' : transaction.profitLoss < 0 ? '#dc2626' : '#0f172a'}; font-weight: 700;">${transaction.profitLoss ? Math.abs(transaction.profitLoss).toFixed(1) : '0'}</td>
                    <td style="padding: 8px 6px; border: 1px solid #e5e7eb; text-align: center; color: #0f172a; ${arabicTextWeight}">${transaction.status === 'pending' ? t.pending : transaction.status === 'completed' ? t.completed : transaction.status === 'cancelled' ? t.cancelled : transaction.status}</td>
                    ${customColumnCells(transaction)}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div style="background: #ffffff; border: 1px solid #d8d8d8; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
            <div style="font-size: 11px; font-weight: 700; color: #1f2937; margin-bottom: 8px; text-align: center; ${arabicTextWeight}">${labels.currency} - ${labels.lekumText} / ${labels.lenaText}</div>
            <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
              <thead>
                <tr style="background: #f8fafc;">
                  <th style="padding: 7px 8px; border: 1px solid #e5e7eb; text-align: left; font-weight: 700; color: #0f172a; ${arabicTextWeight}">${labels.currency}</th>
                  <th style="padding: 7px 8px; border: 1px solid #e5e7eb; text-align: center; font-weight: 700; color: #dc2626; ${arabicTextWeight}">${labels.lekumText}</th>
                  <th style="padding: 7px 8px; border: 1px solid #e5e7eb; text-align: center; font-weight: 700; color: #16a34a; ${arabicTextWeight}">${labels.lenaText}</th>
                </tr>
              </thead>
              <tbody>
                ${currencyRows}
              </tbody>
            </table>
          </div>

          <div style="background: #ffffff; border: 1px solid #d8d8d8; border-radius: 8px; padding: 12px;">
            <div style="display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
              <div style="flex: 1; min-width: 120px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px;">
                <div style="font-size: 9px; color: #6b7280; margin-bottom: 2px; ${arabicTextWeight}">${t.profitLabel}</div>
                <div style="font-size: 12px; font-weight: 700; color: #16a34a;">${dateRangeTransactions.reduce((sum, t) => sum + (t.profitLoss > 0 ? t.profitLoss : 0), 0).toFixed(1)}</div>
              </div>
              <div style="flex: 1; min-width: 120px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px;">
                <div style="font-size: 9px; color: #6b7280; margin-bottom: 2px; ${arabicTextWeight}">${t.lossLabel}</div>
                <div style="font-size: 12px; font-weight: 700; color: #dc2626;">${Math.abs(dateRangeTransactions.reduce((sum, t) => sum + (t.profitLoss < 0 ? t.profitLoss : 0), 0)).toFixed(1)}</div>
              </div>
            </div>
          </div>
        </div>

        <div style="text-align: center; padding: 16px; font-size: 10px; color: #6b7280; background: #f5f5f5; border-top: 1px solid #d8d8d8; border-radius: 0 0 12px 12px; margin-top: 12px;">
          ${pdfFooterHtml}
        </div>
      </div>
    `

    const opt = {
      margin: 0.5,
      filename: `flash_date_range_${dateRangeStartDate}_${dateRangeEndDate}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in' as const, format: 'letter' as const, orientation: 'portrait' as const }
    }

    html2pdf().set(opt).from(element).save()
  }

  // Müşteri istatistiklerini güncelle (USD bazında)
  const updateCustomerStats = (customer: Customer) => {
    const transactions = customer.transactions || []
    let profit = 0
    let loss = 0

    transactions.forEach(t => {
      // İptal edilmiş işlemleri dahil etme
      if (t.status === 'cancelled') {
        return
      }

      // İrade satırlarını istatistiklere dahil etme
      if (t.isIrade) {
        return
      }

      // Kullanılan kur kullan (o anki kur değil, satırın kendi kuru)
      const senderRate = t.senderRate || 1

      if (t.profitLoss > 0) {
        profit += t.profitLoss / senderRate
      } else if (t.profitLoss < 0) {
        loss += Math.abs(t.profitLoss) / senderRate
      }
    })

    return {
      ...customer,
      totalTransactions: transactions.length,
      profit: profit,
      loss: loss
    }
  }

  const handleAddRow = async () => {
    if (!can('canAddTransactions')) {
      alert(language === 'tr' ? 'İşlem ekleme yetkiniz yok.' : language === 'en' ? 'You do not have permission to add transactions.' : 'ليس لديك صلاحية لإضافة المعاملات.')
      return
    }

    if (!selectedCustomer) {
      alert(language === 'tr' ? 'Lütfen önce bir müşteri seçin.' : language === 'en' ? 'Please select a customer first.' : 'يرجى اختيار عميل أولاً.')
      return
    }

    const defaultCurrency = currencyRates[0]
    const currentRate = defaultCurrency.rate || 1
    const newTransaction: Transaction = {
      id: generateTransactionId(),
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer?.name,
      currency: defaultCurrency.currency,
      senderCurrency: defaultCurrency.currency,
      receiverCurrency: defaultCurrency.currency,
      senderRate: currentRate,
      receiverRate: currentRate,
      date: (() => {
        const dateNow = new Date()
        const year = dateNow.getFullYear()
        const month = String(dateNow.getMonth() + 1).padStart(2, '0')
        const day = String(dateNow.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      })(),
      sender: selectedCustomer?.name || '',
      amount: '',
      receiver: '',
      deliveryAmount: '',
      profitLoss: 0,
      description: '',
      status: 'pending'
    }

    // Custom columns için varsayılan değerler
    customColumns.forEach(col => {
      newTransaction[col.id] = col.type === 'number' ? 0 : ''
    })

    try {
      const response = await fetch(`${API_URL}/api/customers/${selectedCustomer.id}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTransaction)
      })

      if (response.ok) {
        const apiTransaction = await response.json()
        setTransactions([...transactions, apiTransaction])
        setEditingRowId(null)

        // İşlemi müşteriye kaydet
        const updatedCustomer = {
          ...selectedCustomer,
          transactions: [...(selectedCustomer.transactions || []), apiTransaction]
        }
        const finalCustomer = updateCustomerStats(updatedCustomer)
        setCustomers(customers.map(c => c.id === selectedCustomer.id ? finalCustomer : c))
        setSelectedCustomer(finalCustomer)

        // Backend'e güncel müşteri verisini kaydet
        try {
          await fetch(`${API_URL}/api/customers/${selectedCustomer.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(finalCustomer)
          })
        } catch {
          console.error('Failed to update customer on backend')
        }

        if (currentUser) {
          const userName = currentUser.name || (language === 'tr' ? 'Kullanıcı' : language === 'en' ? 'User' : 'مستخدم')
          const text = language === 'tr'
            ? `${userName} "${selectedCustomer.name}" müşterisinin hesabına yeni satır ekledi.`
            : language === 'en'
              ? `${userName} added a new row to customer "${selectedCustomer.name}" account.`
              : `${userName} أضاف سطرًا جديدًا إلى حساب العميل "${selectedCustomer.name}".`
          addEmployeeActivity(currentUser.id, text)
        }
      } else {
        setErrorMessage(language === 'tr' ? 'Satır buluta kaydedilemedi.' : language === 'en' ? 'Row could not be saved to the cloud.' : 'تعذر حفظ السطر في السحابة.')
      }
    } catch (err) {
      setErrorMessage(language === 'tr' ? 'Sunucuya bağlanılamadı; satır eklenmedi.' : language === 'en' ? 'Could not reach the server; row was not added.' : 'تعذر الاتصال بالخادم؛ لم تتم إضافة السطر.')
    }
  }



  const handleUpdateTransaction = async (transactionId: string, field: string, value: any) => {
    if (!can('canEditTransactions')) {
      return
    }

    const updatedTransactions = transactions.map(t => {
      if (t.id === transactionId) {
        const updated = { ...t, [field]: value }

        // Otomatik kazanç/zarar hesapla (formül: (amount / senderRate) - (deliveryAmount / receiverRate))
        if (field === 'amount' || field === 'deliveryAmount') {
          const amount = field === 'amount' ? parseFloat(String(value)) || 0 : parseFloat(String(t.amount)) || 0
          const deliveryAmount = field === 'deliveryAmount' ? parseFloat(String(value)) || 0 : parseFloat(String(t.deliveryAmount)) || 0

          // Gönderen ve alıcı kurları (X currency = 1 USD)
          const senderRate = t.senderRate || 1
          const receiverRate = t.receiverRate || 1

          // Her iki tarafı USD'ye çevir, sonra farkı al
          // Gönderen: amount / senderRate
          // Alıcı: deliveryAmount / receiverRate
          // Kazanç = Gönderen USD - Alıcı USD
          updated.profitLoss = (amount / senderRate) - (deliveryAmount / receiverRate)
        } else if (field === 'senderCurrency') {
          // Para birimi değişince GÜNCEL kuru kullan
          const senderRate = currencyRates.find(r => r.currency === value)?.rate || 1
          updated.senderRate = senderRate
          updated.senderCurrency = value
          // Kazancı yeni kura göre yeniden hesapla
          const amount = parseFloat(String(t.amount)) || 0
          const deliveryAmount = parseFloat(String(t.deliveryAmount)) || 0
          const receiverRate = t.receiverRate || 1
          updated.profitLoss = (amount / senderRate) - (deliveryAmount / receiverRate)
        } else if (field === 'receiverCurrency') {
          // Para birimi değişince GÜNCEL kuru kullan
          const receiverRate = currencyRates.find(r => r.currency === value)?.rate || 1
          updated.receiverRate = receiverRate
          updated.receiverCurrency = value
          // Kazancı yeni kura göre yeniden hesapla
          const amount = parseFloat(String(t.amount)) || 0
          const deliveryAmount = parseFloat(String(t.deliveryAmount)) || 0
          const senderRate = t.senderRate || 1
          updated.profitLoss = (amount / senderRate) - (deliveryAmount / receiverRate)
        }

        return updated
      }
      return t
    })

    setTransactions(updatedTransactions)

    // İşlemi müşteriye kaydet
    if (selectedCustomer) {
      const updatedCustomer = {
        ...selectedCustomer,
        transactions: updatedTransactions
      }
      const finalCustomer = updateCustomerStats(updatedCustomer)
      setCustomers(customers.map(c => c.id === selectedCustomer.id ? finalCustomer : c))
      setSelectedCustomer(finalCustomer)
      const existingTimer = transactionSaveTimers.current[transactionId]
      if (existingTimer) window.clearTimeout(existingTimer)
      transactionSaveTimers.current[transactionId] = window.setTimeout(async () => {
        try {
          const response = await fetch(`${API_URL}/api/customers/${selectedCustomer.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(finalCustomer)
          })
          if (!response.ok) throw new Error('Transaction update failed')
        } catch {
          setErrorMessage(language === 'tr' ? 'Satır buluta kaydedilemedi.' : language === 'en' ? 'Row could not be saved to the cloud.' : 'تعذر حفظ السطر في السحابة.')
        }
      }, 350)
      
      if (currentUser) {
        const userName = currentUser.name || (language === 'tr' ? 'Kullanıcı' : language === 'en' ? 'User' : 'مستخدم')
        const text = language === 'tr'
          ? `${userName} "${selectedCustomer.name}" müşterisinin hesabını düzenledi.`
          : language === 'en'
            ? `${userName} updated customer "${selectedCustomer.name}" account.`
            : `${userName} عدّل حساب العميل "${selectedCustomer.name}".`
        addEmployeeActivity(currentUser.id, text)
      }
    }
  }

  const calculateProfitLoss = (amount: string, deliveryAmount: string, senderCurrency: string, receiverCurrency: string) => {
    const amountNum = parseFloat(amount) || 0
    const deliveryAmountNum = parseFloat(deliveryAmount) || 0
    const senderRate = currencyRates.find(r => r.currency === senderCurrency)?.rate || 1
    const receiverRate = currencyRates.find(r => r.currency === receiverCurrency)?.rate || 1
    return (amountNum / senderRate) - (deliveryAmountNum / receiverRate)
  }

  const handleSaveTransactionFromModal = async () => {
    if (!selectedTransactionForModal) return

    const newTransaction: Transaction = {
      ...selectedTransactionForModal,
      id: selectedTransactionForModal.id || generateTransactionId(),
      date: selectedTransactionForModal.date || (() => {
        const dateNow = new Date()
        const year = dateNow.getFullYear()
        const month = String(dateNow.getMonth() + 1).padStart(2, '0')
        const day = String(dateNow.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      })(),
      status: (selectedTransactionForModal.status || 'pending') as 'pending' | 'completed' | 'cancelled',
      senderCurrency: selectedTransactionForModal.senderCurrency || 'USD',
      receiverCurrency: selectedTransactionForModal.receiverCurrency || 'USD',
      senderRate: currencyRates.find(r => r.currency === selectedTransactionForModal.senderCurrency)?.rate || 1,
      receiverRate: currencyRates.find(r => r.currency === selectedTransactionForModal.receiverCurrency)?.rate || 1
    }
    
    // Calculate profit/loss
    const amount = parseFloat(String(newTransaction.amount)) || 0
    const deliveryAmount = parseFloat(String(newTransaction.deliveryAmount)) || 0
    const senderRate = newTransaction.senderRate || 1
    const receiverRate = newTransaction.receiverRate || 1
    newTransaction.profitLoss = (amount / senderRate) - (deliveryAmount / receiverRate)
    
    // Göndericiye göre ilgili müşteriyi bul
    const senderCustomer = customers.find(c => c.name === newTransaction.sender)
    if (senderCustomer) {
      // Mevcut işlem ID'si varsa güncelle, yoksa yeni ekle
      let updatedTransactions: Transaction[]
      if (senderCustomer.transactions?.find(t => t.id === newTransaction.id)) {
        updatedTransactions = senderCustomer.transactions.map(t => 
          t.id === newTransaction.id ? newTransaction : t
        )
      } else {
        updatedTransactions = [...senderCustomer.transactions, newTransaction]
      }
      
      const updatedCustomer = { ...senderCustomer, transactions: updatedTransactions }
      
      const updatedCustomers = customers.map(c => 
        c.id === senderCustomer.id ? updatedCustomer : c
      )
      setCustomers(updatedCustomers)
      setTransactions(updatedTransactions)
      setSelectedCustomer(updatedCustomer)
      
      try {
        const response = await fetch(`${API_URL}/api/customers/${senderCustomer.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedCustomer)
        })
        if (!response.ok) throw new Error('Transaction save failed')
        
        if (currentUser) {
          const userName = currentUser.name || (language === 'tr' ? 'Kullanıcı' : language === 'en' ? 'User' : 'مستخدم')
          const text = language === 'tr'
            ? `${userName} "${senderCustomer.name}" müşterisinin hesabını düzenledi.`
            : language === 'en'
              ? `${userName} updated customer "${senderCustomer.name}" account.`
              : `${userName} عدّل حساب العميل "${senderCustomer.name}".`
          addEmployeeActivity(currentUser.id, text)
        }
      } catch {
        setErrorMessage(language === 'tr' ? 'İşlem kaydedilemedi.' : language === 'en' ? 'Transaction could not be saved.' : 'تعذر حفظ المعاملة.')
      }
    }
    
    setShowTransactionModal(false)
    setSelectedTransactionForModal(null)
  }

  const handleDeleteTransaction = async (transactionId: string) => {
    if (!can('canDeleteTransactions')) {
      alert(language === 'tr' ? 'İşlem silme yetkiniz yok.' : language === 'en' ? 'You do not have permission to delete transactions.' : 'ليس لديك صلاحية لحذف المعاملات.')
      return
    }

    // Tüm müşterilerde işlemi bul
    let targetCustomer: any = null
    let targetTransaction: any = null

    customers.forEach((customer: any) => {
      const transaction = (customer.transactions || []).find((t: any) => t.id === transactionId)
      if (transaction) {
        targetCustomer = customer
        targetTransaction = transaction
      }
    })

    if (!targetCustomer || !targetTransaction) {
      alert('İşlem bulunamadı')
      return
    }

    // Eğer silinen işlem bir irade ise, iradeler listesinden sil
    if (targetTransaction.isIrade && targetTransaction.iradeId) {
      const updatedIrades = irades.filter((irade: any) => irade.id !== targetTransaction.iradeId)
      setIrades(updatedIrades)
      localStorage.setItem('irades', JSON.stringify(updatedIrades))
    }

    if (window.confirm(t.confirmDeleteTransaction)) {
      // İşlemi müşteriden sil
      const updatedTransactions = (targetCustomer.transactions || []).filter((t: any) => t.id !== transactionId)
      const updatedCustomer: any = {
        ...targetCustomer,
        transactions: updatedTransactions
      }
      const finalCustomer = updateCustomerStats(updatedCustomer)
      setCustomers(customers.map((c: any) => c.id === targetCustomer!.id ? finalCustomer : c))

      if (selectedCustomer && selectedCustomer.id === targetCustomer.id) {
        setSelectedCustomer(finalCustomer)
        setTransactions(updatedTransactions)
      }

      try {
        const response = await fetch(`${API_URL}/api/customers/${targetCustomer.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(finalCustomer)
        })
        if (!response.ok) throw new Error('Transaction delete failed')
      } catch {
        setErrorMessage(language === 'tr' ? 'Satır silme işlemi buluta kaydedilemedi.' : language === 'en' ? 'Row deletion could not be saved to the cloud.' : 'تعذر حفظ حذف السطر في السحابة.')
      }
      if (currentUser) {
        const userName = currentUser.name || (language === 'tr' ? 'Kullanıcı' : language === 'en' ? 'User' : 'مستخدم')
        const text = language === 'tr'
          ? `${userName} "${targetCustomer.name}" müşterisinin satırını sildi.`
          : language === 'en'
            ? `${userName} deleted a row from customer "${targetCustomer.name}" account.`
            : `${userName} حذف سطرًا من حساب العميل "${targetCustomer.name}".`
        addEmployeeActivity(currentUser.id, text)
      }
    }
  }

  const handleContextMenu = (e: React.MouseEvent, type: string, id?: number | string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      type: type,
      id: id
    })
  }

  const handleContextMenuAction = (action: string) => {
    if (action === 'delete' && contextMenu.id) {
      if (contextMenu.type === 'transaction') {
        if (!can('canDeleteTransactions')) {
          alert(language === 'tr' ? 'İşlem silme yetkiniz yok.' : language === 'en' ? 'You do not have permission to delete transactions.' : 'ليس لديك صلاحية لحذف المعاملات.')
          setContextMenu({ visible: false, x: 0, y: 0, type: '', id: undefined })
          return
        }
        handleDeleteTransaction(contextMenu.id as string)
      } else if (contextMenu.type === 'column') {
        handleDeleteColumn(contextMenu.id as string)
      }
    }
    setContextMenu({ visible: false, x: 0, y: 0, type: '', id: undefined })
  }

  const closeContextMenu = () => {
    setContextMenu({ visible: false, x: 0, y: 0, type: '', id: undefined })
  }

  const handleAddColumn = (name: string, type: 'text' | 'number' | 'date') => {
    if (!can('canAddTransactions')) {
      alert(language === 'tr' ? 'İşlem ekleme yetkiniz yok.' : language === 'en' ? 'You do not have permission to add transactions.' : 'ليس لديك صلاحية لإضافة المعاملات.')
      return
    }
    const newColumn = {
      id: `col_${Date.now()}`,
      name: name,
      type: type
    }
    setCustomColumns([...customColumns, newColumn])
    
    setTransactions(transactions.map(t => ({
      ...t,
      [newColumn.id]: type === 'number' ? 0 : ''
    })))

    customers.forEach((customer) => {
      const updatedCustomer = {
        ...customer,
        transactions: (customer.transactions || []).map((transaction) => ({
          ...transaction,
          [newColumn.id]: type === 'number' ? 0 : ''
        }))
      }
      fetch(`${API_URL}/api/customers/${customer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedCustomer)
      }).catch(() => setErrorMessage(language === 'tr' ? 'Özel kolon buluta kaydedilemedi.' : language === 'en' ? 'Custom column could not be saved to the cloud.' : 'تعذر حفظ العمود المخصص في السحابة.'))
    })
    
    setShowAddColumnModal(false)
  }

  const handleDeleteColumn = (columnId: string) => {
    if (window.confirm(t.confirmDeleteColumn)) {
      setCustomColumns(customColumns.filter(c => c.id !== columnId))
      setTransactions(transactions.map(t => {
        const newT = { ...t }
        delete newT[columnId]
        return newT
      }))
      customers.forEach((customer) => {
        const updatedCustomer = {
          ...customer,
          transactions: (customer.transactions || []).map((transaction) => {
            const nextTransaction = { ...transaction }
            delete nextTransaction[columnId]
            return nextTransaction
          })
        }
        fetch(`${API_URL}/api/customers/${customer.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedCustomer)
        }).catch(() => setErrorMessage(language === 'tr' ? 'Özel kolon silme işlemi buluta kaydedilemedi.' : language === 'en' ? 'Custom column deletion could not be saved to the cloud.' : 'تعذر حفظ حذف العمود المخصص في السحابة.'))
      })
    }
  }

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.id.includes(searchTerm) ||
    customer.phone.includes(searchTerm) ||
    customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.locatedCountry.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.originCountry.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const totalCustomers = customers.length

  // Tüm müşterilerin istatistiklerini hesapla (USD bazında)
  const calculateTotalStats = () => {
    let totalProfit = 0
    let totalLoss = 0
    let totalTransactions = 0

    customers.forEach(customer => {
      (customer.transactions || []).forEach(t => {
        // İptal edilmiş işlemleri dahil etme
        if (t.status === 'cancelled') {
          return
        }

        // İrade satırlarını istatistiklere dahil etme
        if (t.isIrade) {
          return
        }

        totalTransactions++

        // Kullanılan kur kullan (o anki kur değil, satırın kendi kuru)
        const senderRate = t.senderRate || 1

        if (t.profitLoss > 0) {
          totalProfit += t.profitLoss / senderRate
        } else if (t.profitLoss < 0) {
          totalLoss += Math.abs(t.profitLoss) / senderRate
        }
      })
    })

    return { totalProfit, totalLoss, totalTransactions }
  }

  const stats = calculateTotalStats()

  // İradelerin toplamını hesapla
  const totalIradeAmount = irades.reduce((sum, irade) => sum + irade.amount, 0)

  const netProfit = stats.totalProfit - stats.totalLoss - totalIradeAmount



  // Tarih aralığındaki işlemleri hesapla
  const getDateRangeTransactions = () => {
    if (!dateRangeStartDate || !dateRangeEndDate) return []
    
    const dateRangeTransactions: Transaction[] = []

    customers.forEach(customer => {
      (customer.transactions || []).forEach((t: Transaction) => {
        if (t.date >= dateRangeStartDate && t.date <= dateRangeEndDate) {
          dateRangeTransactions.push({
            ...t,
            customerName: customer.name
          })
        }
      })
    })

    return dateRangeTransactions
  }

  const dateRangeTransactions = getDateRangeTransactions()

  // Günlük eklenen satırları hesapla
  return (
    <div className={`app ${darkMode ? 'dark-mode' : 'light-mode'} ${language === 'ar' ? 'rtl' : ''}`} onClick={closeContextMenu} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      {toast && (
        <div className={`toast-notification ${toast.kind}`} role="status" aria-live="polite">
          <span className="toast-icon">{toast.kind === 'success' ? '✓' : '!'}</span>
          <span>{toast.message}</span>
          <button type="button" className="toast-close" onClick={() => setToast(null)} aria-label="Close notification">×</button>
        </div>
      )}
      {!currentUser ? (
        <div className="page-content page-enter">
          <div className="form-container login-container">
            <h2>{language === 'tr' ? 'Giriş Yap' : language === 'en' ? 'Login' : 'تسجيل الدخول'}</h2>

            <div className="settings-item">
              <label>{t.selectLanguage}</label>
              <div className="language-buttons">
                <button className={`lang-button ${language === 'tr' ? 'active' : ''}`} onClick={() => setLanguage('tr')}>{t.turkish}</button>
                <button className={`lang-button ${language === 'en' ? 'active' : ''}`} onClick={() => setLanguage('en')}>{t.english}</button>
                <button className={`lang-button ${language === 'ar' ? 'active' : ''}`} onClick={() => setLanguage('ar')}>{t.arabic}</button>
              </div>
            </div>

            <div className="settings-item">
              <label>{darkMode ? t.lightMode : t.darkMode}</label>
              <button className="toggle-button" onClick={() => setDarkMode(!darkMode)}>{darkMode ? t.lightMode : t.darkMode}</button>
            </div>

            <form className="customer-form" onSubmit={handleLogin}>
              <div className="form-group">
                <label>{language === 'tr' ? 'Kullanıcı Adı' : language === 'en' ? 'Username' : 'اسم المستخدم'}</label>
                <input
                  type="text"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                  placeholder={language === 'tr' ? 'Kullanıcı adını girin' : language === 'en' ? 'Enter username' : 'أدخل اسم المستخدم'}
                  required
                />
              </div>
              <div className="form-group">
                <label>{language === 'tr' ? 'Şifre' : language === 'en' ? 'Password' : 'كلمة المرور'}</label>
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  placeholder={language === 'tr' ? 'Şifrenizi girin' : language === 'en' ? 'Enter password' : 'أدخل كلمة المرور'}
                  required
                />
              </div>
              <button type="submit" className="submit-button">{language === 'tr' ? 'Giriş Yap' : language === 'en' ? 'Login' : 'تسجيل الدخول'}</button>
            </form>
          </div>
        </div>
      ) : currentUser.id === 'developer' && currentPage === 'developer-panel' ? (
        <div className="page-content page-enter">
          <div className="form-container developer-panel">
            <div className="developer-header-row">
              <h2>{language === 'tr' ? 'Developer Paneli' : language === 'en' ? 'Developer Panel' : 'لوحة المطور'}</h2>
              <button className="submit-button developer-logout" onClick={handleLogout}>{language === 'tr' ? 'Çıkış' : language === 'en' ? 'Logout' : 'تسجيل الخروج'}</button>
            </div>

            <div className="developer-actions">
              <button className="toggle-button" onClick={() => setShowAllUsers(false)}>{language === 'tr' ? 'Kullanıcı Ekle' : language === 'en' ? 'Add User' : 'إضافة مستخدم'}</button>
              <button className="toggle-button" onClick={async () => {
                try {
                  const response = await fetch(`${API_URL}/api/users`)
                  if (!response.ok) throw new Error(await response.text())
                  setAllUsers(await response.json())
                  setShowAllUsers(true)
                } catch {
                  setDeveloperMessage(language === 'tr' ? 'Kullanıcılar sunucudan yüklenemedi.' : language === 'en' ? 'Users could not be loaded from the server.' : 'تعذر تحميل المستخدمين من الخادم.')
                }
              }}>{language === 'tr' ? 'Tüm Kullanıcılar' : language === 'en' ? 'All Users' : 'كل المستخدمين'}</button>
            </div>

            <div className="settings-item">
              <label>{t.selectLanguage}</label>
              <div className="language-buttons">
                <button className={`lang-button ${language === 'tr' ? 'active' : ''}`} onClick={() => setLanguage('tr')}>{t.turkish}</button>
                <button className={`lang-button ${language === 'en' ? 'active' : ''}`} onClick={() => setLanguage('en')}>{t.english}</button>
                <button className={`lang-button ${language === 'ar' ? 'active' : ''}`} onClick={() => setLanguage('ar')}>{t.arabic}</button>
              </div>
            </div>

            <div className="settings-item">
              <label>{darkMode ? t.lightMode : t.darkMode}</label>
              <button className="toggle-button" onClick={() => setDarkMode(!darkMode)}>{darkMode ? t.lightMode : t.darkMode}</button>
            </div>

            {!showAllUsers ? (
              <div className="developer-form-wrap">
                <div className="form-group">
                  <label>{language === 'tr' ? 'Kullanıcı Adı' : language === 'en' ? 'Username' : 'اسم المستخدم'}</label>
                  <input
                    type="text"
                    value={developerForm.username}
                    onChange={(e) => setDeveloperForm({ ...developerForm, username: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>{language === 'tr' ? 'Şifre' : language === 'en' ? 'Password' : 'كلمة المرور'}</label>
                  <input
                    type="password"
                    value={developerForm.password}
                    onChange={(e) => setDeveloperForm({ ...developerForm, password: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>{language === 'tr' ? 'Ülke' : language === 'en' ? 'Country' : 'الدولة'}</label>
                  <input
                    type="text"
                    value={developerForm.country}
                    onChange={(e) => setDeveloperForm({ ...developerForm, country: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>{language === 'tr' ? 'Kullanıcı İsmi' : language === 'en' ? 'User Name' : 'اسم المستخدم'}</label>
                  <input
                    type="text"
                    value={developerForm.name}
                    onChange={(e) => setDeveloperForm({ ...developerForm, name: e.target.value })}
                  />
                </div>
                <button className="submit-button" onClick={handleCreateDeveloperUser}>{language === 'tr' ? 'Kaydet' : language === 'en' ? 'Save' : 'حفظ'}</button>
              </div>
            ) : (
              <div className="developer-user-list">
                {allUsers.length === 0 ? (
                  <div className="empty-state"><p>{language === 'tr' ? 'Kayıtlı kullanıcı yok.' : language === 'en' ? 'No users registered.' : 'لا يوجد مستخدمون مسجلون.'}</p></div>
                ) : (
                  allUsers.filter((user) => user.role !== 'developer').map((user) => {
                    const ownerName = getOwnerNameForUser(user)
                    return (
                      <div key={user.id} className="developer-user-card">
                        <div><strong>{user.name}</strong></div>
                        {user.role === 'employee' && ownerName && (
                          <div>{language === 'tr' ? 'Bu hesaba ait' : language === 'en' ? 'Belongs to this account' : 'ينتمي إلى هذا الحساب'}: <strong>{ownerName}</strong></div>
                        )}
                        {user.role === 'owner' && editingUserId === user.id ? (
                          <>
                            <div className="user-edit-row">
                              <label>{language === 'tr' ? 'Kullanıcı Adı' : language === 'en' ? 'Username' : 'اسم المستخدم'}</label>
                              <input
                                type="text"
                                value={editingUserForm.username}
                                onChange={(e) => setEditingUserForm({ ...editingUserForm, username: e.target.value })}
                              />
                            </div>
                            <div className="user-edit-row">
                              <label>{language === 'tr' ? 'Şifre' : language === 'en' ? 'Password' : 'كلمة المرور'}</label>
                              <input
                                type="text"
                                value={editingUserForm.password}
                                onChange={(e) => setEditingUserForm({ ...editingUserForm, password: e.target.value })}
                              />
                            </div>
                            <div className="user-edit-actions">
                              <button className="toggle-button" onClick={handleSaveOwnerEdit}>{language === 'tr' ? 'Kaydet' : language === 'en' ? 'Save' : 'حفظ'}</button>
                              <button className="toggle-button secondary-button" onClick={() => setEditingUserId(null)}>{language === 'tr' ? 'İptal' : language === 'en' ? 'Cancel' : 'إلغاء'}</button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>{language === 'tr' ? 'Kullanıcı Adı' : language === 'en' ? 'Username' : 'اسم المستخدم'}: {user.username}</div>
                            <div>{language === 'tr' ? 'Şifre' : language === 'en' ? 'Password' : 'كلمة المرور'}: {user.password}</div>
                          </>
                        )}
                        <div>{language === 'tr' ? 'Ülke' : language === 'en' ? 'Country' : 'الدولة'}: {user.country}</div>
                        {user.id !== 'developer' && (
                          <div className="user-card-actions">
                            {user.role === 'owner' && (
                              <button className="toggle-button secondary-button" onClick={() => handleStartEditOwner(user)}>
                                {language === 'tr' ? 'Düzenle' : language === 'en' ? 'Edit' : 'تعديل'}
                              </button>
                            )}
                            <button className="delete-button" onClick={() => handleDeleteUser(user.id)}>
                              {t.deleteUser}
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Sidebar Toggle Button */}
          <button 
            className={`sidebar-toggle ${sidebarCollapsed ? 'expanded' : ''}`}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>

          {/* Ana içerik */}
          <div className={`main-content ${sidebarCollapsed ? 'expanded' : ''}`}>
            {currentPage === 'home' && (
          <div className="stats-panel page-enter">
            <div className="app-header">
              <h1>{t.appTitle}</h1>
              <p>{t.appSubtitle}</p>
            </div>

            {/* Tarih Aralığı Seçici */}
            <div className="date-range-container">
              <h3>{t.dateRange}</h3>
              <div className="date-range-inputs">
                <div className="date-range-input">
                  <label>{t.startDate}</label>
                  <input
                    type="date"
                    value={dateRangeStartDate}
                    onChange={(e) => setDateRangeStartDate(e.target.value)}
                    className="date-input"
                  />
                </div>
                <div className="date-range-input">
                  <label>{t.endDate}</label>
                  <input
                    type="date"
                    value={dateRangeEndDate}
                    onChange={(e) => setDateRangeEndDate(e.target.value)}
                    className="date-input"
                  />
                </div>
                {dateRangeTransactions.length > 0 && (
                  <button
                    className="export-button"
                    onClick={() => exportDateRangePDF()}
                  >
                    {t.exportDateRangePDF}
                  </button>
                )}
              </div>
            </div>

            <h2>{t.statistics}</h2>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                    <line x1="12" y1="22.08" x2="12" y2="12"></line>
                  </svg>
                </div>
                <div className="stat-info">
                  <p className="stat-label">{t.totalTransactions}</p>
                  <p className="stat-value">{stats.totalTransactions > 0 ? stats.totalTransactions : '-'}</p>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                </div>
                <div className="stat-info">
                  <p className="stat-label">{t.activeCustomers}</p>
                  <p className="stat-value">{totalCustomers > 0 ? totalCustomers : '-'}</p>
                </div>
              </div>
              <div className="stat-card" onClick={() => setShowIradeModal(true)} style={{ cursor: 'pointer' }}>
                <div className="stat-icon">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                    <polyline points="17 6 23 6 23 12"></polyline>
                  </svg>
                </div>
                <div className="stat-info">
                  <p className="stat-label">{t.totalLoss}</p>
                  <p className={`stat-value ${netProfit > 0 ? 'profit-text' : netProfit < 0 ? 'loss-text' : ''}`}>
                    {netProfit >= 0 ? netProfit.toFixed(1) : '0'}
                  </p>
                </div>
              </div>
            </div>

            <div className="activity-lines">
              <div className="activity-line">
                <div className="line-label">{t.totalProfit}</div>
                <div className="line-bar">
                  <div className="line-fill" style={{ width: stats.totalProfit > 0 ? `${Math.min(stats.totalProfit * 2, 100)}%` : '0%', backgroundColor: '#22c55e' }}></div>
                </div>
                <div className={`line-value ${stats.totalProfit > 0 ? 'profit-text' : ''}`}>{stats.totalProfit > 0 ? stats.totalProfit.toFixed(1) : '-'}</div>
              </div>
              <div className="activity-line">
                <div className="line-label">{t.iradeLabel}</div>
                <div className="line-bar">
                  <div className="line-fill" style={{ width: totalIradeAmount > 0 ? `${Math.min(totalIradeAmount * 2, 100)}%` : '0%', backgroundColor: '#ef4444' }}></div>
                </div>
                <div className="line-value loss-text">{totalIradeAmount > 0 ? totalIradeAmount.toFixed(1) : '-'}</div>
              </div>
              <div className="activity-line">
                <div className="line-label">{t.activeAccounts}</div>
                <div className="line-bar">
                  <div className="line-fill" style={{ width: totalCustomers > 0 ? `${Math.min(totalCustomers * 10, 100)}%` : '0%' }}></div>
                </div>
                <div className="line-value">{totalCustomers}</div>
              </div>
            </div>

            {/* Tarih Aralığı İşlemleri */}
            {dateRangeTransactions.length > 0 && (
              <div className="today-transactions-container">
                <h3>{t.dateRange} ({dateRangeStartDate} - {dateRangeEndDate})</h3>
                <div className="table-container daily-table">
                  <table className="excel-table compact-table">
                    <thead>
                      <tr>
                        <th data-column="id">{t.id}</th>
                        <th data-column="date">{t.date}</th>
                        <th data-column="sender">{t.sender}</th>
                        <th data-column="senderCurrency">{t.senderCurrency}</th>
                        <th data-column="amount">{t.amount}</th>
                        <th data-column="receiver">{t.receiver}</th>
                        <th data-column="receiverCurrency">{t.receiverCurrency}</th>
                        <th data-column="deliveryAmount">{t.deliveryAmount}</th>
                        <th data-column="profitLoss">{t.profitLoss}</th>
                        <th data-column="status">{t.status}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dateRangeTransactions.map((transaction) => (
                        <tr key={transaction.id}>
                          <td className="readonly-cell">
                            <span className="cell-value">{transaction.id}</span>
                          </td>
                          <td className="readonly-cell">
                            <span className="cell-value">{transaction.date}</span>
                          </td>
                          <td className="readonly-cell">
                            <span className="cell-value">{transaction.sender || '-'}</span>
                          </td>
                          <td className="readonly-cell">
                            <span className="cell-value">{transaction.senderCurrency || '-'}</span>
                          </td>
                          <td className="readonly-cell">
                            <span className="cell-value">{transaction.amount || '-'}</span>
                          </td>
                          <td className="readonly-cell">
                            <span className="cell-value">{transaction.receiver || '-'}</span>
                          </td>
                          <td className="readonly-cell">
                            <span className="cell-value">{transaction.receiverCurrency || '-'}</span>
                          </td>
                          <td className="readonly-cell">
                            <span className="cell-value">{transaction.deliveryAmount || '-'}</span>
                          </td>
                          <td className="readonly-cell">
                            <span className={`cell-value ${transaction.profitLoss && transaction.profitLoss > 0 ? 'profit-text' : transaction.profitLoss && transaction.profitLoss < 0 ? 'loss-text' : ''}`}>
                              {transaction.profitLoss ? Math.abs(transaction.profitLoss).toFixed(1) : '0'}
                            </span>
                          </td>
                          <td className="readonly-cell">
                            <span className="cell-value">
                              {transaction.status === 'pending' ? t.pending :
                               transaction.status === 'completed' ? t.completed :
                               transaction.status === 'cancelled' ? t.cancelled : transaction.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {currentPage === 'add-customer' && (
          <div className="page-content page-enter">
            <button className="back-button" onClick={() => setCurrentPage('home')}>
              ← {t.back}
            </button>
            {!can('canAddCustomers') ? (
              <div className="form-container">
                <h2>{t.addCustomer}</h2>
              </div>
            ) : (
              <div className="form-container">
                <h2>{t.addCustomer}</h2>
                <form className="customer-form" onSubmit={handleAddCustomer}>
                  <div className="form-group">
                    <label>{t.customerName}</label>
                    <input type="text" name="name" placeholder={t.customerName} required />
                  </div>
                  <div className="form-group">
                    <label>{t.phone}</label>
                    <input type="tel" name="phone" placeholder={t.customerPhone} />
                  </div>
                  <div className="form-group">
                    <label>{t.email}</label>
                    <input type="email" name="email" placeholder={t.customerEmail} />
                  </div>
                  <div className="form-group">
                    <label>{t.locatedCountry}</label>
                    <input type="text" name="locatedCountry" placeholder={t.locatedCountry} />
                  </div>
                  <div className="form-group">
                    <label>{t.originCountry}</label>
                    <input type="text" name="originCountry" placeholder={t.originCountry} />
                  </div>
                  <button type="submit" className="submit-button">{t.addCustomer}</button>
                </form>
              </div>
            )}
          </div>
        )}

        {currentPage === 'employees' && (
          <div className="page-content page-enter">
            <button className="back-button" onClick={() => setCurrentPage('home')}>
              ← {t.back}
            </button>
            <div className="form-container developer-panel">
              <h2>{t.employeesPage}</h2>

              {!currentUser || (currentUser.role !== 'owner' && !currentUser.permissions?.canManageEmployees) ? null : (
                <>
                  <div className="developer-actions">
                    <button className="toggle-button" onClick={() => setShowEmployeeModal(true)}>{t.addEmployee}</button>
                  </div>

                  {(() => {
                    const managedOwnerId = getManagedOwnerId(currentUser)
                    const managedEmployees = allUsers.filter((user) => user.role === 'employee' && user.ownerId === managedOwnerId)

                    return managedEmployees.length === 0 ? (
                      <div className="empty-state"><p>{language === 'tr' ? 'Henüz çalışan eklenmedi.' : language === 'en' ? 'No employees added yet.' : 'لم يتم إضافة موظفين بعد.'}</p></div>
                    ) : (
                      managedEmployees.map((employee) => (
                        <div key={employee.id} className="developer-user-card">
                          <div><strong>{employee.name}</strong></div>
                          <div>{t.employeeUsername}: {employee.username}</div>
                          <div>{language === 'tr' ? 'Şifre' : language === 'en' ? 'Password' : 'كلمة المرور'}: {employee.password}</div>
                          <div>{t.employeeCountry}: {employee.country}</div>

                          <div className="user-card-actions">
                            <button
                              className="toggle-button secondary-button"
                              onClick={() => setExpandedPermissionEmployeeId(expandedPermissionEmployeeId === employee.id ? null : employee.id)}
                            >
                              {t.managePermissions}
                            </button>
                            <button
                              className="toggle-button secondary-button"
                              onClick={() => {
                                setActivityDateRange('30d')
                                setActivityCustomDays('30')
                                setActivityEmployee(employee)
                              }}
                            >
                              {language === 'tr' ? 'Son İşlemler' : language === 'en' ? 'Recent Actions' : 'آخر الإجراءات'}
                            </button>
                          </div>

                          {expandedPermissionEmployeeId === employee.id && (
                            <div className="permission-panel">
                              <div className="permission-grid">
                                {[
                                  ['canAddCustomers', t.allowAddCustomers],
                                  ['canEditCustomers', t.allowEditCustomers],
                                  ['canDeleteCustomers', t.allowDeleteCustomers],
                                  ['canAddTransactions', t.allowAddTransactions],
                                  ['canEditTransactions', t.allowEditTransactions],
                                  ['canDeleteTransactions', t.allowDeleteTransactions],
                                  ['canManageEmployees', t.allowManageEmployees],
                                  ['canExportPdf', t.allowExportPdf]
                                ].map(([key, label]) => (
                                  <label key={String(key)} className="permission-toggle">
                                    <input
                                      type="checkbox"
                                      checked={Boolean((employee.permissions || defaultEmployeePermissions)[key as keyof EmployeePermissionSet])}
                                      onChange={() => handlePermissionToggle(employee.id, key as keyof EmployeePermissionSet)}
                                    />
                                    <span>{label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}

                          <button className="delete-button" onClick={() => handleDeleteUser(employee.id)}>{t.deleteUser}</button>
                        </div>
                      ))
                    )
                  })()}
                </>
              )}
            </div>
          </div>
        )}

        {currentPage === 'view-customers' && (
          <div className="page-content page-enter">
            <button className="back-button" onClick={() => setCurrentPage('home')}>
              ← {t.back}
            </button>
            <div className="customers-container">
              <h2>{t.customers}</h2>
              
              <div className="search-container">
                <input
                  type="text"
                  placeholder={t.search}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>

              {customers.length === 0 ? (
                <div className="empty-state">
                  <p>{t.noCustomerAdded}</p>
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="empty-state">
                  <p>{t.noSearchResults}</p>
                </div>
              ) : (
                <div className="customers-grid">
                  {filteredCustomers.map((customer) => {
                    const customerStats = updateCustomerStats(customer)
                    return (
                      <div key={customer.id} className="customer-card">
                        <div className="customer-header">
                          <h3>{customer.name}</h3>
                          <span className="customer-id">ID: {customer.id}</span>
                        </div>
                        <div className="customer-details">
                          <div className="detail-item">
                            <span className="detail-label">{t.phoneLabel}</span>
                            <span className="detail-value">{customer.phone}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">{t.emailLabel}</span>
                            <span className="detail-value">{customer.email}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">{t.locatedCountry}</span>
                            <span className="detail-value">{customer.locatedCountry}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">{t.originCountry}</span>
                            <span className="detail-value">{customer.originCountry}</span>
                          </div>
                        </div>
                        <div className="customer-stats">
                          <div className="customer-stat">
                            <span className="stat-label">{t.totalTransactions}</span>
                            <span className="stat-value">{customerStats.totalTransactions}</span>
                          </div>
                          <div className="customer-stat">
                            <span className="stat-label">{t.profitLabel}</span>
                            <span className="stat-value profit">{customerStats.profit > 0 ? customerStats.profit.toFixed(1) : '0'}</span>
                          </div>
                          <div className="customer-stat">
                            <span className="stat-label">{t.lossLabel}</span>
                            <span className="stat-value loss">{customerStats.loss > 0 ? customerStats.loss.toFixed(1) : '0'}</span>
                          </div>
                        </div>
                        <div className="customer-actions">
                          <button
                            className="action-button transaction-button"
                            onClick={() => handleAddTransaction(customer)}
                          >
                            {t.transactions}
                          </button>
                          <button
                            className="action-button"
                            onClick={() => handleExportClick(customer)}
                          >
                            {t.exportPDF}
                          </button>
                          <button
                            className="action-button delete-button"
                            onClick={() => handleDeleteCustomer(customer.id)}
                          >
                            {t.deleteCustomer}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {currentPage === 'currency-settings' && (
          <div className="page-content page-enter">
            <button className="back-button" onClick={() => setCurrentPage('home')}>
              ← {t.back}
            </button>
            <div className="form-container">
              <h2>{t.currencySettings}</h2>
              <div className="currency-rates-list">
                {currencyRates.map((rate, idx) => (
                  <div key={idx} className="currency-rate-item">
                    <span className="currency-name">{rate.currency}</span>
                    <input
                      type="number"
                      step="0.01"
                      value={editingCurrencyRate?.idx === idx ? editingCurrencyRate.value : rate.rate}
                      onChange={(e) => {
                        const value = e.target.value
                        setEditingCurrencyRate({ idx, value })
                      }}
                      className="currency-rate-input"
                    />
                    <button
                      className="save-currency-button"
                      onClick={() => {
                        if (editingCurrencyRate && editingCurrencyRate.idx === idx) {
                          const newRate = parseFloat(editingCurrencyRate.value)
                          if (!isNaN(newRate) && newRate > 0) {
                            const newRates = [...currencyRates]
                            const previousRate = newRates[idx].rate
                            newRates[idx].rate = newRate
                            setCurrencyRates(newRates)
                            setEditingCurrencyRate(null)
                            if (currentUser) {
                              const userName = currentUser.name || (language === 'tr' ? 'Kullanıcı' : language === 'en' ? 'User' : 'مستخدم')
                              const text = language === 'tr'
                                ? `${userName} ${newRates[idx].currency} kurunu ${previousRate} → ${newRate} olarak güncelledi.`
                                : language === 'en'
                                  ? `${userName} updated ${newRates[idx].currency} rate from ${previousRate} to ${newRate}.`
                                  : `${userName} حدّث سعر ${newRates[idx].currency} من ${previousRate} إلى ${newRate}.`
                              addEmployeeActivity(currentUser.id, text)
                            }
                          }
                        }
                      }}
                    >
                      {t.saveRate}
                    </button>
                    <span className="currency-rate-label">{t.usd}</span>
                    <button
                      className="delete-currency-button"
                      onClick={() => {
                        if (currencyRates.length > 1) {
                          const deletedCurrency = currencyRates[idx].currency
                          const newRates = currencyRates.filter((_, i) => i !== idx)
                          setCurrencyRates(newRates)
                          if (currentUser) {
                            const userName = currentUser.name || (language === 'tr' ? 'Kullanıcı' : language === 'en' ? 'User' : 'مستخدم')
                            const text = language === 'tr'
                              ? `${userName} ${deletedCurrency} para birimini sildi.`
                              : language === 'en'
                                ? `${userName} deleted currency ${deletedCurrency}.`
                                : `${userName} حذف العملة ${deletedCurrency}.`
                            addEmployeeActivity(currentUser.id, text)
                          }
                        } else {
                          alert(t.atLeastOneCurrency)
                        }
                      }}
                      title={t.delete}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              <div className="add-currency-wrapper">
                <input
                  type="text"
                  placeholder={t.newCurrency}
                  className="add-currency-input"
                  id="newCurrencyName"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder={t.usdRate}
                  className="add-currency-input"
                  id="newCurrencyRate"
                />
                <button
                  className="add-currency-button"
                  onClick={() => {
                    const nameInput = document.getElementById('newCurrencyName') as HTMLInputElement
                    const rateInput = document.getElementById('newCurrencyRate') as HTMLInputElement
                    const name = nameInput.value.trim()
                    const rate = parseFloat(rateInput.value) || 1

                    if (name && rate > 0) {
                      setCurrencyRates([...currencyRates, { currency: name, rate }])
                      if (currentUser) {
                        const userName = currentUser.name || (language === 'tr' ? 'Kullanıcı' : language === 'en' ? 'User' : 'مستخدم')
                        const text = language === 'tr'
                          ? `${userName} ${name} para birimini ${rate} kuruyla ekledi.`
                          : language === 'en'
                            ? `${userName} added currency ${name} with rate ${rate}.`
                            : `${userName} أضاف العملة ${name} بسعر ${rate}.`
                        addEmployeeActivity(currentUser.id, text)
                      }
                      nameInput.value = ''
                      rateInput.value = ''
                    } else {
                      alert(t.pleaseEnterValidCurrency)
                    }
                  }}
                >
                  {t.addCurrency}
                </button>
              </div>
              <div className="currency-info">
                <p>{t.currencyInfo}</p>
                <p>{t.currencyInfo2}</p>
                <p>{t.currencyInfo3}</p>
              </div>
            </div>
          </div>
        )}

        {currentPage === 'transactions' && (
          <div className="page-content page-enter">
            <button className="back-button" onClick={() => setCurrentPage('view-customers')}>
              ← {t.back}
            </button>
            <div className="transactions-container">
              <div className="transactions-header">
                <h2>{selectedCustomer?.name} - {t.transactions}</h2>
                <div className="header-actions">
                  <button className="add-column-button" onClick={() => setShowAddColumnModal(true)}>
                    {t.addColumn}
                  </button>
                  <button className="add-row-button" onClick={handleAddRow}>
                    {t.addRow}
                  </button>
                </div>
              </div>

              {/* Para Birimleri */}
              <div className="currencies-section">
                <h3>{t.currenciesHeader}</h3>
                <div className="currencies-list">
                  {currencyRates.map((rate, idx) => (
                    <div key={idx} className="currency-item">
                      <span className="currency-name">{rate.currency}</span>
                      <span className="currency-rate-display">{t.currencyRateDisplay.replace('{currency}', rate.currency).replace('{rate}', String(rate.rate))}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom Columns */}
              {customColumns.length > 0 && (
                <div className="custom-columns-section">
                  <h3>{t.customColumns}</h3>
                  <div className="custom-columns-list">
                    {customColumns.map((column) => (
                      <div key={column.id} className="custom-column-item" onContextMenu={(e) => handleContextMenu(e, 'column', column.id)}>
                        <span className="column-name">{column.name}</span>
                        <span className="column-type">({column.type})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Excel benzeri tablo */}
              <div className="table-section">
                {transactions.length === 0 ? (
                  <div className="empty-state">
                    <p>{t.noTransactionAdded}</p>
                  </div>
                ) : (
                  <div className="table-container">
                    <table className="excel-table">
                      <thead>
                        <tr>
                          <th data-column="id">
                            {t.transactionId}
                          </th>
                          <th data-column="date">
                            {t.date}
                          </th>
                          <th data-column="sender">
                            {t.sender}
                          </th>
                          <th data-column="senderCurrency">
                            {t.senderCurrency}
                          </th>
                          <th data-column="amount">
                            {t.amount}
                          </th>
                          <th data-column="receiver">
                            {t.receiver}
                          </th>
                          <th data-column="receiverCurrency">
                            {t.receiverCurrency}
                          </th>
                          <th data-column="deliveryAmount">
                            {t.deliveryAmount}
                          </th>
                          <th data-column="profitLoss">
                            {t.profitLoss}
                          </th>
                          <th data-column="note">
                            {t.note}
                          </th>
                          <th data-column="status">
                            {t.status}
                          </th>
                          <th data-column="actions">
                            {language === 'tr' ? 'İşlemler' : language === 'en' ? 'Actions' : 'إجراءات'}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* İrade Satırları */}
                        {(selectedCustomer?.transactions || []).filter(t => t.isIrade).map((transaction) => (
                          <tr key={transaction.id} className="irade-row">
                            <td className="readonly-cell">{transaction.id}</td>
                            <td className="readonly-cell">
                              <span className="cell-value">{transaction.date}</span>
                            </td>
                            <td className="readonly-cell">
                              <span className="cell-value">{transaction.sender || '-'}</span>
                            </td>
                            <td className="readonly-cell">
                              <span className="cell-value">{transaction.senderCurrency || '-'}</span>
                            </td>
                            <td className="readonly-cell">
                              <span className="cell-value">{transaction.amount || '-'}</span>
                            </td>
                            <td className="readonly-cell">
                              <span className="cell-value">{transaction.receiver || '-'}</span>
                            </td>
                            <td className="readonly-cell">
                              <span className="cell-value">{transaction.receiverCurrency || '-'}</span>
                            </td>
                            <td className="readonly-cell">
                              <span className="cell-value">{transaction.deliveryAmount || '-'}</span>
                            </td>
                            <td className="readonly-cell">
                              <span className="cell-value">{language === 'tr' ? 'İrade' : language === 'en' ? 'Commission' : 'إرادات'}</span>
                            </td>
                            <td className="readonly-cell">
                              <span className="cell-value">{transaction.note || '-'}</span>
                            </td>
                            <td className="readonly-cell">
                              <span className="cell-value">{language === 'tr' ? 'Tamamlandı' : language === 'en' ? 'Completed' : 'مكتمل'}</span>
                            </td>
                            <td className="readonly-cell">
                              <button
                                className="table-action-button delete-button"
                                onClick={() => handleDeleteTransaction(transaction.id)}
                                title={t.deleteButton}
                              >
                                <span>H</span>
                              </button>
                            </td>
                          </tr>
                        ))}

                        {/* Normal İşlem Satırları */}
                        {(selectedCustomer?.transactions || []).filter(t => !t.isIrade).map((transaction) => (
                          <tr key={transaction.id} className={editingRowId === transaction.id ? 'editing-row' : ''}>
                            <td className="readonly-cell">{transaction.id}</td>
                            <td className="readonly-cell">
                              <span className="cell-value">{transaction.date}</span>
                            </td>
                            <td>
                              {editingRowId === transaction.id ? (
                                <>
                                  <input
                                    list="customer-list"
                                    value={transaction.sender || ''}
                                    onChange={(e) => handleUpdateTransaction(transaction.id, 'sender', e.target.value)}
                                    className="table-input"
                                    placeholder={t.searchCustomer}
                                  />
                                  <datalist id="customer-list">
                                    {customers.map((customer) => (
                                      <option key={customer.id} value={customer.name}>
                                        {customer.name} (ID: {customer.id})
                                      </option>
                                    ))}
                                  </datalist>
                                </>
                              ) : (
                                <span className="cell-value">{transaction.sender || '-'}</span>
                              )}
                            </td>
                            <td>
                              {editingRowId === transaction.id ? (
                                <select
                                  value={transaction.senderCurrency}
                                  onChange={(e) => handleUpdateTransaction(transaction.id, 'senderCurrency', e.target.value)}
                                  className="table-select"
                                >
                                  {currencyRates.map((curr, idx) => (
                                    <option key={idx} value={curr.currency}>{curr.currency}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className="cell-value">{transaction.senderCurrency}</span>
                              )}
                            </td>
                            <td>
                              {editingRowId === transaction.id ? (
                                <input
                                  type="text"
                                  value={transaction.amount || ''}
                                  onChange={(e) => handleUpdateTransaction(transaction.id, 'amount', e.target.value)}
                                  className="table-input"
                                />
                              ) : (
                                <span className="cell-value">{transaction.amount || '-'}</span>
                              )}
                            </td>
                            <td>
                              {editingRowId === transaction.id ? (
                                <>
                                  <input
                                    list="customer-list"
                                    value={transaction.receiver || ''}
                                    onChange={(e) => handleUpdateTransaction(transaction.id, 'receiver', e.target.value)}
                                    className="table-input"
                                    placeholder={t.searchCustomer}
                                  />
                                  <datalist id="customer-list">
                                    {customers.map((customer) => (
                                      <option key={customer.id} value={customer.name}>
                                        {customer.name} (ID: {customer.id})
                                      </option>
                                    ))}
                                  </datalist>
                                </>
                              ) : (
                                <span className="cell-value">{transaction.receiver || '-'}</span>
                              )}
                            </td>
                            <td>
                              {editingRowId === transaction.id ? (
                                <select
                                  value={transaction.receiverCurrency}
                                  onChange={(e) => handleUpdateTransaction(transaction.id, 'receiverCurrency', e.target.value)}
                                  className="table-select"
                                >
                                  {currencyRates.map((curr, idx) => (
                                    <option key={idx} value={curr.currency}>{curr.currency}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className="cell-value">{transaction.receiverCurrency}</span>
                              )}
                            </td>
                            <td>
                              {editingRowId === transaction.id ? (
                                <input
                                  type="text"
                                  value={transaction.deliveryAmount || ''}
                                  onChange={(e) => handleUpdateTransaction(transaction.id, 'deliveryAmount', e.target.value)}
                                  className="table-input"
                                />
                              ) : (
                                <span className="cell-value">{transaction.deliveryAmount || '-'}</span>
                              )}
                            </td>
                            <td className="readonly-cell">
                              <span className={`cell-value ${transaction.profitLoss && transaction.profitLoss > 0 ? 'profit-text' : transaction.profitLoss && transaction.profitLoss < 0 ? 'loss-text' : ''}`}>
                                {transaction.profitLoss ? Math.abs(transaction.profitLoss).toFixed(1) : '0'}
                              </span>
                            </td>
                            <td>
                              {editingRowId === transaction.id ? (
                                <input
                                  type="text"
                                  value={transaction.note || ''}
                                  onChange={(e) => handleUpdateTransaction(transaction.id, 'note', e.target.value)}
                                  className="table-input"
                                />
                              ) : (
                                <span className="cell-value">{transaction.note || '-'}</span>
                              )}
                            </td>
                            <td>
                              {editingRowId === transaction.id ? (
                                <select
                                  value={transaction.status}
                                  onChange={(e) => handleUpdateTransaction(transaction.id, 'status', e.target.value)}
                                  className="table-select"
                                >
                                  <option value="pending">{t.pending}</option>
                                  <option value="completed">{t.completed}</option>
                                  <option value="cancelled">{t.cancelled}</option>
                                </select>
                              ) : (
                                <span className="cell-value">
                                  {transaction.status === 'pending' ? t.pending :
                                     transaction.status === 'completed' ? t.completed :
                                     transaction.status === 'cancelled' ? t.cancelled : transaction.status}
                                </span>
                              )}
                            </td>
                            <td className="action-buttons-cell">
                              <button
                                className="table-action-button edit-button"
                                onClick={() => {
                                  if (editingRowId === transaction.id) {
                                    setEditingRowId(null)
                                  } else {
                                    setEditingRowId(transaction.id)
                                  }
                                }}
                                title={editingRowId === transaction.id ? 'Kaydet' : 'Düzenle'}
                              >
                                {editingRowId === transaction.id ? (
                                  <span>T</span>
                                ) : (
                                  <span>T</span>
                                )}
                              </button>
                              <button
                                className="table-action-button delete-button"
                                onClick={() => handleDeleteTransaction(transaction.id)}
                                title={t.deleteButton}
                              >
                                <span>H</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Transaction Management Modal */}
      {showTransactionModal && (
        <div className="modal-overlay" onClick={() => setShowTransactionModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{t.transactionManagement}</h3>
            <div className="modal-form">
              <div className="form-group">
                <label>{t.sender}</label>
                <input
                  list="modal-customer-list"
                  value={selectedTransactionForModal?.sender || ''}
                  onChange={(e) => {
                    if (selectedTransactionForModal) {
                      const updated = { ...selectedTransactionForModal, sender: e.target.value }
                      setSelectedTransactionForModal(updated)
                    }
                  }}
                  className="modal-input"
                  placeholder={t.searchCustomer}
                />
                <datalist id="modal-customer-list">
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.name}>
                      {customer.name} (ID: {customer.id})
                    </option>
                  ))}
                </datalist>
              </div>
              <div className="form-group">
                <label>{t.senderCurrency}</label>
                <select
                  value={selectedTransactionForModal?.senderCurrency || 'USD'}
                  onChange={(e) => {
                    if (selectedTransactionForModal) {
                      const updated = { ...selectedTransactionForModal, senderCurrency: e.target.value }
                      const profitLoss = calculateProfitLoss(
                        updated.amount || '',
                        updated.deliveryAmount || '',
                        e.target.value,
                        updated.receiverCurrency || 'USD'
                      )
                      updated.profitLoss = profitLoss
                      setSelectedTransactionForModal(updated)
                    }
                  }}
                  className="modal-select"
                >
                  {currencyRates.map((curr, idx) => (
                    <option key={idx} value={curr.currency}>{curr.currency}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>{t.amount}</label>
                <input
                  type="text"
                  value={selectedTransactionForModal?.amount || ''}
                  onChange={(e) => {
                    if (selectedTransactionForModal) {
                      const updated = { ...selectedTransactionForModal, amount: e.target.value }
                      const profitLoss = calculateProfitLoss(
                        e.target.value,
                        updated.deliveryAmount || '',
                        updated.senderCurrency || 'USD',
                        updated.receiverCurrency || 'USD'
                      )
                      updated.profitLoss = profitLoss
                      setSelectedTransactionForModal(updated)
                    }
                  }}
                  className="modal-input"
                />
              </div>
              <div className="form-group">
                <label>{t.receiver}</label>
                <input
                  list="modal-customer-list"
                  value={selectedTransactionForModal?.receiver || ''}
                  onChange={(e) => {
                    if (selectedTransactionForModal) {
                      const updated = { ...selectedTransactionForModal, receiver: e.target.value }
                      setSelectedTransactionForModal(updated)
                    }
                  }}
                  className="modal-input"
                  placeholder={t.searchCustomer}
                />
                <datalist id="modal-customer-list">
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.name}>
                      {customer.name} (ID: {customer.id})
                    </option>
                  ))}
                </datalist>
              </div>
              <div className="form-group">
                <label>{t.receiverCurrency}</label>
                <select
                  value={selectedTransactionForModal?.receiverCurrency || 'USD'}
                  onChange={(e) => {
                    if (selectedTransactionForModal) {
                      const updated = { ...selectedTransactionForModal, receiverCurrency: e.target.value }
                      const profitLoss = calculateProfitLoss(
                        updated.amount || '',
                        updated.deliveryAmount || '',
                        updated.senderCurrency || 'USD',
                        e.target.value
                      )
                      updated.profitLoss = profitLoss
                      setSelectedTransactionForModal(updated)
                    }
                  }}
                  className="modal-select"
                >
                  {currencyRates.map((curr, idx) => (
                    <option key={idx} value={curr.currency}>{curr.currency}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>{t.deliveryAmount}</label>
                <input
                  type="text"
                  value={selectedTransactionForModal?.deliveryAmount || ''}
                  onChange={(e) => {
                    if (selectedTransactionForModal) {
                      const updated = { ...selectedTransactionForModal, deliveryAmount: e.target.value }
                      const profitLoss = calculateProfitLoss(
                        updated.amount || '',
                        e.target.value,
                        updated.senderCurrency || 'USD',
                        updated.receiverCurrency || 'USD'
                      )
                      updated.profitLoss = profitLoss
                      setSelectedTransactionForModal(updated)
                    }
                  }}
                  className="modal-input"
                />
              </div>
              <div className="form-group">
                <label>{t.note}</label>
                <input
                  type="text"
                  value={selectedTransactionForModal?.note || ''}
                  onChange={(e) => {
                    if (selectedTransactionForModal) {
                      const updated = { ...selectedTransactionForModal, note: e.target.value }
                      setSelectedTransactionForModal(updated)
                    }
                  }}
                  className="modal-input"
                />
              </div>
              <div className="form-group">
                <label>{t.profitLoss}</label>
                <input
                  type="text"
                  value={selectedTransactionForModal?.profitLoss ? Math.abs(selectedTransactionForModal.profitLoss).toFixed(1) : '0'}
                  className={`modal-input ${selectedTransactionForModal?.profitLoss && selectedTransactionForModal.profitLoss > 0 ? 'profit-text' : selectedTransactionForModal?.profitLoss && selectedTransactionForModal.profitLoss < 0 ? 'loss-text' : ''}`}
                  disabled
                />
              </div>
              <div className="modal-actions">
                <button className="modal-button cancel" onClick={() => setShowTransactionModal(false)}>
                  {t.cancelButton}
                </button>
                <button
                  className="modal-button confirm"
                  onClick={handleSaveTransactionFromModal}
                >
                  {t.submit}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* İrade Modal */}
      {showIradeModal && (
        <div className="modal-overlay" onClick={() => setShowIradeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{t.addIrade}</h3>
            <div className="modal-form">
              <div className="form-group">
                <label>{t.iradeAmount}</label>
                <input
                  type="number"
                  id="iradeAmount"
                  placeholder="100"
                  className="modal-input"
                  value={iradeAmount}
                  onChange={(e) => setIradeAmount(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>{language === 'tr' ? 'Alıcı' : language === 'en' ? 'Receiver' : 'المستلم'}</label>
                <select
                  id="iradeToCustomer"
                  className="modal-select"
                  value={iradeToCustomer}
                  onChange={(e) => setIradeToCustomer(e.target.value)}
                >
                  <option value="">{language === 'tr' ? 'Alıcı Seçin' : language === 'en' ? 'Select Receiver' : 'اختر المستلم'}</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="modal-actions">
                <button className="modal-button cancel" onClick={() => setShowIradeModal(false)}>
                  {t.cancelButton}
                </button>
                <button
                  className="modal-button confirm"
                  onClick={async () => {
                    const amountInput = document.getElementById('iradeAmount') as HTMLInputElement
                    const toCustomerSelect = document.getElementById('iradeToCustomer') as HTMLSelectElement
                    const amount = parseFloat(amountInput.value)
                    const toCustomerId = toCustomerSelect.value

                    if (isNaN(amount) || amount <= 0) {
                      alert('Lütfen geçerli bir tutar girin')
                      return
                    }

                    if (!toCustomerId) {
                      alert('Lütfen alıcı müşteri seçin')
                      return
                    }

                    const toCustomer = customers.find(c => c.id === toCustomerId)
                    if (!toCustomer) return

                    // Gönderici mevcut kullanıcı
                    const fromCustomerName = currentUser?.name || 'Sistem'

                    const newIrade: Irade = {
                      id: Date.now().toString(),
                      amount,
                      fromCustomerId: currentUser?.id || 'system',
                      fromCustomerName,
                      toCustomerId,
                      toCustomerName: toCustomer.name,
                      date: new Date().toISOString().split('T')[0],
                      note: t.iradeNote.replace('{sender}', fromCustomerName).replace('{receiver}', toCustomer.name).replace('{amount}', amount.toString())
                    }

                    // İradeyi localStorage'a kaydet
                    const updatedIrades = [...irades, newIrade]
                    setIrades(updatedIrades)
                    localStorage.setItem('irades', JSON.stringify(updatedIrades))

                    // Alıcı müşterinin işlemlerine irade satırı ekle
                    const iradeTransaction: Transaction = {
                      id: Date.now().toString(),
                      customerId: toCustomer.id,
                      customerName: toCustomer.name,
                      currency: 'USD',
                      senderCurrency: 'USD',
                      receiverCurrency: 'USD',
                      senderRate: 1,
                      receiverRate: 1,
                      date: new Date().toISOString().split('T')[0],
                      sender: fromCustomerName, // Gönderici kişi
                      amount: `-${amount}`, // Negatif tutar - hesaptan çıkarılacak
                      receiver: toCustomer.name, // Alıcı müşteri
                      deliveryAmount: amount.toString(), // İrade miktarı
                      profitLoss: 0, // Zarar olarak geçmesin
                      description: 'İrade',
                      status: 'completed',
                      note: newIrade.note,
                      isIrade: true,
                      iradeId: newIrade.id
                    }

                    const updatedCustomers = customers.map(c => {
                      if (c.id === toCustomerId) {
                        return {
                          ...c,
                          transactions: [...(c.transactions || []), iradeTransaction]
                        }
                      }
                      return c
                    })

                    setCustomers(updatedCustomers)

                    // İrade satırını backend'e kaydet
                    try {
                      const updatedCustomer = updatedCustomers.find(c => c.id === toCustomerId)
                      if (updatedCustomer) {
                        await fetch(`${API_URL}/api/customers/${toCustomerId}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(updatedCustomer)
                        })
                      }
                    } catch {
                      console.error('Failed to save irade transaction to backend')
                    }

                    setIradeAmount('')
                    setIradeToCustomer('')
                    setShowIradeModal(false)
                    showToast(language === 'tr' ? 'İrade başarıyla eklendi' : language === 'en' ? 'Commission added successfully' : 'تمت إضافة الإرادات بنجاح', 'success')
                  }}
                >
                  {t.addButton}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Column Modal */}
      {showAddColumnModal && (
        <div className="modal-overlay" onClick={() => setShowAddColumnModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{t.addColumn}</h3>
            <div className="modal-form">
              <div className="form-group">
                <label>{t.columnName}</label>
                <input
                  type="text"
                  id="columnName"
                  placeholder={t.exampleColumnPlaceholder}
                  className="modal-input"
                />
              </div>
              <div className="form-group">
                <label>{t.columnType}</label>
                <select id="columnType" className="modal-select">
                  <option value="text">{t.text}</option>
                  <option value="number">{t.number}</option>
                  <option value="date">{t.date}</option>
                </select>
              </div>
              <div className="modal-actions">
                <button className="modal-button cancel" onClick={() => setShowAddColumnModal(false)}>
                  {t.cancelButton}
                </button>
                <button
                  className="modal-button confirm"
                  onClick={() => {
                    const nameInput = document.getElementById('columnName') as HTMLInputElement
                    const typeSelect = document.getElementById('columnType') as HTMLSelectElement
                    const name = nameInput.value
                    const type = typeSelect.value as 'text' | 'number' | 'date'
                    if (name.trim()) {
                      handleAddColumn(name, type)
                    } else {
                      alert(t.pleaseEnterColumnName)
                    }
                  }}
                >
                  {t.addButton}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu.visible && contextMenu.type !== 'transaction' && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="context-menu-item" onClick={() => handleContextMenuAction('delete')}>
            {t.delete}
          </div>
        </div>
      )}

      {currentPage === 'settings' && (
        <div className="page-content page-enter">
          <button className="back-button" onClick={() => setCurrentPage('home')}>
            ← {t.back}
          </button>
          <div className="form-container">
            <h2>{t.settingsPage}</h2>
            
            <div className="settings-section">
              <h3>{t.appearance}</h3>
              
              <div className="settings-item">
                <label>{t.darkMode} / {t.lightMode}</label>
                <button 
                  className="toggle-button"
                  onClick={() => setDarkMode(!darkMode)}
                >
                  {darkMode ? t.lightMode : t.darkMode}
                </button>
              </div>
              
              <div className="settings-item">
                <label>{t.selectLanguage}</label>
                <div className="language-buttons">
                  <button 
                    className={`lang-button ${language === 'tr' ? 'active' : ''}`}
                    onClick={() => setLanguage('tr')}
                  >
                    {t.turkish}
                  </button>
                  <button 
                    className={`lang-button ${language === 'en' ? 'active' : ''}`}
                    onClick={() => setLanguage('en')}
                  >
                    {t.english}
                  </button>
                  <button 
                    className={`lang-button ${language === 'ar' ? 'active' : ''}`}
                    onClick={() => setLanguage('ar')}
                  >
                    {t.arabic}
                  </button>
                </div>
              </div>
              
              <div className="settings-item">
                <label>{t.fontSize}</label>
                <div className="font-size-buttons">
                  <button 
                    className={`font-size-button ${fontSize === 14 ? 'active' : ''}`}
                    onClick={() => setFontSize(14)}
                  >
                    {t.small}
                  </button>
                  <button 
                    className={`font-size-button ${fontSize === 16 ? 'active' : ''}`}
                    onClick={() => setFontSize(16)}
                  >
                    {t.medium}
                  </button>
                  <button 
                    className={`font-size-button ${fontSize === 18 ? 'active' : ''}`}
                    onClick={() => setFontSize(18)}
                  >
                    {t.large}
                  </button>
                </div>
              </div>

              <div className="settings-item">
                <label>{t.logout}</label>
                <button className="toggle-button" onClick={handleLogout}>
                  {t.logout}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activityEmployee && (
        <div className="modal-overlay" onClick={() => setActivityEmployee(null)}>
          <div className="modal-content activity-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{activityEmployee.name}</h3>

            <div className="activity-filter-row" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
              <select
                value={activityDateRange}
                onChange={(e) => setActivityDateRange(e.target.value as '1d' | '30d' | '365d' | 'custom')}
                style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #d1d5db', minWidth: '140px' }}
              >
                <option value="1d">{language === 'tr' ? 'Son 1 gün' : language === 'en' ? 'Last 1 day' : 'آخر 24 ساعة'}</option>
                <option value="30d">{language === 'tr' ? 'Son 30 gün' : language === 'en' ? 'Last 30 days' : 'آخر 30 يومًا'}</option>
                <option value="365d">{language === 'tr' ? 'Son 1 yıl' : language === 'en' ? 'Last 1 year' : 'آخر سنة'}</option>
                <option value="custom">{language === 'tr' ? 'Özel gün sayısı' : language === 'en' ? 'Custom days' : 'أيام مخصصة'}</option>
              </select>

              {activityDateRange === 'custom' && (
                <input
                  type="number"
                  min="1"
                  value={activityCustomDays}
                  onChange={(e) => setActivityCustomDays(e.target.value)}
                  placeholder={language === 'tr' ? 'Son kaç gün?' : language === 'en' ? 'How many days?' : 'كم يوم؟'}
                  style={{ width: '120px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                />
              )}
            </div>

            <div className="activity-log-list">
              {getFilteredActivityLogs(activityEmployee.id).length === 0 ? (
                <div className="empty-state"><p>{language === 'tr' ? 'Seçili aralıkta işlem kaydı yok.' : language === 'en' ? 'No actions recorded in the selected range.' : 'لا توجد سجلات إجراءات في النطاق المحدد.'}</p></div>
              ) : (
                getFilteredActivityLogs(activityEmployee.id).map((log) => (
                  <div key={log.id} className="activity-log-item">
                    <div className="activity-log-action">{log.action}</div>
                    <div className="activity-log-time">{formatActivityTimestamp(log.timestamp)}</div>
                  </div>
                ))
              )}
            </div>
            <div className="modal-actions">
              <button className="modal-button cancel" onClick={() => setActivityEmployee(null)}>{t.back}</button>
            </div>
          </div>
        </div>
      )}

      {showEmployeeModal && (
        <div className="modal-overlay" onClick={() => setShowEmployeeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{t.addEmployee}</h3>
            <div className="modal-form">
              <div className="form-group">
                <label>{t.employeeName}</label>
                <input type="text" value={employeeForm.name} onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })} placeholder={t.employeeName} />
              </div>
              <div className="form-group">
                <label>{t.employeeUsername}</label>
                <input type="text" value={employeeForm.username} onChange={(e) => setEmployeeForm({ ...employeeForm, username: e.target.value })} placeholder={t.employeeUsername} />
              </div>
              <div className="form-group">
                <label>{t.employeePassword}</label>
                <input type="password" value={employeeForm.password} onChange={(e) => setEmployeeForm({ ...employeeForm, password: e.target.value })} placeholder={t.employeePassword} />
              </div>
              <div className="form-group">
                <label>{t.employeeCountry}</label>
                <input type="text" value={employeeForm.country} onChange={(e) => setEmployeeForm({ ...employeeForm, country: e.target.value })} placeholder={t.employeeCountry} />
              </div>
              <div className="form-group">
                <label>{t.permissions}</label>
                <div className="permission-grid permission-grid-modal">
                  {[
                    ['canAddCustomers', t.allowAddCustomers],
                    ['canEditCustomers', t.allowEditCustomers],
                    ['canDeleteCustomers', t.allowDeleteCustomers],
                    ['canAddTransactions', t.allowAddTransactions],
                    ['canEditTransactions', t.allowEditTransactions],
                    ['canDeleteTransactions', t.allowDeleteTransactions],
                    ['canManageEmployees', t.allowManageEmployees],
                    ['canExportPdf', t.allowExportPdf]
                  ].map(([key, label]) => (
                    <label key={String(key)} className="permission-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(employeeForm.permissions[key as keyof EmployeePermissionSet])}
                        onChange={() => setEmployeeForm({
                          ...employeeForm,
                          permissions: {
                            ...employeeForm.permissions,
                            [key]: !employeeForm.permissions[key as keyof EmployeePermissionSet]
                          }
                        })}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="modal-actions">
                <button className="modal-button cancel" onClick={() => setShowEmployeeModal(false)}>{t.back}</button>
                <button className="modal-button confirm" onClick={handleCreateEmployee}>{t.submit}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showExportModal && selectedCustomer && can('canExportPdf') && (
        <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{t.exportRange}</h3>
            <div className="modal-form">
              <div className="form-group">
                <label>{t.startDate}</label>
                <input 
                  type="datetime-local" 
                  value={exportStartDate}
                  onChange={(e) => setExportStartDate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>{t.endDate}</label>
                <input 
                  type="datetime-local" 
                  value={exportEndDate}
                  onChange={(e) => setExportEndDate(e.target.value)}
                />
              </div>
              <div className="modal-actions">
                <button className="modal-button cancel" onClick={() => setShowExportModal(false)}>{t.cancel}</button>
                <button className="modal-button confirm" onClick={handleExportWithRange}>{t.exportSelected}</button>
                <button className="modal-button confirm" onClick={handleExportAll}>{t.exportAll}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sağ sidebar - butonlar */}
      <div className={`right-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className={`menu-item ${currentPage === 'home' ? 'active' : ''}`} onClick={() => setCurrentPage('home')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="3" y1="9" x2="21" y2="9"></line>
            <line x1="9" y1="21" x2="9" y2="9"></line>
          </svg>
          <span>{t.statistics}</span>
        </div>
        <div className={`menu-item ${currentPage === 'view-customers' || currentPage === 'transactions' ? 'active' : ''}`} onClick={() => setCurrentPage('view-customers')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          <span>{t.customers}</span>
        </div>
        <div className="menu-item add-transaction-button" onClick={() => {
          setSelectedTransactionForModal({
            id: '',
            customerId: '',
            customerName: '',
            currency: 'USD',
            senderCurrency: 'USD',
            receiverCurrency: 'USD',
            senderRate: 1,
            receiverRate: 1,
            date: (() => {
              const dateNow = new Date()
              const year = dateNow.getFullYear()
              const month = String(dateNow.getMonth() + 1).padStart(2, '0')
              const day = String(dateNow.getDate()).padStart(2, '0')
              return `${year}-${month}-${day}`
            })(),
            sender: '',
            amount: '',
            receiver: '',
            deliveryAmount: '',
            profitLoss: 0,
            description: '',
            status: 'pending',
            note: ''
          })
          setShowTransactionModal(true)
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>{language === 'tr' ? 'İşlem Ekle' : language === 'en' ? 'Add Transaction' : 'إضافة معاملة'}</span>
        </div>
        {currentUser && (currentUser.role === 'owner' || currentUser.role === 'developer' || currentUser.permissions?.canAddCustomers) && (
          <div className={`menu-item ${currentPage === 'add-customer' ? 'active' : ''}`} onClick={() => setCurrentPage('add-customer')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <span>{t.addCustomer}</span>
          </div>
        )}
        <div className={`menu-item ${currentPage === 'currency-settings' ? 'active' : ''}`} onClick={() => setCurrentPage('currency-settings')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="1" x2="12" y2="23"></line>
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
          </svg>
          <span>{t.currencies}</span>
        </div>
        {(currentUser?.role === 'owner' || currentUser?.role === 'developer' || currentUser?.permissions?.canManageEmployees) && (
          <div className={`menu-item ${currentPage === 'employees' ? 'active' : ''}`} onClick={() => setCurrentPage('employees')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <span>{t.employeesPage}</span>
          </div>
        )}
        <div className={`menu-item ${currentPage === 'settings' ? 'active' : ''}`} onClick={() => setCurrentPage('settings')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
          <span>{t.settings}</span>
        </div>
      </div>
        </>
      )}
    </div>
  )
}

export default App

