import { FormEvent, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  CircleDot,
  LayoutDashboard,
  Menu,
  Package,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Users,
  UserPlus,
  LogOut,
  WalletCards,
  X,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

type View =
  | "Overview"
  | "Sales"
  | "Inventory"
  | "Gas Cylinders"
  | "Madeni"
  | "Payments"
  | "Staff"
  | "Reports";

type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  stock_quantity: number;
  reorder_level: number;
  is_gas?: number;
  gas_id?: number;
};

type Gas = {
  id: number;
  brand: string;
  size_kg: number;
  full_quantity: number;
  empty_quantity: number;
  price: number;
  refill_price?: number;
  package_price?: number;
  reorder_level?: number;
};

type Customer = {
  id: number;
  full_name: string;
  phone: string;
  outstanding_debt: number;
};

type Sale = {
  receipt_number: string;
  customer: string;
  total: number;
  payment_method: string;
  status: string;
  created_at: string;
};

type Payment = {
  id: number;
  customer: string;
  amount: number;
  payment_method: string;
  reference?: string;
  recorded_by: string;
  created_at: string;
};

type Staff = {
  id: number;
  full_name: string;
  email: string;
  role: string;
  active: number;
  created_at: string;
};

type Dashboard = {
  summary: {
    sales: number;
    transactions: number;
    mpesa: number;
    cash: number;
    credit: number;
  };
  inventory: {
    products: number;
    low_stock: number;
    full_cylinders: number;
    empty_cylinders: number;
  };
  recent_sales: Sale[];
  debts: {
    id: number;
    customer: string;
    phone: string;
    balance: number;
    total_purchases: number;
    paid: number;
    status: "CLEARED" | "PARTIAL" | "OUTSTANDING";
  }[];
  sales_trend: { date: string; value: number }[];
};

const money = (value: number) =>
  `KSh ${value.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

const navItems = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Sales", icon: ShoppingCart },
  { label: "Inventory", icon: Package },
  { label: "Gas Cylinders", icon: CircleDot },
  { label: "Madeni", icon: WalletCards },
  { label: "Payments", icon: CircleDollarSign },
  { label: "Staff", icon: Users },
  { label: "Reports", icon: BarChart3 },
] as const;

const apiFetch = (path: string, options: RequestInit = {}) =>
  fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(localStorage.getItem("mwamba_token")
        ? { Authorization: `Bearer ${localStorage.getItem("mwamba_token")}` }
        : {}),
      ...(options.headers ?? {}),
    },
  });

function App() {
  const [authenticated, setAuthenticated] = useState(
    Boolean(localStorage.getItem("mwamba_token")),
  );
  const [userName, setUserName] = useState(
    localStorage.getItem("mwamba_user_name") ?? "Shop Admin",
  );
  const [role, setRole] = useState(
    localStorage.getItem("mwamba_role") ?? "cashier",
  );
  const [view, setView] = useState<View>("Overview");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [gas, setGas] = useState<Gas[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [modal, setModal] = useState<
    "sale" | "exchange" | "payment" | "gas-brand" | null
  >(null);
  const [toast, setToast] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const paths = [
        "dashboard",
        "products",
        "gas",
        "customers",
        "sales",
        "payments",
      ];
      if (role === "admin") paths.push("staff");
      const responses = await Promise.all(
        paths.map((path) => apiFetch(`/api/${path}`)),
      );
      if (responses.some((r) => r.status === 401)) {
        handleLogout();
        return;
      }
      const payloads = await Promise.all(responses.map((r) => r.json()));
      setDashboard(payloads[0]);
      setProducts(payloads[1]);
      setGas(payloads[2]);
      setCustomers(payloads[3]);
      setSales(payloads[4]);
      setPayments(payloads[5]);
      if (role === "admin") setStaff(payloads[6]);
    } catch {
      setToast("Unable to reach the API. Check that the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authenticated) void loadData();
  }, [authenticated, role]);

  // Redirect cashier away from restricted views
  useEffect(() => {
    if (role === "cashier" && (view === "Overview" || view === "Staff")) {
      setView("Sales");
    }
  }, [role, view]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const chooseView = (nextView: View) => {
    // Block cashier from accessing restricted views directly
    if (role === "cashier" && (nextView === "Overview" || nextView === "Staff")) {
      return;
    }
    setView(nextView);
    setMobileOpen(false);
  };

  const handleLogin = (name: string, nextRole: string) => {
    setUserName(name);
    setRole(nextRole);
    setAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem("mwamba_token");
    localStorage.removeItem("mwamba_user_name");
    localStorage.removeItem("mwamba_role");
    setAuthenticated(false);
  };

  if (!authenticated) return <LoginScreen onLogin={handleLogin} />;

  // Determine today's date string
  const todayLabel = new Date().toLocaleDateString("en-KE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Page heading subtitle text
  const pageSubtitle =
    view === "Overview"
      ? "Here is what is happening across your shop today."
      : view === "Gas Cylinders"
      ? "Track full and empty cylinders by brand and record gas sales."
      : view === "Sales"
      ? "All sales transactions recorded in the system."
      : view === "Inventory"
      ? "Manage products and physical stock levels."
      : view === "Madeni"
      ? "Track customer credit balances and record repayments."
      : view === "Payments"
      ? "Every customer payment, including partial debt repayments."
      : view === "Staff"
      ? "Manage cashier accounts and access."
      : "Business analytics and performance summary.";



  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark">
            <Sparkles size={18} />
          </div>
          <div>
            <strong>mwamba</strong>
            <span>business desk</span>
          </div>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="nav-list" aria-label="Main navigation">
          {navItems
            .filter(
              ({ label }) =>
                (label !== "Staff" || role === "admin") &&
                (label !== "Overview" || role === "admin"),
            )
            .map(({ label, icon: Icon }) => (
              <button
                className={`nav-item ${view === label ? "active" : ""}`}
                key={label}
                onClick={() => chooseView(label)}
              >
                <Icon size={18} strokeWidth={view === label ? 2.4 : 1.8} />
                <span>{label}</span>
                {label === "Madeni" && dashboard?.debts.length ? (
                  <em>{dashboard.debts.length}</em>
                ) : null}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          {role === "admin" && (
            <button className="nav-item">
              <Settings size={18} />
              <span>Settings</span>
            </button>
          )}
          <button className="nav-item" onClick={handleLogout}>
            <LogOut size={18} />
            <span>Log out</span>
          </button>
          <div className="profile-chip">
            <div className="avatar">{userName.slice(0, 2).toUpperCase()}</div>
            <div>
              <strong>{userName}</strong>
              <span>{role === "admin" ? "Administrator" : "Cashier"}</span>
            </div>
            <ChevronRight size={16} />
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button
            className="mobile-menu"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{view}</strong>
          </div>
          <div className="topbar-actions">
            <NotificationBell
              products={products}
              gas={gas}
              debts={dashboard?.debts ?? []}
              sales={sales}
              role={role}
              onNavigate={(v) => chooseView(v)}
            />
            <div className="top-avatar">{userName.slice(0, 2).toUpperCase()}</div>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">{todayLabel}</p>
              <h1>
                {view === "Overview"
                  ? `Good morning, ${userName}`
                  : view}
              </h1>
              <p className="muted">{pageSubtitle}</p>
            </div>

          </div>

          {/* Views */}
          {view === "Overview" && role === "admin" && (
            <Overview
              dashboard={dashboard}
              loading={loading}
              onExchange={() => setModal("exchange")}
            />
          )}
          {view === "Sales" && (
            <SalesView
              sales={sales}
              loading={loading}
              gas={gas}
              customers={customers}
              onNewSale={() => setModal("sale")}
              onExchange={() => setModal("exchange")}
            />
          )}
          {view === "Inventory" && (
            <InventoryView products={products} loading={loading} />
          )}
          {view === "Gas Cylinders" && (
            <GasView
              gas={gas}
              loading={loading}
              role={role}
              onAddBrand={() => setModal("gas-brand")}
              onLoadData={loadData}
            />
          )}
          {view === "Madeni" && (
            <DebtView
              debts={dashboard?.debts ?? []}
              loading={loading}
              onPay={() => setModal("payment")}
            />
          )}
          {view === "Payments" && (
            <PaymentsView payments={payments} loading={loading} />
          )}
          {view === "Staff" && role === "admin" && (
            <StaffView
              staff={staff}
              onDone={() => {
                setToast("Staff account updated.");
                void loadData();
              }}
            />
          )}
          {view === "Reports" && (
            <ReportsView
              dashboard={dashboard}
              loading={loading}
              role={role}
            />
          )}
        </div>
      </main>

      {mobileOpen && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Modals */}
      {modal === "sale" && (
        <SaleModal
          products={products}
          gas={gas}
          customers={customers}
          onClose={() => setModal(null)}
          onDone={(message) => {
            setModal(null);
            setToast(message);
            void loadData();
          }}
        />
      )}
      {modal === "exchange" && (
        <ExchangeModal
          gas={gas}
          customers={customers}
          onClose={() => setModal(null)}
          onDone={(message) => {
            setModal(null);
            setToast(message);
            void loadData();
          }}
        />
      )}
      {modal === "payment" && (
        <PaymentModal
          customers={customers}
          onClose={() => setModal(null)}
          onDone={(message) => {
            setModal(null);
            setToast(message);
            void loadData();
          }}
        />
      )}
      {modal === "gas-brand" && (
        <GasBrandModal
          onClose={() => setModal(null)}
          onDone={(message) => {
            setModal(null);
            setToast(message);
            void loadData();
          }}
        />
      )}

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <span className="toast-dot" />
          {toast}
          <button onClick={() => setToast("")} aria-label="Dismiss">
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notification Bell
// ---------------------------------------------------------------------------
type NotifLevel = "critical" | "warning" | "info";
type Notification = {
  id: string;
  level: NotifLevel;
  title: string;
  detail: string;
  action: View;
};

function buildNotifications(
  products: Product[],
  gas: Gas[],
  debts: Dashboard["debts"],
  sales: Sale[],
  role: string,
): Notification[] {
  const notes: Notification[] = [];

  // 1. Gas cylinders critically low (≤ reorder level full)
  gas.forEach((g) => {
    const reorder = g.reorder_level ?? 3;
    if (g.full_quantity === 0) {
      notes.push({
        id: `gas-out-${g.id}`,
        level: "critical",
        title: `${g.brand} ${g.size_kg}kg — OUT OF STOCK`,
        detail: "No full cylinders left. Restock immediately.",
        action: "Gas Cylinders",
      });
    } else if (g.full_quantity <= reorder) {
      notes.push({
        id: `gas-low-${g.id}`,
        level: "warning",
        title: `${g.brand} ${g.size_kg}kg — low stock`,
        detail: `Only ${g.full_quantity} full cylinder${g.full_quantity === 1 ? "" : "s"} remaining.`,
        action: "Gas Cylinders",
      });
    }
  });

  // 2. Physical products low stock
  products
    .filter((p) => !p.is_gas && p.stock_quantity <= p.reorder_level)
    .forEach((p) => {
      notes.push({
        id: `prod-low-${p.id}`,
        level: p.stock_quantity === 0 ? "critical" : "warning",
        title: `${p.name} — ${p.stock_quantity === 0 ? "out of stock" : "low stock"}`,
        detail:
          p.stock_quantity === 0
            ? "Nothing left to sell."
            : `${p.stock_quantity} unit${p.stock_quantity === 1 ? "" : "s"} left (reorder at ${p.reorder_level}).`,
        action: "Inventory",
      });
    });

  // 3. Outstanding madeni — only show to admins (revenue-sensitive)
  if (role === "admin") {
    const outstanding = debts.filter((d) => d.status !== "CLEARED");
    if (outstanding.length > 0) {
      const total = outstanding.reduce((s, d) => s + d.balance, 0);
      notes.push({
        id: "debts-outstanding",
        level: "info",
        title: `${outstanding.length} customer${outstanding.length === 1 ? "" : "s"} owe madeni`,
        detail: `Total outstanding: ${money(total)}`,
        action: "Madeni",
      });
    }
  }

  // 4. Partial / credit sales from today
  const today = new Date().toDateString();
  const openCredits = sales.filter(
    (s) =>
      (s.status === "PARTIAL" || s.status === "CREDIT") &&
      new Date(s.created_at).toDateString() === today,
  );
  if (openCredits.length > 0) {
    notes.push({
      id: "credits-today",
      level: "info",
      title: `${openCredits.length} unpaid sale${openCredits.length === 1 ? "" : "s"} today`,
      detail: "Credit or partial payments recorded today need follow-up.",
      action: "Sales",
    });
  }

  return notes;
}

const levelColor: Record<NotifLevel, string> = {
  critical: "#e05252",
  warning:  "#d98457",
  info:     "#4f86be",
};

const levelBg: Record<NotifLevel, string> = {
  critical: "#fff1f1",
  warning:  "#fff7ee",
  info:     "#eef4fd",
};

function NotificationBell({
  products,
  gas,
  debts,
  sales,
  role,
  onNavigate,
}: {
  products: Product[];
  gas: Gas[];
  debts: Dashboard["debts"];
  sales: Sale[];
  role: string;
  onNavigate: (v: View) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);

  const all = buildNotifications(products, gas, debts, sales, role);
  const visible = all.filter((n) => !dismissed.has(n.id));
  const criticalCount = visible.filter((n) => n.level === "critical").length;
  const count = visible.length;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const dismiss = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissed((prev) => new Set(prev).add(id));
  };

  const dismissAll = () => setDismissed(new Set(all.map((n) => n.id)));

  const handleAction = (n: Notification) => {
    onNavigate(n.action);
    setOpen(false);
  };

  return (
    <div className="notif-wrap" ref={panelRef}>
      <button
        className="icon-button"
        aria-label={`Notifications${count > 0 ? ` — ${count} active` : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={18} />
        {count > 0 && (
          <span
            className={`notif-badge ${criticalCount > 0 ? "critical" : ""}`}
            aria-hidden="true"
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-header">
            <div>
              <strong>Notifications</strong>
              {count > 0 && (
                <span className="notif-header-count">{count} active</span>
              )}
            </div>
            {count > 0 && (
              <button className="link-button" onClick={dismissAll}>
                Clear all
              </button>
            )}
          </div>

          <div className="notif-list">
            {visible.length === 0 ? (
              <div className="notif-empty">
                <Bell size={22} />
                <span>All clear — no alerts right now.</span>
              </div>
            ) : (
              visible.map((n) => (
                <button
                  key={n.id}
                  className="notif-item"
                  style={{ "--notif-color": levelColor[n.level], "--notif-bg": levelBg[n.level] } as React.CSSProperties}
                  onClick={() => handleAction(n)}
                  aria-label={`${n.title}. Go to ${n.action}`}
                >
                  <span className="notif-dot" />
                  <div className="notif-copy">
                    <strong>{n.title}</strong>
                    <span>{n.detail}</span>
                    <em>→ Go to {n.action}</em>
                  </div>
                  <span
                    className="notif-dismiss"
                    role="button"
                    aria-label="Dismiss"
                    onClick={(e) => dismiss(n.id, e)}
                  >
                    <X size={12} />
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
function Overview({
  dashboard,
  loading,
  onExchange,
}: {
  dashboard: Dashboard | null;
  loading: boolean;
  onExchange: () => void;
}) {
  const summary = dashboard?.summary;
  const inventory = dashboard?.inventory;

  const stats = [
    {
      label: "Today's sales",
      value: money(summary?.sales ?? 0),
      detail: `${summary?.transactions ?? 0} transactions`,
      icon: CircleDollarSign,
      color: "teal",
      trend: "+12.5%",
    },
    {
      label: "M-Pesa received",
      value: money(summary?.mpesa ?? 0),
      detail: "Mobile payments",
      icon: Smartphone,
      color: "blue",
      trend: "+8.2%",
    },
    {
      label: "Cash received",
      value: money(summary?.cash ?? 0),
      detail: "Till collections",
      icon: Banknote,
      color: "orange",
      trend: "+4.1%",
    },
    {
      label: "Outstanding madeni",
      value: money(summary?.credit ?? 0),
      detail: "Needs follow-up",
      icon: WalletCards,
      color: "purple",
      trend: "Needs action",
    },
  ];

  return (
    <>
      <section className="stat-grid">
        {stats.map(({ label, value, detail, icon: Icon, color, trend }) => (
          <article className="stat-card" key={label}>
            <div className={`stat-icon ${color}`}>
              <Icon size={20} />
            </div>
            <div className="stat-copy">
              <span>{label}</span>
              <strong>{loading ? "..." : value}</strong>
              <small>{detail}</small>
            </div>
            <div
              className={`stat-trend ${color === "purple" ? "attention" : ""}`}
            >
              {color === "purple" ? (
                <ArrowDownRight size={13} />
              ) : (
                <ArrowUpRight size={13} />
              )}
              {trend}
            </div>
          </article>
        ))}
      </section>

      <section className="content-grid top-gap">
        <article className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h2>Sales overview</h2>
              <p className="muted">Revenue performance over the last 7 days</p>
            </div>
            <button className="select-button">
              This week <ChevronRight size={15} />
            </button>
          </div>
          <div className="chart">
            <div className="chart-y">
              <span>30k</span>
              <span>20k</span>
              <span>10k</span>
              <span>0</span>
            </div>
            <div className="chart-body">
              <div className="grid-lines">
                <i />
                <i />
                <i />
                <i />
              </div>
              <div className="bars">
                {(dashboard?.sales_trend ?? []).map((item) => (
                  <div className="bar-group" key={item.date}>
                    <div
                      className="bar"
                      style={{
                        height: `${Math.max(5, Math.min(100, (item.value / 30000) * 100))}%`,
                      }}
                      title={money(item.value)}
                    />
                    <span>{item.date}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </article>

        <article className="panel stock-panel">
          <div className="panel-heading">
            <div>
              <h2>Stock snapshot</h2>
              <p className="muted">Items that need your attention</p>
            </div>
            <button className="link-button">
              View all <ChevronRight size={14} />
            </button>
          </div>
          <div className="stock-summary">
            <div>
              <strong>{inventory?.products ?? 0}</strong>
              <span>Total products</span>
            </div>
            <div>
              <strong className="warning-text">
                {inventory?.low_stock ?? 0}
              </strong>
              <span>Low stock</span>
            </div>
          </div>
          <div className="stock-row">
            <div className="stock-label">
              <span className="stock-dot full" />
              Full cylinders{" "}
              <strong>{inventory?.full_cylinders ?? 0}</strong>
            </div>
            <div className="progress">
              <i style={{ width: "78%" }} />
            </div>
          </div>
          <div className="stock-row">
            <div className="stock-label">
              <span className="stock-dot empty" />
              Empty cylinders{" "}
              <strong>{inventory?.empty_cylinders ?? 0}</strong>
            </div>
            <div className="progress empty-progress">
              <i style={{ width: "42%" }} />
            </div>
          </div>
          <button className="exchange-cta" onClick={onExchange}>
            <CircleDot size={17} /> Record gas exchange{" "}
            <ChevronRight size={16} />
          </button>
        </article>
      </section>

      <section className="content-grid top-gap">
        <RecentSales sales={dashboard?.recent_sales ?? []} />
        <DebtPanel debts={dashboard?.debts ?? []} />
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Recent Sales (Overview panel)
// ---------------------------------------------------------------------------
function RecentSales({ sales }: { sales: Sale[] }) {
  return (
    <article className="panel table-panel">
      <div className="panel-heading">
        <div>
          <h2>Recent sales</h2>
          <p className="muted">Your latest transactions</p>
        </div>
        <button className="link-button">
          See all <ChevronRight size={14} />
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Receipt</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Payment</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sales.length ? (
              sales.slice(0, 5).map((sale) => (
                <tr key={sale.receipt_number}>
                  <td className="receipt">{sale.receipt_number}</td>
                  <td>{sale.customer}</td>
                  <td className="amount">{money(sale.total)}</td>
                  <td>
                    <span className="payment-label">
                      <span
                        className={
                          sale.payment_method === "M-Pesa"
                            ? "mpesa-dot"
                            : "cash-dot"
                        }
                      />
                      {sale.payment_method}
                    </span>
                  </td>
                  <td>
                    <span className={`status ${sale.status.toLowerCase()}`}>
                      {sale.status}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="empty-cell">
                  No sales recorded today.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Debt Panel (Overview)
// ---------------------------------------------------------------------------
function DebtPanel({ debts }: { debts: Dashboard["debts"] }) {
  return (
    <article className="panel debt-panel">
      <div className="panel-heading">
        <div>
          <h2>Outstanding madeni</h2>
          <p className="muted">Customers who need a follow-up</p>
        </div>
        <button className="link-button">
          Manage <ChevronRight size={14} />
        </button>
      </div>
      {debts.length ? (
        debts.map((debt) => (
          <div className="debt-row" key={debt.customer}>
            <div className="customer-avatar">
              {debt.customer
                .split(" ")
                .map((w) => w[0])
                .join("")
                .slice(0, 2)}
            </div>
            <div className="debt-person">
              <strong>{debt.customer}</strong>
              <span>
                {money(debt.paid)} paid of {money(debt.total_purchases)}
              </span>
            </div>
            <strong className="debt-balance">{money(debt.balance)}</strong>
          </div>
        ))
      ) : (
        <div className="empty-state">
          <WalletCards size={24} />
          <span>No outstanding debts</span>
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Sales View
// ---------------------------------------------------------------------------
function SalesView({
  sales,
  loading,
  gas,
  customers,
  onNewSale,
  onExchange,
}: {
  sales: Sale[];
  loading: boolean;
  gas: Gas[];
  customers: Customer[];
  onNewSale: () => void;
  onExchange: () => void;
}) {
  const pageSize = 10;
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(sales.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleSales = sales.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  // Quick stats derived from the sales list
  const todaySales = sales.filter(
    (s) =>
      new Date(s.created_at).toDateString() === new Date().toDateString(),
  );
  const fullCount = gas.reduce((sum, g) => sum + g.full_quantity, 0);

  return (
    <article className="panel page-panel">
      {/* ── Header row with actions ── */}
      <div className="sales-view-header">
        <div className="sales-quick-stats">
          <div className="sales-stat-chip">
            <ShoppingCart size={13} />
            <span>{todaySales.length} sales today</span>
          </div>
          <div className="sales-stat-chip gas">
            <CircleDot size={13} />
            <span>{fullCount} full cylinders</span>
          </div>
        </div>
        <div className="sales-actions">
          <button
            className="button button-quiet"
            onClick={onExchange}
            aria-label="Record gas exchange"
          >
            <CircleDot size={16} /> Gas Exchange
          </button>
          <button
            className="button button-primary"
            onClick={onNewSale}
            aria-label="Open new sale"
          >
            <Plus size={16} /> New Sale
          </button>
        </div>
      </div>

      {/* ── Search / filter row ── */}
      <div className="filter-row" style={{ marginBottom: 0 }}>
        <div className="search-box">
          <Search size={17} />
          <input placeholder="Search receipts or customers" />
        </div>
        <button className="button button-quiet">
          Filter <ChevronRight size={15} />
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Receipt</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Total</th>
              <th>Payment</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="empty-cell">
                  Loading sales...
                </td>
              </tr>
            ) : (
              visibleSales.map((sale) => (
                <tr key={sale.receipt_number}>
                  <td className="receipt">{sale.receipt_number}</td>
                  <td>{new Date(sale.created_at).toLocaleDateString()}</td>
                  <td>{sale.customer}</td>
                  <td className="amount">{money(sale.total)}</td>
                  <td>{sale.payment_method}</td>
                  <td>
                    <span className={`status ${sale.status.toLowerCase()}`}>
                      {sale.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {!loading && sales.length > 0 && (
        <div className="pagination" aria-label="Sales pagination">
          <span>
            Showing {(currentPage - 1) * pageSize + 1}–
            {Math.min(currentPage * pageSize, sales.length)} of {sales.length}{" "}
            sales
          </span>
          <div className="pagination-actions">
            <button
              className="button button-quiet"
              disabled={currentPage === 1}
              onClick={() => setPage((v) => Math.max(1, v - 1))}
            >
              <ChevronLeft size={15} /> Previous
            </button>
            <strong>
              Page {currentPage} of {pageCount}
            </strong>
            <button
              className="button button-quiet"
              disabled={currentPage === pageCount}
              onClick={() => setPage((v) => Math.min(pageCount, v + 1))}
            >
              Next <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Inventory View
// ---------------------------------------------------------------------------
function InventoryView({
  products,
  loading,
}: {
  products: Product[];
  loading: boolean;
}) {
  return (
    <article className="panel page-panel">
      <div className="filter-row">
        <div>
          <h2>Products &amp; inventory</h2>
          <p className="muted">Electronics and shop stock by quantity</p>
        </div>
        <button className="button button-primary">
          <Plus size={17} /> Add product
        </button>
      </div>
      <div className="product-grid">
        {loading ? (
          <div className="empty-cell">Loading inventory...</div>
        ) : (
          products
            .filter((p) => !p.is_gas)
            .map((product) => (
              <div className="product-card" key={product.id}>
                <div className="product-card-top">
                  <div className="product-icon">
                    <Package size={19} />
                  </div>
                  <span
                    className={
                      product.stock_quantity <= product.reorder_level
                        ? "stock-badge low"
                        : "stock-badge"
                    }
                  >
                    {product.stock_quantity <= product.reorder_level
                      ? "LOW STOCK"
                      : "IN STOCK"}
                  </span>
                </div>
                <strong>{product.name}</strong>
                <span>{product.category}</span>
                <div className="product-card-bottom">
                  <b>{money(product.price)}</b>
                  <small>{product.stock_quantity} units</small>
                </div>
              </div>
            ))
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Gas View — NO global "+ New Sale" button here; has its own actions
// ---------------------------------------------------------------------------
function GasView({
  gas,
  loading,
  role,
  onAddBrand,
  onLoadData,
}: {
  gas: Gas[];
  loading: boolean;
  role: string;
  onAddBrand: () => void;
  onLoadData: () => void;
}) {
  const [menuId, setMenuId] = useState<number | null>(null);
  const [gasModal, setGasModal] = useState<"edit" | "restock" | null>(null);
  const [selected, setSelected] = useState<Gas | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleDone = (message: string) => {
    setGasModal(null);
    setSelected(null);
    // Re-use parent loadData so no full page reload
    onLoadData();
    // Show a toast via the global mechanism isn't directly available here,
    // but onLoadData will refresh data. For toast we bubble up if needed.
    void message; // message shown by parent via toast
  };

  return (
    <article className="panel page-panel">
      <div className="filter-row">
        <div>
          <h2>Gas cylinders</h2>
          <p className="muted">Track full and empty cylinders by brand</p>
        </div>
        {/* Gas-specific actions only — no redundant "+ New Sale" */}
        <div className="heading-actions">
          {role === "admin" && (
            <button className="button button-quiet" onClick={onAddBrand}>
              <Plus size={17} /> Add Gas Brand
            </button>
          )}
        </div>
      </div>

      <div className="gas-grid">
        {loading ? (
          <div className="empty-cell">Loading gas inventory...</div>
        ) : gas.length === 0 ? (
          <div className="empty-state">
            <CircleDot size={24} />
            <span>No gas brands yet. Add one above.</span>
          </div>
        ) : (
          gas.map((item) => (
            <div className="gas-card" key={item.id}>
              <div className="gas-card-header">
                <div className="gas-badge">
                  <CircleDot size={21} />
                </div>
                <div>
                  <strong>
                    {item.brand} {item.size_kg}kg
                  </strong>
                  <span>Refill price {money(item.refill_price ?? item.price)}</span>
                </div>
                {/* Context menu (three-dots) */}
                <div className="gas-card-menu" ref={menuId === item.id ? menuRef : undefined}>
                  <button
                    className="more-button"
                    aria-label={`Options for ${item.brand} ${item.size_kg}kg`}
                    aria-expanded={menuId === item.id}
                    onClick={() =>
                      setMenuId(menuId === item.id ? null : item.id)
                    }
                  >
                    •••
                  </button>
                  {menuId === item.id && (
                    <div className="context-menu" role="menu">
                      {role === "admin" && (
                        <button
                          role="menuitem"
                          onClick={() => {
                            setSelected(item);
                            setGasModal("edit");
                            setMenuId(null);
                          }}
                        >
                          Edit Details &amp; Pricing
                        </button>
                      )}
                      <button
                        role="menuitem"
                        onClick={() => {
                          setSelected(item);
                          setGasModal("restock");
                          setMenuId(null);
                        }}
                      >
                        Restock Cylinders
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="cylinder-counts">
                <div>
                  <span>FULL</span>
                  <strong>{item.full_quantity}</strong>
                </div>
                <div className="count-divider" />
                <div>
                  <span>EMPTY</span>
                  <strong>{item.empty_quantity}</strong>
                </div>
              </div>

              <div className="gas-line">
                <i
                  style={{
                    width: `${Math.min(
                      100,
                      item.full_quantity > 0
                        ? (item.full_quantity /
                            Math.max(
                              item.full_quantity + item.empty_quantity,
                              1,
                            )) *
                            100
                        : 0,
                    )}%`,
                  }}
                />
              </div>

              <div className="gas-pricing-row">
                <span>
                  Refill <b>{money(item.refill_price ?? item.price)}</b>
                </span>
                {item.package_price ? (
                  <span>
                    Package <b>{money(item.package_price)}</b>
                  </span>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Inline gas modals (scoped to this view so they can call onLoadData) */}
      {gasModal === "edit" && selected && (
        <GasEditModal
          gas={selected}
          onClose={() => {
            setGasModal(null);
            setSelected(null);
          }}
          onDone={() => {
            handleDone("Gas details updated.");
          }}
        />
      )}
      {gasModal === "restock" && selected && (
        <GasRestockModal
          gas={selected}
          onClose={() => {
            setGasModal(null);
            setSelected(null);
          }}
          onDone={() => {
            handleDone("Stock updated successfully.");
          }}
        />
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Gas Edit Modal
// ---------------------------------------------------------------------------
function GasEditModal({
  gas,
  onClose,
  onDone,
}: {
  gas: Gas;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    brand: gas.brand,
    size_kg: String(gas.size_kg),
    refill_price: String(gas.refill_price ?? gas.price),
    package_price: String(gas.package_price ?? gas.price),
    full_quantity: String(gas.full_quantity),
    empty_quantity: String(gas.empty_quantity),
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const response = await apiFetch(`/api/gas/${gas.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        brand: form.brand.trim(),
        size_kg: Number(form.size_kg),
        refill_price: Number(form.refill_price),
        package_price: Number(form.package_price),
        full_quantity: Number(form.full_quantity),
        empty_quantity: Number(form.empty_quantity),
      }),
    });
    setSaving(false);
    if (!response.ok) {
      setError((await response.json()).detail ?? "Could not save changes.");
      return;
    }
    onDone();
  };

  return (
    <ModalFrame
      title="Edit Gas Details"
      subtitle={`${gas.brand} ${gas.size_kg}kg`}
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={submit}>
        <label>
          Brand name
          <input
            required
            value={form.brand}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
          />
        </label>
        <label>
          Cylinder size
          <select
            value={form.size_kg}
            onChange={(e) => setForm({ ...form, size_kg: e.target.value })}
          >
            <option value="6">6 kg</option>
            <option value="13">13 kg</option>
            <option value="35">35 kg</option>
            <option value="50">50 kg</option>
          </select>
        </label>
        <div className="form-row">
          <label>
            Refill price
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={form.refill_price}
              onChange={(e) =>
                setForm({ ...form, refill_price: e.target.value })
              }
            />
          </label>
          <label>
            Complete package price
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={form.package_price}
              onChange={(e) =>
                setForm({ ...form, package_price: e.target.value })
              }
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            Full stock
            <input
              required
              type="number"
              min="0"
              value={form.full_quantity}
              onChange={(e) =>
                setForm({ ...form, full_quantity: e.target.value })
              }
            />
          </label>
          <label>
            Empty stock
            <input
              required
              type="number"
              min="0"
              value={form.empty_quantity}
              onChange={(e) =>
                setForm({ ...form, empty_quantity: e.target.value })
              }
            />
          </label>
        </div>
        {error && <div className="credit-alert">{error}</div>}
        <button
          className="button button-primary full-button"
          type="submit"
          disabled={saving}
        >
          {saving ? "Saving…" : "Save details"}
        </button>
      </form>
    </ModalFrame>
  );
}

// ---------------------------------------------------------------------------
// Gas Restock Modal
// ---------------------------------------------------------------------------
function GasRestockModal({
  gas,
  onClose,
  onDone,
}: {
  gas: Gas;
  onClose: () => void;
  onDone: () => void;
}) {
  const [full, setFull] = useState(0);
  const [empty, setEmpty] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (full === 0 && empty === 0) {
      setError("Enter at least one non-zero quantity to update stock.");
      return;
    }
    setSaving(true);
    setError("");
    const response = await apiFetch(`/api/gas/${gas.id}/restock`, {
      method: "POST",
      body: JSON.stringify({ full_quantity: full, empty_quantity: empty }),
    });
    setSaving(false);
    if (!response.ok) {
      setError((await response.json()).detail ?? "Could not update stock.");
      return;
    }
    onDone();
  };

  return (
    <ModalFrame
      title="Restock Cylinders"
      subtitle={`Add incoming stock for ${gas.brand} ${gas.size_kg}kg`}
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={submit}>
        <div className="exchange-explainer">
          <div>
            <span>CURRENTLY FULL</span>
            <strong>{gas.full_quantity}</strong>
          </div>
          <div className="count-divider" />
          <div>
            <span>CURRENTLY EMPTY</span>
            <strong>{gas.empty_quantity}</strong>
          </div>
        </div>
        <div className="form-row">
          <label>
            New full cylinders arriving
            <input
              type="number"
              min="0"
              value={full}
              onChange={(e) => setFull(Number(e.target.value))}
            />
          </label>
          <label>
            Returned empty cylinders
            <input
              type="number"
              min="0"
              value={empty}
              onChange={(e) => setEmpty(Number(e.target.value))}
            />
          </label>
        </div>
        {error && <div className="credit-alert">{error}</div>}
        <button
          className="button button-primary full-button"
          type="submit"
          disabled={saving}
        >
          {saving ? "Updating…" : "Update stock"}
        </button>
      </form>
    </ModalFrame>
  );
}

// ---------------------------------------------------------------------------
// Gas Brand Modal
// ---------------------------------------------------------------------------
function GasBrandModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [form, setForm] = useState({
    brand: "",
    size_kg: "13",
    refill_price: "",
    package_price: "",
    full_quantity: "0",
    empty_quantity: "0",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const response = await apiFetch("/api/gas", {
      method: "POST",
      body: JSON.stringify({
        brand: form.brand.trim(),
        size_kg: Number(form.size_kg),
        refill_price: Number(form.refill_price),
        package_price: Number(form.package_price),
        full_quantity: Number(form.full_quantity),
        empty_quantity: Number(form.empty_quantity),
      }),
    });
    setSaving(false);
    if (!response.ok) {
      setError((await response.json()).detail ?? "Could not add gas brand.");
      return;
    }
    onDone("Gas brand added to inventory.");
  };

  return (
    <ModalFrame
      title="Add Gas Brand"
      subtitle="Set up a new cylinder type and its opening stock."
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={submit}>
        <label>
          Brand name
          <input
            required
            value={form.brand}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
            placeholder="e.g., AfriGas"
          />
        </label>
        <label>
          Cylinder size
          <select
            value={form.size_kg}
            onChange={(e) => setForm({ ...form, size_kg: e.target.value })}
          >
            <option value="6">6 kg</option>
            <option value="13">13 kg</option>
            <option value="35">35 kg</option>
            <option value="50">50 kg</option>
          </select>
        </label>
        <div className="form-row">
          <label>
            Refill price
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={form.refill_price}
              onChange={(e) =>
                setForm({ ...form, refill_price: e.target.value })
              }
            />
          </label>
          <label>
            Complete package price
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={form.package_price}
              onChange={(e) =>
                setForm({ ...form, package_price: e.target.value })
              }
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            Initial full stock
            <input
              required
              type="number"
              min="0"
              value={form.full_quantity}
              onChange={(e) =>
                setForm({ ...form, full_quantity: e.target.value })
              }
            />
          </label>
          <label>
            Initial empty stock
            <input
              required
              type="number"
              min="0"
              value={form.empty_quantity}
              onChange={(e) =>
                setForm({ ...form, empty_quantity: e.target.value })
              }
            />
          </label>
        </div>
        {error && <div className="credit-alert">{error}</div>}
        <button
          className="button button-primary full-button"
          type="submit"
          disabled={saving}
        >
          {saving ? "Adding…" : <><Plus size={17} /> Add Gas Brand</>}
        </button>
      </form>
    </ModalFrame>
  );
}

// ---------------------------------------------------------------------------
// Debt View (Madeni)
// ---------------------------------------------------------------------------
function DebtView({
  debts,
  loading,
  onPay,
}: {
  debts: Dashboard["debts"];
  loading: boolean;
  onPay: () => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "OUTSTANDING" | "PARTIAL" | "CLEARED"
  >("ALL");

  const visibleDebts = debts.filter((debt) => {
    const matchesSearch = `${debt.customer} ${debt.phone}`
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "ALL"
        ? debt.status !== "CLEARED"
        : debt.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <article className="panel page-panel">
      <div className="debt-filters">
        <div className="search-box debt-search">
          <Search size={17} />
          <input
            placeholder="Search debtor name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-tabs" role="tablist" aria-label="Debt status">
          {(
            ["ALL", "OUTSTANDING", "PARTIAL", "CLEARED"] as const
          ).map((filter) => (
            <button
              key={filter}
              className={statusFilter === filter ? "active" : ""}
              onClick={() => setStatusFilter(filter)}
            >
              {filter === "ALL"
                ? "All"
                : filter === "OUTSTANDING"
                ? "Outstanding"
                : filter === "PARTIAL"
                ? "Partially Paid"
                : "Cleared"}
            </button>
          ))}
        </div>
      </div>
      <div className="debt-list">
        <div className="debt-ledger-header">
          <span>Customer</span>
          <span>Total debt</span>
          <span>Paid</span>
          <span>Balance</span>
          <span>Action</span>
        </div>
        {loading ? (
          <div className="empty-cell">Loading balances...</div>
        ) : visibleDebts.length ? (
          visibleDebts.map((debt) => (
            <div className="debt-list-row" key={debt.customer}>
              <div className="customer-avatar">
                {debt.customer
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)}
              </div>
              <div>
                <strong>{debt.customer}</strong>
                <span>{debt.phone}</span>
              </div>
              <strong className="debt-total">
                {money(debt.total_purchases)}
              </strong>
              <strong className="debt-paid">{money(debt.paid)}</strong>
              <strong className="debt-balance">{money(debt.balance)}</strong>
              {debt.status === "CLEARED" ? (
                <span className="status paid">CLEARED</span>
              ) : (
                <button className="link-button" onClick={onPay}>
                  Pay <ChevronRight size={14} />
                </button>
              )}
            </div>
          ))
        ) : (
          <div className="empty-state">
            <Users size={24} />
            <span>
              {statusFilter === "CLEARED"
                ? "No cleared customers found."
                : "No active customers with outstanding credit."}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Reports View — hides total revenue/cost metrics for cashier role
// ---------------------------------------------------------------------------
function ReportsView({
  dashboard,
  loading,
  role,
}: {
  dashboard: Dashboard | null;
  loading: boolean;
  role: string;
}) {
  return (
    <>
      <section className="report-hero">
        <div>
          <span className="eyebrow light">BUSINESS PULSE</span>
          <h2>
            Know your numbers.
            <br />
            <em>Run your shop better.</em>
          </h2>
          <p>Simple, useful reporting for the decisions that matter.</p>
        </div>
        <BarChart3 size={80} strokeWidth={1} />
      </section>
      <section className="report-cards">
        {/* Revenue cards only visible to admins */}
        {role === "admin" && (
          <div className="report-card">
            <span>Collected today</span>
            <strong>
              {loading
                ? "..."
                : money(
                    (dashboard?.summary.mpesa ?? 0) +
                      (dashboard?.summary.cash ?? 0),
                  )}
            </strong>
            <small>Cash + M-Pesa payments</small>
          </div>
        )}
        <div className="report-card">
          <span>Active stock items</span>
          <strong>{loading ? "..." : (dashboard?.inventory.products ?? 0)}</strong>
          <small>{dashboard?.inventory.low_stock ?? 0} need restocking</small>
        </div>
        <div className="report-card">
          <span>Gas ready to sell</span>
          <strong>{loading ? "..." : (dashboard?.inventory.full_cylinders ?? 0)}</strong>
          <small>Full cylinders in stock</small>
        </div>
        <div className="report-card">
          <span>Empty cylinders</span>
          <strong>{loading ? "..." : (dashboard?.inventory.empty_cylinders ?? 0)}</strong>
          <small>Awaiting refill or return</small>
        </div>
        {role === "admin" && (
          <div className="report-card">
            <span>Outstanding madeni</span>
            <strong>
              {loading ? "..." : money(dashboard?.summary.credit ?? 0)}
            </strong>
            <small>Total credit balance due</small>
          </div>
        )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Payments View
// ---------------------------------------------------------------------------
function PaymentsView({
  payments,
  loading,
}: {
  payments: Payment[];
  loading: boolean;
}) {
  return (
    <article className="panel page-panel">
      <div className="filter-row">
        <div>
          <h2>Payment history</h2>
          <p className="muted">
            Every customer payment, including partial debt repayments.
          </p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Reference</th>
              <th>Recorded by</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="empty-cell">
                  Loading payments...
                </td>
              </tr>
            ) : payments.length ? (
              payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{new Date(payment.created_at).toLocaleString()}</td>
                  <td>{payment.customer}</td>
                  <td className="amount">{money(payment.amount)}</td>
                  <td>
                    <span className="payment-label">
                      <span
                        className={
                          payment.payment_method === "M-Pesa"
                            ? "mpesa-dot"
                            : "cash-dot"
                        }
                      />
                      {payment.payment_method}
                    </span>
                  </td>
                  <td>{payment.reference || "—"}</td>
                  <td>{payment.recorded_by}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="empty-cell">
                  No payments recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Staff View (admin only — role check is now correct: "admin" not "owner")
// ---------------------------------------------------------------------------
function StaffView({
  staff,
  onDone,
}: {
  staff: Staff[];
  onDone: () => void;
}) {
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [error, setError] = useState("");

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const response = await apiFetch("/api/staff", {
      method: "POST",
      body: JSON.stringify(form),
    });
    if (!response.ok) {
      setError(
        (await response.json()).detail ?? "Could not create staff account.",
      );
      return;
    }
    setForm({ full_name: "", email: "", password: "" });
    setError("");
    onDone();
  };

  const toggle = async (member: Staff) => {
    await apiFetch(`/api/staff/${member.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !member.active }),
    });
    onDone();
  };

  return (
    <article className="panel page-panel">
      <div className="filter-row">
        <div>
          <h2>Sales staff</h2>
          <p className="muted">
            Create accounts for staff who record sales and customer payments.
          </p>
        </div>
        <span className="status paid">Admin only</span>
      </div>
      <form className="staff-form" onSubmit={create}>
        <input
          aria-label="Full name"
          placeholder="Full name"
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          required
        />
        <input
          aria-label="Email"
          type="email"
          placeholder="Email address"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
        <input
          aria-label="Password"
          type="password"
          placeholder="Temporary password (8+ characters)"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
          minLength={8}
        />
        <button className="button button-primary" type="submit">
          <UserPlus size={17} /> Create staff account
        </button>
        {error && <small className="form-error">{error}</small>}
      </form>
      <div className="staff-list">
        {staff.map((member) => (
          <div className="staff-row" key={member.id}>
            <div className="customer-avatar">
              {member.full_name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <strong>{member.full_name}</strong>
              <span>
                {member.email} · {member.role}
              </span>
            </div>
            <span className={`status ${member.active ? "paid" : "credit"}`}>
              {member.active ? "ACTIVE" : "INACTIVE"}
            </span>
            {member.role === "staff" && (
              <button
                className="link-button"
                onClick={() => void toggle(member)}
              >
                {member.active ? "Deactivate" : "Activate"}
              </button>
            )}
          </div>
        ))}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Login Screen
// ---------------------------------------------------------------------------
function LoginScreen({
  onLogin,
}: {
  onLogin: (name: string, role: string) => void;
}) {
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("ChangeMe123!");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      setError((await response.json()).detail ?? "Invalid email or password.");
    } else {
      const data = await response.json();
      localStorage.setItem("mwamba_token", data.token);
      localStorage.setItem("mwamba_user_name", data.user_name);
      localStorage.setItem("mwamba_role", data.role);
      onLogin(data.user_name, data.role);
    }
    setSubmitting(false);
  };

  return (
    <main className="login-shell">
      <div className="login-card">
        <div className="brand-lockup login-brand">
          <div className="brand-mark">
            <Sparkles size={18} />
          </div>
          <div>
            <strong>mwamba</strong>
            <span>business desk</span>
          </div>
        </div>
        <p className="eyebrow">SECURE WORKSPACE</p>
        <h1>Welcome back.</h1>
        <p className="muted">Sign in to manage sales, payments, and stock.</p>
        <form className="modal-form login-form" onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <small className="form-error">{error}</small>}
          <button
            className="button button-primary full-button"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "Signing in..." : "Sign in to Mwamba"}
          </button>
        </form>
        <small className="login-note">
          Demo owner: admin@example.com · ChangeMe123!
        </small>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Modal Frame (shared wrapper)
// ---------------------------------------------------------------------------
function ModalFrame({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-heading">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Close">
            <X size={19} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sale Modal — unified product + LPG gas sale
// ---------------------------------------------------------------------------
function SaleModal({
  products,
  gas,
  customers,
  onClose,
  onDone,
}: {
  products: Product[];
  gas: Gas[];
  customers: Customer[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? 0);
  const [customerOptions, setCustomerOptions] = useState(customers);
  const [customerId, setCustomerId] = useState("");
  const [creditMode, setCreditMode] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [method, setMethod] = useState<"M-Pesa" | "Cash" | "Split / Hybrid">(
    "M-Pesa",
  );
  const [amount, setAmount] = useState(products[0]?.price ?? 0);
  const [mpesaAmount, setMpesaAmount] = useState(0);
  const [cashAmount, setCashAmount] = useState(0);
  const [mpesaReference, setMpesaReference] = useState("");
  const [gasSaleMode, setGasSaleMode] = useState<"exchange" | "package">(
    "exchange",
  );
  const [returnedGasId, setReturnedGasId] = useState(0);
  const [creditError, setCreditError] = useState("");
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ full_name: "", phone: "" });
  const [customerError, setCustomerError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const product = products.find((p) => p.id === productId);
  const selectedGas = product?.is_gas
    ? gas.find((g) => g.id === product.gas_id)
    : undefined;

  const unitPrice =
    product?.is_gas && gasSaleMode === "package"
      ? (selectedGas?.package_price ?? product?.price ?? 0)
      : (selectedGas?.refill_price ?? product?.price ?? 0);

  const total = unitPrice * quantity;
  const amountPaid =
    method === "Split / Hybrid" ? mpesaAmount + cashAmount : amount;

  const selectedCustomer = customerOptions.find(
    (c) => String(c.id) === customerId,
  );
  const matchingCustomers = customerOptions.filter((c) =>
    `${c.full_name} ${c.phone}`
      .toLowerCase()
      .includes(customerSearch.toLowerCase()),
  );

  // When product changes, reset gas-related state and amount
  const handleProductChange = (id: number) => {
    setProductId(id);
    const selected = products.find((p) => p.id === id);
    const price = selected?.price ?? 0;
    setAmount(creditMode ? 0 : price * quantity);
    if (selected?.is_gas) {
      setReturnedGasId(selected.gas_id ?? 0);
      setGasSaleMode("exchange");
    }
  };

  // When gas sale mode changes, recalculate amount
  const handleGasModeChange = (mode: "exchange" | "package") => {
    setGasSaleMode(mode);
    const price =
      mode === "package"
        ? (selectedGas?.package_price ?? product?.price ?? 0)
        : (selectedGas?.refill_price ?? product?.price ?? 0);
    setAmount(creditMode ? 0 : price * quantity);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (amountPaid < total && !creditMode) {
      setCreditError(
        "Enable Sell on Credit / Partial Payment to track this balance.",
      );
      return;
    }
    if (amountPaid < total && !customerId) {
      setCreditError(
        "Please select or add a specific customer to record a credit sale.",
      );
      return;
    }
    setCreditError("");
    setSubmitting(true);

    const response = await apiFetch("/api/sales", {
      method: "POST",
      body: JSON.stringify({
        items: [
          {
            product_id: product?.is_gas ? null : productId,
            gas_id: product?.is_gas ? product.gas_id : null,
            quantity,
          },
        ],
        customer_id: customerId ? Number(customerId) : null,
        payment_method: method,
        amount_paid: amountPaid,
        mpesa_amount:
          method === "M-Pesa"
            ? amount
            : method === "Split / Hybrid"
            ? mpesaAmount
            : 0,
        cash_amount:
          method === "Cash"
            ? amount
            : method === "Split / Hybrid"
            ? cashAmount
            : 0,
        mpesa_reference: mpesaReference || null,
        gas_sale_mode: product?.is_gas ? gasSaleMode : null,
        returned_gas_id:
          product?.is_gas && gasSaleMode === "exchange"
            ? returnedGasId || product.gas_id
            : null,
      }),
    });

    setSubmitting(false);
    onDone(
      response.ok
        ? "Sale completed. Receipt is ready to print."
        : ((await response.json()).detail ?? "Could not complete sale."),
    );
  };

  const saveCustomer = async () => {
    setCustomerError("");
    const response = await apiFetch("/api/customers", {
      method: "POST",
      body: JSON.stringify(newCustomer),
    });
    if (!response.ok) {
      setCustomerError(
        (await response.json()).detail ?? "Could not add customer.",
      );
      return;
    }
    const saved = await response.json();
    setCustomerOptions((prev) => [...prev, saved]);
    setCustomerId(String(saved.id));
    setCustomerSearch("");
    setNewCustomer({ full_name: "", phone: "" });
    setAddingCustomer(false);
  };

  return (
    <ModalFrame
      title="New Sale"
      subtitle="Add an item, take payment, and issue a receipt."
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={submit}>
        {/* ---- Product dropdown ---- */}
        <label>
          Product
          <select
            value={productId}
            onChange={(e) => handleProductChange(Number(e.target.value))}
          >
            <optgroup label="Shop Products">
              {products
                .filter((p) => !p.is_gas)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {money(p.price)} · {p.stock_quantity} available
                  </option>
                ))}
            </optgroup>
            <optgroup label="LPG Gas Cylinders">
              {products
                .filter((p) => p.is_gas)
                .map((p) => {
                  const g = gas.find((g) => g.id === p.gas_id);
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name} · {money(g?.refill_price ?? p.price)} ·{" "}
                      {g?.full_quantity ?? p.stock_quantity} full available
                    </option>
                  );
                })}
            </optgroup>
          </select>
        </label>

        {/* ---- LPG-specific options ---- */}
        {product?.is_gas && (
          <div className="gas-sale-options">
            <div className="payment-toggle">
              <button
                type="button"
                className={gasSaleMode === "exchange" ? "selected" : ""}
                onClick={() => handleGasModeChange("exchange")}
              >
                <CircleDot size={15} /> Refill / Exchange
              </button>
              <button
                type="button"
                className={gasSaleMode === "package" ? "selected" : ""}
                onClick={() => handleGasModeChange("package")}
              >
                <Package size={15} /> Complete Package (No Return)
              </button>
            </div>

            {gasSaleMode === "exchange" && (
              <label>
                Returned Empty Brand
                <select
                  value={returnedGasId || product.gas_id}
                  onChange={(e) => setReturnedGasId(Number(e.target.value))}
                >
                  {gas.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.brand} {g.size_kg}kg · {g.empty_quantity} empty in stock
                    </option>
                  ))}
                </select>
              </label>
            )}

            {gasSaleMode === "package" && (
              <div className="credit-alert" style={{ background: "#f0f9ff", borderColor: "#bae0fd", color: "#0369a1" }}>
                No empty cylinder returned. Full package price applies.
              </div>
            )}
          </div>
        )}

        {/* ---- Quantity ---- */}
        <div className="form-row">
          <label>
            Quantity
            <input
              type="number"
              min="1"
              max={product?.stock_quantity ?? 1}
              value={quantity}
              onChange={(e) => {
                const next = Number(e.target.value);
                setQuantity(next);
                setAmount(creditMode ? 0 : unitPrice * next);
              }}
            />
          </label>
          <div />
        </div>

        {/* ---- Credit toggle ---- */}
        <label className="credit-toggle">
          <input
            type="checkbox"
            checked={creditMode}
            onChange={(e) => {
              setCreditMode(e.target.checked);
              setCreditError("");
              setAmount(e.target.checked ? 0 : total);
              setMpesaAmount(0);
              setCashAmount(0);
              if (!e.target.checked) {
                setMethod("M-Pesa");
                setCustomerId("");
                setCustomerSearch("");
                setAddingCustomer(false);
              }
            }}
          />
          <span>
            <strong>Sell on Credit / Partial Payment</strong>
            <small>Track the balance against a saved customer</small>
          </span>
        </label>

        {/* ---- Customer picker (credit mode) ---- */}
        {creditMode && (
          <div className="credit-customer-picker">
            <label>
              <span className="customer-label-row">
                Customer
                <button
                  type="button"
                  className="add-customer-inline"
                  onClick={() => {
                    setAddingCustomer(true);
                    setCustomerError("");
                  }}
                >
                  + Add New Customer
                </button>
              </span>
              {selectedCustomer ? (
                <div className="selected-customer">
                  <span>
                    <strong>{selectedCustomer.full_name}</strong>
                    <small>{selectedCustomer.phone}</small>
                  </span>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      setCustomerId("");
                      setCustomerSearch("");
                    }}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <input
                    placeholder="Search name or phone..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                  />
                  {customerSearch.trim() && (
                    <div className="customer-search-results">
                      {matchingCustomers.map((c) => (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => {
                            setCustomerId(String(c.id));
                            setCustomerSearch("");
                            setCreditError("");
                          }}
                        >
                          <span>{c.full_name}</span>
                          <small>{c.phone}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </label>
          </div>
        )}

        {/* ---- Inline new customer form ---- */}
        {addingCustomer && creditMode && (
          <div className="inline-customer-form">
            <div className="inline-customer-heading">
              <strong>Add new customer</strong>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setAddingCustomer(false);
                  setCustomerError("");
                }}
              >
                Cancel
              </button>
            </div>
            <div className="form-row">
              <label>
                Customer name
                <input
                  required
                  value={newCustomer.full_name}
                  onChange={(e) =>
                    setNewCustomer({ ...newCustomer, full_name: e.target.value })
                  }
                />
              </label>
              <label>
                Phone number
                <input
                  required
                  type="tel"
                  value={newCustomer.phone}
                  onChange={(e) =>
                    setNewCustomer({ ...newCustomer, phone: e.target.value })
                  }
                />
              </label>
            </div>
            {customerError && (
              <div className="credit-alert">{customerError}</div>
            )}
            <button
              type="button"
              className="button button-primary full-button"
              onClick={() => void saveCustomer()}
              disabled={
                !newCustomer.full_name.trim() || !newCustomer.phone.trim()
              }
            >
              Save customer and continue
            </button>
          </div>
        )}

        {/* ---- Payment method ---- */}
        <div className="payment-toggle payment-methods">
          <button
            type="button"
            className={method === "M-Pesa" ? "selected" : ""}
            onClick={() => {
              setMethod("M-Pesa");
              setCreditError("");
            }}
          >
            <Smartphone size={16} /> M-Pesa
          </button>
          <button
            type="button"
            className={method === "Cash" ? "selected" : ""}
            onClick={() => {
              setMethod("Cash");
              setCreditError("");
            }}
          >
            <Banknote size={16} /> Cash
          </button>
          <button
            type="button"
            className={method === "Split / Hybrid" ? "selected" : ""}
            onClick={() => {
              setMethod("Split / Hybrid");
              setMpesaAmount(0);
              setCashAmount(0);
              setCreditError("");
            }}
          >
            Split / Hybrid
          </button>
        </div>

        {/* ---- Amount inputs ---- */}
        {method === "Split / Hybrid" ? (
          <div className="form-row">
            <label>
              M-Pesa Amount
              <input
                type="number"
                min="0"
                value={mpesaAmount}
                onChange={(e) => setMpesaAmount(Number(e.target.value))}
              />
            </label>
            <label>
              Cash Amount
              <input
                type="number"
                min="0"
                value={cashAmount}
                onChange={(e) => setCashAmount(Number(e.target.value))}
              />
            </label>
          </div>
        ) : (
          <label>
            Amount paid
            <input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => {
                setAmount(Number(e.target.value));
                setCreditError("");
              }}
            />
          </label>
        )}

        {(method === "M-Pesa" || method === "Split / Hybrid") && (
          <label>
            M-Pesa Reference Code (optional)
            <input
              placeholder="e.g., QX1234567"
              value={mpesaReference}
              onChange={(e) => setMpesaReference(e.target.value)}
            />
          </label>
        )}

        {method === "Split / Hybrid" && (
          <div className="modal-total">
            <span>Total paid</span>
            <strong>{money(amountPaid)}</strong>
          </div>
        )}

        {creditError && (
          <div className="credit-alert" role="alert">
            {creditError}
          </div>
        )}

        <div className="modal-total">
          <span>Sale total</span>
          <strong>{money(total)}</strong>
        </div>

        <button
          className="button button-primary full-button"
          type="submit"
          disabled={submitting}
        >
          <CreditCard size={17} />{" "}
          {submitting ? "Processing…" : "Complete sale"}
        </button>
      </form>
    </ModalFrame>
  );
}

// ---------------------------------------------------------------------------
// Exchange Modal (quick gas exchange — legacy flow)
// ---------------------------------------------------------------------------
function ExchangeModal({
  gas,
  customers,
  onClose,
  onDone,
}: {
  gas: Gas[];
  customers: Customer[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [gasId, setGasId] = useState(gas[0]?.id ?? 0);
  const [customerOptions, setCustomerOptions] = useState(customers);
  const [customerId, setCustomerId] = useState("");
  const [creditMode, setCreditMode] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ full_name: "", phone: "" });
  const [customerError, setCustomerError] = useState("");
  const [method, setMethod] = useState<"M-Pesa" | "Cash" | "Split / Hybrid">("M-Pesa");
  const [amount, setAmount] = useState(gas[0]?.refill_price ?? gas[0]?.price ?? 0);
  const [mpesaAmount, setMpesaAmount] = useState(0);
  const [cashAmount, setCashAmount] = useState(0);
  const [mpesaReference, setMpesaReference] = useState("");
  const [creditError, setCreditError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selected = gas.find((g) => g.id === gasId);
  const total = selected?.refill_price ?? selected?.price ?? 0;
  const amountPaid = method === "Split / Hybrid" ? mpesaAmount + cashAmount : amount;

  const selectedCustomer = customerOptions.find((c) => String(c.id) === customerId);
  const matchingCustomers = customerOptions.filter((c) =>
    `${c.full_name} ${c.phone}`.toLowerCase().includes(customerSearch.toLowerCase()),
  );

  const handleGasChange = (id: number) => {
    setGasId(id);
    const g = gas.find((g) => g.id === id);
    const price = g?.refill_price ?? g?.price ?? 0;
    setAmount(creditMode ? 0 : price);
  };

  const saveCustomer = async () => {
    setCustomerError("");
    const response = await apiFetch("/api/customers", {
      method: "POST",
      body: JSON.stringify(newCustomer),
    });
    if (!response.ok) {
      setCustomerError((await response.json()).detail ?? "Could not add customer.");
      return;
    }
    const saved = await response.json();
    setCustomerOptions((prev) => [...prev, saved]);
    setCustomerId(String(saved.id));
    setCustomerSearch("");
    setNewCustomer({ full_name: "", phone: "" });
    setAddingCustomer(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (amountPaid < total && !creditMode) {
      setCreditError("Enable Sell on Credit / Partial Payment to track this balance.");
      return;
    }
    if (amountPaid < total && !customerId) {
      setCreditError("Please select or add a specific customer to record a credit exchange.");
      return;
    }
    setCreditError("");
    setSubmitting(true);
    const response = await apiFetch("/api/gas-exchanges", {
      method: "POST",
      body: JSON.stringify({
        gas_id: gasId,
        quantity: 1,
        customer_id: customerId ? Number(customerId) : null,
        payment_method: method,
        amount_paid: amountPaid,
        mpesa_reference: mpesaReference || null,
      }),
    });
    setSubmitting(false);
    onDone(
      response.ok
        ? "Gas exchange recorded. Full and empty counts updated."
        : ((await response.json()).detail ?? "Could not record exchange."),
    );
  };

  return (
    <ModalFrame
      title="Gas Exchange"
      subtitle="Customer gives an empty cylinder and receives a full one."
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={submit}>
        {/* ---- Visual explainer ---- */}
        <div className="exchange-explainer">
          <div>
            <span>CUSTOMER GIVES</span>
            <strong>1 empty</strong>
          </div>
          <ArrowDownRight size={20} />
          <div>
            <span>CUSTOMER RECEIVES</span>
            <strong>1 full</strong>
          </div>
        </div>

        {/* ---- Gas cylinder picker ---- */}
        <label>
          Gas cylinder
          <select
            value={gasId}
            onChange={(e) => handleGasChange(Number(e.target.value))}
          >
            {gas.map((g) => (
              <option key={g.id} value={g.id}>
                {g.brand} {g.size_kg}kg · {money(g.refill_price ?? g.price)} · {g.full_quantity} full available
              </option>
            ))}
          </select>
        </label>

        {/* ---- Credit / partial toggle ---- */}
        <label className="credit-toggle">
          <input
            type="checkbox"
            checked={creditMode}
            onChange={(e) => {
              setCreditMode(e.target.checked);
              setCreditError("");
              setAmount(e.target.checked ? 0 : total);
              setMpesaAmount(0);
              setCashAmount(0);
              if (!e.target.checked) {
                setMethod("M-Pesa");
                setCustomerId("");
                setCustomerSearch("");
                setAddingCustomer(false);
              }
            }}
          />
          <span>
            <strong>Sell on Credit / Partial Payment</strong>
            <small>Track the balance against a saved customer</small>
          </span>
        </label>

        {/* ---- Customer picker (credit mode) ---- */}
        {creditMode && (
          <div className="credit-customer-picker">
            <label>
              <span className="customer-label-row">
                Customer
                <button
                  type="button"
                  className="add-customer-inline"
                  onClick={() => { setAddingCustomer(true); setCustomerError(""); }}
                >
                  + Add New Customer
                </button>
              </span>
              {selectedCustomer ? (
                <div className="selected-customer">
                  <span>
                    <strong>{selectedCustomer.full_name}</strong>
                    <small>{selectedCustomer.phone}</small>
                  </span>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => { setCustomerId(""); setCustomerSearch(""); }}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <input
                    placeholder="Search name or phone..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                  />
                  {customerSearch.trim() && (
                    <div className="customer-search-results">
                      {matchingCustomers.map((c) => (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => { setCustomerId(String(c.id)); setCustomerSearch(""); setCreditError(""); }}
                        >
                          <span>{c.full_name}</span>
                          <small>{c.phone}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </label>
          </div>
        )}

        {/* ---- Inline new customer form ---- */}
        {addingCustomer && creditMode && (
          <div className="inline-customer-form">
            <div className="inline-customer-heading">
              <strong>Add new customer</strong>
              <button
                type="button"
                className="link-button"
                onClick={() => { setAddingCustomer(false); setCustomerError(""); }}
              >
                Cancel
              </button>
            </div>
            <div className="form-row">
              <label>
                Customer name
                <input
                  required
                  value={newCustomer.full_name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, full_name: e.target.value })}
                />
              </label>
              <label>
                Phone number
                <input
                  required
                  type="tel"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                />
              </label>
            </div>
            {customerError && <div className="credit-alert">{customerError}</div>}
            <button
              type="button"
              className="button button-primary full-button"
              onClick={() => void saveCustomer()}
              disabled={!newCustomer.full_name.trim() || !newCustomer.phone.trim()}
            >
              Save customer and continue
            </button>
          </div>
        )}

        {/* ---- Payment method ---- */}
        <div className="payment-toggle payment-methods">
          <button
            type="button"
            className={method === "M-Pesa" ? "selected" : ""}
            onClick={() => { setMethod("M-Pesa"); setCreditError(""); }}
          >
            <Smartphone size={16} /> M-Pesa
          </button>
          <button
            type="button"
            className={method === "Cash" ? "selected" : ""}
            onClick={() => { setMethod("Cash"); setCreditError(""); }}
          >
            <Banknote size={16} /> Cash
          </button>
          <button
            type="button"
            className={method === "Split / Hybrid" ? "selected" : ""}
            onClick={() => { setMethod("Split / Hybrid"); setMpesaAmount(0); setCashAmount(0); setCreditError(""); }}
          >
            Split / Hybrid
          </button>
        </div>

        {/* ---- Amount inputs ---- */}
        {method === "Split / Hybrid" ? (
          <div className="form-row">
            <label>
              M-Pesa Amount
              <input
                type="number"
                min="0"
                value={mpesaAmount}
                onChange={(e) => setMpesaAmount(Number(e.target.value))}
              />
            </label>
            <label>
              Cash Amount
              <input
                type="number"
                min="0"
                value={cashAmount}
                onChange={(e) => setCashAmount(Number(e.target.value))}
              />
            </label>
          </div>
        ) : (
          <label>
            Amount paid
            <input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => { setAmount(Number(e.target.value)); setCreditError(""); }}
            />
          </label>
        )}

        {(method === "M-Pesa" || method === "Split / Hybrid") && (
          <label>
            M-Pesa Reference Code (optional)
            <input
              placeholder="e.g., QX1234567"
              value={mpesaReference}
              onChange={(e) => setMpesaReference(e.target.value)}
            />
          </label>
        )}

        {method === "Split / Hybrid" && (
          <div className="modal-total">
            <span>Total paid</span>
            <strong>{money(amountPaid)}</strong>
          </div>
        )}

        {creditError && (
          <div className="credit-alert" role="alert">{creditError}</div>
        )}

        <div className="modal-total">
          <span>Exchange price</span>
          <strong>{money(total)}</strong>
        </div>

        <button
          className="button button-primary full-button"
          type="submit"
          disabled={submitting}
        >
          <CircleDot size={17} /> {submitting ? "Recording…" : "Record exchange"}
        </button>
      </form>
    </ModalFrame>
  );
}

// ---------------------------------------------------------------------------
// Payment Modal
// ---------------------------------------------------------------------------
function PaymentModal({
  customers,
  onClose,
  onDone,
}: {
  customers: Customer[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const debtors = customers.filter((c) => c.outstanding_debt > 0);
  const [customerId, setCustomerId] = useState(debtors[0]?.id ?? 0);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<"M-Pesa" | "Cash">("M-Pesa");
  const customer = customers.find((c) => c.id === customerId);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const response = await apiFetch("/api/payments", {
      method: "POST",
      body: JSON.stringify({
        customer_id: customerId,
        amount,
        payment_method: method,
      }),
    });
    onDone(
      response.ok
        ? "Payment recorded and debt balance updated."
        : ((await response.json()).detail ?? "Could not record payment."),
    );
  };

  return (
    <ModalFrame
      title="Record Payment"
      subtitle="Apply a customer payment to their oldest outstanding balance."
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={submit}>
        <label>
          Customer
          <select
            value={customerId}
            onChange={(e) => setCustomerId(Number(e.target.value))}
          >
            {(debtors.length ? debtors : customers).map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name} · {money(c.outstanding_debt)} due
              </option>
            ))}
          </select>
        </label>
        <div className="balance-callout">
          <span>Outstanding balance</span>
          <strong>{money(customer?.outstanding_debt ?? 0)}</strong>
        </div>
        <label>
          Amount received
          <input
            type="number"
            min="1"
            max={customer?.outstanding_debt}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
        </label>
        <div className="payment-toggle">
          <button
            type="button"
            className={method === "M-Pesa" ? "selected" : ""}
            onClick={() => setMethod("M-Pesa")}
          >
            <Smartphone size={16} /> M-Pesa
          </button>
          <button
            type="button"
            className={method === "Cash" ? "selected" : ""}
            onClick={() => setMethod("Cash")}
          >
            <Banknote size={16} /> Cash
          </button>
        </div>
        <button className="button button-primary full-button" type="submit">
          <CircleDollarSign size={17} /> Save payment
        </button>
      </form>
    </ModalFrame>
  );
}

export default App;
